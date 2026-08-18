import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LineaLoteAsignado {
  lote_id: string;
  codigo: string;
  caducidad: string | null;
  cantidad: number;
}

/**
 * Lotes asignados por línea de una venta/pedido (multi-lote).
 * Devuelve un mapa venta_linea_id → lotes con su cantidad.
 */
export function useVentaLineaLotes(ventaId?: string | null, enabled = true) {
  const { empresaId } = useAuth();

  const { data } = useQuery({
    queryKey: ['venta_linea_lotes', empresaId, ventaId],
    enabled: !!ventaId && !!empresaId && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('venta_linea_lotes')
        .select('venta_linea_id, lote_id, cantidad, lotes:lotes!lote_id(codigo, fecha_caducidad)')
        .eq('venta_id', ventaId);
      if (error) throw error;
      const map: Record<string, LineaLoteAsignado[]> = {};
      for (const row of (data ?? []) as any[]) {
        if (!row.venta_linea_id) continue;
        const arr = map[row.venta_linea_id] ?? (map[row.venta_linea_id] = []);
        const ex = arr.find((x) => x.lote_id === row.lote_id);
        if (ex) ex.cantidad += Number(row.cantidad) || 0;
        else arr.push({
          lote_id: row.lote_id,
          codigo: row.lotes?.codigo ?? '—',
          caducidad: row.lotes?.fecha_caducidad ?? null,
          cantidad: Number(row.cantidad) || 0,
        });
      }
      return map;
    },
  });

  return data ?? {};
}
