import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

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
      return fetchAllPages((from, to) => {
        let q = supabase
          .from('ventas')
          .select('id, fecha, total, subtotal, iva_total, tipo, status, condicion_pago, vendedor_id, saldo_pendiente, cliente_id, clientes(nombre)')
          .eq('empresa_id', empresa!.id)
          .eq('es_saldo_inicial', false)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .neq('status', 'cancelado' as any)
          .range(from, to);
        if (vendedorId) q = q.eq('vendedor_id', vendedorId);
        return q;
      });
    },
  });
}

export function useDashboardCobros(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-cobros', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        const q = supabase
          .from('cobros')
          .select('id, fecha, monto, metodo_pago, cliente_id')
          .eq('empresa_id', empresa!.id)
          .neq('status', 'cancelado')
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .range(from, to);
        return q;
      });
    },
  });
}

export function useDashboardCompras(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-compras', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) =>
        supabase
          .from('compras')
          .select('id, fecha, total, saldo_pendiente, status, proveedor_id, proveedores(nombre)')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .range(from, to)
      );
    },
  });
}

export function useDashboardGastos(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-gastos', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        let q = supabase
          .from('gastos')
          .select('id, fecha, monto, concepto, vendedor_id')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .range(from, to);
        if (vendedorId) q = q.eq('vendedor_id', vendedorId);
        return q;
      });
    },
  });
}

export function useDashboardCartera() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-cartera', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) =>
        supabase
          .from('ventas')
          .select('id, fecha, total, saldo_pendiente, cliente_id, clientes(nombre), condicion_pago')
          .eq('empresa_id', empresa!.id)
          .eq('condicion_pago', 'credito')
          .gt('saldo_pendiente', 0)
          .neq('status', 'cancelado' as any)
          .order('fecha', { ascending: true })
          .range(from, to)
      );
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
      return fetchAllPages((from, to) =>
        supabase
          .from('productos')
          .select('id, codigo, nombre, cantidad, min, max, precio_principal, costo, status')
          .eq('empresa_id', empresa!.id)
          .eq('se_puede_vender', true)
          .not('status', 'eq', 'inactivo')
          .order('cantidad', { ascending: true })
          .range(from, to)
      );
    },
  });
}

export function useDashboardTopProductos(range: DateRange) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-top-productos', empresa?.id, fmt(range.from), fmt(range.to)],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const data = await fetchAllPages((from, to) =>
        supabase
          .from('venta_lineas')
          .select('producto_id, cantidad, total, venta_id, ventas!inner(fecha, status, empresa_id)')
          .eq('ventas.empresa_id', empresa!.id)
          .gte('ventas.fecha', fmt(range.from))
          .lte('ventas.fecha', fmt(range.to))
          .neq('ventas.status', 'cancelado')
          .range(from, to)
      );

      const map = new Map<string, { qty: number; total: number }>();
      data.forEach((l: any) => {
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
      const data = await fetchAllPages((from, to) => {
        let q = supabase
          .from('ventas')
          .select('fecha, total')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .neq('status', 'cancelado')
          .range(from, to);
        if (vendedorId) q = q.eq('vendedor_id', vendedorId);
        return q;
      });

      const map = new Map<string, number>();
      data.forEach((v: any) => {
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
      const data = await fetchAllPages((from, to) =>
        supabase
          .from('ventas')
          .select('vendedor_id, total, vendedores(nombre)')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .neq('status', 'cancelado')
          .not('vendedor_id', 'is', null)
          .range(from, to)
      );

      const map = new Map<string, { nombre: string; total: number; count: number }>();
      data.forEach((v: any) => {
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
      return fetchAllPages((from, to) => {
        let q = (supabase as any)
          .from('devoluciones')
          .select('id, fecha, tipo, vendedor_id, vendedores(nombre), clientes(nombre), devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre, codigo))')
          .eq('empresa_id', empresa!.id)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .range(from, to);
        if (vendedorId) q = q.eq('vendedor_id', vendedorId);
        return q;
      });
    },
  });
}

export function useDashboardClientesEnRiesgo(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-clientes-riesgo', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      const eid = empresa!.id;

      // 1) Active clients (paginated)
      const clientes = await fetchAllPages((from, to) => {
        let q = supabase
          .from('clientes')
          .select('id, nombre, vendedor_id, vendedores(nombre)')
          .eq('empresa_id', eid)
          .eq('status', 'activo')
          .range(from, to);
        if (vendedorId) q = q.eq('vendedor_id', vendedorId);
        return q;
      });

      // 2) Sales in period (visited) — paginated
      const visitedSet = new Set<string>();
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data: page } = await supabase
          .from('ventas')
          .select('cliente_id')
          .eq('empresa_id', eid)
          .gte('fecha', fmt(range.from))
          .lte('fecha', fmt(range.to))
          .not('status', 'eq', 'cancelado')
          .range(offset, offset + PAGE - 1);
        for (const v of page ?? []) if (v.cliente_id) visitedSet.add(v.cliente_id);
        if (!page || page.length < PAGE) break;
        offset += PAGE;
      }

      // 3) Not visited clients
      const noVisitados = clientes.filter((c: any) => !visitedSet.has(c.id));
      if (noVisitados.length === 0) return [];

      // 4) Last sale for each unvisited client (last 180 days for perf)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const noVisitadoIds = noVisitados.map((c: any) => c.id);

      const lastSaleMap = new Map<string, { fecha: string; total: number }>();
      const batchSize = 200;
      for (let i = 0; i < noVisitadoIds.length; i += batchSize) {
        const batch = noVisitadoIds.slice(i, i + batchSize);
        const { data: sales } = await supabase
          .from('ventas')
          .select('cliente_id, fecha, total')
          .eq('empresa_id', eid)
          .in('cliente_id', batch)
          .not('status', 'eq', 'cancelado')
          .gte('fecha', fmt(cutoff))
          .order('fecha', { ascending: false });
        for (const s of sales ?? []) {
          if (!s.cliente_id || lastSaleMap.has(s.cliente_id)) continue;
          lastSaleMap.set(s.cliente_id, { fecha: s.fecha, total: Number(s.total ?? 0) });
        }
      }

      const todayMs = Date.now();
      return noVisitados.map((c: any) => {
        const last = lastSaleMap.get(c.id);
        return {
          id: c.id,
          nombre: c.nombre,
          vendedor: (c.vendedores as any)?.nombre ?? 'Sin asignar',
          ultimaCompraFecha: last?.fecha ?? null,
          ultimaCompraValor: last?.total ?? 0,
          diasSinComprar: last ? Math.floor((todayMs - new Date(last.fecha + 'T12:00:00').getTime()) / 86400000) : null,
          visitadoHoy: false,
        };
      });
    },
  });
}
