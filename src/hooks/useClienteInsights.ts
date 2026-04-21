import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { usePromocionesActivas } from '@/hooks/usePromociones';
import { supabase } from '@/lib/supabase';

interface SuggestedItem {
  producto_id: string;
  cantidad: number;
  source: 'manual' | 'historial';
}

interface MissedProduct {
  producto_id: string;
  nombre: string;
  diasSinPedir: number;
  ultimaCantidad: number;
}

export function useClienteInsights(clienteId: string | null, clienteData?: any) {
  const { empresa } = useAuth();
  const enabled = !!empresa?.id && !!clienteId;

  const { data: ventas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: ventaLineas } = useOfflineQuery('venta_lineas', {}, { enabled });
  const { data: pedidoSugeridoRaw } = useOfflineQuery('cliente_pedido_sugerido', { cliente_id: clienteId }, { enabled });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: promosAll } = usePromocionesActivas();

  // Online fallback: ensures "Repetir última venta" works even when offline cache is cold.
  const { data: lastSaleOnline } = useQuery({
    queryKey: ['cliente-last-sale', empresa?.id, clienteId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: vs } = await supabase
        .from('ventas')
        .select('id, fecha, status, tipo')
        .eq('empresa_id', empresa!.id)
        .eq('cliente_id', clienteId!)
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .neq('tipo', 'saldo_inicial')
        .order('fecha', { ascending: false })
        .limit(1);
      const last = vs?.[0];
      if (!last) return { lineas: [] as any[] };
      const { data: ls } = await supabase
        .from('venta_lineas')
        .select('producto_id, cantidad, venta_id')
        .eq('venta_id', last.id);
      return { lineas: ls ?? [] };
    },
  });

  // ── Client's recent sales (sorted desc) ──
  const clientSales = useMemo(() => {
    if (!ventas || !clienteId) return [] as any[];
    return (ventas as any[])
      .filter(v => v.cliente_id === clienteId
        && ['confirmado', 'entregado', 'facturado'].includes(v.status)
        && v.tipo !== 'saldo_inicial')
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [ventas, clienteId]);

  // ── Last sale + lineas (for "Repetir última venta") ──
  const lastSaleLineas = useMemo(() => {
    if (!clientSales.length || !ventaLineas) return [] as any[];
    const lastId = clientSales[0]?.id;
    return (ventaLineas as any[]).filter(l => l.venta_id === lastId);
  }, [clientSales, ventaLineas]);

  // ── Manual configured list (cliente_pedido_sugerido) ──
  const manualList: SuggestedItem[] = useMemo(() => {
    if (!pedidoSugeridoRaw || pedidoSugeridoRaw.length === 0) return [];
    return (pedidoSugeridoRaw as any[]).map(ps => ({
      producto_id: ps.producto_id,
      cantidad: Number(ps.cantidad) || 1,
      source: 'manual' as const,
    }));
  }, [pedidoSugeridoRaw]);

  // ── Historical average from last 3 sales ──
  const historialAvg: SuggestedItem[] = useMemo(() => {
    if (!clientSales.length || !ventaLineas) return [];
    const last3 = clientSales.slice(0, 3).map(v => v.id);
    if (!last3.length) return [];
    const lineas = (ventaLineas as any[]).filter(l => last3.includes(l.venta_id));
    const map = new Map<string, { sum: number; count: number }>();
    lineas.forEach(l => {
      const ex = map.get(l.producto_id);
      if (ex) { ex.sum += Number(l.cantidad) || 0; ex.count += 1; }
      else map.set(l.producto_id, { sum: Number(l.cantidad) || 0, count: 1 });
    });
    const out: SuggestedItem[] = [];
    map.forEach((v, k) => {
      const avg = Math.max(1, Math.round(v.sum / Math.max(1, last3.length)));
      out.push({ producto_id: k, cantidad: avg, source: 'historial' });
    });
    return out;
  }, [clientSales, ventaLineas]);

  // Backwards-compatible: prefer manual, fallback to historial
  const suggested: SuggestedItem[] = manualList.length > 0 ? manualList : historialAvg;

  // ── Days since last visit ──
  const diasSinVisita = useMemo(() => {
    if (!clientSales.length) return null;
    const last = clientSales[0]?.fecha;
    if (!last) return null;
    const diff = Date.now() - new Date(last).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [clientSales]);

  // ── Missed products: bought before but not in last 2 visits ──
  const missedProducts: MissedProduct[] = useMemo(() => {
    if (!clientSales.length || !ventaLineas || !productos) return [];
    const recentIds = new Set(clientSales.slice(0, 2).map(v => v.id));
    const olderIds = new Set(clientSales.slice(2, 6).map(v => v.id));
    if (!olderIds.size) return [];
    const recentProds = new Set<string>();
    const olderProds = new Map<string, { qty: number; lastDate: string }>();
    (ventaLineas as any[]).forEach(l => {
      if (recentIds.has(l.venta_id)) recentProds.add(l.producto_id);
      if (olderIds.has(l.venta_id)) {
        const sale = clientSales.find(s => s.id === l.venta_id);
        const prev = olderProds.get(l.producto_id);
        if (!prev || (sale?.fecha ?? '') > prev.lastDate) {
          olderProds.set(l.producto_id, { qty: Number(l.cantidad) || 0, lastDate: sale?.fecha ?? '' });
        }
      }
    });
    const out: MissedProduct[] = [];
    olderProds.forEach((v, pid) => {
      if (recentProds.has(pid)) return;
      const prod = (productos as any[]).find(p => p.id === pid);
      if (!prod) return;
      const days = v.lastDate ? Math.floor((Date.now() - new Date(v.lastDate).getTime()) / 86400000) : 0;
      out.push({ producto_id: pid, nombre: prod.nombre, diasSinPedir: days, ultimaCantidad: v.qty });
    });
    return out.sort((a, b) => a.diasSinPedir - b.diasSinPedir).slice(0, 5);
  }, [clientSales, ventaLineas, productos]);

  // ── Pending balance ──
  const saldoPendiente = useMemo(() => {
    if (!ventas || !clienteId) return 0;
    return (ventas as any[])
      .filter(v => v.cliente_id === clienteId
        && (v.saldo_pendiente ?? 0) > 0
        && ['confirmado', 'entregado', 'facturado'].includes(v.status))
      .reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
  }, [ventas, clienteId]);

  // ── Credit info ──
  const creditoInfo = useMemo(() => {
    if (!clienteData?.credito) return null;
    const limite = clienteData.limite_credito ?? 0;
    const disponible = Math.max(0, limite - saldoPendiente);
    return { limite, disponible, dias: clienteData.dias_credito ?? 0 };
  }, [clienteData, saldoPendiente]);

  // ── Promotions applicable to this client / zona ──
  const promosAplicables = useMemo(() => {
    if (!promosAll) return [];
    const zonaId = clienteData?.zona_id ?? null;
    return promosAll.filter((p: any) => {
      const okCli = !p.cliente_id || p.cliente_id === clienteId;
      const okZona = !p.zona_id || p.zona_id === zonaId;
      return okCli && okZona;
    });
  }, [promosAll, clienteData, clienteId]);

  return {
    suggested,
    manualList,
    historialAvg,
    lastSaleLineas,
    diasSinVisita,
    missedProducts,
    saldoPendiente,
    creditoInfo,
    promosAplicables,
  };
}
