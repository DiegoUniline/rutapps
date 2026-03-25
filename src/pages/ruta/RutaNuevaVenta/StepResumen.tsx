import { useCurrency } from '@/hooks/useCurrency';
import { Check, Receipt, Tag } from 'lucide-react';
import type { CartItem, DevolucionItem } from './types';
import { MOTIVOS, ACCIONES } from './types';
import type { PromoResult } from '@/hooks/usePromociones';

interface Props {
  clienteNombre: string;
  devoluciones: DevolucionItem[];
  cambioItems: CartItem[];
  chargedItems: CartItem[];
  promoResults: PromoResult[];
  totals: { subtotal: number; iva: number; ieps: number; total: number; descuento: number; descuentoDevolucion?: number };
  saldoPendienteTotal: number;
  setStep: (s: any) => void;
  goToPayment: () => void;
  navigate: (to: any) => void;
  cart: CartItem[];
  fmt: (n: number) => string;
}

export function StepResumen(props: Props) {
  const { clienteNombre, devoluciones, cambioItems, chargedItems, promoResults, totals, saldoPendienteTotal, setStep, goToPayment, navigate, cart, fmt } = props;
  const { symbol: s } = useCurrency();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-3 pt-2.5 pb-24 space-y-2.5">
        <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2.5">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0"><span className="text-[10px] font-bold text-foreground">{clienteNombre.charAt(0)}</span></div>
          <div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-foreground truncate">{clienteNombre}</p></div>
          <button onClick={() => setStep('cliente')} className="text-[10.5px] text-primary font-medium">Cambiar</button>
        </div>
        {devoluciones.length > 0 && (
          <section className="bg-card rounded-lg p-3">
            <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Devoluciones ({devoluciones.length})</p><button onClick={() => setStep('devoluciones')} className="text-[10.5px] text-primary font-medium">Editar</button></div>
            {devoluciones.map(d => (
              <div key={d.producto_id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0 text-[11px]">
                <span className="text-foreground truncate flex-1 mr-2">{d.cantidad}x {d.nombre}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${d.accion === 'reposicion' ? 'bg-primary/10 text-primary' : d.accion === 'descuento_venta' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-accent text-muted-foreground'}`}>
                    {ACCIONES.find(a => a.value === d.accion)?.label}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent text-muted-foreground">
                    {MOTIVOS.find(m => m.value === d.motivo)?.label}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
        {cambioItems.length > 0 && (
          <section className="bg-card rounded-lg p-3"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cambios (sin cargo)</p>{cambioItems.map(item => (<div key={`cambio-${item.producto_id}`} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0"><div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p><p className="text-[10.5px] text-muted-foreground">{item.cantidad} × $0.00</p></div><span className="text-[12.5px] font-semibold text-muted-foreground shrink-0"{s}0.00</span></div>))}</section>
        )}
        <section className="bg-card rounded-lg p-3">
          <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Productos ({chargedItems.length})</p><button onClick={() => setStep('productos')} className="text-[10.5px] text-primary font-medium">Editar</button></div>
          <div className="space-y-1">{chargedItems.map(item => { const lineTotal = item.precio_unitario * item.cantidad; return (<div key={item.producto_id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0"><div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p><p className="text-[10.5px] text-muted-foreground">{item.cantidad} × ${fmt(item.precio_unitario)} / {item.unidad}</p></div><span className="text-[12.5px] font-semibold text-foreground shrink-0 tabular-nums">{s}{fmt(lineTotal)}</span></div>); })}</div>
        </section>
        {promoResults.length > 0 && (
          <section className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Tag className="h-3 w-3" /> Promociones aplicadas</p>
            {promoResults.map((r, i) => (<div key={i} className="flex justify-between text-[11px] py-0.5"><span className="text-emerald-700 dark:text-emerald-300 truncate flex-1 mr-2">{r.descripcion}</span>{r.descuento > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">{s}{fmt(r.descuento)}</span>}{r.cantidad_gratis && r.cantidad_gratis > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">{r.cantidad_gratis}x gratis</span>}</div>))}
          </section>
        )}
        <section className="bg-card rounded-lg p-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Subtotal</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(totals.subtotal)}</span></div>
            {totals.iva > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">IVA</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(totals.iva)}</span></div>}
            {(totals.descuento - (totals.descuentoDevolucion ?? 0)) > 0 && <div className="flex justify-between text-[12px]"><span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Tag className="h-3 w-3" /> Promociones</span><span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{s}{fmt(totals.descuento - (totals.descuentoDevolucion ?? 0))}</span></div>}
            {(totals.descuentoDevolucion ?? 0) > 0 && <div className="flex justify-between text-[12px]"><span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">🏷️ Desc. devolución</span><span className="font-medium text-amber-600 dark:text-amber-400 tabular-nums">{s}{fmt(totals.descuentoDevolucion!)}</span></div>}
          </div>
          <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60"><span className="text-[13px] font-semibold text-foreground">Total</span><span className="text-[18px] font-bold text-primary tabular-nums">{s}{fmt(totals.total)}</span></div>
        </section>
        {saldoPendienteTotal > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-600 shrink-0" /><div className="flex-1"><p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Cuentas pendientes: {s}{fmt(saldoPendienteTotal)}</p><p className="text-[10px] text-amber-600 dark:text-amber-400">Podrás aplicar pagos en el siguiente paso</p></div></div>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
        <div className="flex gap-2">
          <button onClick={() => navigate(-1)} className="flex-1 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">Cancelar</button>
          <button onClick={goToPayment} disabled={cart.length === 0} className="flex-1 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Confirmar</button>
        </div>
      </div>
    </div>
  );
}
