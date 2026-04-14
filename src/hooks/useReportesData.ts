import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { fetchAllPages } from '@/lib/supabasePaginate';

export function useReportesData(desde: string, hasta: string, vendedorIds?: string[], statusFilter?: string[]) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['reportes-full', empresa?.id, desde, hasta, vendedorIds, statusFilter],
    enabled: !!empresa?.id,
    staleTime: 2 * 60 * 1000, // 2 min stale for reports
    queryFn: async () => {
      const eid = empresa!.id;
      const hasVendorFilter = vendedorIds && vendedorIds.length > 0;

      const activeStatuses = (statusFilter && statusFilter.length > 0 ? statusFilter : ['borrador', 'confirmado', 'entregado', 'facturado']) as any;

      // --- All queries paginated to avoid 1000-row cap ---
      const ventas = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('ventas').select('id, folio, fecha, fecha_entrega, total, saldo_pendiente, status, tipo, condicion_pago, cliente_id, vendedor_id, subtotal, iva_total, ieps_total, descuento_total, clientes(nombre), vendedores(nombre)').eq('empresa_id', eid).eq('es_saldo_inicial', false).gte('fecha', desde).lte('fecha', hasta).in('status', activeStatuses).range(from, to);
        if (hasVendorFilter) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const ventaLineas = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('venta_lineas').select('producto_id, cantidad, precio_unitario, total, subtotal, productos(codigo, nombre), venta_id, ventas!inner(empresa_id, fecha, status, cliente_id, vendedor_id, clientes(nombre), vendedores(nombre))').eq('ventas.empresa_id', eid).gte('ventas.fecha', desde).lte('ventas.fecha', hasta).in('ventas.status', activeStatuses).range(from, to);
        if (hasVendorFilter) q = q.in('ventas.vendedor_id', vendedorIds);
        return q;
      });

      const cobros = await fetchAllPages<any>((from, to) => {
        const q = supabase.from('cobros').select('id, monto, fecha, metodo_pago, cliente_id, clientes(nombre)').eq('empresa_id', eid).neq('status', 'cancelado').gte('fecha', desde).lte('fecha', hasta).range(from, to);
        return q;
      });

      const gastos = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('gastos').select('id, monto, concepto, fecha, vendedor_id, vendedores(nombre)').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta).range(from, to);
        if (hasVendorFilter) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const clientes = await fetchAllPages<any>((from, to) =>
        supabase.from('clientes').select('id, nombre, codigo, status').eq('empresa_id', eid).range(from, to)
      );

      const productos = await fetchAllPages<any>((from, to) =>
        supabase.from('productos').select('id, codigo, nombre, cantidad, costo, precio_principal').eq('empresa_id', eid).eq('status', 'activo').range(from, to)
      );

      const cargas = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('cargas').select('id, fecha, status, vendedor_id, vendedores!cargas_vendedor_id_fkey(nombre), carga_lineas(producto_id, cantidad_cargada, cantidad_vendida, cantidad_devuelta, productos(codigo, nombre))').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).range(from, to);
        if (hasVendorFilter) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const devoluciones = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('devoluciones').select('id, fecha, tipo, notas, vendedor_id, cliente_id, vendedores(nombre), clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))').eq('empresa_id', eid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).range(from, to);
        if (hasVendorFilter) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const entregas = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('ventas').select('id, folio, fecha, fecha_entrega, total, status, tipo, entrega_inmediata, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre), venta_lineas(producto_id, cantidad, total, productos(codigo, nombre))').eq('empresa_id', eid).eq('es_saldo_inicial', false).in('status', ['confirmado', 'entregado']).or(`and(fecha_entrega.gte.${desde},fecha_entrega.lte.${hasta}),and(fecha_entrega.is.null,entrega_inmediata.eq.true,fecha.gte.${desde},fecha.lte.${hasta})`).range(from, to);
        if (hasVendorFilter) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      // === RESUMEN ===
      const totalVentas = ventas.reduce((s, v) => s + (v.total ?? 0), 0);
      const totalCobros = cobros.reduce((s, c) => s + (c.monto ?? 0), 0);
      const totalGastos = gastos.reduce((s, g) => s + (g.monto ?? 0), 0);
      const totalPendiente = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);

      // === CONTADO vs CRÉDITO ===
      const totalContado = ventas.filter(v => v.condicion_pago === 'contado').reduce((s, v) => s + (v.total ?? 0), 0);
      const totalCredito = ventas.filter(v => v.condicion_pago === 'credito').reduce((s, v) => s + (v.total ?? 0), 0);

      // === DESGLOSE POR MÉTODO DE PAGO (from cobros) ===
      const metodoPagoMap: Record<string, number> = {};
      for (const c of cobros) {
        const m = c.metodo_pago ?? 'otro';
        metodoPagoMap[m] = (metodoPagoMap[m] ?? 0) + (c.monto ?? 0);
      }
      const metodosPago = Object.entries(metodoPagoMap)
        .map(([metodo, total]) => ({ metodo, total, pct: totalCobros > 0 ? (total / totalCobros) * 100 : 0 }))
        .sort((a, b) => b.total - a.total);

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
      // Compute utilidad per client from ventaLineas
      const clientUtilMap: Record<string, number> = {};
      const clientCostoMap: Record<string, number> = {};
      for (const l of ventaLineas) {
        const cid = l.ventas?.cliente_id ?? '';
        const prod = productos.find((p: any) => p.id === l.producto_id);
        const costo = (prod?.costo ?? 0) * (l.cantidad ?? 0);
        clientCostoMap[cid] = (clientCostoMap[cid] ?? 0) + costo;
        clientUtilMap[cid] = (clientUtilMap[cid] ?? 0) + ((l.total ?? 0) - costo);
      }
      const ventasPorCliente = Object.entries(cliMap).map(([id, v]) => ({ id, ...v, costo: clientCostoMap[id] ?? 0, utilidad: clientUtilMap[id] ?? 0 })).sort((a, b) => b.total - a.total);

      // === TOP VENDEDORES ===
      const vendMap: Record<string, { nombre: string; total: number; ventas: number }> = {};
      for (const v of ventas) {
        const vid = v.vendedor_id ?? '';
        if (!vendMap[vid]) vendMap[vid] = { nombre: (v.vendedores as any)?.nombre ?? '—', total: 0, ventas: 0 };
        vendMap[vid].total += v.total ?? 0;
        vendMap[vid].ventas += 1;
      }
      // Compute utilidad per vendedor
      const vendUtilMap: Record<string, number> = {};
      const vendCostoMap: Record<string, number> = {};
      for (const l of ventaLineas) {
        const vid = l.ventas?.vendedor_id ?? '';
        const prod = productos.find((p: any) => p.id === l.producto_id);
        const costo = (prod?.costo ?? 0) * (l.cantidad ?? 0);
        vendCostoMap[vid] = (vendCostoMap[vid] ?? 0) + costo;
        vendUtilMap[vid] = (vendUtilMap[vid] ?? 0) + ((l.total ?? 0) - costo);
      }
      const topVendedores = Object.entries(vendMap).map(([id, v]) => ({ id, ...v, costo: vendCostoMap[id] ?? 0, utilidad: vendUtilMap[id] ?? 0 })).sort((a, b) => b.total - a.total);

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
        for (const l of ((d as Record<string, unknown>).devolucion_lineas ?? []) as Record<string, unknown>[]) {
          const motivo = (l.motivo as string) ?? '';
          devPorMotivo[motivo] = (devPorMotivo[motivo] ?? 0) + ((l.cantidad as number) ?? 0);
        }
      }

      return {
        totalVentas, totalCobros, totalGastos, totalPendiente,
        totalContado, totalCredito, metodosPago,
        numVentas: ventas.length, numCobros: cobros.length,
        utilidad: totalVentas - totalGastos, dailyVentas,
        ventaLineas,
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
