import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useManejaLotes } from '@/hooks/useManejaLotes';

export interface LoteRef { codigo: string; fecha_caducidad: string | null; cantidad: number; }

/**
 * Lee los lotes usados en un documento (venta, merma, devolución, traspaso,
 * compra…) desde movimientos_inventario y los agrupa por producto_id.
 * Una línea puede tener varios lotes (FEFO), por eso devuelve un arreglo por
 * producto. Devuelve {} si el producto no maneja lote / no hay lotes.
 */
export function useLotesPorReferencia(referenciaId?: string, referenciaTipos: string[] = []) {
  const manejaLotes = useManejaLotes();
  return useQuery({
    queryKey: ['lotes-por-referencia', referenciaId, referenciaTipos.join(',')],
    enabled: manejaLotes && !!referenciaId && referenciaTipos.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, LoteRef[]>> => {
      const { data: mvs } = await (supabase.from as any)('movimientos_inventario')
        .select('producto_id, cantidad, lote_id')
        .eq('referencia_id', referenciaId)
        .in('referencia_tipo', referenciaTipos)
        .not('lote_id', 'is', null);
      const rows = (mvs ?? []) as { producto_id: string; cantidad: number; lote_id: string }[];
      const loteIds = Array.from(new Set(rows.map(r => r.lote_id).filter(Boolean)));
      let lotesById: Record<string, { codigo: string; fecha_caducidad: string | null }> = {};
      if (loteIds.length > 0) {
        const { data: lts } = await (supabase.from as any)('lotes')
          .select('id, codigo, fecha_caducidad')
          .in('id', loteIds);
        lotesById = Object.fromEntries((lts ?? []).map((l: any) => [l.id, { codigo: l.codigo ?? '—', fecha_caducidad: l.fecha_caducidad ?? null }]));
      }
      const map: Record<string, LoteRef[]> = {};
      for (const r of rows) {
        const info = lotesById[r.lote_id];
        (map[r.producto_id] ??= []).push({
          codigo: info?.codigo ?? '—',
          fecha_caducidad: info?.fecha_caducidad ?? null,
          cantidad: Number(r.cantidad) || 0,
        });
      }
      return map;
    },
  });
}
