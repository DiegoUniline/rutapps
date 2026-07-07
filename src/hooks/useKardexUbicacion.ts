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
) {
  const { empresa } = useAuth();

  const query = useQuery({
    queryKey: ['kardex-ubicacion', productoId, ubicacionId, ubicacionTipo, empresa?.id, fechaDesde, fechaHasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('movimientos_inventario')
        .select('id, fecha, created_at, tipo, cantidad, referencia_tipo, referencia_id, notas, producto_id, user_id, almacen_origen_id, almacen_destino_id, vendedor_destino_id')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: true })
        .limit(2000);

      if (productoId) q = q.eq('producto_id', productoId);
      if (fechaDesde) q = q.gte('fecha', fechaDesde);
      if (fechaHasta) q = q.lte('fecha', fechaHasta);

      if (ubicacionId) {
        // Camiones de ruta también son registros en `almacenes` (tipo='ruta')
        // y sus movimientos usan almacen_origen_id/almacen_destino_id.
        // Filtramos por almacén tanto para 'almacen' como para 'camion'.
        q = q.or(
          `and(almacen_origen_id.eq.${ubicacionId},tipo.eq.salida),and(almacen_destino_id.eq.${ubicacionId},tipo.eq.entrada)`
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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
      // Contraparte: para salida mostramos el destino; para entrada el origen
      let contraparteId: string | null = null;
      if (m.tipo === 'salida') contraparteId = m.almacen_destino_id ?? null;
      else if (m.tipo === 'entrada') contraparteId = m.almacen_origen_id ?? null;
      const contraparte_nombre = contraparteId && almMap[contraparteId] ? almMap[contraparteId].nombre : null;
      return { ...m, delta, saldo: computeSaldo ? saldo : 0, contraparte_nombre };
    });
  }, [query.data, almacenesQuery.data, ubicacionId, ubicacionTipo, productoId]);

  return { ...query, rows };
}

