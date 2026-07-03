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

/**
 * Lines of sales in range, including discount & cost info to build an
 * income-statement style breakdown (Ventas, Descuentos, Devoluciones,
 * Ventas Brutas, Costo, Utilidad Bruta).
 */
export function useDashboardVentaLineasIS(range: DateRange, vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-venta-lineas-is', empresa?.id, fmt(range.from), fmt(range.to), vendedorId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const lineas = await fetchAllPages((from, to) => {
        let q = supabase
          .from('venta_lineas')
          .select('venta_id, producto_id, cantidad, precio_unitario, descuento_pct, subtotal, total, presentacion_factor, ventas!inner(id, subtotal, descuento_total, iva_total, ieps_total, total, fecha, status, empresa_id, vendedor_id, es_saldo_inicial)')
          .eq('ventas.empresa_id', empresa!.id)
          .eq('ventas.es_saldo_inicial', false)
          .gte('ventas.fecha', fmt(range.from))
          .lte('ventas.fecha', fmt(range.to))
          .neq('ventas.status', 'cancelado')
          .range(from, to);
        if (vendedorId) q = q.eq('ventas.vendedor_id', vendedorId);
        return q;
      });
      // Fetch costos for involved productos. Los batches se piden EN PARALELO
      // (antes iban en serie, uno esperando al anterior) → el estado de
      // resultados carga más rápido. Mismo resultado (mismo costMap).
      const ids = Array.from(new Set(lineas.map((l: any) => l.producto_id).filter(Boolean)));
      const costMap = new Map<string, number>();
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += 500) batches.push(ids.slice(i, i + 500));
      const results = await Promise.all(
        batches.map((batch) => supabase.from('productos').select('id, costo').in('id', batch))
      );
      results.forEach(({ data: prods }) =>
        (prods ?? []).forEach((p: any) => costMap.set(p.id, Number(p.costo) || 0))
      );
      return { lineas, costMap };
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
    queryKey: ['dashboard-top-productos-all', empresa?.id, fmt(range.from), fmt(range.to)],
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
        if (!l.producto_id) return;
        const existing = map.get(l.producto_id) ?? { qty: 0, total: 0 };
        existing.qty += Number(l.cantidad);
        existing.total += Number(l.total ?? 0);
        map.set(l.producto_id, existing);
      });

      const ids = [...map.keys()];
      if (ids.length === 0) return [];
      // Resolve names in batches of 500
      const prodMap = new Map<string, { nombre: string; codigo: string }>();
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('productos')
          .select('id, nombre, codigo')
          .in('id', batch);
        (prods ?? []).forEach((p: any) => prodMap.set(p.id, { nombre: p.nombre, codigo: p.codigo }));
      }

      return ids
        .map(id => {
          const prod = prodMap.get(id);
          const agg = map.get(id)!;
          return { id, nombre: prod?.nombre ?? 'N/A', codigo: prod?.codigo ?? '', qty: agg.qty, total: agg.total };
        })
        .sort((a, b) => b.total - a.total);
    },
  });
}

// ============ Mensual: evolución por producto/cliente/vendedor ============
function monthsBack(n: number) {
  const arr: { key: string; label: string }[] = [];
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const md = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`;
    arr.push({ key, label: md.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) });
  }
  return arr;
}

export function useDashboardEvolucionMensual(months: number = 12) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-evolucion-mensual', empresa?.id, months],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const lineas = await fetchAllPages((f, t) =>
        supabase
          .from('venta_lineas')
          .select('producto_id, cantidad, total, ventas!inner(fecha, status, empresa_id, vendedor_id, cliente_id)')
          .eq('ventas.empresa_id', empresa!.id)
          .gte('ventas.fecha', fmt(from))
          .lte('ventas.fecha', fmt(to))
          .neq('ventas.status', 'cancelado')
          .range(f, t)
      );

      const meses = monthsBack(months);
      // Aggregate per (entityKind, entityId, monthKey)
      const agg = {
        producto: new Map<string, Map<string, number>>(),
        cliente: new Map<string, Map<string, number>>(),
        vendedor: new Map<string, Map<string, number>>(),
      };
      const totales = {
        producto: new Map<string, number>(),
        cliente: new Map<string, number>(),
        vendedor: new Map<string, number>(),
      };

      const bump = (
        kind: 'producto' | 'cliente' | 'vendedor',
        id: string | null | undefined,
        monthKey: string,
        value: number,
      ) => {
        if (!id) return;
        let inner = agg[kind].get(id);
        if (!inner) { inner = new Map(); agg[kind].set(id, inner); }
        inner.set(monthKey, (inner.get(monthKey) ?? 0) + value);
        totales[kind].set(id, (totales[kind].get(id) ?? 0) + value);
      };

      lineas.forEach((l: any) => {
        const v = l.ventas;
        if (!v?.fecha) return;
        const monthKey = String(v.fecha).slice(0, 7);
        const total = Number(l.total ?? 0);
        bump('producto', l.producto_id, monthKey, total);
        bump('cliente', v.cliente_id, monthKey, total);
        bump('vendedor', v.vendedor_id, monthKey, total);
      });

      // Resolve names
      const resolveNames = async (
        ids: string[],
        table: 'productos' | 'clientes' | 'profiles',
      ) => {
        const out = new Map<string, string>();
        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500);
          const { data } = await supabase
            .from(table)
            .select('id, nombre')
            .in('id', batch);
          (data ?? []).forEach((r: any) => out.set(r.id, r.nombre));
        }
        return out;
      };

      const [prodNames, cliNames, vendNames] = await Promise.all([
        resolveNames([...agg.producto.keys()], 'productos'),
        resolveNames([...agg.cliente.keys()], 'clientes'),
        resolveNames([...agg.vendedor.keys()], 'profiles'),
      ]);

      const build = (
        kind: 'producto' | 'cliente' | 'vendedor',
        names: Map<string, string>,
      ) =>
        [...agg[kind].entries()]
          .map(([id, m]) => ({
            id,
            nombre: names.get(id) ?? 'N/A',
            total: totales[kind].get(id) ?? 0,
            porMes: Object.fromEntries(meses.map(({ key }) => [key, m.get(key) ?? 0])),
          }))
          .sort((a, b) => b.total - a.total);

      return {
        meses,
        productos: build('producto', prodNames),
        clientes: build('cliente', cliNames),
        vendedores: build('vendedor', vendNames),
      };
    },
  });
}

// ============ Mensual: total ventas por mes con crecimiento ============
export function useDashboardVentasPorMes(months: number = 12) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ventas-por-mes', empresa?.id, months],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const data = await fetchAllPages((f, t) =>
        supabase
          .from('ventas')
          .select('fecha, total')
          .eq('empresa_id', empresa!.id)
          .eq('es_saldo_inicial', false)
          .neq('status', 'cancelado')
          .gte('fecha', fmt(from))
          .lte('fecha', fmt(to))
          .range(f, t),
      );
      const meses = monthsBack(months);
      const map = new Map<string, { total: number; count: number }>();
      data.forEach((v: any) => {
        const k = String(v.fecha).slice(0, 7);
        const cur = map.get(k) ?? { total: 0, count: 0 };
        cur.total += Number(v.total ?? 0);
        cur.count += 1;
        map.set(k, cur);
      });
      return meses.map(({ key, label }, idx) => {
        const cur = map.get(key) ?? { total: 0, count: 0 };
        const prev = idx > 0 ? (map.get(meses[idx - 1].key) ?? { total: 0, count: 0 }) : null;
        const growth =
          prev && prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;
        return { key, label, total: cur.total, count: cur.count, prev: prev?.total ?? 0, growth };
      });
    },
  });
}

// ============ Por usuario: mes actual vs anterior ============
export function useDashboardVentasUsuarioMes() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-ventas-usuario-mes', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const startCur = new Date(now.getFullYear(), now.getMonth(), 1);
      const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endCur = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const data = await fetchAllPages((f, t) =>
        supabase
          .from('ventas')
          .select('vendedor_id, fecha, total, vendedores:profiles!vendedor_id(nombre)')
          .eq('empresa_id', empresa!.id)
          .eq('es_saldo_inicial', false)
          .neq('status', 'cancelado')
          .gte('fecha', fmt(startPrev))
          .lte('fecha', fmt(endCur))
          .not('vendedor_id', 'is', null)
          .range(f, t),
      );
      const curKey = `${startCur.getFullYear()}-${String(startCur.getMonth() + 1).padStart(2, '0')}`;
      const prevKey = `${startPrev.getFullYear()}-${String(startPrev.getMonth() + 1).padStart(2, '0')}`;
      const map = new Map<string, { nombre: string; cur: number; prev: number; curCount: number; prevCount: number }>();
      data.forEach((v: any) => {
        const id = v.vendedor_id as string;
        const nombre = v.vendedores?.nombre ?? 'N/A';
        const k = String(v.fecha).slice(0, 7);
        const cur = map.get(id) ?? { nombre, cur: 0, prev: 0, curCount: 0, prevCount: 0 };
        if (k === curKey) { cur.cur += Number(v.total ?? 0); cur.curCount += 1; }
        else if (k === prevKey) { cur.prev += Number(v.total ?? 0); cur.prevCount += 1; }
        map.set(id, cur);
      });
      return [...map.entries()]
        .map(([id, r]) => ({
          id,
          nombre: r.nombre,
          cur: r.cur,
          prev: r.prev,
          curCount: r.curCount,
          prevCount: r.prevCount,
          growth: r.prev > 0 ? ((r.cur - r.prev) / r.prev) * 100 : r.cur > 0 ? 100 : 0,
        }))
        .sort((a, b) => b.cur - a.cur);
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
           .eq('es_saldo_inicial', false)
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
          .select('vendedor_id, total, vendedores:profiles!vendedor_id(nombre)')
          .eq('empresa_id', empresa!.id)
          .eq('es_saldo_inicial', false)
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
          .select('id, fecha, tipo, vendedor_id, vendedores:profiles!vendedor_id(nombre), clientes(nombre), devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre, codigo))')
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
          .select('id, nombre, vendedor_id, vendedores:profiles!vendedor_id(nombre)')
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

export function useDashboardHoy(vendedorId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-hoy', empresa?.id, vendedorId],
    enabled: !!empresa?.id,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const eid = empresa!.id;
      // today in company timezone (YYYY-MM-DD)
      const tz = (empresa as any)?.zona_horaria || 'America/Mexico_City';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const tomorrowDate = new Date(today + 'T00:00:00');
      tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
      const tomorrow = tomorrowDate.toISOString().slice(0, 10);

      const baseVisitas = supabase
        .from('visitas')
        .select('id, user_id, cliente_id', { count: 'exact' })
        .eq('empresa_id', eid)
        .gte('fecha', today)
        .lt('fecha', tomorrow);
      const visitasQ = vendedorId ? baseVisitas.eq('user_id', vendedorId) : baseVisitas;

      const baseEntregas = supabase
        .from('entregas')
        .select('id, status, vendedor_id')
        .eq('empresa_id', eid)
        .eq('fecha', today);
      const entregasQ = vendedorId ? baseEntregas.eq('vendedor_id', vendedorId) : baseEntregas;

      const baseVentas = supabase
        .from('ventas')
        .select('id, total, tipo, vendedor_id', { count: 'exact' })
        .eq('empresa_id', eid)
        .eq('es_saldo_inicial', false)
        .neq('status', 'cancelado' as any)
        .eq('fecha', today);
      const ventasQ = vendedorId ? baseVentas.eq('vendedor_id', vendedorId) : baseVentas;

      const cobrosQ = supabase
        .from('cobros')
        .select('id, monto', { count: 'exact' })
        .eq('empresa_id', eid)
        .neq('status', 'cancelado')
        .eq('fecha', today);

      const pedidosBase = supabase
        .from('ventas')
        .select('id, vendedor_id', { count: 'exact', head: false })
        .eq('empresa_id', eid)
        .eq('tipo', 'pedido')
        .not('status', 'in', '(entregado,cancelado)' as any);
      const pedidosQ = vendedorId ? pedidosBase.eq('vendedor_id', vendedorId) : pedidosBase;

      const baseGastos = supabase
        .from('gastos')
        .select('id, monto, vendedor_id', { count: 'exact' })
        .eq('empresa_id', eid)
        .eq('fecha', today);
      const gastosQ = vendedorId ? baseGastos.eq('vendedor_id', vendedorId) : baseGastos;

      const [vRes, eRes, sRes, cRes, pRes, gRes] = await Promise.all([
        visitasQ, entregasQ, ventasQ, cobrosQ, pedidosQ, gastosQ,
      ]);

      const visitasRows = (vRes.data ?? []) as any[];
      const entregasRows = (eRes.data ?? []) as any[];
      const ventasRows = (sRes.data ?? []) as any[];
      const cobrosRows = (cRes.data ?? []) as any[];
      const gastosRows = (gRes.data ?? []) as any[];

      const vendedoresActivos = new Set(visitasRows.map(v => v.user_id).filter(Boolean));
      const entregasHechas = entregasRows.filter(e => e.status === 'hecho').length;
      const entregasTotales = entregasRows.length;
      const ventasTotal = ventasRows.reduce((s, v) => s + Number(v.total ?? 0), 0);
      const cobrosTotal = cobrosRows.reduce((s, c) => s + Number(c.monto ?? 0), 0);
      const gastosTotal = gastosRows.reduce((s, g) => s + Number(g.monto ?? 0), 0);

      return {
        today,
        visitasCount: visitasRows.length,
        vendedoresActivos: vendedoresActivos.size,
        entregasHechas,
        entregasTotales,
        ventasTotal,
        ventasCount: ventasRows.length,
        cobrosTotal,
        cobrosCount: cobrosRows.length,
        pedidosPendientes: pRes.count ?? (pRes.data?.length ?? 0),
        gastosTotal,
        gastosCount: gastosRows.length,
      };
    },
  });
}
