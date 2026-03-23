import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { pickColumns, VENTA_COLUMNS, VENTA_LINEA_COLUMNS } from '@/lib/allowlist';
import type { Venta, VentaLinea } from '@/types';

/** Paginated ventas for list views */
export function useVentasPaginated(search?: string, statusFilter?: string, tipoFilter?: string, page = 1, pageSize = 80) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { seeAll, profileId } = useDataVisibility('ventas');
  const filterOwn = !seeAll && !!profileId;

  useEffect(() => {
    const channel = supabase
      .channel('ventas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
        qc.invalidateQueries({ queryKey: ['ventas'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ['ventas', empresa?.id, search, statusFilter, tipoFilter, page, pageSize, filterOwn ? profileId : 'all'],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, subtotal, iva_total, saldo_pendiente, status, tipo, condicion_pago, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre)', { count: 'exact' })
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (filterOwn) q = q.eq('vendedor_id', profileId!);
      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as Venta['status']);
      if (tipoFilter && tipoFilter !== 'todos') q = q.eq('tipo', tipoFilter as Venta['tipo']);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Venta[], total: count ?? 0 };
    },
  });
}

/** All ventas (for lookups) */
export function useVentas(search?: string, statusFilter?: string, tipoFilter?: string) {
  const qc = useQueryClient();
  const { empresa } = useAuth();

  useEffect(() => {
    const channel = supabase
      .channel('ventas-realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
        qc.invalidateQueries({ queryKey: ['ventas'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: ['ventas', empresa?.id, search, statusFilter, tipoFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, subtotal, iva_total, saldo_pendiente, status, tipo, condicion_pago, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as Venta['status']);
      if (tipoFilter && tipoFilter !== 'todos') q = q.eq('tipo', tipoFilter as Venta['tipo']);
      const { data, error } = await q;
      if (error) throw error;
      return data as Venta[];
    },
  });
}

export function useVenta(id?: string) {
  return useQuery({
    queryKey: ['venta', id],
    queryFn: async () => {
      // Try server first
      const { data, error } = await supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), tarifas(nombre), almacenes(nombre), venta_lineas(*, productos(id, codigo, nombre, precio_principal, tiene_iva, tiene_ieps, tasa_iva_id, tasa_ieps_id, unidad_venta_id), unidades(nombre, abreviatura))')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as Venta;

      // Fallback: try local IndexedDB (sale not yet synced)
      try {
        const { getOfflineTable } = await import('@/lib/offlineDb');
        const table = getOfflineTable('ventas');
        if (table) {
          const local = await table.get(id!);
          if (local) {
            // Enrich with local venta_lineas if available
            const lineasTable = getOfflineTable('venta_lineas');
            let venta_lineas: unknown[] = [];
            if (lineasTable) {
              const allLineas = await lineasTable.toArray();
              venta_lineas = allLineas.filter((l: Record<string, unknown>) => l.venta_id === id);
              const prodTable = getOfflineTable('productos');
              if (prodTable) {
                const prods = await prodTable.toArray();
                const prodMap = new Map(prods.map((p: Record<string, unknown>) => [p.id, p]));
                venta_lineas = venta_lineas.map((l: unknown) => {
                  const line = l as Record<string, unknown>;
                  return {
                    ...line,
                    productos: prodMap.get(line.producto_id as string) || { id: line.producto_id, codigo: '', nombre: (line.descripcion as string) ?? '—' },
                  };
                });
              }
            }
            let clientes: { nombre: string } = { nombre: 'Sin cliente' };
            if (local.cliente_id) {
              const cliTable = getOfflineTable('clientes');
              if (cliTable) {
                const cli = await cliTable.get(local.cliente_id);
                if (cli) clientes = { nombre: cli.nombre };
              }
            }
            return { ...local, clientes, vendedores: null, tarifas: null, almacenes: null, venta_lineas } as unknown as Venta;
          }
        }
      } catch { /* IndexedDB not available */ }

      return null as unknown as Venta;
    },
    enabled: !!id,
  });
}

export function useSaveVenta() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (venta: Partial<Venta> & { id?: string }) => {
      const clean = pickColumns(venta, VENTA_COLUMNS);
      delete (clean as any).id;
      if (venta.id) {
        const { data, error } = await supabase.from('ventas').update(clean as any).eq('id', venta.id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        (clean as any).empresa_id = empresa.id;
        const { data, error } = await supabase.from('ventas').insert(clean as any).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
    },
  });
}

export function useSaveVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linea: Partial<VentaLinea> & { id?: string }) => {
      const clean = pickColumns(linea, VENTA_LINEA_COLUMNS);
      delete (clean as any).id;
      if (linea.id) {
        const { data, error } = await supabase.from('venta_lineas').update(clean as any).eq('id', linea.id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('venta_lineas').insert(clean as any).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
  });
}

export function useDeleteVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('venta_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
  });
}

export function useDeleteVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['ventas'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['ventas'] });
      qc.setQueriesData<any[]>({ queryKey: ['ventas'] }, (old) =>
        old?.filter(v => v.id !== id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ventas'] }),
  });
}
