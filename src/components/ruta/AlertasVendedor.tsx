import { AlertTriangle, Clock, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';

export default function AlertasVendedor() {
  const { fmt } = useCurrency();
  const { empresa, profile } = useAuth();
  const vendedorId = profile?.vendedor_id;

  const { data: ventas } = useOfflineQuery('ventas', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id, status: 'activo' }, { enabled: !!empresa?.id });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });

  // Saldos pendientes
  const ventasCredito = (ventas ?? []).filter((v: any) => v.condicion_pago === 'credito' && (v.saldo_pendiente ?? 0) > 0 && ['confirmado', 'entregado', 'facturado'].includes(v.status));
  const saldosMap = new Map<string, { nombre: string; total: number }>();
  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c.nombre]));

  ventasCredito.forEach((v: any) => {
    const cid = v.cliente_id;
    const existing = saldosMap.get(cid);
    if (existing) {
      existing.total += v.saldo_pendiente ?? 0;
    } else {
      saldosMap.set(cid, { nombre: clienteMap.get(cid) ?? '—', total: v.saldo_pendiente ?? 0 });
    }
  });
  const saldos = Array.from(saldosMap.values()).sort((a, b) => b.total - a.total);
  const totalPendiente = saldos.reduce((s, x) => s + x.total, 0);

  // Stock bajo
  const lowStock = (productos ?? []).filter((p: any) => (p.min ?? 0) > 0 && (p.cantidad ?? 0) <= (p.min ?? 0));

  const items: { icon: any; color: string; text: string; detail: string }[] = [];

  if (totalPendiente > 0) {
    items.push({
      icon: Clock,
      color: 'text-destructive bg-destructive/10',
      text: `${saldos.length} clientes con saldo`,
      detail: `$ ${fmt(totalPendiente)} por cobrar`,
    });
  }

  if (lowStock.length > 0) {
    items.push({
      icon: Package,
      color: 'text-warning bg-warning/10',
      text: `${lowStock.length} productos stock bajo`,
      detail: lowStock.slice(0, 5).map((p: any) => p.nombre).join(', '),
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
