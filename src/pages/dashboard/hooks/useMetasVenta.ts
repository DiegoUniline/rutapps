import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface MetaVenta {
  id: string;
  empresa_id: string;
  vendedor_id: string | null;
  producto_id: string | null;
  presentacion_id: string | null;
  clasificacion_id: string | null;
  marca_id: string | null;
  periodo_year: number;
  periodo_month: number;
  meta_unidades: number;
  meta_monto: number;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaInput {
  id?: string;
  vendedor_id: string | null;
  producto_id: string | null;
  presentacion_id: string | null;
  clasificacion_id: string | null;
  marca_id: string | null;
  periodo_year: number;
  periodo_month: number;
  meta_unidades: number;
  meta_monto: number;
  notas?: string | null;
}

export interface AvanceRow {
  vendedor_id: string | null;
  producto_id: string | null;
  presentacion_id: string | null;
  clasificacion_id: string | null;
  marca_id: string | null;
  unidades: number;
  monto: number;
}

const KEY = (empresaId: string | undefined) => ['metas-venta', empresaId];

export function useMetasVenta(year: number, month: number) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: [...KEY(empresa?.id), year, month],
    enabled: !!empresa?.id,
    queryFn: async (): Promise<MetaVenta[]> => {
      const { data, error } = await supabase
        .from('metas_venta' as any)
        .select('*')
        .eq('empresa_id', empresa!.id)
        .eq('periodo_year', year)
        .eq('periodo_month', month)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MetaVenta[];
    },
  });
}

/** Resumen mensual (totales) últimos 12 meses para el historial. */
export function useMetasResumenAnual() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: [...KEY(empresa?.id), 'resumen-anual'],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metas_venta' as any)
        .select('periodo_year, periodo_month, meta_unidades, meta_monto')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const map = new Map<string, { year: number; month: number; meta: number; uds: number; count: number }>();
      for (const r of (data ?? []) as any[]) {
        const k = `${r.periodo_year}-${r.periodo_month}`;
        const ex = map.get(k) ?? { year: r.periodo_year, month: r.periodo_month, meta: 0, uds: 0, count: 0 };
        ex.meta += Number(r.meta_monto ?? 0);
        ex.uds += Number(r.meta_unidades ?? 0);
        ex.count += 1;
        map.set(k, ex);
      }
      return Array.from(map.values()).sort((a, b) => (b.year - a.year) || (b.month - a.month));
    },
  });
}

export function useUpsertMeta() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: MetaInput) => {
      const payload = {
        ...m,
        empresa_id: empresa!.id,
        created_by: m.id ? undefined : user?.id ?? null,
      };
      if (m.id) {
        const { error } = await supabase
          .from('metas_venta' as any)
          .update({
            vendedor_id: m.vendedor_id,
            producto_id: m.producto_id,
            presentacion_id: m.presentacion_id,
            clasificacion_id: m.clasificacion_id,
            marca_id: m.marca_id,
            meta_unidades: m.meta_unidades,
            meta_monto: m.meta_monto,
            notas: m.notas ?? null,
          } as any)
          .eq('id', m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('metas_venta' as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(empresa?.id) }),
    onSuccess: () => toast.success('Meta guardada'),
    onError: (e: any) => toast.error(e.message || 'Error al guardar meta'),
  });
}

export function useCreateMetasBatch() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: MetaInput[]) => {
      const payload = rows.map((r) => ({
        ...r,
        empresa_id: empresa!.id,
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase.from('metas_venta' as any).insert(payload as any);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(empresa?.id) }),
    onSuccess: (_d, variables) => toast.success(`${variables.length} meta(s) creadas`),
    onError: (e: any) => toast.error(e.message || 'Error al guardar metas'),
  });
}

export function useDeleteMeta() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('metas_venta' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(empresa?.id) }),
    onSuccess: () => toast.success('Meta eliminada'),
    onError: (e: any) => toast.error(e.message || 'Error al eliminar meta'),
  });
}

export function useDuplicarMesAnterior() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      let prevY = year;
      let prevM = month - 1;
      if (prevM < 1) { prevM = 12; prevY -= 1; }
      const { data: prev, error } = await supabase
        .from('metas_venta' as any)
        .select('vendedor_id, producto_id, presentacion_id, clasificacion_id, marca_id, meta_unidades, meta_monto, notas')
        .eq('empresa_id', empresa!.id)
        .eq('periodo_year', prevY)
        .eq('periodo_month', prevM);
      if (error) throw error;
      if (!prev || prev.length === 0) {
        throw new Error('No hay metas del mes anterior para duplicar');
      }
      const rows = (prev as any[]).map((p) => ({
        empresa_id: empresa!.id,
        vendedor_id: p.vendedor_id,
        producto_id: p.producto_id,
        presentacion_id: p.presentacion_id,
        clasificacion_id: p.clasificacion_id,
        marca_id: p.marca_id,
        periodo_year: year,
        periodo_month: month,
        meta_unidades: p.meta_unidades,
        meta_monto: p.meta_monto,
        notas: p.notas,
        created_by: user?.id ?? null,
      }));
      const { error: insErr } = await supabase
        .from('metas_venta' as any)
        .upsert(rows as any, {
          onConflict: 'empresa_id,vendedor_id,producto_id,presentacion_id,clasificacion_id,marca_id,periodo_year,periodo_month',
          ignoreDuplicates: true,
        });
      if (insErr) throw insErr;
      return rows.length;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(empresa?.id) }),
    onSuccess: (n) => toast.success(`Se duplicaron ${n} metas del mes anterior`),
    onError: (e: any) => toast.error(e.message || 'Error al duplicar metas'),
  });
}

/** Avance real del mes: agrega venta_lineas de ventas (no canceladas) en el mes.
 *  Enriquecido con clasificacion_id/marca_id del producto para cruzar con metas por categoría/marca. */
export function useAvanceMetas(year: number, month: number) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: [...KEY(empresa?.id), 'avance', year, month],
    enabled: !!empresa?.id,
    queryFn: async (): Promise<AvanceRow[]> => {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Map producto -> { clasificacion_id, marca_id }
      const { data: prods } = await supabase
        .from('productos' as any)
        .select('id, clasificacion_id, marca_id')
        .eq('empresa_id', empresa!.id);
      const prodMeta = new Map<string, { clasificacion_id: string | null; marca_id: string | null }>();
      for (const p of (prods ?? []) as any[]) {
        prodMeta.set(p.id, { clasificacion_id: p.clasificacion_id ?? null, marca_id: p.marca_id ?? null });
      }

      const { data, error } = await supabase
        .from('ventas')
        .select('id, vendedor_id, status, venta_lineas(producto_id, presentacion_id, cantidad, subtotal)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', from)
        .lte('fecha', to)
        .neq('status', 'cancelado');
      if (error) throw error;
      const map = new Map<string, AvanceRow>();
      for (const v of (data ?? []) as any[]) {
        const lineas: any[] = v.venta_lineas ?? [];
        for (const l of lineas) {
          const meta = l.producto_id ? prodMeta.get(l.producto_id) : null;
          const clasif = meta?.clasificacion_id ?? null;
          const marca = meta?.marca_id ?? null;
          const key = `${v.vendedor_id ?? 'null'}|${l.producto_id ?? 'null'}|${l.presentacion_id ?? 'null'}|${clasif ?? 'null'}|${marca ?? 'null'}`;
          const ex = map.get(key) ?? {
            vendedor_id: v.vendedor_id ?? null,
            producto_id: l.producto_id ?? null,
            presentacion_id: l.presentacion_id ?? null,
            clasificacion_id: clasif,
            marca_id: marca,
            unidades: 0,
            monto: 0,
          };
          ex.unidades += Number(l.cantidad ?? 0);
          ex.monto += Number(l.subtotal ?? 0);
          map.set(key, ex);
        }
      }
      return Array.from(map.values());
    },
  });
}
