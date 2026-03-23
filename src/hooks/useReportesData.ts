import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export function useReportesData(desde: string, hasta: string, vendedorIds?: string[]) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['reportes-full', empresa?.id, desde, hasta, vendedorIds],
    enabled: !!empresa?.id,
    staleTime: 2 * 60 * 1000, // 2 min stale for reports
    queryFn: async () => {
      const eid = empresa!.id;
      const hasVendorFilter = vendedorIds && vendedorIds.length > 0;

      let ventasQ = supabase.from('ventas').select('id, folio, fecha, fecha_entrega, total, saldo_pendiente, status, tipo, condicion_pago, cliente_id, vendedor_id, subtotal, iva_total, ieps_total, descuento_total, clientes(nombre), vendedores(nombre)').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta);
      if (hasVendorFilter) ventasQ = ventasQ.in('vendedor_id', vendedorIds);

      let cobrosQ = supabase.from('cobros').select('id, monto, fecha, metodo_pago, cliente_id, clientes(nombre)').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta);

      let gastosQ = supabase.from('gastos').select('id, monto, concepto, fecha, vendedor_id, vendedores(nombre)').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta);
      if (hasVendorFilter) gastosQ = gastosQ.in('vendedor_id', vendedorIds);

      const clientesQ = supabase.from('clientes').select('id, nombre, codigo, status').eq('empresa_id', eid);
      const productosQ = supabase.from('productos').select('id, codigo, nombre, cantidad, costo, precio_principal').eq('empresa_id', eid).eq('status', 'activo');

      let ventaLineasQ = supabase.from('venta_lineas').select('producto_id, cantidad, precio_unitario, total, subtotal, productos(codigo, nombre), venta_id, ventas!inner(empresa_id, fecha, cliente_id, vendedor_id, clientes(nombre), vendedores(nombre))').eq('ventas.empresa_id', eid).gte('ventas.fecha', desde).lte('ventas.fecha', hasta);
      if (hasVendorFilter) ventaLineasQ = ventaLineasQ.in('ventas.vendedor_id', vendedorIds);

      let cargasQ = supabase.from('cargas').select('id, fecha, status, vendedor_id, vendedores!cargas_vendedor_id_fkey(nombre), carga_lineas(producto_id, cantidad_cargada, cantidad_vendida, cantidad_devuelta, productos(codigo, nombre))').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
      if (hasVendorFilter) cargasQ = cargasQ.in('vendedor_id', vendedorIds);

      let devolucionesQ = supabase.from('devoluciones').select('id, fecha, tipo, notas, vendedor_id, cliente_id, vendedores(nombre), clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, productos(codigo, nombre))').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
      if (hasVendorFilter) devolucionesQ = devolucionesQ.in('vendedor_id', vendedorIds);

      let entregasQ = supabase.from('ventas').select('id, folio, fecha, fecha_entrega, total, status, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre), venta_lineas(producto_id, cantidad, total, productos(codigo, nombre))').eq('empresa_id', eid).gte('fecha_entrega', desde).lte('fecha_entrega', hasta).in('status', ['confirmado', 'entregado']);
      if (hasVendorFilter) entregasQ = entregasQ.in('vendedor_id', vendedorIds);

      const [ventasRes, cobrosRes, gastosRes, clientesRes, productosRes, ventaLineasRes, cargasRes, devolucionesRes, entregasRes] = await Promise.all([
        ventasQ, cobrosQ, gastosQ, clientesQ, productosQ, ventaLineasQ, cargasQ, devolucionesQ, entregasQ,
      ]);

      const ventas = ventasRes.data ?? [];
      const cobros = cobrosRes.data ?? [];
      const gastos = gastosRes.data ?? [];
      const clientes = clientesRes.data ?? [];
      const productos = productosRes.data ?? [];
      const ventaLineas = ventaLineasRes.data ?? [];
      const cargas = cargasRes.data ?? [];
      const devoluciones = devolucionesRes.data ?? [];
      const entregas = entregasRes.data ?? [];

      // === RESUMEN ===
      const totalVentas = ventas.reduce((s, v) => s + (v.total ?? 0), 0);
      const totalCobros = cobros.reduce((s, c) => s + (c.monto ?? 0), 0);
      const totalGastos = gastos.reduce((s, g) => s + (g.monto ?? 0), 0);
      const totalPendiente = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);

      const dailyMap: Record<string, number> = {};
      for (const v of ventas) { dailyMap[v.fecha] = (dailyMap[v.fecha] ?? 0) + (v.total ?? 0); }
      const dailyVentas = Object.entries(dailyMap).sort().map(([fecha, total]) => ({ fecha, total }));

      // === VENTAS POR PRODUCTO ===
      const prodMap: Record<string, { nombre: string; codigo: string; cantidad: number; total: number; costo: number }> = {};
      for (const l of ventaLineas) {
        const pid = l.producto_id ?? '';
        const prod = productos.find(p => p.id === pid);
        if (!prodMap[pid]) prodMap[pid] = { nombre: (l.productos as any)?.nombre ?? '', codigo: (l.productos as any)?.codigo ?? '', cantidad: 0, total: 0, costo: (prod?.costo ?? 0) };
        prodMap[pid].cantidad += l.cantidad ?? 0;
        prodMap[pid].total += l.total ?? 0;
      }
      const ventasPorProducto = Object.entries(prodMap).map(([id, v]) => ({ id, ...v, utilidad: v.total - (v.costo * v.cantidad) })).sort((a, b) => b.total - a.total);

      // === VENTAS POR CLIENTE ===
      const cliMap: Record<string, { nombre: string; total: number; ventas: number; pendiente: number }> = {};
      for (const v of ventas) {
        const cid = v.cliente_id ?? '';
        if (!cliMap[cid]) cliMap[cid] = { nombre: (v.clientes as any)?.nombre ?? '—', total: 0, ventas: 0, pendiente: 0 };
        cliMap[cid].total += v.total ?? 0;
        cliMap[cid].ventas += 1;
        cliMap[cid].pendiente += v.saldo_pendiente ?? 0;
      }
      const ventasPorCliente = Object.entries(cliMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);

      // === TOP VENDEDORES ===
      const vendMap: Record<string, { nombre: string; total: number; ventas: number }> = {};
      for (const v of ventas) {
        const vid = v.vendedor_id ?? '';
        if (!vendMap[vid]) vendMap[vid] = { nombre: (v.vendedores as any)?.nombre ?? '—', total: 0, ventas: 0 };
        vendMap[vid].total += v.total ?? 0;
        vendMap[vid].ventas += 1;
      }
      const topVendedores = Object.entries(vendMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);

      // === UTILIDAD ===
      const costoTotal = ventaLineas.reduce((s, l) => {
        const prod = productos.find(p => p.id === l.producto_id);
        return s + ((prod?.costo ?? 0) * (l.cantidad ?? 0));
      }, 0);

      const gastosPorConcepto: Record<string, number> = {};
      for (const g of gastos) {
        gastosPorConcepto[g.concepto] = (gastosPorConcepto[g.concepto] ?? 0) + (g.monto ?? 0);
      }
      const gastosDesglose = Object.entries(gastosPorConcepto).map(([concepto, monto]) => ({ concepto, monto })).sort((a, b) => b.monto - a.monto);

      // === ENTREGAS ===
      const entregasPorRuta: Record<string, { nombre: string; entregas: number; total: number; productos: Record<string, { codigo: string; nombre: string; cantidad: number }> }> = {};
      for (const e of entregas) {
        const vid = e.vendedor_id ?? 'sin-ruta';
        if (!entregasPorRuta[vid]) entregasPorRuta[vid] = { nombre: (e.vendedores as any)?.nombre ?? 'Sin ruta', entregas: 0, total: 0, productos: {} };
        entregasPorRuta[vid].entregas += 1;
        entregasPorRuta[vid].total += e.total ?? 0;
        for (const l of ((e as Record<string, unknown>).venta_lineas ?? []) as Record<string, unknown>[]) {
          const pid = (l.producto_id as string) ?? '';
          const prod = l.productos as { codigo?: string; nombre?: string } | null;
          if (!entregasPorRuta[vid].productos[pid]) entregasPorRuta[vid].productos[pid] = { codigo: prod?.codigo ?? '', nombre: prod?.nombre ?? '', cantidad: 0 };
          entregasPorRuta[vid].productos[pid].cantidad += (l.cantidad as number) ?? 0;
        }
      }

      // === CARGAS ===
      const cargasData = cargas.map((c) => {
        const cLineas = ((c as Record<string, unknown>).carga_lineas ?? []) as Record<string, unknown>[];
        const vend = (c as Record<string, unknown>).vendedores as { nombre?: string } | null;
        return {
          id: c.id,
          fecha: c.fecha,
          status: c.status,
          vendedor: vend?.nombre ?? '—',
          lineas: cLineas.map((l) => ({
            codigo: ((l.productos as Record<string, unknown>)?.codigo as string) ?? '',
            nombre: ((l.productos as Record<string, unknown>)?.nombre as string) ?? '',
            cargada: (l.cantidad_cargada as number) ?? 0,
            vendida: (l.cantidad_vendida as number) ?? 0,
            devuelta: (l.cantidad_devuelta as number) ?? 0,
          })),
          totalCargado: cLineas.reduce((s, l) => s + ((l.cantidad_cargada as number) ?? 0), 0),
          totalVendido: cLineas.reduce((s, l) => s + ((l.cantidad_vendida as number) ?? 0), 0),
        };
      });

      // === DEVOLUCIONES ===
      const devData = devoluciones.map((d) => {
        const dLineas = ((d as Record<string, unknown>).devolucion_lineas ?? []) as Record<string, unknown>[];
        const vend = (d as Record<string, unknown>).vendedores as { nombre?: string } | null;
        const cli = (d as Record<string, unknown>).clientes as { nombre?: string } | null;
        return {
          id: d.id,
          fecha: d.fecha,
          tipo: d.tipo,
          vendedor: vend?.nombre ?? '—',
          cliente: cli?.nombre ?? '—',
          lineas: dLineas.map((l) => ({
            codigo: ((l.productos as Record<string, unknown>)?.codigo as string) ?? '',
            nombre: ((l.productos as Record<string, unknown>)?.nombre as string) ?? '',
            cantidad: (l.cantidad as number) ?? 0,
            motivo: (l.motivo as string) ?? '',
          })),
          totalPiezas: dLineas.reduce((s, l) => s + ((l.cantidad as number) ?? 0), 0),
        };
      });

      const devPorMotivo: Record<string, number> = {};
      for (const d of devoluciones) {
        for (const l of ((d as any).devolucion_lineas ?? [])) {
          devPorMotivo[l.motivo] = (devPorMotivo[l.motivo] ?? 0) + (l.cantidad ?? 0);
        }
      }

      return {
        totalVentas, totalCobros, totalGastos, totalPendiente,
        numVentas: ventas.length, numCobros: cobros.length,
        utilidad: totalVentas - totalGastos, dailyVentas,
        ventasPorProducto,
        ventasPorCliente,
        topVendedores,
        costoTotal, gastosDesglose,
        utilidadBruta: totalVentas - costoTotal,
        utilidadNeta: totalVentas - costoTotal - totalGastos,
        entregas, entregasPorRuta: Object.values(entregasPorRuta),
        totalEntregas: entregas.length,
        cargasData,
        devData, devPorMotivo,
        totalDevoluciones: devoluciones.length,
      };
    },
  });
}
