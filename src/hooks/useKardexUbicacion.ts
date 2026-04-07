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
      let q = supabase
        .from('movimientos_inventario')
        .select('id, fecha, created_at, tipo, cantidad, referencia_tipo, referencia_id, notas, almacen_origen_id, almacen_destino_id, vendedor_destino_id')
        .eq('producto_id', productoId!)
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: true });

      if (fechaDesde) q = q.gte('fecha', fechaDesde);
      if (fechaHasta) q = q.lte('fecha', fechaHasta);

      if (ubicacionTipo === 'almacen') {
        // Only fetch movements relevant to THIS almacen's perspective:
        // - tipo=salida WHERE almacen_origen = this (stock left here)
        // - tipo=entrada WHERE almacen_destino = this (stock arrived here)
        // This prevents double-counting traspasos/entregas that have both columns set
        q = q.or(
          `and(almacen_origen_id.eq.${ubicacionId},tipo.eq.salida),and(almacen_destino_id.eq.${ubicacionId},tipo.eq.entrada)`
        );
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
        // After the filtered query, the logic is simple:
        // tipo='entrada' means stock arrived at this almacen → +
        // tipo='salida' means stock left this almacen → -
        delta = m.tipo === 'entrada' ? m.cantidad : -m.cantidad;
      } else {
        delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : 0;
      }
      saldo += delta;
      return { ...m, delta, saldo };
    });
  }, [query.data, ubicacionId, ubicacionTipo]);

  return { ...query, rows };
}
