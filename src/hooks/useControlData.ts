import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { subDays, format } from 'date-fns';

export function useControlData(dateRange: { from: Date; to: Date }) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  // 1. Ventas canceladas
  const canceladas = useQuery({
    queryKey: ['control-canceladas', empresaId, from, to],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, cliente_id, vendedor_id, clientes(nombre), vendedores(nombre)')
        .eq('empresa_id', empresaId!)
        .eq('status', 'cancelado')
        .gte('fecha', from)
        .lte('fecha', to)
        .order('fecha', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // 2. Descuentos altos (>15%)
  const descuentosAltos = useQuery({
    queryKey: ['control-descuentos', empresaId, from, to],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, descuento_porcentaje, descuento_monto, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre)')
        .eq('empresa_id', empresaId!)
        .gte('fecha', from)
        .lte('fecha', to)
        .gt('descuento_porcentaje', 15)
        .neq('status', 'cancelado')
        .order('descuento_porcentaje', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // 3. Ventas por debajo del costo (margin check)
  const ventasBajoCosto = useQuery({
    queryKey: ['control-bajo-costo', empresaId, from, to],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: ventas } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre), venta_lineas(producto_id, cantidad, precio_unitario, total)')
        .eq('empresa_id', empresaId!)
        .gte('fecha', from)
        .lte('fecha', to)
        .neq('status', 'cancelado')
        .order('fecha', { ascending: false })
        .limit(500);

      if (!ventas || ventas.length === 0) return [];

      // Get product costs
      const productoIds = [...new Set(ventas.flatMap(v => (v.venta_lineas ?? []).map((l: any) => l.producto_id)))];
      if (productoIds.length === 0) return [];

      const { data: productos } = await supabase
        .from('productos')
        .select('id, costo, nombre')
        .in('id', productoIds.slice(0, 200));

      const costoMap = new Map((productos ?? []).map(p => [p.id, { costo: p.costo ?? 0, nombre: p.nombre }]));

      const alerts: any[] = [];
      for (const v of ventas) {
        for (const l of (v.venta_lineas ?? []) as any[]) {
          const prod = costoMap.get(l.producto_id);
          if (prod && prod.costo > 0 && l.precio_unitario < prod.costo) {
            alerts.push({
              venta_id: v.id,
              folio: v.folio,
              fecha: v.fecha,
              producto: prod.nombre,
              costo: prod.costo,
              precio_venta: l.precio_unitario,
              cantidad: l.cantidad,
              perdida: (prod.costo - l.precio_unitario) * l.cantidad,
              vendedor: (v.vendedores as any)?.nombre ?? '—',
              cliente: (v.clientes as any)?.nombre ?? '—',
            });
          }
        }
      }
      return alerts.sort((a, b) => b.perdida - a.perdida).slice(0, 50);
    },
  });

  // 4. Diferencias en descargas de ruta
  const diferenciasDescarga = useQuery({
    queryKey: ['control-descargas', empresaId, from, to],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await (supabase.from as any)('descargas_ruta')
        .select('id, fecha, status, vendedor_id, diferencia_efectivo, efectivo_esperado, efectivo_entregado, vendedores(nombre), descarga_ruta_lineas(producto_id, cantidad_esperada, cantidad_real, diferencia, productos(nombre))')
        .eq('empresa_id', empresaId!)
        .gte('fecha', from)
        .lte('fecha', to)
        .order('fecha', { ascending: false })
        .limit(50);

      const alerts: any[] = [];
      for (const d of (data ?? []) as any[]) {
        const difEfectivo = d.diferencia_efectivo ?? 0;
        const lineasConDif = ((d.descarga_ruta_lineas ?? []) as any[]).filter((l: any) => (l.diferencia ?? 0) !== 0);

        if (difEfectivo !== 0 || lineasConDif.length > 0) {
          alerts.push({
            id: d.id,
            fecha: d.fecha,
            vendedor: d.vendedores?.nombre ?? '—',
            status: d.status,
            diferencia_efectivo: difEfectivo,
            efectivo_esperado: d.efectivo_esperado,
            efectivo_entregado: d.efectivo_entregado,
            productos_con_diferencia: lineasConDif.length,
            lineas: lineasConDif.map((l: any) => ({
              producto: l.productos?.nombre ?? '—',
              esperada: l.cantidad_esperada,
              real: l.cantidad_real,
              diferencia: l.diferencia,
            })),
          });
        }
      }
      return alerts;
    },
  });

  // 5. Cobros pendientes vencidos (crédito vencido)
  const creditoVencido = useQuery({
    queryKey: ['control-credito-vencido', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, dias_credito, cliente_id, vendedor_id, clientes(nombre), vendedores(nombre)')
        .eq('empresa_id', empresaId!)
        .eq('condicion_pago', 'credito')
        .gt('saldo_pendiente', 0)
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: true })
        .limit(100);

      const today = new Date();
      return (data ?? [])
        .map((v: any) => {
          const fechaVenta = new Date(v.fecha);
          const diasCredito = v.dias_credito ?? 30;
          const vencimiento = new Date(fechaVenta);
          vencimiento.setDate(vencimiento.getDate() + diasCredito);
          const diasVencido = Math.floor((today.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24));
          return {
            ...v,
            vencimiento: format(vencimiento, 'yyyy-MM-dd'),
            dias_vencido: diasVencido,
            cliente: (v.clientes as any)?.nombre ?? '—',
            vendedor: (v.vendedores as any)?.nombre ?? '—',
          };
        })
        .filter((v: any) => v.dias_vencido > 0)
        .sort((a: any, b: any) => b.dias_vencido - a.dias_vencido);
    },
  });

  // 6. Historial de cambios de venta (bitácora)
  const historial = useQuery({
    queryKey: ['control-historial', empresaId, from, to],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_historial')
        .select('id, venta_id, accion, detalle, created_at, user_id, ventas(folio), profiles(nombre)')
        .eq('empresa_id', empresaId!)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const isLoading = canceladas.isLoading || descuentosAltos.isLoading || ventasBajoCosto.isLoading 
    || diferenciasDescarga.isLoading || creditoVencido.isLoading || historial.isLoading;

  return {
    canceladas: canceladas.data ?? [],
    descuentosAltos: descuentosAltos.data ?? [],
    ventasBajoCosto: ventasBajoCosto.data ?? [],
    diferenciasDescarga: diferenciasDescarga.data ?? [],
    creditoVencido: creditoVencido.data ?? [],
    historial: historial.data ?? [],
    isLoading,
  };
}
