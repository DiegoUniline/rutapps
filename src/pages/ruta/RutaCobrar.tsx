import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Check, ChevronRight, CreditCard, Banknote, Building2, Wallet, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { queueOperation } from '@/lib/syncQueue';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { toast } from 'sonner';
import { useCurrency } from '@/hooks/useCurrency';

type Step = 'cliente' | 'monto' | 'cuentas' | 'pago';

interface VentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
}

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'transferencia', label: 'Transfer.', icon: Building2 },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'otro', label: 'Otro', icon: Wallet },
] as const;

export default function RutaCobrar() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const { symbol: s, fmt: fmtC } = useCurrency();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('cliente');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [cuentas, setCuentas] = useState<VentaPendiente[]>([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Offline-compatible: read clients and ventas from local cache
  const { data: clientesRaw } = useOfflineQuery('clientes', { empresa_id: empresa?.id, status: 'activo' }, { enabled: !!empresa?.id, orderBy: 'nombre' });
  const { data: allVentas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  const clientes = useMemo(() => {
    if (!clientesRaw) return [];
    const saldosPorCliente: Record<string, number> = {};
    (allVentas ?? []).forEach((v: any) => {
      if (v.cliente_id && v.condicion_pago === 'credito' && ['confirmado', 'entregado', 'facturado'].includes(v.status) && (v.saldo_pendiente ?? 0) > 0) {
        saldosPorCliente[v.cliente_id] = (saldosPorCliente[v.cliente_id] ?? 0) + (v.saldo_pendiente ?? 0);
      }
    });
    return clientesRaw.map((c: any) => ({ ...c, saldoPendiente: saldosPorCliente[c.id] ?? 0 }));
  }, [clientesRaw, allVentas]);

  // Offline-compatible: filter pending ventas for selected client
  const ventasPendientes = useMemo(() => {
    if (!allVentas || !clienteId) return [];
    return (allVentas as any[])
      .filter(v =>
        v.cliente_id === clienteId &&
        v.condicion_pago === 'credito' &&
        (v.saldo_pendiente ?? 0) > 0 &&
        ['confirmado', 'entregado', 'facturado'].includes(v.status)
      )
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [allVentas, clienteId]);
  const loadingVentas = false;

  const clientesConSaldo = clientes?.filter((c: any) => c.saldoPendiente > 0) ?? [];
  const clientesSinSaldo = clientes?.filter((c: any) => c.saldoPendiente === 0) ?? [];

  const filteredConSaldo = clientesConSaldo.filter((c: any) =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );
  const filteredSinSaldo = clientesSinSaldo.filter((c: any) =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );

  const selectCliente = (c: any) => {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    setCuentas([]);
    setMontoRecibido('');
    setStep('monto');
  };

  const totalPendienteCliente = useMemo(() =>
    (ventasPendientes ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0),
    [ventasPendientes]
  );

  // Auto-apply amount to oldest debts first
  const autoApply = (monto: number, ventas: typeof ventasPendientes) => {
    if (!ventas || ventas.length === 0) return [];
    let restante = monto;
    return ventas.map(v => {
      const saldo = v.saldo_pendiente ?? 0;
      const aplicar = Math.min(restante, saldo);
      restante = Math.max(0, restante - saldo);
      return {
        id: v.id,
        folio: v.folio,
        fecha: v.fecha,
        total: v.total ?? 0,
        saldo_pendiente: saldo,
        montoAplicar: Math.round(aplicar * 100) / 100,
      };
    });
  };

  // When user enters amount and proceeds, auto-distribute
  const proceedToDistribution = () => {
    const monto = parseFloat(montoRecibido);
    if (isNaN(monto) || monto <= 0) return;
    const distributed = autoApply(monto, ventasPendientes ?? []);
    setCuentas(distributed);
    setStep('cuentas');
  };

  const totalAplicado = cuentas.reduce((s, c) => s + c.montoAplicar, 0);
  const sobrante = parseFloat(montoRecibido || '0') - totalAplicado;

  const updateMontoAplicar = (id: string, monto: number) => {
    setCuentas(prev => prev.map(c => {
      if (c.id !== id) return c;
      const clamped = Math.min(Math.max(0, monto), c.saldo_pendiente);
      return { ...c, montoAplicar: Math.round(clamped * 100) / 100 };
    }));
  };

  const handleSave = async () => {
    if (!empresa || !user || totalAplicado <= 0) return;
    setSaving(true);
    try {
      const cobroId = crypto.randomUUID();
      await queueOperation('cobros', 'insert', {
        id: cobroId,
        empresa_id: empresa.id,
        cliente_id: clienteId!,
        monto: totalAplicado,
        metodo_pago: metodoPago,
        referencia: referencia || null,
        notas: notas || null,
        user_id: user.id,
        fecha: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      });

      const aplicaciones = cuentas.filter(c => c.montoAplicar > 0);
      for (const app of aplicaciones) {
        await queueOperation('cobro_aplicaciones', 'insert', {
          id: crypto.randomUUID(),
          cobro_id: cobroId,
          venta_id: app.id,
          monto_aplicado: app.montoAplicar,
          created_at: new Date().toISOString(),
        });
        // Update local venta saldo
        const venta = (allVentas as any[])?.find(v => v.id === app.id);
        if (venta) {
          const nuevoSaldo = Math.round((app.saldo_pendiente - app.montoAplicar) * 100) / 100;
          await queueOperation('ventas', 'update', { ...venta, saldo_pendiente: nuevoSaldo });
        }
      }

      toast.success(`¡Cobro de ${fmtC(totalAplicado)} registrado!`);
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      navigate('/ruta/cobros');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const STEPS: Step[] = ['cliente', 'monto', 'cuentas', 'pago'];
  const STEP_LABELS: Record<Step, string> = { cliente: 'Cliente', monto: 'Monto', cuentas: 'Distribución', pago: 'Cobrar' };
  const currentStepIdx = STEPS.indexOf(step);

  const goBack = () => {
    if (currentStepIdx === 0) navigate('/ruta/cobros');
    else {
      if (step === 'monto') { setCuentas([]); setMontoRecibido(''); }
      setStep(STEPS[currentStepIdx - 1]);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const daysSince = (d: string) => {
    const diff = Date.now() - new Date(d + 'T12:00:00').getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const fmtM = (n: number) => `${s}${fmt(n)}`;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-4 h-14">
          <button onClick={goBack} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <span className="text-base font-semibold text-foreground flex-1">Cobrar</span>
        </div>
        <div className="flex px-4 pb-3 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1 w-full rounded-full transition-colors ${
                i <= currentStepIdx ? 'bg-primary' : 'bg-border'
              }`} />
              <span className={`text-xs font-medium transition-colors ${
                i <= currentStepIdx ? 'text-primary' : 'text-muted-foreground/60'
              }`}>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ─── STEP 1: Seleccionar cliente ─── */}
      {step === 'cliente' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                className="w-full bg-accent/60 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 pb-4">
            {filteredConSaldo.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2">
                  Con saldo pendiente ({filteredConSaldo.length})
                </p>
                <div className="space-y-1">
                  {filteredConSaldo.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCliente(c)}
                      className="w-full rounded-xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all text-left bg-card hover:bg-accent/30 min-h-[56px]"
                    >
                      <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-destructive">{c.nombre.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.nombre}</p>
                        {c.codigo && <p className="text-xs text-muted-foreground">{c.codigo}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-destructive">{fmtM(c.saldoPendiente)}</p>
                        <p className="text-xs text-muted-foreground">pendiente</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {filteredSinSaldo.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2 mt-3">
                  Sin saldo ({filteredSinSaldo.length})
                </p>
                <div className="space-y-1">
                  {filteredSinSaldo.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCliente(c)}
                      className="w-full rounded-xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all text-left bg-card/50 opacity-60 min-h-[56px]"
                    >
                      <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-foreground">{c.nombre.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.nombre}</p>
                      </div>
                      <span className="text-xs text-success font-medium">Al corriente</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── STEP 2: Monto recibido ─── */}
      {step === 'monto' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 px-4 pt-4 space-y-4">
            {/* Client info */}
            <div className="bg-card rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-foreground">{clienteNombre.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{clienteNombre}</p>
                {totalPendienteCliente > 0 && (
                  <p className="text-xs text-destructive font-medium">
                    Deuda total: {fmtM(totalPendienteCliente)}
                    {ventasPendientes && ventasPendientes.length > 0 && ` · ${ventasPendientes.length} cuenta${ventasPendientes.length > 1 ? 's' : ''}`}
                  </p>
                )}
                {loadingVentas && <p className="text-xs text-muted-foreground">Cargando cuentas...</p>}
              </div>
            </div>

            {/* Pending invoices preview (oldest first) */}
            {ventasPendientes && ventasPendientes.length > 0 && (
              <div className="bg-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Cuentas pendientes (más antigua primero)
                  </p>
                </div>
                <div className="space-y-1.5">
                  {ventasPendientes.map((v, i) => {
                    const dias = daysSince(v.fecha);
                    return (
                      <div key={v.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{v.folio || 'Sin folio'}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(v.fecha)} · {dias}d
                              {dias > 30 && <span className="text-destructive ml-1">⚠ vencida</span>}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-foreground tabular-nums">{fmtM(v.saldo_pendiente ?? 0)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Amount input */}
            <div className="bg-card rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">¿Cuánto te entrega el cliente?</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">{s}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full text-2xl font-bold bg-accent/40 rounded-xl pl-10 pr-4 py-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={montoRecibido}
                  onChange={e => setMontoRecibido(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              {totalPendienteCliente > 0 && (
                <button
                  onClick={() => setMontoRecibido(totalPendienteCliente.toString())}
                  className="text-xs text-primary font-semibold active:underline"
                >
                  Liquidar todo · {fmtM(totalPendienteCliente)}
                </button>
              )}
            </div>
          </div>

          {/* Continue button */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
            <button
              onClick={proceedToDistribution}
              disabled={!montoRecibido || parseFloat(montoRecibido) <= 0}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform min-h-[52px]"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Distribución automática ─── */}
      {step === 'cuentas' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="bg-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">{clienteNombre}</p>
                <p className="text-lg font-bold text-primary tabular-nums">{fmtM(parseFloat(montoRecibido) || 0)}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Aplicado automáticamente a las cuentas más antiguas. Puedes ajustar manualmente.</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 space-y-1.5 pb-24">
            {cuentas.map((c, i) => {
              const dias = daysSince(c.fecha);
              const vencida = dias > 30;
              const liquidada = c.montoAplicar >= c.saldo_pendiente;
              return (
                <div
                  key={c.id}
                  className={`rounded-xl px-4 py-3.5 transition-all ${
                    c.montoAplicar > 0 ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{c.folio || 'Sin folio'}</span>
                        {vencida && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                        {liquidada && c.montoAplicar > 0 && (
                          <span className="text-[11px] bg-success/10 text-success font-semibold px-2 py-0.5 rounded-full">Liquidada</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(c.fecha)} · {dias}d · Saldo: {fmtM(c.saldo_pendiente)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Aplicar:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-foreground">{s}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="w-28 text-right text-base font-bold bg-accent/40 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={c.montoAplicar || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          updateMontoAplicar(c.id, isNaN(val) ? 0 : val);
                        }}
                        onFocus={e => e.target.select()}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Surplus warning */}
            {sobrante > 0.01 && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Sobrante: {fmtM(sobrante)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    El cliente entrega más de lo que debe. Revisa los montos o registra como anticipo.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Floating bar */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs text-muted-foreground">
                {cuentas.filter(c => c.montoAplicar > 0).length} cuentas
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums">Total: {fmtM(totalAplicado)}</span>
            </div>
            <button
              onClick={() => setStep('pago')}
              disabled={totalAplicado <= 0}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform min-h-[52px]"
            >
              Continuar al cobro
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 4: Método de pago y confirmar ─── */}
      {step === 'pago' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-4 pt-3 pb-24 space-y-3">

            {/* Total to collect */}
            <section className="bg-card rounded-xl p-5 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total a cobrar</p>
              <p className="text-3xl font-bold text-primary tabular-nums">{fmtM(totalAplicado)}</p>
              <p className="text-sm text-muted-foreground mt-1">{clienteNombre}</p>
            </section>

            {/* Payment method */}
            <section className="bg-card rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Método de pago</p>
              <div className="grid grid-cols-4 gap-2">
                {METODOS_PAGO.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMetodoPago(m.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all active:scale-95 min-h-[64px] ${
                      metodoPago === m.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent/60 text-foreground'
                    }`}
                  >
                    <m.icon className="h-5 w-5" />
                    {m.label}
                  </button>
                ))}
              </div>

              {metodoPago !== 'efectivo' && (
                <input
                  type="text"
                  placeholder="Referencia / No. operación"
                  className="w-full mt-3 bg-accent/40 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                />
              )}
            </section>

            {/* Applied invoices summary */}
            <section className="bg-card rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Cuentas a liquidar ({cuentas.filter(c => c.montoAplicar > 0).length})
              </p>
              <div className="space-y-2">
                {cuentas.filter(c => c.montoAplicar > 0).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.folio || 'Sin folio'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.fecha)} · Saldo: ${fmt(c.saldo_pendiente)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground tabular-nums">${fmt(c.montoAplicar)}</p>
                      {c.montoAplicar >= c.saldo_pendiente && (
                        <span className="text-[11px] text-success font-medium">Liquidada</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notes */}
            <section className="bg-card rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notas</p>
              <textarea
                className="w-full bg-accent/40 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none transition-shadow"
                rows={2}
                placeholder="Observaciones del cobro..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </section>
          </div>

          {/* Confirm button */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
            <button
              onClick={handleSave}
              disabled={saving || totalAplicado <= 0}
              className="w-full bg-success text-success-foreground rounded-xl py-4 text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-success/20 flex items-center justify-center gap-2 min-h-[52px]"
            >
              <Check className="h-5 w-5" />
              {saving ? 'Registrando...' : `Confirmar cobro · $${fmt(totalAplicado)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
