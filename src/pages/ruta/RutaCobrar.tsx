import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Check, ChevronRight, CreditCard, Banknote, Building2, Wallet, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type Step = 'cliente' | 'cuentas' | 'pago';

interface VentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
  selected: boolean;
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
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('cliente');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [cuentas, setCuentas] = useState<VentaPendiente[]>([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch clients with pending balance
  const { data: clientes } = useQuery({
    queryKey: ['ruta-clientes-cobro', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Get clients
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, telefono')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');

      if (!clientesData) return [];

      // Get all pending sales grouped by client
      const { data: ventasData } = await supabase
        .from('ventas')
        .select('cliente_id, saldo_pendiente')
        .eq('empresa_id', empresa!.id)
        .eq('condicion_pago', 'credito')
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .gt('saldo_pendiente', 0);

      const saldosPorCliente: Record<string, number> = {};
      (ventasData ?? []).forEach(v => {
        if (v.cliente_id) {
          saldosPorCliente[v.cliente_id] = (saldosPorCliente[v.cliente_id] ?? 0) + (v.saldo_pendiente ?? 0);
        }
      });

      return clientesData.map(c => ({
        ...c,
        saldoPendiente: saldosPorCliente[c.id] ?? 0,
      }));
    },
  });

  const clientesConSaldo = clientes?.filter(c => c.saldoPendiente > 0) ?? [];
  const clientesSinSaldo = clientes?.filter(c => c.saldoPendiente === 0) ?? [];

  const filteredConSaldo = clientesConSaldo.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );
  const filteredSinSaldo = clientesSinSaldo.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );

  // Fetch pending invoices for selected client
  const { data: ventasPendientes, isLoading: loadingVentas } = useQuery({
    queryKey: ['ruta-ventas-pendientes', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente')
        .eq('cliente_id', clienteId!)
        .eq('condicion_pago', 'credito')
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .gt('saldo_pendiente', 0)
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });

  const selectCliente = (c: any) => {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    setStep('cuentas');
  };

  // When ventas load, initialize cuentas state
  const initCuentas = () => {
    if (ventasPendientes && cuentas.length === 0) {
      setCuentas(ventasPendientes.map(v => ({
        id: v.id,
        folio: v.folio,
        fecha: v.fecha,
        total: v.total ?? 0,
        saldo_pendiente: v.saldo_pendiente ?? 0,
        montoAplicar: 0,
        selected: false,
      })));
    }
  };

  // Auto-init when ventas load
  if (step === 'cuentas' && ventasPendientes && cuentas.length === 0 && ventasPendientes.length > 0) {
    initCuentas();
  }

  const totalAplicado = cuentas.reduce((s, c) => s + c.montoAplicar, 0);
  const totalPendienteCliente = cuentas.reduce((s, c) => s + c.saldo_pendiente, 0);

  const liquidarTodo = () => {
    setCuentas(prev => prev.map(c => ({ ...c, selected: true, montoAplicar: c.saldo_pendiente })));
  };

  const toggleCuenta = (id: string) => {
    setCuentas(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newSelected = !c.selected;
      return { ...c, selected: newSelected, montoAplicar: newSelected ? c.saldo_pendiente : 0 };
    }));
  };

  const updateMontoAplicar = (id: string, monto: number) => {
    setCuentas(prev => prev.map(c => {
      if (c.id !== id) return c;
      const clamped = Math.min(Math.max(0, monto), c.saldo_pendiente);
      return { ...c, montoAplicar: clamped, selected: clamped > 0 };
    }));
  };

  const handleSave = async () => {
    if (!empresa || !user || totalAplicado <= 0) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();

      // Create cobro
      const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({
        empresa_id: profile!.empresa_id,
        cliente_id: clienteId!,
        monto: totalAplicado,
        metodo_pago: metodoPago,
        referencia: referencia || null,
        notas: notas || null,
        user_id: user.id,
      }).select('id').single();
      if (cobroErr) throw cobroErr;

      // Create aplicaciones
      const aplicaciones = cuentas
        .filter(c => c.montoAplicar > 0)
        .map(c => ({
          cobro_id: cobro.id,
          venta_id: c.id,
          monto_aplicado: c.montoAplicar,
        }));

      if (aplicaciones.length > 0) {
        const { error: appErr } = await supabase.from('cobro_aplicaciones').insert(aplicaciones);
        if (appErr) throw appErr;

        // Update saldo_pendiente on each venta
        for (const app of aplicaciones) {
          const cuenta = cuentas.find(c => c.id === app.venta_id)!;
          const nuevoSaldo = cuenta.saldo_pendiente - app.monto_aplicado;
          await supabase.from('ventas').update({ saldo_pendiente: nuevoSaldo }).eq('id', app.venta_id);
        }
      }

      toast.success(`¡Cobro de $${totalAplicado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} registrado!`);
      queryClient.invalidateQueries({ queryKey: ['ruta-clientes-cobro'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas-pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      navigate('/ruta/cobros');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const STEPS: Step[] = ['cliente', 'cuentas', 'pago'];
  const STEP_LABELS: Record<Step, string> = { cliente: 'Cliente', cuentas: 'Cuentas', pago: 'Cobrar' };
  const currentStepIdx = STEPS.indexOf(step);

  const goBack = () => {
    if (currentStepIdx === 0) navigate('/ruta/cobros');
    else {
      if (step === 'cuentas') { setCuentas([]); }
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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Cobrar</span>
        </div>
        <div className="flex px-3 pb-2.5 gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-[3px] w-full rounded-full transition-colors ${
                i <= currentStepIdx ? 'bg-primary' : 'bg-border'
              }`} />
              <span className={`text-[10px] font-medium transition-colors ${
                i <= currentStepIdx ? 'text-primary' : 'text-muted-foreground/60'
              }`}>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ─── STEP 1: Seleccionar cliente ─── */}
      {step === 'cliente' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40 transition-shadow"
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 pb-4">
            {/* Clients with pending balance */}
            {filteredConSaldo.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2">
                  Con saldo pendiente ({filteredConSaldo.length})
                </p>
                <div className="space-y-[3px]">
                  {filteredConSaldo.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCliente(c)}
                      className="w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left bg-card hover:bg-accent/30"
                    >
                      <div className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-destructive">{c.nombre.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                        {c.codigo && <p className="text-[10.5px] text-muted-foreground">{c.codigo}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-bold text-destructive">${c.saldoPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] text-muted-foreground">pendiente</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Clients without balance */}
            {filteredSinSaldo.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-2 mt-2">
                  Sin saldo ({filteredSinSaldo.length})
                </p>
                <div className="space-y-[3px]">
                  {filteredSinSaldo.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCliente(c)}
                      className="w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left bg-card/50 opacity-60"
                    >
                      <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-foreground">{c.nombre.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                      </div>
                      <span className="text-[10px] text-success font-medium">Al corriente</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── STEP 2: Cuentas pendientes ─── */}
      {step === 'cuentas' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Client + total header */}
          <div className="px-3 pt-2.5 pb-2">
            <div className="bg-card rounded-lg p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-foreground">{clienteNombre.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-foreground truncate">{clienteNombre}</p>
                <p className="text-[10.5px] text-muted-foreground">
                  {cuentas.length} {cuentas.length === 1 ? 'cuenta' : 'cuentas'} · Total: ${totalPendienteCliente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <button
                onClick={liquidarTodo}
                className="text-[10.5px] font-semibold text-primary bg-primary/8 rounded-md px-2.5 py-1.5 active:scale-95 transition-transform"
              >
                Liquidar todo
              </button>
            </div>
          </div>

          {loadingVentas ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-muted-foreground">Cargando cuentas...</p>
            </div>
          ) : cuentas.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8">
              <Check className="h-10 w-10 text-success" />
              <p className="text-[14px] font-semibold text-foreground text-center">Sin cuentas pendientes</p>
              <p className="text-[12px] text-muted-foreground text-center">Este cliente está al corriente</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
              {cuentas.map(c => {
                const dias = daysSince(c.fecha);
                const vencida = dias > 30;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg px-3 py-2.5 transition-all ${
                      c.selected ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleCuenta(c.id)}
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${
                          c.selected ? 'bg-primary text-primary-foreground' : 'border-2 border-border'
                        }`}
                      >
                        {c.selected && <Check className="h-3 w-3" />}
                      </button>

                      <div className="flex-1 min-w-0" onClick={() => toggleCuenta(c.id)}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold text-foreground">{c.folio || 'Sin folio'}</span>
                          {vencida && <AlertCircle className="h-3 w-3 text-destructive" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-px">
                          <span className="text-[10px] text-muted-foreground">{formatDate(c.fecha)}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className={`text-[10px] font-medium ${vencida ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {dias}d
                          </span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">Total: ${c.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">Saldo</p>
                        <p className="text-[12.5px] font-bold text-foreground">${c.saldo_pendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>

                    {/* Editable amount */}
                    {c.selected && (
                      <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">Aplicar:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] text-foreground">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-24 text-right text-[13px] font-bold bg-accent/40 rounded-md px-2 py-1 focus:outline-none focus:ring-1.5 focus:ring-primary/40 text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={c.montoAplicar || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value);
                              updateMontoAplicar(c.id, isNaN(val) ? 0 : val);
                            }}
                            onFocus={e => e.target.select()}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating bar */}
          {totalAplicado > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-2 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
              <button
                onClick={() => setStep('pago')}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
              >
                <span className="text-[13px] font-medium">
                  {cuentas.filter(c => c.selected).length} {cuentas.filter(c => c.selected).length === 1 ? 'cuenta' : 'cuentas'}
                </span>
                <span className="text-[14px] font-bold">Cobrar ${totalAplicado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3: Método de pago y confirmar ─── */}
      {step === 'pago' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-3 pt-2.5 pb-20 space-y-2.5">

            {/* Total to collect */}
            <section className="bg-card rounded-lg p-4 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total a cobrar</p>
              <p className="text-[28px] font-bold text-primary tabular-nums">${totalAplicado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{clienteNombre}</p>
            </section>

            {/* Payment method */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de pago</p>
              <div className="grid grid-cols-4 gap-1.5">
                {METODOS_PAGO.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMetodoPago(m.value)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-md text-[10.5px] font-medium transition-all active:scale-95 ${
                      metodoPago === m.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent/60 text-foreground'
                    }`}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>

              {metodoPago !== 'efectivo' && (
                <input
                  type="text"
                  placeholder="Referencia / No. operación"
                  className="w-full mt-2.5 bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                />
              )}
            </section>

            {/* Applied invoices summary */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Cuentas a liquidar ({cuentas.filter(c => c.selected).length})
              </p>
              <div className="space-y-1.5">
                {cuentas.filter(c => c.selected).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                    <div>
                      <p className="text-[12px] font-medium text-foreground">{c.folio || 'Sin folio'}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(c.fecha)} · Saldo: ${c.saldo_pendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12.5px] font-bold text-foreground tabular-nums">${c.montoAplicar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                      {c.montoAplicar >= c.saldo_pendiente && (
                        <span className="text-[9px] text-success font-medium">Liquidada</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notes */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
              <textarea
                className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none transition-shadow"
                rows={2}
                placeholder="Observaciones del cobro..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </section>
          </div>

          {/* Confirm button */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-2 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
            <button
              onClick={handleSave}
              disabled={saving || totalAplicado <= 0}
              className="w-full bg-success text-success-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-success/20 flex items-center justify-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Registrando...' : `Confirmar cobro · $${totalAplicado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
