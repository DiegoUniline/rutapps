import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type AgingBucket = { label: string; minDays: number; maxDays: number | null; monto: number; clientes: number };
export type AgingClienteRow = {
  ventaId: string; folio: string | null; cliente: string; clienteId: string | null;
  vendedor: string; saldo: number; diasVencido: number; fecha: string; ultimaCompra?: string;
};

export function useDashboardAging() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['dashboard-aging', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eId = empresa!.id;
      const sb: any = supabase;
      const data = await fetchAllPages((from, to) => sb
        .from('ventas')
        .select('id, folio, cliente_id, saldo_pendiente, fecha, fecha_vencimiento, vendedor_id, clientes(nombre)')
        .eq('empresa_id', eId)
        .eq('condicion_pago', 'credito')
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelado')
        .range(from, to));

      // vendedor names
      const vIds = [...new Set((data ?? []).map((v: any) => v.vendedor_id).filter(Boolean))];
      let vendMap = new Map<string, string>();
      if (vIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, nombre, ').in('id', vIds);
        vendMap = new Map((profs ?? []).map((p: any) => [p.id, p.nombre || p. || 'Sin nombre']));
      }

      const today = new Date(); today.setHours(0,0,0,0);
      const buckets: AgingBucket[] = [
        { label: 'Al corriente', minDays: -99999, maxDays: 0, monto: 0, clientes: 0 },
        { label: '1-30 días', minDays: 1, maxDays: 30, monto: 0, clientes: 0 },
        { label: '31-60 días', minDays: 31, maxDays: 60, monto: 0, clientes: 0 },
        { label: '61-90 días', minDays: 61, maxDays: 90, monto: 0, clientes: 0 },
        { label: '90+ días', minDays: 91, maxDays: null, monto: 0, clientes: 0 },
      ];
      const bucketClientes: Set<string>[] = buckets.map(() => new Set());

      const vencidos: AgingClienteRow[] = [];
      (data ?? []).forEach((v: any) => {
        const venc = v.fecha_vencimiento ? new Date(v.fecha_vencimiento) : new Date(v.fecha);
        venc.setHours(0,0,0,0);
        const diff = Math.floor((today.getTime() - venc.getTime()) / 86400000);
        const saldo = Number(v.saldo_pendiente || 0);
        const cid = v.cliente_id || '';
        const idx = buckets.findIndex(b => diff >= b.minDays && (b.maxDays === null || diff <= b.maxDays));
        if (idx >= 0) {
          buckets[idx].monto += saldo;
          if (cid) bucketClientes[idx].add(cid);
        }
        if (diff > 0) {
          vencidos.push({
            ventaId: v.id,
            folio: v.folio,
            cliente: v.clientes?.nombre || 'Cliente',
            clienteId: v.cliente_id,
            vendedor: vendMap.get(v.vendedor_id) || '—',
            saldo,
            diasVencido: diff,
            fecha: v.fecha,
          });
        }
      });
      buckets.forEach((b, i) => { b.clientes = bucketClientes[i].size; });
      vencidos.sort((a, b) => b.saldo - a.saldo);

      const carteraTotal = buckets.reduce((s, b) => s + b.monto, 0);
      return { buckets, vencidos, carteraTotal };
    },
  });
}
