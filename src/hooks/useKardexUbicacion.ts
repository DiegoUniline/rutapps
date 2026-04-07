import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export interface KardexUbicacionRow {
  id: string;
  fecha: string;
  created_at: string;
  tipo: string;
  referencia_tipo: string | null;
  referencia_id: string | null;
  notas: string | null;
  cantidad: number;
  delta: number;
  saldo: number;
}

export function useKardexUbicacion(
  productoId: string | null,
  ubicacionId: string | null,
  ubicacionTipo: 'almacen' | 'camion',
  fechaDesde?: string,
  fechaHasta?: string,
) {
  const { empresa } = useAuth();

  const query = useQuery({
    queryKey: ['kardex-ubicacion', productoId, ubicacionId, ubicacionTipo, empresa?.id, fechaDesde, fechaHasta],
    enabled: !!productoId && !!ubicacionId && !!empresa?.id,
    queryFn: async () => {
      // For almacen: movements where this almacen is origin OR destination
      // For camion (vendedor): movements where vendedor_destino_id matches
      let q = supabase
        .from('movimientos_inventario')
        .select('id, fecha, created_at, tipo, cantidad, referencia_tipo, referencia_id, notas, almacen_origen_id, almacen_destino_id, vendedor_destino_id')
        .eq('producto_id', productoId!)
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: true });

      if (fechaDesde) q = q.gte('fecha', fechaDesde);
      if (fechaHasta) q = q.lte('fecha', fechaHasta);

      if (ubicacionTipo === 'almacen') {
        q = q.or(`almacen_origen_id.eq.${ubicacionId},almacen_destino_id.eq.${ubicacionId}`);
      } else {
        q = q.eq('vendedor_destino_id', ubicacionId!);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<KardexUbicacionRow[]>(() => {
    if (!query.data) return [];
    let saldo = 0;
    return query.data.map((m: any) => {
      let delta = 0;
      if (ubicacionTipo === 'almacen') {
        // Entrada al almacén = +, Salida del almacén = -
        if (m.tipo === 'entrada' && m.almacen_destino_id === ubicacionId) {
          delta = m.cantidad;
        } else if (m.tipo === 'salida' && m.almacen_origen_id === ubicacionId) {
          delta = -m.cantidad;
        } else if (m.tipo === 'transferencia') {
          if (m.almacen_destino_id === ubicacionId) delta = m.cantidad;
          if (m.almacen_origen_id === ubicacionId) delta = -m.cantidad;
        } else if (m.tipo === 'entrada' && m.almacen_origen_id === ubicacionId) {
          // Some entries log the almacen in origen (e.g. compra)
          delta = m.cantidad;
        } else if (m.tipo === 'salida' && m.almacen_destino_id === ubicacionId) {
          delta = -m.cantidad;
        }
      } else {
        // Camión/ruta
        delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : 0;
      }
      saldo += delta;
      return { ...m, delta, saldo };
    });
  }, [query.data, ubicacionId, ubicacionTipo]);

  return { ...query, rows };
}
