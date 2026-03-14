import { AlertTriangle, Clock, Package, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function AlertasVendedor() {
  const { empresa } = useAuth();

  const { data: alertas } = useQuery({
    queryKey: ['ruta-alertas', empresa?.id],
    enabled: !!empresa?.id,
    refetchInterval: 5 * 60 * 1000, // every 5 min
    queryFn: async () => {
      const eid = empresa!.id;
      const [saldosVencidos, stockBajo, clientesSinVisita] = await Promise.all([
        // Clientes con saldo pendiente > 0 on crédito
        supabase.from('ventas')
          .select('cliente_id, saldo_pendiente, clientes(nombre)')
          .eq('empresa_id', eid)
          .eq('condicion_pago', 'credito')
          .gt('saldo_pendiente', 0)
          .in('status', ['confirmado', 'entregado', 'facturado']),
        // Products with low stock (cantidad <= min and min > 0)
        supabase.from('productos')
          .select('id, nombre, cantidad, min')
          .eq('empresa_id', eid)
          .eq('status', 'activo')
          .gt('min', 0),
        // Clients with today's visit day but no sale today
        supabase.from('clientes')
          .select('id, nombre')
          .eq('empresa_id', eid)
          .eq('status', 'activo'),
      ]);

      // Process saldos vencidos - group by client
      const saldosMap = new Map<string, { nombre: string; total: number }>();
      (saldosVencidos.data ?? []).forEach((v: any) => {
        const cid = v.cliente_id;
        const existing = saldosMap.get(cid);
        if (existing) {
          existing.total += v.saldo_pendiente ?? 0;
        } else {
          saldosMap.set(cid, { nombre: v.clientes?.nombre ?? '—', total: v.saldo_pendiente ?? 0 });
        }
      });
      const saldos = Array.from(saldosMap.values()).sort((a, b) => b.total - a.total);

      // Process stock bajo
      const lowStock = (stockBajo.data ?? []).filter((p: any) => (p.cantidad ?? 0) <= (p.min ?? 0));

      return {
        saldosPendientes: saldos,
        totalPendiente: saldos.reduce((s, x) => s + x.total, 0),
        stockBajo: lowStock.slice(0, 5),
        numStockBajo: lowStock.length,
      };
    },
  });

  if (!alertas) return null;

  const items: { icon: any; color: string; text: string; detail: string }[] = [];

  if (alertas.totalPendiente > 0) {
    items.push({
      icon: Clock,
      color: 'text-destructive bg-destructive/10',
      text: `${alertas.saldosPendientes.length} clientes con saldo`,
      detail: `$ ${fmt(alertas.totalPendiente)} por cobrar`,
    });
  }

  if (alertas.numStockBajo > 0) {
    items.push({
      icon: Package,
      color: 'text-warning bg-warning/10',
      text: `${alertas.numStockBajo} productos stock bajo`,
      detail: alertas.stockBajo.map(p => p.nombre).join(', '),
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5 px-4 pb-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-3 py-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
            <item.icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground">{item.text}</p>
            <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
