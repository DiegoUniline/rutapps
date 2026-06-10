import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type AlertaItem = { id: string; nombre: string; detalle?: string; monto?: number };
export type AlertasData = {
  creditoExcedido: AlertaItem[];
  vendedoresSinGps: AlertaItem[];
  facturasPorVencer: AlertaItem[];
  pedidosPendientesViejos: AlertaItem[];
  total: number;
};

export function useDashboardAlertas() {
  const { empresa } = useAuth();
  return useQuery<AlertasData>({
    queryKey: ['dashboard-alertas', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const eId = empresa!.id;
      const todayIso = new Date().toISOString().slice(0, 10);
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      const in7Iso = in7.toISOString().slice(0, 10);
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      // 1) Clientes con crédito excedido: sumar saldo_pendiente por cliente y comparar con limite_credito
      const sb: any = supabase;
      const [clientesRes, ventasCreditoRes, vendedoresRes, ubicRes, facturasRes, pedidosPendRes] = await Promise.all([
        sb.from('clientes').select('id, nombre, limite_credito, credito').eq('empresa_id', eId).eq('credito', true).gt('limite_credito', 0),
        fetchAllPages((from, to) =>
          sb.from('ventas').select('cliente_id, saldo_pendiente').eq('empresa_id', eId).eq('condicion_pago', 'credito').gt('saldo_pendiente', 0).neq('status', 'cancelado').range(from, to)
        ),
        sb.from('profiles').select('id, nombre').eq('empresa_id', eId).eq('estado', 'activo'),
        sb.from('vendedor_ubicaciones').select('user_id, updated_at').eq('empresa_id', eId).gte('updated_at', todayIso),
        sb.from('ventas').select('id, folio, total, saldo_pendiente, fecha_vencimiento, clientes(nombre)').eq('empresa_id', eId).eq('requiere_factura', true).gt('saldo_pendiente', 0).neq('status', 'cancelado').gte('fecha_vencimiento', todayIso).lte('fecha_vencimiento', in7Iso),
        sb.from('ventas').select('id, folio, total, created_at, clientes(nombre)').eq('empresa_id', eId).eq('tipo', 'pedido').in('status', ['confirmado', 'borrador']).lt('created_at', since24h),
      ]);

      // Build credito excedido
      const saldoPorCliente = new Map<string, number>();
      (ventasCreditoRes ?? []).forEach((v: any) => {
        if (!v.cliente_id) return;
        saldoPorCliente.set(v.cliente_id, (saldoPorCliente.get(v.cliente_id) || 0) + Number(v.saldo_pendiente || 0));
      });
      const creditoExcedido: AlertaItem[] = (clientesRes.data ?? [])
        .map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
          monto: saldoPorCliente.get(c.id) || 0,
          limite: Number(c.limite_credito || 0),
        }))
        .filter((c) => c.monto > c.limite && c.limite > 0)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          monto: c.monto,
          detalle: `Saldo $${c.monto.toFixed(0)} / Límite $${c.limite.toFixed(0)}`,
        }));

      // Vendedores sin GPS hoy: profiles activos sin entry en vendedor_ubicaciones hoy
      const conGps = new Set((ubicRes.data ?? []).map((u: any) => u.user_id));
      const vendedoresSinGps: AlertaItem[] = (vendedoresRes.data ?? [])
        .filter((v: any) => !conGps.has(v.id))
        .map((v: any) => ({ id: v.id, nombre: v.nombre || 'Sin nombre' }));

      // Facturas por vencer (ventas a crédito con factura en próximos 7 días)
      const facturasPorVencer: AlertaItem[] = (facturasRes.data ?? []).map((v: any) => ({
        id: v.id,
        nombre: v.folio || '—',
        monto: Number(v.saldo_pendiente || 0),
        detalle: `${v.clientes?.nombre ?? 'Cliente'} · vence ${v.fecha_vencimiento}`,
      }));

      // Pedidos pendientes >24h
      const pedidosPendientesViejos: AlertaItem[] = (pedidosPendRes.data ?? []).map((v: any) => ({
        id: v.id,
        nombre: v.folio || '—',
        monto: Number(v.total || 0),
        detalle: `${v.clientes?.nombre ?? 'Cliente'} · creado ${new Date(v.created_at).toLocaleDateString('es-MX')}`,
      }));

      const total =
        creditoExcedido.length +
        vendedoresSinGps.length +
        facturasPorVencer.length +
        pedidosPendientesViejos.length;

      return {
        creditoExcedido,
        vendedoresSinGps,
        facturasPorVencer,
        pedidosPendientesViejos,
        total,
      };
    },
  });
}
