import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import type { DateRange } from '@/hooks/useDashboardData';

const fmt = (d: Date) => {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export type EquipoRow = {
  vendedorId: string;
  nombre: string;
  venta: number;
  margen: number;
  cobrado: number;
  carteraVencida: number;
  visitas: number;
  visitasPlaneadas: number;
  ventasConPedido: number;
  efectividadPct: number;
  cumplimientoRutaPct: number;
  metaPct: number;
  semaforo: 'verde' | 'ambar' | 'rojo';
};

export function useDashboardEquipo(range: DateRange, metaMes: number) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-equipo', empresa?.id, fmt(range.from), fmt(range.to), metaMes],
    enabled: !!empresa?.id,
    queryFn: async (): Promise<EquipoRow[]> => {
      const eId = empresa!.id;
      const fromIso = fmt(range.from); const toIso = fmt(range.to);

      const sb: any = supabase;
      const [vendedoresRes, ventasRes, lineasRes, cobrosRes, carteraRes, visitasRes, clientesRes] = await Promise.all([
        sb.from('profiles').select('id, nombre').eq('empresa_id', eId).eq('estado', 'activo'),
        fetchAllPages((from, to) => sb.from('ventas')
          .select('id, vendedor_id, total, fecha, status, saldo_pendiente, condicion_pago, fecha_vencimiento')
          .eq('empresa_id', eId).eq('es_saldo_inicial', false).neq('status', 'cancelado')
          .gte('fecha', fromIso).lte('fecha', toIso).range(from, to)),
        fetchAllPages((from, to) => sb.from('venta_lineas')
          .select('venta_id, cantidad, total, productos(costo), ventas!inner(vendedor_id, empresa_id, fecha, status)')
          .eq('ventas.empresa_id', eId).gte('ventas.fecha', fromIso).lte('ventas.fecha', toIso)
          .neq('ventas.status', 'cancelado').range(from, to)),
        fetchAllPages((from, to) => sb.from('cobro_aplicaciones')
          .select('monto_aplicado, cobros!inner(user_id, empresa_id, status, fecha), ventas!inner(status)')
          .eq('cobros.empresa_id', eId).neq('cobros.status', 'cancelado')
          .neq('ventas.status', 'cancelado' as any)
          .gte('cobros.fecha', fromIso).lte('cobros.fecha', toIso).range(from, to)),
        fetchAllPages((from, to) => sb.from('ventas')
          .select('vendedor_id, saldo_pendiente, fecha_vencimiento, fecha')
          .eq('empresa_id', eId).eq('condicion_pago', 'credito').gt('saldo_pendiente', 0)
          .neq('status', 'cancelado').range(from, to)),
        fetchAllPages((from, to) => sb.from('visitas')
          .select('user_id, fecha, venta_id')
          .eq('empresa_id', eId).gte('fecha', fromIso).lte('fecha', toIso).range(from, to)),
        sb.from('clientes').select('vendedor_id, status, dia_visita').eq('empresa_id', eId).eq('status', 'activo'),
      ]);

      const vendList = (vendedoresRes.data ?? []) as any[];
      const today = new Date(); today.setHours(0,0,0,0);

      // margen por venta_id (sumar (total - costo*qty) por línea)
      const margenPorVenta = new Map<string, number>();
      (lineasRes ?? []).forEach((l: any) => {
        const costo = Number(l.productos?.costo || 0);
        const qty = Number(l.cantidad || 0);
        const tot = Number(l.total || 0);
        margenPorVenta.set(l.venta_id, (margenPorVenta.get(l.venta_id) || 0) + (tot - costo * qty));
      });

      // clientes planeados por vendedor (suma de días de visita en el rango)
      const diasMap: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0 };
      const diasEnRango = new Set<number>();
      {
        const start = new Date(range.from); start.setHours(0,0,0,0);
        const end = new Date(range.to); end.setHours(0,0,0,0);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) diasEnRango.add(d.getDay());
      }
      const planeadasPorVendedor = new Map<string, number>();
      (clientesRes.data ?? []).forEach((c: any) => {
        if (!c.vendedor_id) return;
        const dias: string[] = Array.isArray(c.dia_visita) ? c.dia_visita : [];
        const ocurrencias = dias.reduce((n, d) => n + (diasEnRango.has(diasMap[(d || '').toLowerCase()] ?? -1) ? 1 : 0), 0);
        planeadasPorVendedor.set(c.vendedor_id, (planeadasPorVendedor.get(c.vendedor_id) || 0) + ocurrencias);
      });

      const rows: EquipoRow[] = vendList.map((v: any) => {
        const vId = v.id;
        const ventasV = (ventasRes ?? []).filter((x: any) => x.vendedor_id === vId);
        const venta = ventasV.reduce((s, x: any) => s + Number(x.total || 0), 0);
        const margen = ventasV.reduce((s, x: any) => s + (margenPorVenta.get(x.id) || 0), 0);
        const cobrado = (cobrosRes ?? []).filter((c: any) => c.cobros?.user_id === vId).reduce((s, c: any) => s + Number(c.monto_aplicado || 0), 0);
        const carteraVencida = (carteraRes ?? [])
          .filter((c: any) => c.vendedor_id === vId && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < today)
          .reduce((s, c: any) => s + Number(c.saldo_pendiente || 0), 0);
        const visitasV = (visitasRes ?? []).filter((v: any) => v.user_id === vId);
        const visitas = visitasV.length;
        const ventasConPedido = visitasV.filter((v: any) => !!v.venta_id).length;
        const visitasPlaneadas = planeadasPorVendedor.get(vId) || 0;
        const efectividadPct = visitas > 0 ? (ventasConPedido / visitas) * 100 : 0;
        const cumplimientoRutaPct = visitasPlaneadas > 0 ? (visitas / visitasPlaneadas) * 100 : 0;

        // %Meta y avance esperado del mes (basado en today vs mes)
        const metaProporcional = metaMes > 0 ? metaMes / Math.max(vendList.length, 1) : 0;
        const metaPct = metaProporcional > 0 ? (venta / metaProporcional) * 100 : 0;
        const diaMes = new Date().getDate();
        const ultDia = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const avanceEsperado = (diaMes / ultDia) * 100;
        const carteraVencidaPct = venta > 0 ? (carteraVencida / venta) * 100 : 0;

        let semaforo: 'verde' | 'ambar' | 'rojo' = 'ambar';
        if (metaProporcional > 0) {
          if (metaPct >= avanceEsperado && carteraVencidaPct < 10) semaforo = 'verde';
          else if (metaPct < avanceEsperado * 0.7 || carteraVencidaPct > 25) semaforo = 'rojo';
        } else {
          semaforo = carteraVencidaPct > 25 ? 'rojo' : 'verde';
        }

        return {
          vendedorId: vId,
          nombre: v.nombre || 'Sin nombre',
          venta, margen, cobrado, carteraVencida,
          visitas, visitasPlaneadas, ventasConPedido,
          efectividadPct, cumplimientoRutaPct, metaPct,
          semaforo,
        };
      });

      return rows.sort((a, b) => b.venta - a.venta);
    },
  });
}
