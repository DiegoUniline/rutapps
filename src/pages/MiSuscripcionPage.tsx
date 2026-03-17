import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  CreditCard, Users, Loader2, Crown, Plus, Minus, Stamp, BanknoteIcon,
  Building2, Copy, ShoppingCart, Check, ArrowLeft, Sparkles, Clock, AlertTriangle, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInDays } from 'date-fns';

const PLANS = [
  { id: 'mensual', label: 'Mensual', price: 300, priceId: 'price_1TBGvcCUpJnsv7il0KmvUTCj', desc: '$300/usuario/mes', period: '1 mes' },
  { id: 'semestral', label: 'Semestral', price: 270, priceId: 'price_1TBGwFCUpJnsv7il7iiIUPLV', desc: '$270/usuario/mes', badge: '10% desc.', period: '6 meses' },
  { id: 'anual', label: 'Anual', price: 255, priceId: 'price_1TBGxQCUpJnsv7iltBEy18AC', desc: '$255/usuario/mes', badge: '15% desc.', period: '12 meses' },
] as const;

const BANK_INFO = {
  banco: 'BBVA Bancomer',
  titular: 'Diego Alonso León de Dios',
  cuenta: '116 755 1576',
  clabe: '012 333 01167551576 8',
};

interface CartItem {
  type: 'plan' | 'usuarios' | 'timbres';
  label: string;
  detail: string;
  amount: number; // cents
}

export default function MiSuscripcionPage() {
  const { user, empresa } = useAuth();
  const sub = useSubscription();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subData, setSubData] = useState<any>(null);
  const [timbresBalance, setTimbresBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSolicitudes, setPendingSolicitudes] = useState<any[]>([]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [planQty, setPlanQty] = useState(3);
  const [timbresPacks, setTimbresPacks] = useState(1);

  // Payment dialogs
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showTransferInfo, setShowTransferInfo] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');
  const [paying, setPaying] = useState(false);

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
    if (subRes.data) setPlanQty(subRes.data.max_usuarios || 3);
    setLoading(false);
  }

  async function verifyTimbresPurchase(sessionId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('purchase-timbres', {
        body: { action: 'verify_payment', session_id: sessionId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`¡${data.timbres_added || 100} timbres acreditados!`);
        loadData();
      }
    } catch (e: any) {
      toast.error('Error verificando compra: ' + e.message);
    }
  }

  // ─── Cart helpers ───
  function addPlanToCart() {
    if (!selectedPlan) return;
    const plan = PLANS.find(p => p.priceId === selectedPlan);
    if (!plan) return;
    // Remove existing plan item
    const filtered = cart.filter(c => c.type !== 'plan' && c.type !== 'usuarios');
    filtered.push({
      type: 'plan',
      label: `Plan ${plan.label}`,
      detail: `${planQty} usuarios × $${plan.price}/mes`,
      amount: plan.price * planQty * 100,
    });
    setCart(filtered);
    toast.success(`Plan ${plan.label} agregado al pedido`);
  }

  function addTimbresToCart() {
    const filtered = cart.filter(c => c.type !== 'timbres');
    filtered.push({
      type: 'timbres',
      label: `${timbresPacks * 100} timbres CFDI`,
      detail: `${timbresPacks} paquete(s) × $100`,
      amount: timbresPacks * 100 * 100,
    });
    setCart(filtered);
    toast.success(`${timbresPacks * 100} timbres agregados al pedido`);
  }

  function removeFromCart(type: string) {
    setCart(cart.filter(c => c.type !== type));
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.amount, 0);

  // ─── Pay with Card ───
  async function handlePayWithCard() {
    setPaying(true);
    try {
      const planItem = cart.find(c => c.type === 'plan');
      const timbresItem = cart.find(c => c.type === 'timbres');

      // Handle plan
      if (planItem) {
        if (subData?.stripe_subscription_id) {
          const { data, error } = await supabase.functions.invoke('manage-subscription', {
            body: { action: 'change_plan', new_price_id: selectedPlan },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          // Also update qty if changed
          if (planQty !== (subData?.max_usuarios || 3)) {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'update_quantity', new_quantity: planQty },
            });
          }
        } else {
          const { data, error } = await supabase.functions.invoke('create-checkout', {
            body: { price_id: selectedPlan, quantity: planQty, empresa_id: empresa?.id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          if (data?.url) window.open(data.url, '_blank');
        }
      }

      // Handle timbres
      if (timbresItem) {
        const { data, error } = await supabase.functions.invoke('purchase-timbres', {
          body: { action: 'create_checkout', quantity: timbresPacks },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.url) window.open(data.url, '_blank');
      }

      toast.success('Redirigiendo al pago...');
      setShowPayMethod(false);
      setCart([]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPaying(false);
    }
  }

  // ─── Pay with Transfer ───
  async function handleSubmitTransfer() {
    if (!empresa?.id || !user) return;
    setPaying(true);
    try {
      const planItem = cart.find(c => c.type === 'plan');
      const timbresItem = cart.find(c => c.type === 'timbres');
      const plan = PLANS.find(p => p.priceId === selectedPlan);

      const concepto = cart.map(c => c.label).join(' + ');

      const { error } = await supabase.from('solicitudes_pago').insert({
        empresa_id: empresa.id,
        user_id: user.id,
        tipo: planItem ? 'suscripcion' : 'timbres',
        concepto,
        monto_centavos: cartTotal,
        metodo: 'transferencia',
        notas: transferNotes || null,
        plan_price_id: planItem ? selectedPlan : null,
        cantidad_usuarios: planItem ? planQty : null,
        cantidad_timbres: timbresItem ? timbresPacks * 100 : null,
      } as any);

      if (error) throw error;
      toast.success('Solicitud enviada. Te avisaremos cuando confirmemos tu pago.');
      setShowTransferInfo(false);
      setShowPayMethod(false);
      setCart([]);
      setTransferNotes('');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPaying(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    toast.success('Copiado');
  }

  const statusLabel: Record<string, string> = {
    trial: 'Prueba gratuita', active: 'Activa', past_due: 'Pago pendiente', suspended: 'Suspendida',
  };
  const statusColor: Record<string, string> = {
    trial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    past_due: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    suspended: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const endDate = sub.status === 'trial' ? subData?.trial_ends_at : subData?.current_period_end;
  const daysLeft = endDate ? differenceInDays(new Date(endDate), new Date()) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" /> Mi Suscripción
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administra tu plan, usuarios y timbres de facturación en un solo lugar.
        </p>
      </div>

      {/* Status Banner */}
      <Card className={`overflow-hidden border-2 ${
        sub.isBlocked ? 'border-destructive/50' :
        sub.status === 'active' ? 'border-green-300 dark:border-green-700' :
        sub.status === 'trial' ? 'border-blue-300 dark:border-blue-700' :
        'border-border'
      }`}>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
                sub.isBlocked ? 'bg-destructive/10' :
                sub.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
                'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {sub.isBlocked ? <AlertTriangle className="h-7 w-7 text-destructive" /> :
                 sub.status === 'active' ? <Check className="h-7 w-7 text-green-600" /> :
                 <Clock className="h-7 w-7 text-blue-600" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${statusColor[sub.status || ''] || 'bg-muted text-muted-foreground'}`}>
                    {statusLabel[sub.status || ''] || sub.status || 'Sin suscripción'}
                  </span>
                </div>
                {sub.isBlocked && (
                  <p className="text-sm text-destructive mt-1 font-medium">Tu acceso está suspendido. Contrata un plan para continuar.</p>
                )}
                {!sub.isBlocked && daysLeft !== null && daysLeft < 999 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {daysLeft > 0 ? `Quedan ${daysLeft} días de tu periodo actual` : 'Tu periodo ha vencido'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{subData?.max_usuarios || sub.maxUsuarios}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Usuarios</div>
              </div>
              <Separator orientation="vertical" className="h-10" />
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{timbresBalance ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Timbres</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending requests */}
      {pendingSolicitudes.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Tienes {pendingSolicitudes.length} solicitud(es) de pago pendiente(s) de aprobación
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Se activará tu servicio cuando confirmemos el pago por transferencia.
            </p>
          </div>
        </div>
      )}

      {/* Two-column layout: Products + Cart */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Products (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Plans Section */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                <CreditCard className="h-5 w-5 text-primary" /> Elige tu plan
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Todos los planes incluyen acceso completo. Solo pagas por usuario.
              </p>

              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                {PLANS.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.priceId)}
                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                      selectedPlan === plan.priceId
                        ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                    <div className="text-sm font-bold text-foreground">{plan.label}</div>
                    <div className="text-2xl font-black text-foreground mt-1">${plan.price}</div>
                    <div className="text-[10px] text-muted-foreground">por usuario / mes</div>
                  </button>
                ))}
              </div>

              {selectedPlan && (
                <div className="flex items-center gap-4 bg-muted/50 rounded-xl p-4">
                  <span className="text-sm text-muted-foreground shrink-0">Usuarios:</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPlanQty(q => Math.max(3, q - 1))} disabled={planQty <= 3}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-lg font-bold w-8 text-center">{planQty}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPlanQty(q => q + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">(mín. 3)</span>
                  <Button size="sm" className="ml-auto" onClick={addPlanToCart}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timbres Section */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                <Stamp className="h-5 w-5 text-primary" /> Timbres CFDI
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Cada timbre te permite generar una factura electrónica (CFDI). Se venden en paquetes de 100 a $1 MXN c/u.
                <br />Tu saldo actual: <strong>{timbresBalance ?? 0} timbres</strong>.
              </p>

              <div className="flex items-center gap-4 bg-muted/50 rounded-xl p-4">
                <span className="text-sm text-muted-foreground shrink-0">Paquetes:</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTimbresPacks(p => Math.max(1, p - 1))} disabled={timbresPacks <= 1}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-lg font-bold w-8 text-center">{timbresPacks}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTimbresPacks(p => p + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="text-sm font-semibold text-foreground">{timbresPacks * 100} timbres = ${(timbresPacks * 100).toLocaleString()} MXN</span>
                <Button size="sm" className="ml-auto" onClick={addTimbresToCart}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Cart (1 col) */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6 border-2 border-primary/20">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" /> Tu pedido
              </h2>

              {cart.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">Tu pedido está vacío</p>
                  <p className="text-xs text-muted-foreground">
                    Selecciona un plan, usuarios o timbres y haz clic en <strong>"Agregar"</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.type} className="flex items-start justify-between gap-2 bg-muted/50 rounded-lg p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{item.label}</div>
                          <div className="text-[11px] text-muted-foreground">{item.detail}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-foreground">${(item.amount / 100).toLocaleString()}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.type)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">Total</span>
                    <span className="text-xl font-black text-foreground">${(cartTotal / 100).toLocaleString()} MXN</span>
                  </div>

                  <Button className="w-full h-12 text-base font-bold" size="lg" onClick={() => setShowPayMethod(true)}>
                    <Sparkles className="h-5 w-5 mr-2" /> Pagar ahora
                  </Button>

                  <p className="text-[10px] text-muted-foreground text-center">
                    Puedes pagar con tarjeta de crédito/débito o transferencia bancaria
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Dialog: Payment Method ─── */}
      <Dialog open={showPayMethod} onOpenChange={setShowPayMethod}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cómo deseas pagar?</DialogTitle>
            <DialogDescription>Total: ${(cartTotal / 100).toLocaleString()} MXN</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <button
              onClick={handlePayWithCard}
              disabled={paying}
              className="flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Pagar con tarjeta</div>
                <div className="text-xs text-muted-foreground">Crédito o débito — se procesa al instante</div>
              </div>
              {paying && <Loader2 className="h-5 w-5 animate-spin ml-auto" />}
            </button>

            <button
              onClick={() => { setShowPayMethod(false); setTransferNotes(''); setShowTransferInfo(true); }}
              className="flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Pagar con transferencia</div>
                <div className="text-xs text-muted-foreground">BBVA — se activa al confirmar tu pago</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Transfer Info ─── */}
      <Dialog open={showTransferInfo} onOpenChange={setShowTransferInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Datos para transferencia</DialogTitle>
            <DialogDescription>Transfiere y envía tu solicitud. Activamos tu servicio al confirmar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
                <span className="text-xs text-muted-foreground">Monto: </span>
                <span className="font-bold text-foreground text-lg">${(cartTotal / 100).toLocaleString()} MXN</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
              <Textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Referencia de transferencia, fecha, etc." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferInfo(false)}>Cancelar</Button>
            <Button onClick={handleSubmitTransfer} disabled={paying}>
              {paying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <BanknoteIcon className="h-4 w-4 mr-1" /> Ya transferí, enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
