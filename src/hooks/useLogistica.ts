import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Pedidos pendientes del día (tipo=pedido, status confirmado or borrador)
export function usePedidosPendientes(fecha: string, statusFilter?: string, vendedorFilter?: string) {
  return useQuery({
    queryKey: ['logistica-pedidos', fecha, statusFilter, vendedorFilter],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, status, tipo, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre), venta_lineas(id, cantidad)')
        .eq('tipo', 'pedido')
        .eq('fecha', fecha)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Pedidos asignados a una carga
export function useCargaPedidos(cargaId?: string) {
  return useQuery({
    queryKey: ['carga-pedidos', cargaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carga_pedidos')
        .select('id, carga_id, venta_id, ventas(id, folio, total, status, cliente_id, clientes(nombre), vendedores(nombre), venta_lineas(id, cantidad, producto_id, precio_unitario, productos(codigo, nombre)))')
        .eq('carga_id', cargaId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cargaId,
  });
}

// Check which pedidos are already assigned to any carga on a date
export function useAsignacionesFecha(fecha: string) {
  return useQuery({
    queryKey: ['asignaciones-fecha', fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carga_pedidos')
        .select('venta_id, carga_id, cargas!inner(fecha)')
        .eq('cargas.fecha', fecha);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Cargas del día (camiones)
export function useCargasDia(fecha: string) {
  return useQuery({
    queryKey: ['cargas-dia', fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargas')
        .select('id, fecha, status, vendedor_id, almacen_id, almacen_destino_id, notas, vendedores!cargas_vendedor_id_fkey(nombre), almacen_origen:almacen_id(nombre), almacen_destino:almacen_destino_id(nombre), carga_lineas(id, producto_id, cantidad_cargada, productos(codigo, nombre))')
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
  });
}

// Dashboard KPIs
export function useLogisticaKpis(fecha: string) {
  return useQuery({
    queryKey: ['logistica-kpis', fecha],
    queryFn: async () => {
      // Pedidos del día
      const { data: pedidos } = await supabase
        .from('ventas')
        .select('id, status')
        .eq('tipo', 'pedido')
        .eq('fecha', fecha);

      // Cargas del día
      const { data: cargas } = await supabase
        .from('cargas')
        .select('id, status')
        .eq('fecha', fecha);

      // Asignaciones del día
      const { data: asignaciones } = await supabase
        .from('carga_pedidos')
        .select('venta_id, cargas!inner(fecha)')
        .eq('cargas.fecha', fecha);

      const totalPedidos = pedidos?.length ?? 0;
      const asignadosSet = new Set((asignaciones ?? []).map(a => a.venta_id));
      const sinAsignar = (pedidos ?? []).filter(p => !asignadosSet.has(p.id)).length;
      const entregados = (pedidos ?? []).filter(p => p.status === 'entregado').length;

      const cargasList = cargas ?? [];
      const listos = cargasList.filter(c => c.status === 'confirmada' || c.status === 'completada').length;
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
  return useQuery({
    queryKey: ['logistica-quiebres', fecha],
    queryFn: async () => {
      // Get all pedido lines for the date
      const { data: ventaLineas } = await supabase
        .from('venta_lineas')
        .select('producto_id, cantidad, productos(id, codigo, nombre, cantidad), ventas!inner(fecha, tipo)')
        .eq('ventas.fecha', fecha)
        .eq('ventas.tipo', 'pedido');

      if (!ventaLineas || ventaLineas.length === 0) return [];

      // Consolidate by product
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
