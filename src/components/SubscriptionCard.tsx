import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CreditCard, Users, Loader2, Crown, Plus, Minus, ExternalLink, Stamp, BanknoteIcon, Building2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const PLANS = [
  { id: 'mensual', label: 'Mensual', price: 300, priceId: 'price_1TBGvcCUpJnsv7il0KmvUTCj', desc: '$300/usuario/mes' },
  { id: 'semestral', label: 'Semestral', price: 270, priceId: 'price_1TBGwFCUpJnsv7il7iiIUPLV', desc: '$270/usuario/mes (10% desc.)' },
  { id: 'anual', label: 'Anual', price: 255, priceId: 'price_1TBGxQCUpJnsv7iltBEy18AC', desc: '$255/usuario/mes (15% desc.)' },
] as const;

const BANK_INFO = {
  banco: 'BBVA Bancomer',
  titular: 'Diego Alonso León de Dios',
  cuenta: '116 755 1576',
  clabe: '012 333 01167551576 8',
};

export default function SubscriptionCard() {
  const { user, empresa } = useAuth();
  const sub = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subData, setSubData] = useState<any>(null);
  const [timbresBalance, setTimbresBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [showUsers, setShowUsers] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showTimbres, setShowTimbres] = useState(false);
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showTransferInfo, setShowTransferInfo] = useState(false);

  // Form states
  const [newQty, setNewQty] = useState(3);
  const [savingUsers, setSavingUsers] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [timbresPacks, setTimbresPacks] = useState(1);
  const [buyingTimbres, setBuyingTimbres] = useState(false);

  // Payment context: what is being paid for
  const [payContext, setPayContext] = useState<'plan' | 'timbres'>('plan');
  const [transferNotes, setTransferNotes] = useState('');
  const [sendingTransfer, setSendingTransfer] = useState(false);

  // Pending solicitudes
  const [pendingSolicitudes, setPendingSolicitudes] = useState<any[]>([]);

  useEffect(() => {
    if (!empresa?.id) return;
    loadData();
  }, [empresa?.id]);

  useEffect(() => {
    const sessionId = searchParams.get('timbres_session');
    if (sessionId) {
      verifyTimbresPurchase(sessionId);
      searchParams.delete('timbres_session');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  async function loadData() {
    setLoading(true);
    const [subRes, timbresRes, solRes] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('solicitudes_pago').select('*').eq('empresa_id', empresa!.id).eq('status', 'pendiente').order('created_at', { ascending: false }),
    ]);
    setSubData(subRes.data);
    setTimbresBalance(timbresRes.data?.saldo ?? 0);
    setPendingSolicitudes(solRes.data || []);
    if (subRes.data) setNewQty(subRes.data.max_usuarios || 3);
    setLoading(false);
  }

  async function verifyTimbresPurchase(sessionId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('purchase-timbres', {
        body: { action: 'verify_payment', session_id: sessionId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`¡${data.timbres_added || 100} timbres acreditados exitosamente!`);
        loadData();
      }
    } catch (e: any) {
      toast.error('Error verificando compra de timbres: ' + e.message);
    }
  }

  // ─── Update Users ───
  async function handleUpdateUsers() {
    setSavingUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'update_quantity', new_quantity: newQty },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Límite actualizado a ${newQty} usuarios`);
      setShowUsers(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingUsers(false);
    }
  }

  // ─── Pay with Card (Stripe) ───
  async function handlePayWithCard() {
    setSavingPlan(true);
    try {
      if (payContext === 'plan') {
        if (subData?.stripe_subscription_id) {
          // Change existing plan
          const { data, error } = await supabase.functions.invoke('manage-subscription', {
            body: { action: 'change_plan', new_price_id: selectedPlan },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast.success('Plan actualizado exitosamente');
        } else {
          // New subscription checkout
          const { data, error } = await supabase.functions.invoke('create-checkout', {
            body: { price_id: selectedPlan, quantity: newQty, empresa_id: empresa?.id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          if (data?.url) window.open(data.url, '_blank');
        }
      } else {
        // Timbres
        const { data, error } = await supabase.functions.invoke('purchase-timbres', {
          body: { action: 'create_checkout', quantity: timbresPacks },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.url) window.open(data.url, '_blank');
      }
      setShowPayMethod(false);
      setShowPlan(false);
      setShowTimbres(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPlan(false);
    }
  }

  // ─── Pay with Transfer ───
  async function handleSubmitTransfer() {
    if (!empresa?.id || !user) return;
    setSendingTransfer(true);
    try {
      const plan = PLANS.find(p => p.priceId === selectedPlan);
      const isTimbresPay = payContext === 'timbres';

      const monto = isTimbresPay
        ? timbresPacks * 100 * 100 // cents
        : (plan ? plan.price * newQty * 100 : 0);

      const concepto = isTimbresPay
        ? `Compra de ${timbresPacks * 100} timbres CFDI`
        : `Suscripción ${plan?.label || ''} — ${newQty} usuarios`;

      const { error } = await supabase.from('solicitudes_pago').insert({
        empresa_id: empresa.id,
        user_id: user.id,
        tipo: isTimbresPay ? 'timbres' : 'suscripcion',
        concepto,
        monto_centavos: monto,
        metodo: 'transferencia',
        notas: transferNotes || null,
        plan_price_id: isTimbresPay ? null : selectedPlan,
        cantidad_usuarios: isTimbresPay ? null : newQty,
        cantidad_timbres: isTimbresPay ? timbresPacks * 100 : null,
      } as any);

      if (error) throw error;
      toast.success('Solicitud de pago enviada. Te avisaremos cuando sea aprobada.');
      setShowTransferInfo(false);
      setShowPayMethod(false);
      setShowPlan(false);
      setShowTimbres(false);
      setTransferNotes('');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingTransfer(false);
    }
  }

  function openPayMethodDialog(context: 'plan' | 'timbres') {
    setPayContext(context);
    setShowPayMethod(true);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    toast.success('Copiado al portapapeles');
  }

  const statusLabel: Record<string, string> = {
    trial: 'Prueba gratuita', active: 'Activa', past_due: 'Pago pendiente', suspended: 'Suspendida',
  };

  const statusColor: Record<string, string> = {
    trial: 'bg-blue-100 text-blue-700', active: 'bg-green-100 text-green-700',
    past_due: 'bg-amber-100 text-amber-700', suspended: 'bg-red-100 text-red-700',
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando suscripción...
        </div>
      </div>
    );
  }

  const today = new Date();
  const daysInMonth = 30;
  const dayOfMonth = today.getDate();
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Crown className="h-4 w-4" /> Mi Suscripción
        </h3>

        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor[sub.status || ''] || 'bg-muted text-muted-foreground'}`}>
                {statusLabel[sub.status || ''] || sub.status || 'Sin suscripción'}
              </span>
              {sub.daysLeft !== null && sub.daysLeft < 999 && (
                <span className="text-[11px] text-muted-foreground">
                  {sub.daysLeft > 0 ? `${sub.daysLeft} días restantes` : 'Vencida'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pending transfer requests */}
        {pendingSolicitudes.length > 0 && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              ⏳ Tienes {pendingSolicitudes.length} solicitud(es) de pago por transferencia pendiente(s) de aprobación.
            </p>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setShowUsers(true)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
          >
            <Users className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-foreground">{subData?.max_usuarios || sub.maxUsuarios}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Usuarios</span>
          </button>

          <button
            onClick={() => { setSelectedPlan(''); setShowPlan(true); }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
          >
            <CreditCard className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold text-foreground capitalize">
              {sub.status === 'trial' ? 'Prueba' : 'Plan'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cambiar plan</span>
          </button>

          <button
            onClick={() => { setTimbresPacks(1); setShowTimbres(true); }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
          >
            <Stamp className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-foreground">{timbresBalance ?? 0}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Timbres</span>
          </button>
        </div>
      </div>

      {/* ─── Dialog: Usuarios ─── */}
      <Dialog open={showUsers} onOpenChange={setShowUsers}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar cantidad de usuarios</DialogTitle>
            <DialogDescription>
              Se prorrateará el cobro de hoy al día 30 ({remainingDays} días).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4 py-4">
            <Button variant="outline" size="icon" onClick={() => setNewQty(q => Math.max(3, q - 1))} disabled={newQty <= 3}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{newQty}</div>
              <div className="text-xs text-muted-foreground">usuarios</div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setNewQty(q => q + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">Mínimo 3 usuarios</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUsers(false)}>Cancelar</Button>
            <Button onClick={handleUpdateUsers} disabled={savingUsers || newQty === (subData?.max_usuarios || 3)}>
              {savingUsers && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Plan ─── */}
      <Dialog open={showPlan} onOpenChange={setShowPlan}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Elegir plan</DialogTitle>
            <DialogDescription>
              Todos los planes se facturan el día 1 de cada mes. Si contratas hoy, solo pagas {remainingDays} de 30 días (prorrateo).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {PLANS.map(plan => {
              const prorated = Math.round((plan.price * remainingDays) / daysInMonth);
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.priceId)}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-colors text-left ${
                    selectedPlan === plan.priceId ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-foreground">{plan.label}</div>
                    <div className="text-xs text-muted-foreground">{plan.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-foreground">${plan.price}/mes</div>
                    <div className="text-[10px] text-muted-foreground">Hoy: ${prorated} (prorrateo)</div>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlan(false)}>Cancelar</Button>
            <Button
              onClick={() => { if (selectedPlan) openPayMethodDialog('plan'); }}
              disabled={!selectedPlan}
            >
              Continuar al pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Timbres ─── */}
      <Dialog open={showTimbres} onOpenChange={setShowTimbres}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Comprar timbres CFDI</DialogTitle>
            <DialogDescription>
              Cada paquete contiene 100 timbres a $1 MXN c/u ($100 MXN por paquete).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4 py-4">
            <Button variant="outline" size="icon" onClick={() => setTimbresPacks(p => Math.max(1, p - 1))} disabled={timbresPacks <= 1}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{timbresPacks * 100}</div>
              <div className="text-xs text-muted-foreground">timbres</div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setTimbresPacks(p => p + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-center">
            <span className="text-lg font-bold text-foreground">${(timbresPacks * 100).toLocaleString()} MXN</span>
            <p className="text-xs text-muted-foreground mt-1">Saldo actual: {timbresBalance ?? 0} timbres</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTimbres(false)}>Cancelar</Button>
            <Button onClick={() => openPayMethodDialog('timbres')}>
              Continuar al pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Payment Method Choice ─── */}
      <Dialog open={showPayMethod} onOpenChange={setShowPayMethod}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cómo deseas pagar?</DialogTitle>
            <DialogDescription>
              Elige tu método de pago preferido.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <button
              onClick={handlePayWithCard}
              disabled={savingPlan}
              className="flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Pagar con tarjeta</div>
                <div className="text-xs text-muted-foreground">Crédito o débito — se procesa al instante vía Stripe</div>
              </div>
              {savingPlan && <Loader2 className="h-5 w-5 animate-spin ml-auto" />}
            </button>

            <button
              onClick={() => { setShowPayMethod(false); setTransferNotes(''); setShowTransferInfo(true); }}
              className="flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Pagar con transferencia</div>
                <div className="text-xs text-muted-foreground">Transferencia bancaria BBVA — se activa al confirmar el pago</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Transfer Bank Info ─── */}
      <Dialog open={showTransferInfo} onOpenChange={setShowTransferInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Datos para transferencia</DialogTitle>
            <DialogDescription>
              Realiza la transferencia y envía tu solicitud. Tu plan se activará cuando confirmemos el pago.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Bank card */}
            <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-card p-5 space-y-3 text-center">
              <div className="text-lg font-bold text-blue-800 dark:text-blue-300">{BANK_INFO.banco}</div>
              <div className="text-muted-foreground">{BANK_INFO.titular}</div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cuenta:</div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-mono font-semibold text-foreground">{BANK_INFO.cuenta}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(BANK_INFO.cuenta)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CLABE:</div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-mono font-semibold text-foreground">{BANK_INFO.clabe}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(BANK_INFO.clabe)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="pt-2 border-t border-blue-100 dark:border-blue-800">
                <span className="text-xs text-muted-foreground">Monto a transferir: </span>
                <span className="font-bold text-foreground">
                  {payContext === 'timbres'
                    ? `$${(timbresPacks * 100).toLocaleString()} MXN`
                    : `$${((PLANS.find(p => p.priceId === selectedPlan)?.price || 0) * newQty).toLocaleString()} MXN`
                  }
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notas (opcional — referencia de transferencia, etc.)</label>
              <Textarea
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                placeholder="Ej: Referencia #12345, fecha de transferencia..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferInfo(false)}>Cancelar</Button>
            <Button onClick={handleSubmitTransfer} disabled={sendingTransfer}>
              {sendingTransfer && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <BanknoteIcon className="h-4 w-4 mr-1" /> Ya transferí, enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
