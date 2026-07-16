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
  producto_id: string | null;
  user_id: string | null;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  vendedor_destino_id: string | null;
  lote_id: string | null;
  origen_nombre: string | null;
  destino_nombre: string | null;
}

/**
 * Fetches inventory movements. All parameters are optional:
 *   - productoId + ubicacionId  → kardex con saldo corrido (vista clásica)
 *   - solo productoId          → todos los movimientos del producto en cualquier ubicación
 *   - solo ubicacionId         → todos los movimientos en esa ubicación
 *   - ninguno                  → todos los movimientos de la empresa
 *
 * El saldo corrido solo se calcula cuando hay productoId + ubicacionId.
 */
export function useKardexUbicacion(
  productoId: string | null,
  ubicacionId: string | null,
  ubicacionTipo: 'almacen' | 'camion',
  fechaDesde?: string,
  fechaHasta?: string,
  loteId?: string,
) {
  const { empresa } = useAuth();

  const query = useQuery({
    queryKey: ['kardex-ubicacion', productoId, ubicacionId, ubicacionTipo, empresa?.id, fechaDesde, fechaHasta, loteId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/supabasePaginate');
      return await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('movimientos_inventario')
          .select('id, fecha, created_at, tipo, cantidad, referencia_tipo, referencia_id, notas, producto_id, user_id, almacen_origen_id, almacen_destino_id, vendedor_destino_id, lote_id')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: true });

        if (productoId) q = q.eq('producto_id', productoId);
        if (loteId) q = q.eq('lote_id', loteId);
        if (fechaDesde) q = q.gte('fecha', fechaDesde);
        if (fechaHasta) q = q.lte('fecha', fechaHasta);

        if (ubicacionId) {
          q = q.or(
            `and(almacen_origen_id.eq.${ubicacionId},tipo.eq.salida),and(almacen_destino_id.eq.${ubicacionId},tipo.eq.entrada)`
          );
        }

        return q.range(from, to);
      });
    },
  });


  const almacenesQuery = useQuery({
    queryKey: ['kardex-almacenes-map', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('almacenes')
        .select('id, nombre, tipo')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const map: Record<string, { nombre: string; tipo: string }> = {};
      for (const a of data ?? []) map[a.id] = { nombre: a.nombre, tipo: a.tipo };
      return map;
    },
  });

  const rows = useMemo<KardexUbicacionRow[]>(() => {
    if (!query.data) return [];
    const almMap = almacenesQuery.data ?? {};
    // Saldo corrido solo cuando hay producto + ubicacion
    const computeSaldo = !!productoId && !!ubicacionId;
    let saldo = 0;
    return query.data.map((m: any) => {
      let delta = 0;
      if (ubicacionId) {
        // entrada/salida relative to the selected almacen (filtered above)
        delta = m.tipo === 'entrada' ? m.cantidad : -m.cantidad;
      } else {
        delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : 0;
      }
      if (computeSaldo) saldo += delta;
      const origen_nombre = m.almacen_origen_id && almMap[m.almacen_origen_id] ? almMap[m.almacen_origen_id].nombre : null;
      const destino_nombre = m.almacen_destino_id && almMap[m.almacen_destino_id] ? almMap[m.almacen_destino_id].nombre : null;
      return { ...m, delta, saldo: computeSaldo ? saldo : 0, origen_nombre, destino_nombre };
    });
  }, [query.data, almacenesQuery.data, ubicacionId, ubicacionTipo, productoId]);

  return { ...query, rows };
}

