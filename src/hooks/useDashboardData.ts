import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type DateRange = { from: Date; to: Date };

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useDashboardVentas(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ventas', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, fecha, total, subtotal, iva_total, tipo, status, condicion_pago, vendedor_id, saldo_pendiente, cliente_id, clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to))
        .neq('status', 'cancelado' as any);
      if (vendedorId) q = q.eq('vendedor_id', vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardCobros(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-cobros', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('cobros')
        .select('id, fecha, monto, metodo_pago, cliente_id')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardCompras(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-compras', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('id, fecha, total, saldo_pendiente, status, proveedor_id, proveedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to));
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardGastos(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-gastos', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('gastos')
        .select('id, fecha, monto, concepto, vendedor_id')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to));
      if (vendedorId) q = q.eq('vendedor_id', vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardCartera() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-cartera', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, fecha, total, saldo_pendiente, cliente_id, clientes(nombre), condicion_pago')
        .eq('empresa_id', empresa!.id)
        .eq('condicion_pago', 'credito')
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelado' as any)
        .order('fecha', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardStock() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-stock', empresa?.id],
    staleTime: 5 * 60 * 1000,
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, nombre, cantidad, min, max, precio_principal, costo, status')
        .eq('empresa_id', empresa!.id)
        .eq('se_puede_vender', true)
        .not('status', 'eq', 'inactivo')
        .order('cantidad', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardTopProductos(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-top-productos', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_lineas')
        .select('producto_id, cantidad, total, venta_id, ventas!inner(fecha, status, empresa_id)')
        .eq('ventas.empresa_id', empresa!.id)
        .gte('ventas.fecha', fmt(range.from))
        .lte('ventas.fecha', fmt(range.to))
        .neq('ventas.status', 'cancelado');
      if (error) throw error;

      const map = new Map<string, { qty: number; total: number }>();
      (data ?? []).forEach((l) => {
        const existing = map.get(l.producto_id) ?? { qty: 0, total: 0 };
        existing.qty += Number(l.cantidad);
        existing.total += Number(l.total ?? 0);
        map.set(l.producto_id, existing);
      });

      const ids = [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([id]) => id);
      if (ids.length === 0) return [];
      const { data: prods } = await supabase
        .from('productos')
        .select('id, nombre, codigo')
        .in('id', ids);

      return ids
        .map(id => {
          const prod = prods?.find(p => p.id === id);
          const agg = map.get(id)!;
          return { id, nombre: prod?.nombre ?? 'N/A', codigo: prod?.codigo ?? '', qty: agg.qty, total: agg.total };
        })
        .sort((a, b) => b.total - a.total);
    },
  });
}

export function useDashboardVentasPorDia(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ventas-dia', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('fecha, total')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to))
        .neq('status', 'cancelado');
      if (vendedorId) q = q.eq('vendedor_id', vendedorId);
      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, number>();
      (data ?? []).forEach(v => {
        map.set(v.fecha, (map.get(v.fecha) ?? 0) + Number(v.total ?? 0));
      });

      const result: { date: string; total: number }[] = [];
      const d = new Date(range.from);
      while (d <= range.to) {
        const key = fmt(d);
        result.push({ date: key, total: map.get(key) ?? 0 });
        d.setDate(d.getDate() + 1);
      }
      return result;
    },
  });
}

export function useDashboardVentasPorVendedor(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ventas-vendedor', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('vendedor_id, total, vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to))
        .neq('status', 'cancelado')
        .not('vendedor_id', 'is', null);
      if (error) throw error;

      const map = new Map<string, { nombre: string; total: number; count: number }>();
      (data ?? []).forEach((v) => {
        const vendedorName = (v.vendedores as { nombre: string } | null)?.nombre ?? 'N/A';
        const existing = map.get(v.vendedor_id!) ?? { nombre: vendedorName, total: 0, count: 0 };
        existing.total += Number(v.total ?? 0);
        existing.count += 1;
        map.set(v.vendedor_id, existing);
      });

      return [...map.entries()]
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

export function useDashboardDevoluciones(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-devoluciones', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = (supabase as any)
        .from('devoluciones')
        .select('id, fecha, tipo, vendedor_id, vendedores(nombre), clientes(nombre), devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre, codigo))')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fmt(range.from))
        .lte('fecha', fmt(range.to));
      if (vendedorId) q = q.eq('vendedor_id', vendedorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
