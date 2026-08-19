import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fetchAllPages } from '@/lib/supabasePaginate';

export interface MinMaxRow {
  producto_id: string;
  almacen_id: string;
  stock_minimo: number | null;
  stock_maximo: number | null;
}

const from = (t: string) => (supabase.from as any)(t);
export const cellKey = (productoId: string, almacenId: string) => `${productoId}|${almacenId}`;

/** Configuración min/máx de toda la empresa, indexada por producto|almacén. */
export function useMinMaxConfigMap() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  return useQuery({
    queryKey: ['producto_almacen_config', empresaId, 'matriz'],
    enabled: hasEmpresa(empresaId),
    queryFn: async (): Promise<Record<string, MinMaxRow>> => {
      const eid = requireEmpresa(empresaId, 'useMinMaxConfigMap');
      const rows = await fetchAllPages<MinMaxRow>((desde, hasta) =>
        from('producto_almacen_config')
          .select('producto_id, almacen_id, stock_minimo, stock_maximo')
          .eq('empresa_id', eid)
          .range(desde, hasta),
      );
      const map: Record<string, MinMaxRow> = {};
      for (const r of rows) map[cellKey(r.producto_id, r.almacen_id)] = r;
      return map;
    },
  });
}

/** Existencias actuales por producto|almacén (para los indicadores de la matriz). */
export function useStockMatriz(enabled = true) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  return useQuery({
    queryKey: ['stock_almacen', empresaId, 'matriz'],
    enabled: enabled && hasEmpresa(empresaId),
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const eid = requireEmpresa(empresaId, 'useStockMatriz');
      const rows = await fetchAllPages<{ producto_id: string; almacen_id: string; cantidad: number }>((desde, hasta) =>
        from('stock_almacen')
          .select('producto_id, almacen_id, cantidad')
          .eq('empresa_id', eid)
          .range(desde, hasta),
      );
      const map: Record<string, number> = {};
      for (const r of rows) map[cellKey(r.producto_id, r.almacen_id)] = Number(r.cantidad) || 0;
      return map;
    },
  });
}

const CHUNK = 500;

/** Guarda en lote: upsert de celdas con valor y borrado de celdas vaciadas. */
export function useGuardarMinMaxBulk() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rows: MinMaxRow[]) => {
      const eid = requireEmpresa(empresa?.id, 'useGuardarMinMaxBulk');
      const upserts = rows.filter(r => r.stock_minimo !== null || r.stock_maximo !== null);
      const borrar = rows.filter(r => r.stock_minimo === null && r.stock_maximo === null);

      for (let i = 0; i < upserts.length; i += CHUNK) {
        const payload = upserts.slice(i, i + CHUNK).map(r => ({
          empresa_id: eid,
          producto_id: r.producto_id,
          almacen_id: r.almacen_id,
          stock_minimo: r.stock_minimo,
          stock_maximo: r.stock_maximo,
        }));
        const { error } = await from('producto_almacen_config').upsert(payload, { onConflict: 'producto_id,almacen_id' });
        if (error) throw error;
      }

      // Borrado agrupado por almacén para minimizar peticiones.
      const porAlmacen = new Map<string, string[]>();
      for (const r of borrar) {
        const arr = porAlmacen.get(r.almacen_id) ?? [];
        arr.push(r.producto_id);
        porAlmacen.set(r.almacen_id, arr);
      }
      for (const [almacenId, productos] of porAlmacen) {
        for (let i = 0; i < productos.length; i += CHUNK) {
          const { error } = await from('producto_almacen_config')
            .delete()
            .eq('empresa_id', eid)
            .eq('almacen_id', almacenId)
            .in('producto_id', productos.slice(i, i + CHUNK));
          if (error) throw error;
        }
      }
      return rows.length;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['producto_almacen_config'] });
      qc.invalidateQueries({ queryKey: ['sugerencias_resurtido'] });
    },
  });
}
