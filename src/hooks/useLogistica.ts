import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { toast } from 'sonner';

// Pedidos pendientes en rango de fechas (tipo=pedido)
export function usePedidosPendientes(
  desde: string,
  hasta: string,
  statusFilter?: string,
  vendedorFilter?: string | string[],
  clienteFilter?: string,
  fechaCampo: 'fecha' | 'fecha_entrega' = 'fecha',
) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const vendedoresKey = Array.isArray(vendedorFilter) ? vendedorFilter.slice().sort().join(',') : vendedorFilter;
  return useQuery({
    queryKey: ['logistica-pedidos', empresaId, desde, hasta, statusFilter, vendedoresKey, clienteFilter, fechaCampo],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'usePedidosPendientes');
      return await fetchAllPages((from, to) => {
        let q = supabase
          .from('ventas')
          .select('id, folio, fecha, fecha_entrega, total, status, tipo, vendedor_id, cliente_id, notas, clientes(nombre, telefono, direccion), vendedores:profiles!vendedor_id(nombre), venta_lineas(id, cantidad, precio_unitario, subtotal, total, producto_id, productos(codigo, nombre, unidad_granel))')
          .eq('empresa_id', eid)
          .eq('tipo', 'pedido')
          .gte(fechaCampo, desde)
          .lte(fechaCampo, hasta)
          .order(fechaCampo, { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
        if (Array.isArray(vendedorFilter)) {
          if (vendedorFilter.length > 0) q = q.in('vendedor_id', vendedorFilter);
        } else if (vendedorFilter) {
          q = q.eq('vendedor_id', vendedorFilter);
        }
        if (clienteFilter) q = q.eq('cliente_id', clienteFilter);
        return q;
      });
    },
  });
}

// Pedidos asignados a una carga (RLS aísla por carga_id; carga_pedidos no tiene empresa_id)
export function useCargaPedidos(cargaId?: string) {
  return useQuery({
    queryKey: ['carga-pedidos', cargaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carga_pedidos')
        .select('id, carga_id, venta_id, ventas(id, folio, total, status, cliente_id, clientes(nombre), vendedores:profiles!vendedor_id(nombre), venta_lineas(id, cantidad, producto_id, precio_unitario, productos(codigo, nombre)))')
        .eq('carga_id', cargaId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cargaId,
  });
}

// Asignaciones en rango: scoped por cargas.empresa_id via inner join
export function useAsignacionesFecha(desde: string, hasta: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['asignaciones-fecha', empresaId, desde, hasta],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useAsignacionesFecha');
      return await fetchAllPages((from, to) =>
        supabase
          .from('carga_pedidos')
          .select('venta_id, carga_id, cargas!inner(fecha, empresa_id)')
          .eq('cargas.empresa_id', eid)
          .gte('cargas.fecha', desde)
          .lte('cargas.fecha', hasta)
          .range(from, to)
      );
    },
  });
}

// Cargas del día (camiones)
export function useCargasDia(fecha: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['cargas-dia', empresaId, fecha],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useCargasDia');
      const { data, error } = await supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id, almacen_destino_id, notas, vendedores:profiles!cargas_vendedor_id_profiles_fkey(nombre), almacen_origen:almacen_id(nombre), almacen_destino:almacen_destino_id(nombre), carga_lineas(id, producto_id, cantidad_cargada, productos(codigo, nombre))')
        .eq('empresa_id', eid)
        .eq('fecha', fecha)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Assign pedidos to carga
export function useAsignarPedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cargaId, ventaIds }: { cargaId: string; ventaIds: string[] }) => {
      const rows = ventaIds.map(venta_id => ({ carga_id: cargaId, venta_id }));
      const { error } = await supabase.from('carga_pedidos').upsert(rows, { onConflict: 'carga_id,venta_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['carga-pedidos'] });
      qc.invalidateQueries({ queryKey: ['asignaciones-fecha'] });
      qc.invalidateQueries({ queryKey: ['logistica-pedidos'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

// Remove pedido from carga
export function useDesasignarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cargaId, ventaId }: { cargaId: string; ventaId: string }) => {
      const { error } = await supabase.from('carga_pedidos').delete().eq('carga_id', cargaId).eq('venta_id', ventaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['carga-pedidos'] });
      qc.invalidateQueries({ queryKey: ['asignaciones-fecha'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

// Dashboard KPIs
export function useLogisticaKpis(fecha: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['logistica-kpis', empresaId, fecha],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useLogisticaKpis');
      const { data: pedidos } = await supabase
        .from('ventas')
        .select('id, status')
        .eq('empresa_id', eid)
        .eq('tipo', 'pedido')
        .eq('fecha', fecha);

      const { data: cargas } = await supabase
        .from('cargas')
        .select('id, status')
        .eq('empresa_id', eid)
        .eq('fecha', fecha);

      const { data: asignaciones } = await supabase
        .from('carga_pedidos')
        .select('venta_id, cargas!inner(fecha, empresa_id)')
        .eq('cargas.empresa_id', eid)
        .eq('cargas.fecha', fecha);

      const totalPedidos = pedidos?.length ?? 0;
      const asignadosSet = new Set((asignaciones ?? []).map(a => a.venta_id));
      const sinAsignar = (pedidos ?? []).filter(p => !asignadosSet.has(p.id)).length;
      const entregados = (pedidos ?? []).filter(p => p.status === 'entregado').length;

      const cargasList = cargas ?? [];
      const listos = cargasList.filter(c => (c.status as string) === 'confirmada' || c.status === 'completada').length;
      const enRuta = cargasList.filter(c => c.status === 'en_ruta').length;

      return {
        totalPedidos,
        sinAsignar,
        entregados,
        totalCamiones: cargasList.length,
        cargasListas: listos,
        enRuta,
      };
    },
  });
}

// Quiebres: products where ordered qty > available stock
export function useQuiebres(fecha: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['logistica-quiebres', empresaId, fecha],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'useQuiebres');
      const { data: ventaLineas } = await supabase
        .from('venta_lineas')
        .select('producto_id, cantidad, productos(id, codigo, nombre, cantidad), ventas!inner(fecha, tipo, empresa_id)')
        .eq('ventas.empresa_id', eid)
        .eq('ventas.fecha', fecha)
        .eq('ventas.tipo', 'pedido');

      if (!ventaLineas || ventaLineas.length === 0) return [];

      const byProduct: Record<string, { producto_id: string; codigo: string; nombre: string; pedido_total: number; stock: number }> = {};
      for (const l of ventaLineas as any[]) {
        const pid = l.producto_id;
        if (!pid) continue;
        if (!byProduct[pid]) {
          byProduct[pid] = {
            producto_id: pid,
            codigo: l.productos?.codigo ?? '',
            nombre: l.productos?.nombre ?? '',
            pedido_total: 0,
            stock: l.productos?.cantidad ?? 0,
          };
        }
        byProduct[pid].pedido_total += Number(l.cantidad) || 0;
      }

      return Object.values(byProduct)
        .filter(p => p.pedido_total > p.stock)
        .sort((a, b) => (b.pedido_total - b.stock) - (a.pedido_total - a.stock));
    },
  });
}
