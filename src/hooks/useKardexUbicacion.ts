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

interface KardexMovementRecord {
  id: string;
  fecha: string;
  created_at: string;
  tipo: string;
  cantidad: number;
  referencia_tipo: string | null;
  referencia_id: string | null;
  notas: string | null;
  producto_id: string | null;
  user_id: string | null;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  vendedor_destino_id: string | null;
  lote_id: string | null;
}

/**
 * Efecto de un movimiento en el saldo de UNA ubicación (almacén o camión).
 *
 * Se lee según el tipo, igual que como el movimiento cambió el stock:
 * - 'entrada' solo suma en el almacén DESTINO (aunque traiga origen);
 * - 'salida' solo resta en el almacén ORIGEN (aunque traiga destino);
 * - otros tipos (p. ej. traspaso en un solo renglón): suma en destino y resta en origen.
 *
 * Por qué: los movimientos entre almacenes (reasignar entrega, cargas) se guardan como DOS
 * renglones —salida y entrada— y ambos llevan origen y destino. Leerlos «por almacén» restaba
 * dos veces en el origen y sumaba dos veces en el destino (caso Tampico Ruta03: stock 12,
 * kardex 0). También cubre la carga a camión ('entrega_cargado', entrada) y los reversos
 * viejos guardados con el mismo almacén como origen y destino.
 */
export function deltaKardexUbicacion(
  m: { tipo: string; cantidad: number | string; almacen_origen_id: string | null; almacen_destino_id: string | null },
  ubicacionId: string,
): number {
  const cantidad = Number(m.cantidad) || 0;
  if (m.tipo === 'entrada') return m.almacen_destino_id === ubicacionId ? cantidad : 0;
  if (m.tipo === 'salida') return m.almacen_origen_id === ubicacionId ? -cantidad : 0;
  return (m.almacen_destino_id === ubicacionId ? cantidad : 0)
    - (m.almacen_origen_id === ubicacionId ? cantidad : 0);
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
      return await fetchAllPages<KardexMovementRecord>((from, to) => {
        let q = supabase
          .from('movimientos_inventario')
          .select('id, fecha, created_at, tipo, cantidad, referencia_tipo, referencia_id, notas, producto_id, user_id, almacen_origen_id, almacen_destino_id, vendedor_destino_id, lote_id')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }); // desempate: paginación estable

        if (productoId) q = q.eq('producto_id', productoId);
        if (loteId) q = q.eq('lote_id', loteId);
        if (fechaDesde) q = q.gte('fecha', fechaDesde);
        if (fechaHasta) q = q.lte('fecha', fechaHasta);

        if (ubicacionId) {
          // La ubicación, no el enum, determina el signo. Esto incluye
          // transferencias y cualquier movimiento válido con origen/destino.
          q = q.or(`almacen_origen_id.eq.${ubicacionId},almacen_destino_id.eq.${ubicacionId}`);
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
    return query.data.map((m: KardexMovementRecord) => {
      let delta = 0;
      const cantidad = Number(m.cantidad) || 0;
      if (ubicacionId) {
        delta = deltaKardexUbicacion(m, ubicacionId);
      } else {
        delta = m.tipo === 'entrada' ? cantidad : m.tipo === 'salida' ? -cantidad : 0;
      }
      if (computeSaldo) saldo += delta;
      const origen_nombre = m.almacen_origen_id && almMap[m.almacen_origen_id] ? almMap[m.almacen_origen_id].nombre : null;
      const destino_nombre = m.almacen_destino_id && almMap[m.almacen_destino_id] ? almMap[m.almacen_destino_id].nombre : null;
      return { ...m, delta, saldo: computeSaldo ? saldo : 0, origen_nombre, destino_nombre };
    });
  }, [query.data, almacenesQuery.data, ubicacionId, productoId]);

  return { ...query, rows };
}
