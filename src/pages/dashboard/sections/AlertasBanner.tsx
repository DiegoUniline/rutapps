import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardAlertas, type AlertaItem } from '../hooks/useDashboardAlertas';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type AlertKey = 'creditoExcedido' | 'vendedoresSinGps' | 'facturasPorVencer' | 'pedidosPendientesViejos';

const CHIP_META: Record<AlertKey, { label: (n: number) => string; tone: 'red' | 'amber' }> = {
  creditoExcedido: { label: (n) => `${n} cliente${n === 1 ? '' : 's'} excedió límite de crédito`, tone: 'red' },
  vendedoresSinGps: { label: (n) => `${n} vendedor${n === 1 ? '' : 'es'} sin actividad GPS hoy`, tone: 'amber' },
  facturasPorVencer: { label: (n) => `${n} factura${n === 1 ? '' : 's'} vence${n === 1 ? '' : 'n'} esta semana`, tone: 'amber' },
  pedidosPendientesViejos: { label: (n) => `${n} pedido${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} >24h`, tone: 'amber' },
};

const MODAL_TITLES: Record<AlertKey, string> = {
  creditoExcedido: 'Clientes con crédito excedido',
  vendedoresSinGps: 'Vendedores sin actividad GPS hoy',
  facturasPorVencer: 'Facturas que vencen esta semana',
  pedidosPendientesViejos: 'Pedidos pendientes con más de 24 h',
};

export default function AlertasBanner() {
  const { data, isLoading } = useDashboardAlertas();
  const [collapsed, setCollapsed] = useState(false);
  const [modalKey, setModalKey] = useState<AlertKey | null>(null);

  if (isLoading) return <div className="mt-3 mb-3 h-10 bg-accent/40 rounded-lg animate-pulse" />;

  const total = data?.total ?? 0;

  if (total === 0) {
    return (
      <div className="mt-3 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))] text-xs">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Sin alertas activas</span>
      </div>
    );
  }

  const chips: { key: AlertKey; items: AlertaItem[] }[] = (['creditoExcedido','vendedoresSinGps','facturasPorVencer','pedidosPendientesViejos'] as AlertKey[])
    .map((k) => ({ key: k, items: (data as any)[k] as AlertaItem[] }))
    .filter((c) => c.items.length > 0);

  return (
    <>
      <div className="mt-3 mb-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <button
          onClick={() => setCollapsed((s) => !s)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {total} alerta{total === 1 ? '' : 's'} activa{total === 1 ? '' : 's'}
            </span>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-destructive" /> : <ChevronUp className="h-4 w-4 text-destructive" />}
        </button>
        {!collapsed && (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {chips.map((c) => {
              const meta = CHIP_META[c.key];
              const tone = meta.tone === 'red'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-[hsl(var(--warning))] text-white hover:opacity-90';
              return (
                <button
                  key={c.key}
                  onClick={() => setModalKey(c.key)}
                  className={cn('text-xs font-medium px-3 py-1.5 rounded-full transition-colors', tone)}
                >
                  {meta.label(c.items.length)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!modalKey} onOpenChange={(o) => !o && setModalKey(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle>{modalKey ? MODAL_TITLES[modalKey] : ''}</DialogTitle>
          </DialogHeader>
          {modalKey && (
            <ul className="space-y-1">
              {((data as any)[modalKey] as AlertaItem[]).map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 border-b border-border py-2 text-sm">
                  <div>
                    <div className="font-medium text-foreground">{it.nombre}</div>
                    {it.detalle && <div className="text-xs text-muted-foreground">{it.detalle}</div>}
                  </div>
                  {it.monto !== undefined && (
                    <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                      ${it.monto.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
