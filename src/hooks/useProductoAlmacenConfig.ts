import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fetchAllPages } from '@/lib/supabasePaginate';

export interface ProductoAlmacenConfig {
  id: string;
  empresa_id: string;
  producto_id: string;
  almacen_id: string;
  stock_minimo: number;
  stock_maximo: number;
  activo: boolean;
}

export interface SugerenciaResurtido {
  producto_id: string;
  codigo: string;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  stock_maximo: number;
  cantidad_sugerida: number;
}

const from = (t: string) => (supabase.from as any)(t);

/** Config de mínimos/máximos de la empresa (opcionalmente de un solo almacén). */
export function useProductoAlmacenConfig(almacenId?: string, productoId?: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  return useQuery({
    queryKey: ['producto_almacen_config', empresaId, almacenId ?? null, productoId ?? null],
    enabled: hasEmpresa(empresaId),
    queryFn: async (): Promise<ProductoAlmacenConfig[]> => {
      const eid = requireEmpresa(empresaId, 'useProductoAlmacenConfig');
      return fetchAllPages<ProductoAlmacenConfig>((desde, hasta) => {
        let q = from('producto_almacen_config')
          .select('id, empresa_id, producto_id, almacen_id, stock_minimo, stock_maximo, activo')
          .eq('empresa_id', eid);
        if (almacenId) q = q.eq('almacen_id', almacenId);
        if (productoId) q = q.eq('producto_id', productoId);
        return q.range(desde, hasta);
      });
    },
  });
}

/** Alta/edición de la configuración por producto + almacén. */
export function useGuardarProductoAlmacenConfig() {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Array<{ producto_id: string; almacen_id: string; stock_minimo: number; stock_maximo: number }>) => {
      const eid = requireEmpresa(empresa?.id, 'useGuardarProductoAlmacenConfig');
      if (rows.length === 0) return;
      const payload = rows.map(r => ({
        empresa_id: eid,
        producto_id: r.producto_id,
        almacen_id: r.almacen_id,
        stock_minimo: Number(r.stock_minimo) || 0,
        stock_maximo: Number(r.stock_maximo) || 0,
      }));
      const { error } = await from('producto_almacen_config')
        .upsert(payload, { onConflict: 'producto_id,almacen_id' });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['producto_almacen_config'] });
      qc.invalidateQueries({ queryKey: ['sugerencias_resurtido'] });
    },
  });
}

export function useEliminarProductoAlmacenConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await from('producto_almacen_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['producto_almacen_config'] }),
  });
}

/** Productos por resurtir del almacén (stock actual <= mínimo). */
export function useSugerenciasResurtido(almacenId?: string, enabled = true) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  return useQuery({
    queryKey: ['sugerencias_resurtido', empresaId, almacenId ?? null],
    enabled: enabled && hasEmpresa(empresaId) && !!almacenId,
    queryFn: async (): Promise<SugerenciaResurtido[]> => {
      const { data, error } = await (supabase.rpc as any)('fn_sugerencias_resurtido', { p_almacen_id: almacenId });
      if (error) throw error;
      return (data ?? []) as SugerenciaResurtido[];
    },
  });
}

/** Etiqueta discreta de estado de inventario. */
export type EstadoStock = 'sin_existencia' | 'bajo' | 'ok';

export function estadoStock(actual: number, minimo?: number | null): EstadoStock {
  if (!(actual > 0)) return 'sin_existencia';
  if (minimo != null && actual <= minimo) return 'bajo';
  return 'ok';
}
