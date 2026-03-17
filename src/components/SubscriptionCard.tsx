import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CreditCard, Users, FileText, Loader2, Crown, Plus, Minus, ExternalLink, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const PLANS = [
  { id: 'mensual', label: 'Mensual', price: 300, priceId: 'price_1TBGvcCUpJnsv7il0KmvUTCj', desc: '$300/usuario/mes' },
  { id: 'semestral', label: 'Semestral', price: 270, priceId: 'price_1TBGwFCUpJnsv7il7iiIUPLV', desc: '$270/usuario/mes (10% desc.)' },
  { id: 'anual', label: 'Anual', price: 255, priceId: 'price_1TBGxQCUpJnsv7iltBEy18AC', desc: '$255/usuario/mes (15% desc.)' },
] as const;

const PRODUCT_TO_PLAN: Record<string, string> = {
  'prod_U9a56wjBGbKv4B': 'mensual',
  'prod_U9a6TsdjaGp99L': 'semestral',
  'prod_U9a7Ap6nbM6kPV': 'anual',
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

  // Form states
  const [newQty, setNewQty] = useState(3);
  const [savingUsers, setSavingUsers] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [timbresPacks, setTimbresPacks] = useState(1);
  const [buyingTimbres, setBuyingTimbres] = useState(false);

  useEffect(() => {
    if (!empresa?.id) return;
    loadData();
  }, [empresa?.id]);

  // Verify timbres purchase on return from Stripe
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
    const [subRes, timbresRes] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresa!.id).maybeSingle(),
    ]);
    setSubData(subRes.data);
    setTimbresBalance(timbresRes.data?.saldo ?? 0);
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

  // ─── Change Plan ───
  async function handleChangePlan() {
    setSavingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'change_plan', new_price_id: selectedPlan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Plan actualizado exitosamente');
      setShowPlan(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPlan(false);
    }
  }

  // ─── Buy Timbres ───
  async function handleBuyTimbres() {
    setBuyingTimbres(true);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-timbres', {
        body: { action: 'create_checkout', quantity: timbresPacks },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBuyingTimbres(false);
    }
  }

  // ─── Subscribe (new) ───
  async function handleNewSubscription(priceId: string) {
    setSavingPlan(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: priceId, quantity: newQty, empresa_id: empresa?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.open(data.url, '_blank');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPlan(false);
    }
  }

  const currentPlanId = subData?.stripe_subscription_id ? 
    (subData?.stripe_price_id ? PRODUCT_TO_PLAN[subData.stripe_price_id] : null) : null;

  const statusLabel = {
    trial: 'Prueba gratuita',
    active: 'Activa',
    past_due: 'Pago pendiente',
    suspended: 'Suspendida',
  }[sub.status || ''] || sub.status || 'Sin suscripción';

  const statusColor = {
    trial: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    past_due: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
  }[sub.status || ''] || 'bg-muted text-muted-foreground';

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando suscripción...
        </div>
      </div>
    );
  }

  // Calculate proration info for display
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
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor}`}>
                {statusLabel}
              </span>
              {sub.daysLeft !== null && sub.daysLeft < 999 && (
                <span className="text-[11px] text-muted-foreground">
                  {sub.daysLeft > 0 ? `${sub.daysLeft} días restantes` : 'Vencida'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Users card */}
          <button
            onClick={() => setShowUsers(true)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
          >
            <Users className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-foreground">{subData?.max_usuarios || sub.maxUsuarios}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Usuarios</span>
          </button>

          {/* Plan card */}
          <button
            onClick={() => {
              setSelectedPlan('');
              setShowPlan(true);
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
          >
            <CreditCard className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold text-foreground capitalize">
              {sub.status === 'trial' ? 'Prueba' : 'Plan'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cambiar plan</span>
          </button>

          {/* Timbres card */}
          <button
            onClick={() => {
              setTimbresPacks(1);
              setShowTimbres(true);
            }}
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
              Se prorrateará el cobro de hoy al día 30 ({remainingDays} días). A partir del 1° del siguiente mes se cobrará el precio completo.
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
                    selectedPlan === plan.priceId
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
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
            {subData?.stripe_subscription_id ? (
              <Button onClick={handleChangePlan} disabled={savingPlan || !selectedPlan}>
                {savingPlan && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Cambiar plan
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const plan = PLANS.find(p => p.priceId === selectedPlan);
                  if (plan) handleNewSubscription(plan.priceId);
                }}
                disabled={savingPlan || !selectedPlan}
              >
                {savingPlan && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <ExternalLink className="h-4 w-4 mr-1" /> Contratar
              </Button>
            )}
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
            <Button onClick={handleBuyTimbres} disabled={buyingTimbres}>
              {buyingTimbres && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <ExternalLink className="h-4 w-4 mr-1" /> Pagar con Stripe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
