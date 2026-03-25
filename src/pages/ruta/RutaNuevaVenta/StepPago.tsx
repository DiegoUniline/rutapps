import { ShoppingCart, Package, CalendarDays, Wallet, Banknote, CreditCard, Save, ReceiptText } from 'lucide-react';
import type { CartItem, CuentaPendiente, DevolucionItem } from './types';
import { ACCIONES } from './types';

interface Props {
  tipoVenta: 'venta_directa' | 'pedido';
  entregaInmediata: boolean;
  fechaEntrega: string;
  setFechaEntrega: (v: string) => void;
  condicionPago: 'contado' | 'credito' | 'por_definir';
  setCondicionPago: (v: 'contado' | 'credito' | 'por_definir') => void;
  clienteCredito: { credito: boolean; limite: number; dias: number } | null;
  excedeCredito: boolean;
  creditoDisponible: number;
  saldoPendienteTotal: number;
  cuentasPendientes: CuentaPendiente[];
  liquidarTodas: () => void;
  updateCuentaMonto: (id: string, monto: number) => void;
  totalAplicarCuentas: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta';
  setMetodoPago: (v: 'efectivo' | 'transferencia' | 'tarjeta') => void;
  montoRecibido: string;
  setMontoRecibido: (v: string) => void;
  referenciaPago: string;
  setReferenciaPago: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  totals: { subtotal: number; total: number; iva?: number; ieps?: number; descuento?: number; descuentoDevolucion?: number };
  totalACobrar: number;
  cambio: number;
  saving: boolean;
  cart: CartItem[];
  devoluciones: DevolucionItem[];
  sinImpuestos: boolean;
  setSinImpuestos: (v: boolean) => void;
  handleSave: () => Promise<void>;
  navigate: (to: any) => void;
  fmt: (n: number) => string;
}

const BILLETES = [50, 100, 200, 500];

export function StepPago(props: Props) {
  const { tipoVenta, entregaInmediata, fechaEntrega, setFechaEntrega, condicionPago, setCondicionPago, clienteCredito, excedeCredito, creditoDisponible, saldoPendienteTotal, cuentasPendientes, liquidarTodas, updateCuentaMonto, totalAplicarCuentas, metodoPago, setMetodoPago, montoRecibido, setMontoRecibido, referenciaPago, setReferenciaPago, notas, setNotas, totals, totalACobrar, cambio, saving, cart, devoluciones, sinImpuestos, setSinImpuestos, handleSave, navigate, fmt } = props;

  const descDevolucion = totals.descuentoDevolucion ?? 0;
  const descPromos = (totals.descuento ?? 0) - descDevolucion;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-3 pt-2.5 pb-24 space-y-2.5">
        <section className="bg-card rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo de operación</p>
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-md px-3 py-1.5 text-[12px] font-semibold">
            {tipoVenta === 'venta_directa' ? <ShoppingCart className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
            {tipoVenta === 'venta_directa' ? 'Venta inmediata' : 'Pedido'}
          </div>
          {!entregaInmediata && (
            <div className="mt-2.5 rounded-md px-2.5 py-2 flex items-start gap-2 bg-accent/50">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" />
              <div className="flex-1"><p className="text-[11px] text-muted-foreground leading-snug mb-1.5">Fecha de entrega</p>
                <input type="date" className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
              </div>
            </div>
          )}
        </section>

        <section className="bg-card rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condición de pago</p>
          <div className="flex gap-1.5">
            {([['contado', 'Contado'], ...(clienteCredito?.credito ? [['credito', 'Crédito'] as const] : []), ['por_definir', 'Por definir']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setCondicionPago(val as any)} className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all active:scale-95 ${condicionPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>{label}</button>
            ))}
          </div>
          {condicionPago === 'credito' && clienteCredito && (
            <div className={`mt-2.5 rounded-md px-2.5 py-2 text-[11px] space-y-1 ${excedeCredito ? 'bg-destructive/8' : 'bg-accent/50'}`}>
              <div className="flex justify-between"><span className="text-muted-foreground">Límite</span><span className="font-medium text-foreground">${fmt(clienteCredito.limite)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendiente</span><span className="font-medium text-foreground">${fmt(saldoPendienteTotal)}</span></div>
              <div className="flex justify-between border-t border-border/40 pt-1"><span className="text-muted-foreground">Disponible</span><span className={`font-bold ${excedeCredito ? 'text-destructive' : 'text-green-600'}`}>${fmt(creditoDisponible)}</span></div>
              {excedeCredito && <p className="text-[10px] text-destructive font-medium mt-1">⚠ El total excede el crédito disponible</p>}
            </div>
          )}
        </section>

        {cuentasPendientes.length > 0 && (
          <section className="bg-card rounded-lg p-3">
            <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cuentas pendientes ({cuentasPendientes.length})</p><button onClick={liquidarTodas} className="text-[10.5px] text-primary font-semibold">Liquidar todas</button></div>
            <div className="space-y-1.5">{cuentasPendientes.map(cuenta => (
              <div key={cuenta.id} className="rounded-md border border-border/60 p-2.5">
                <div className="flex items-center justify-between mb-1.5"><div><span className="text-[11px] font-semibold text-foreground">{cuenta.folio ?? '—'}</span><span className="text-[10px] text-muted-foreground ml-2">{cuenta.fecha}</span></div><span className="text-[11px] font-medium text-destructive">Debe: ${fmt(cuenta.saldo_pendiente)}</span></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateCuentaMonto(cuenta.id, cuenta.saldo_pendiente)} className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${cuenta.montoAplicar === cuenta.saldo_pendiente ? 'bg-primary text-primary-foreground' : 'bg-accent/60 text-foreground'}`}>Liquidar</button>
                  <div className="flex-1 relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span><input type="number" inputMode="decimal" className="w-full bg-accent/40 rounded-md pl-5 pr-2 py-1.5 text-[12px] text-foreground font-medium focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={cuenta.montoAplicar || ''} placeholder="0.00" onChange={e => updateCuentaMonto(cuenta.id, parseFloat(e.target.value) || 0)} /></div>
                  {cuenta.montoAplicar > 0 && <button onClick={() => updateCuentaMonto(cuenta.id, 0)} className="text-[10px] text-destructive font-medium">Quitar</button>}
                </div>
              </div>
            ))}</div>
            {totalAplicarCuentas > 0 && <div className="mt-2 pt-2 border-t border-border/60 flex justify-between"><span className="text-[11px] text-muted-foreground">Total a cuentas anteriores</span><span className="text-[12px] font-bold text-foreground">${fmt(totalAplicarCuentas)}</span></div>}
          </section>
        )}

        <section className="bg-card rounded-lg p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recibir pago</p>
          <div className="flex gap-1.5">
            {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Banknote], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
              <button key={val} onClick={() => setMetodoPago(val as any)} className={`flex-1 py-2.5 rounded-md text-[11px] font-semibold transition-all active:scale-95 flex flex-col items-center gap-1 ${metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>
            ))}
          </div>
          {metodoPago === 'efectivo' && (
            <div className="mt-2.5 space-y-2">
              <label className="text-[10px] text-muted-foreground font-medium">Monto recibido</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">$</span><input type="number" inputMode="decimal" className="w-full bg-accent/40 rounded-lg pl-7 pr-3 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={montoRecibido} placeholder={fmt(totalACobrar)} onChange={e => setMontoRecibido(e.target.value)} /></div>

              {/* Quick bill buttons */}
              <div className="flex gap-1.5">
                {BILLETES.map(b => (
                  <button
                    key={b}
                    onClick={() => setMontoRecibido(b.toString())}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all active:scale-95 ${
                      montoRecibido === b.toString()
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent/60 text-foreground'
                    }`}
                  >
                    ${b}
                  </button>
                ))}
                <button
                  onClick={() => setMontoRecibido(totalACobrar > 0 ? totalACobrar.toFixed(2) : '')}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 ${
                    parseFloat(montoRecibido) === totalACobrar && totalACobrar > 0
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-accent/60 text-foreground'
                  }`}
                >
                  Exacto
                </button>
              </div>

              {cambio > 0 && <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded-md px-2.5 py-2"><span className="text-[12px] text-green-700 dark:text-green-400 font-medium">Cambio</span><span className="text-[14px] text-green-700 dark:text-green-400 font-bold">${fmt(cambio)}</span></div>}
            </div>
          )}
          {metodoPago !== 'efectivo' && (
            <div className="mt-2.5"><label className="text-[10px] text-muted-foreground font-medium">Referencia (opcional)</label><input type="text" className="w-full mt-1 bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={referenciaPago} placeholder="No. de referencia o autorización" onChange={e => setReferenciaPago(e.target.value)} /></div>
          )}
        </section>

        <section className="bg-card rounded-lg p-3"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p><textarea className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none" rows={2} placeholder="Instrucciones o comentarios..." value={notas} onChange={e => setNotas(e.target.value)} /></section>

        {/* Totals summary */}
        <section className="bg-card rounded-lg p-3">
          <div className="space-y-1">
            <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Venta actual</span><span className="font-medium text-foreground tabular-nums">${fmt(totals.subtotal)}</span></div>
            {descPromos > 0 && (
              <div className="flex justify-between text-[11px]"><span className="text-emerald-600 dark:text-emerald-400">🏷️ Promociones</span><span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">-${fmt(descPromos)}</span></div>
            )}
            {descDevolucion > 0 && (
              <div className="flex justify-between text-[11px]"><span className="text-amber-600 dark:text-amber-400">🔄 Desc. devolución</span><span className="font-medium text-amber-600 dark:text-amber-400 tabular-nums">-${fmt(descDevolucion)}</span></div>
            )}
            {/* Devolution detail summary */}
            {devoluciones.length > 0 && (
              <div className="mt-1 pt-1 border-t border-border/30 space-y-0.5">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Devoluciones ({devoluciones.reduce((s, d) => s + d.cantidad, 0)} uds)</p>
                {devoluciones.map(d => {
                  const accion = ACCIONES.find(a => a.value === d.accion);
                  return (
                    <div key={d.producto_id} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground truncate flex-1 mr-2">{d.cantidad}x {d.nombre}</span>
                      <span className="text-muted-foreground shrink-0">{accion?.icon} {accion?.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {condicionPago === 'credito' && <div className="flex justify-between text-[11px]"><span className="text-muted-foreground italic">→ Se deja a crédito</span><span className="text-muted-foreground italic">$0.00 hoy</span></div>}
            {condicionPago === 'por_definir' && <div className="flex justify-between text-[11px]"><span className="text-muted-foreground italic">→ Pago por definir</span><span className="text-muted-foreground italic">$0.00 hoy</span></div>}
            {totalAplicarCuentas > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Cuentas anteriores</span><span className="font-medium text-foreground tabular-nums">${fmt(totalAplicarCuentas)}</span></div>}
          </div>
          {totalACobrar > 0 && <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60"><span className="text-[13px] font-semibold text-foreground">Total a cobrar</span><span className="text-[20px] font-bold text-primary tabular-nums">${fmt(totalACobrar)}</span></div>}
          {totalACobrar === 0 && (condicionPago === 'credito' || condicionPago === 'por_definir') && <div className="mt-2 pt-2 border-t border-border/60"><p className="text-[12px] text-muted-foreground text-center">{condicionPago === 'credito' ? 'No hay cobro por ahora — se registra a crédito' : 'No hay cobro por ahora — pago por definir'}</p></div>}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
        <div className="flex gap-2">
          <button onClick={() => navigate(-1)} className="flex-1 bg-card border border-destructive/30 text-destructive rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5">Cancelar</button>
          <button onClick={handleSave} disabled={saving || cart.length === 0 || excedeCredito} className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"><Save className="h-4 w-4" />{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
