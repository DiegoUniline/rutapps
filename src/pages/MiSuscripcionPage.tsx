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
  Building2, Copy, Check, AlertTriangle, Trash2,
  Receipt, FileText, Clock, Sparkles, ShoppingCart, ArrowRight, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SubPlanRow {
  id: string;
  nombre: string;
  periodo: string;
  meses: number;
  precio_por_usuario: number;
  descuento_pct: number;
  stripe_price_id: string | null;
  activo: boolean;
}

interface FacturaRow {
  id: string;
  numero_factura: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  num_usuarios: number;
  total: number;
  estado: string;
  es_prorrateo: boolean;
  fecha_emision: string;
  fecha_pago: string | null;
}

const BANK_INFO = {
  banco: 'BBVA Bancomer',
  titular: 'Diego Alonso León de Dios',
  cuenta: '116 755 1576',
  clabe: '012 333 01167551576 8',
};

interface CartItem {
  type: 'actualizacion' | 'timbres';
  label: string;
  detail: string;
  amount: number;
}

const PERIODO_LABEL: Record<string, string> = {
  mensual: 'Mensual',
  semestral: 'Semestral',
  anual: 'Anual',
};

export default function MiSuscripcionPage() {
  const { user, empresa } = useAuth();
  const sub = useSubscription();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subData, setSubData] = useState<any>(null);
  const [timbresBalance, setTimbresBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSolicitudes, setPendingSolicitudes] = useState<any[]>([]);
  const [subPlans, setSubPlans] = useState<SubPlanRow[]>([]);
  const [currentPlan, setCurrentPlan] = useState<SubPlanRow | null>(null);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);

  // Frequency change
  const [selectedFreq, setSelectedFreq] = useState<string | null>(null);

  // Add users
  const [extraUsers, setExtraUsers] = useState(0);

  const [timbresPacks, setTimbresPacks] = useState(1);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Payment dialogs
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showTransferInfo, setShowTransferInfo] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);

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
    const [subRes, timbresRes, solRes, plansRes, facturasRes] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('solicitudes_pago').select('*').eq('empresa_id', empresa!.id).eq('status', 'pendiente').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').eq('activo', true).order('precio_por_usuario', { ascending: false }),
      supabase.from('facturas').select('id, numero_factura, periodo_inicio, periodo_fin, num_usuarios, total, estado, es_prorrateo, fecha_emision, fecha_pago').eq('empresa_id', empresa!.id).order('fecha_emision', { ascending: false }).limit(20),
    ]);
    setSubData(subRes.data);
    setTimbresBalance(timbresRes.data?.saldo ?? 0);
    setPendingSolicitudes(solRes.data || []);
    const plans = (plansRes.data as SubPlanRow[]) || [];
    setSubPlans(plans);
    setFacturas((facturasRes.data as any[]) || []);

    // Resolve current plan
    if (subRes.data?.plan_id) {
      const cp = plans.find(p => p.id === subRes.data.plan_id) || null;
      setCurrentPlan(cp);
      if (cp) setSelectedFreq(cp.periodo);
    } else {
      setCurrentPlan(null);
      setSelectedFreq(null);
    }

    setExtraUsers(0);
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

  const currentUsuarios = subData?.max_usuarios || sub.maxUsuarios || 3;
  const newSelectedPlan = subPlans.find(p => p.periodo === selectedFreq) || null;

  // ─── Derived update state ───
  const targetPlan = newSelectedPlan || currentPlan;
  const totalNewUsers = currentUsuarios + extraUsers;
  const isFreqChange = selectedFreq && currentPlan && selectedFreq !== currentPlan.periodo;
  const isUserChange = extraUsers !== 0;
  const hasChanges = isFreqChange || isUserChange;

  // Calculate proration
  function calcUpdateCharge(): { amount: number; label: string; detail: string; isDowngrade: boolean } {
    if (!targetPlan) return { amount: 0, label: '', detail: '', isDowngrade: false };

    const newTotalMes = targetPlan.precio_por_usuario * totalNewUsers;
    const currentTotalMes = currentPlan ? currentPlan.precio_por_usuario * currentUsuarios : 0;

    // Determine months remaining in current period
    const periodEnd = subData?.current_period_end;
    let monthsRemaining = 1;
    if (periodEnd) {
      const now = new Date();
      const end = new Date(periodEnd);
      const diffMs = end.getTime() - now.getTime();
      monthsRemaining = Math.max(1, Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000)));
    }

    const diffMes = newTotalMes - currentTotalMes;
    const isDowngrade = diffMes < 0;

    if (isDowngrade) {
      // No refund — applies next period
      return {
        amount: 0,
        label: 'Reducción de plan',
        detail: `Se aplica al siguiente periodo. Nuevo total: $${newTotalMes.toLocaleString()}/mes`,
        isDowngrade: true,
      };
    }

    // Charge the difference for remaining months
    const chargeTotal = diffMes * monthsRemaining;
    const parts: string[] = [];
    if (isFreqChange) parts.push(`frecuencia a ${PERIODO_LABEL[targetPlan.periodo]}`);
    if (isUserChange && extraUsers > 0) parts.push(`+${extraUsers} usuario${extraUsers > 1 ? 's' : ''}`);
    
    return {
      amount: Math.round(chargeTotal * 100),
      label: `Actualizar plan${parts.length ? ': ' + parts.join(', ') : ''}`,
      detail: `${totalNewUsers} usuarios × $${targetPlan.precio_por_usuario}/mes = $${newTotalMes.toLocaleString()}/mes${monthsRemaining > 1 ? ` · Cobro prorrateo: $${chargeTotal.toLocaleString()} (${monthsRemaining} meses restantes)` : ''}`,
      isDowngrade: false,
    };
  }

  // ─── Cart helpers ───
  function addUpdateToCart() {
    if (!targetPlan || !hasChanges) return;
    if (totalNewUsers < 3) {
      toast.error('Mínimo 3 usuarios');
      return;
    }
    const charge = calcUpdateCharge();
    const filtered = cart.filter(c => c.type !== 'actualizacion');
    filtered.push({
      type: 'actualizacion',
      label: charge.label,
      detail: charge.detail,
      amount: charge.amount,
    });
    setCart(filtered);
    toast.success(charge.isDowngrade ? 'Cambio programado para el siguiente periodo' : 'Actualización agregada al pedido');
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
      const usersItem = cart.find(c => c.type === 'usuarios');
      const timbresItem = cart.find(c => c.type === 'timbres');
      let redirectUrl = '';

      // Determine the target plan for checkout
      const targetPlan = planItem ? newSelectedPlan : currentPlan;
      const targetQty = currentUsuarios + extraUsers;

      if (planItem || usersItem) {
        if (!targetPlan?.stripe_price_id) throw new Error('El plan seleccionado no tiene precio configurado en Stripe');

        if (subData?.stripe_subscription_id) {
          // Update existing Stripe subscription
          if (planItem) {
            const { data, error } = await supabase.functions.invoke('manage-subscription', {
              body: { action: 'change_plan', new_price_id: targetPlan.stripe_price_id },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
          }
          if (usersItem || (planItem && targetQty !== currentUsuarios)) {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'update_quantity', new_quantity: targetQty },
            });
          }
          // Update plan_id locally
          if (planItem && newSelectedPlan) {
            await supabase.from('subscriptions')
              .update({ plan_id: newSelectedPlan.id, max_usuarios: targetQty, updated_at: new Date().toISOString() })
              .eq('id', subData.id);
          } else if (usersItem) {
            await supabase.from('subscriptions')
              .update({ max_usuarios: targetQty, updated_at: new Date().toISOString() })
              .eq('id', subData.id);
          }
          toast.success('Plan actualizado correctamente');
          setShowPayMethod(false);
          setCart([]);
          loadData();
          return;
        } else {
          // No existing Stripe sub — select plan & create checkout
          const planForCheckout = newSelectedPlan || currentPlan;
          if (!planForCheckout?.stripe_price_id) throw new Error('Sin precio de Stripe configurado');

          const { data: spData, error: spError } = await supabase.functions.invoke('select-plan', {
            body: { plan_id: planForCheckout.id, num_usuarios: targetQty },
          });
          if (spError) throw spError;
          if (spData?.error) throw new Error(spData.error);

          if (spData?.checkout_url) {
            redirectUrl = spData.checkout_url;
          } else {
            const { data, error } = await supabase.functions.invoke('create-checkout', {
              body: { price_id: planForCheckout.stripe_price_id, quantity: targetQty, empresa_id: empresa?.id },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            if (!data?.url) throw new Error('No se recibió URL de pago de Stripe');
            redirectUrl = data.url;
          }
        }
      }

      if (timbresItem && !redirectUrl) {
        const { data, error } = await supabase.functions.invoke('purchase-timbres', {
          body: { action: 'create_checkout', quantity: timbresPacks },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error('No se recibió URL de pago de Stripe');
        redirectUrl = data.url;
      }

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar el pago con tarjeta');
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
      const usersItem = cart.find(c => c.type === 'usuarios');
      const timbresItem = cart.find(c => c.type === 'timbres');
      const concepto = cart.map(c => c.label).join(' + ');
      const targetPlan = planItem ? newSelectedPlan : currentPlan;
      const targetQty = currentUsuarios + extraUsers;

      if (planItem || usersItem) {
        const planForSelect = newSelectedPlan || currentPlan;
        if (planForSelect) {
          await supabase.functions.invoke('select-plan', {
            body: { plan_id: planForSelect.id, num_usuarios: targetQty },
          });
        }
      }

      const { error } = await supabase.from('solicitudes_pago').insert({
        empresa_id: empresa.id,
        user_id: user.id,
        tipo: (planItem || usersItem) ? 'suscripcion' : 'timbres',
        concepto,
        monto_centavos: cartTotal,
        metodo: 'transferencia',
        notas: transferNotes || null,
        plan_price_id: targetPlan?.stripe_price_id || null,
        cantidad_usuarios: (planItem || usersItem) ? targetQty : null,
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

  // ─── Pay single invoice with Stripe ───
  async function handlePayInvoice(factura: FacturaRow) {
    setPayingInvoice(factura.id);
    try {
      const plan = currentPlan || subPlans[0];
      if (!plan?.stripe_price_id) throw new Error('No se encontró un plan con precio de Stripe');

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: plan.stripe_price_id, quantity: factura.num_usuarios, empresa_id: empresa?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('No se recibió URL de pago');
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || 'Error al generar enlace de pago');
    } finally {
      setPayingInvoice(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    toast.success('Copiado');
  }

  const statusLabel: Record<string, string> = {
    trial: 'Prueba gratuita', active: 'Activa', past_due: 'Pago pendiente',
    suspended: 'Suspendida', pendiente_pago: 'Pendiente de pago', gracia: 'Periodo de gracia',
  };
  const statusColor: Record<string, string> = {
    trial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    past_due: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    suspended: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    pendiente_pago: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    gracia: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  };

  const facturaStatusLabel: Record<string, string> = {
    pendiente: 'Pendiente', procesando: 'Procesando', pagada: 'Pagada', cancelada: 'Cancelada',
  };
  const facturaStatusColor: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    procesando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    pagada: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
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

  // Pending invoices
  const pendingFacturas = facturas.filter(f => f.estado === 'pendiente');

  // Is frequency different from current?
  const isFreqChange = selectedFreq && currentPlan && selectedFreq !== currentPlan.periodo;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" /> Mi Suscripción
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administra tu plan, usuarios y timbres de facturación.
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
                  {currentPlan && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
                      Plan {PERIODO_LABEL[currentPlan.periodo] || currentPlan.nombre}
                    </span>
                  )}
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
                <div className="text-2xl font-bold text-foreground">{currentUsuarios}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Usuarios</div>
              </div>
              <Separator orientation="vertical" className="h-10" />
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{timbresBalance ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Timbres</div>
              </div>
            </div>
          </div>

          {subData && (subData.current_period_start || subData.current_period_end) && (
            <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-border">
              {subData.current_period_start && (
                <div className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Último pago:</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(subData.current_period_start), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                </div>
              )}
              {subData.current_period_end && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Próximo cobro:</span>
                  <span className="font-medium text-foreground">
                    {(() => {
                      const d = new Date(subData.current_period_end);
                      const firstOfNext = new Date(d.getFullYear(), d.getMonth() + (d.getDate() === 1 ? 0 : 1), 1);
                      return format(firstOfNext, "d 'de' MMMM yyyy", { locale: es });
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ⚠️ PROMINENT: Pending Invoice Banner */}
      {pendingFacturas.length > 0 && (
        <Card className="border-2 border-destructive/60 bg-destructive/5">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-bold text-destructive">
                    Tienes {pendingFacturas.length} factura{pendingFacturas.length > 1 ? 's' : ''} pendiente{pendingFacturas.length > 1 ? 's' : ''} de pago
                  </p>
                  <p className="text-lg font-black text-foreground">
                    ${pendingFacturas.reduce((sum, f) => sum + f.total, 0).toLocaleString()} MXN
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                className="h-12 text-base font-bold gap-2 shrink-0"
                disabled={payingInvoice !== null}
                onClick={() => handlePayInvoice(pendingFacturas[0])}
              >
                {payingInvoice ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                Pagar ahora
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending transfer requests */}
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

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Plan + Timbres + History */}
        <div className="lg:col-span-2 space-y-6">

          {/* ─── Tu plan actual ─── */}
          {currentPlan && (
            <Card className="border-primary/20">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
                  <Crown className="h-5 w-5 text-primary" /> Tu plan actual
                </h2>
                <div className="flex flex-wrap items-center gap-4 bg-primary/5 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-sm font-bold border-primary text-primary px-3 py-1">
                      {PERIODO_LABEL[currentPlan.periodo] || currentPlan.nombre}
                    </Badge>
                  </div>
                  <Separator orientation="vertical" className="h-8 hidden sm:block" />
                  <div className="text-sm text-foreground">
                    <strong>{currentUsuarios}</strong> usuarios × <strong>${currentPlan.precio_por_usuario}</strong>/usuario/mes
                  </div>
                  <Separator orientation="vertical" className="h-8 hidden sm:block" />
                  <div className="text-lg font-black text-foreground">
                    ${(currentPlan.precio_por_usuario * currentUsuarios).toLocaleString()} MXN/mes
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Cambiar frecuencia de cobro ─── */}
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                  <RefreshCw className="h-5 w-5 text-primary" /> {currentPlan ? 'Cambiar frecuencia de cobro' : 'Elige tu plan'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {currentPlan
                    ? 'Cambia la frecuencia y se aplica a todos tus usuarios. Los planes con mayor duración tienen descuento.'
                    : 'Todos los usuarios de tu empresa comparten el mismo plan y frecuencia de cobro.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {subPlans.map(plan => {
                  const isCurrentPlan = currentPlan?.id === plan.id;
                  const isSelected = selectedFreq === plan.periodo;
                  const totalMes = plan.precio_por_usuario * currentUsuarios;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedFreq(plan.periodo)}
                      className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      {isCurrentPlan && (
                        <span className="absolute -top-2.5 left-3 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Plan actual
                        </span>
                      )}
                      {plan.descuento_pct > 0 && !isCurrentPlan && (
                        <span className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {plan.descuento_pct}% desc.
                        </span>
                      )}
                      <div className="text-sm font-bold text-foreground">{PERIODO_LABEL[plan.periodo] || plan.nombre}</div>
                      <div className="text-2xl font-black text-foreground mt-1">${plan.precio_por_usuario}</div>
                      <div className="text-[10px] text-muted-foreground">por usuario / mes</div>
                      <Separator className="my-2" />
                      <div className="text-xs text-muted-foreground">
                        {currentUsuarios} usuarios × ${plan.precio_por_usuario} = <strong className="text-foreground">${totalMes.toLocaleString()}/mes</strong>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Change frequency action */}
              {isFreqChange && newSelectedPlan && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Cambiar de <strong className="text-foreground">{PERIODO_LABEL[currentPlan!.periodo]}</strong> a <strong className="text-foreground">{PERIODO_LABEL[newSelectedPlan.periodo]}</strong>
                    </div>
                    <div className="text-lg font-black text-foreground">
                      {currentUsuarios} usuarios × ${newSelectedPlan.precio_por_usuario} = ${(newSelectedPlan.precio_por_usuario * currentUsuarios).toLocaleString()} MXN/mes
                    </div>
                  </div>
                  <Button size="lg" className="h-11 font-bold shrink-0" onClick={addFreqChangeToCart}>
                    <ArrowRight className="h-4 w-4 mr-2" /> Cambiar plan
                  </Button>
                </div>
              )}

              {/* First-time plan selection (no current plan) */}
              {!currentPlan && selectedFreq && newSelectedPlan && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Plan <strong className="text-foreground">{PERIODO_LABEL[newSelectedPlan.periodo]}</strong> — {currentUsuarios} usuarios
                    </div>
                    <div className="text-lg font-black text-foreground">
                      ${(newSelectedPlan.precio_por_usuario * currentUsuarios).toLocaleString()} MXN/mes
                    </div>
                  </div>
                  <Button size="lg" className="h-11 font-bold shrink-0" onClick={addFreqChangeToCart}>
                    <ShoppingCart className="h-4 w-4 mr-2" /> Agregar al pedido
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Agregar usuarios ─── */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                  <Users className="h-5 w-5 text-primary" /> Agregar usuarios
                </h2>
                <p className="text-xs text-muted-foreground">
                  Los nuevos usuarios se cobrarán con tu plan actual{currentPlan ? ` (${PERIODO_LABEL[currentPlan.periodo]})` : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 bg-muted/30 rounded-xl p-4">
                <span className="text-sm font-medium text-foreground shrink-0">Usuarios adicionales:</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setExtraUsers(q => Math.max(0, q - 1))} disabled={extraUsers <= 0}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    value={extraUsers}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 0) setExtraUsers(v);
                      else if (e.target.value === '') setExtraUsers(0);
                    }}
                    className="w-16 h-9 text-center text-xl font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setExtraUsers(q => q + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {extraUsers > 0 && (currentPlan || newSelectedPlan) && (
                  <span className="text-sm text-muted-foreground">
                    +${((currentPlan || newSelectedPlan)!.precio_por_usuario * extraUsers).toLocaleString()}/mes
                  </span>
                )}
              </div>

              {extraUsers > 0 && (
                <div className="flex justify-between items-center bg-primary/5 rounded-xl border border-primary/20 p-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {extraUsers} usuario{extraUsers > 1 ? 's' : ''} × ${(currentPlan || newSelectedPlan)?.precio_por_usuario}/mes
                    </div>
                    <div className="text-lg font-black text-foreground">
                      +${((currentPlan || newSelectedPlan)!.precio_por_usuario * extraUsers).toLocaleString()} MXN/mes
                    </div>
                  </div>
                  <Button size="lg" className="h-11 font-bold shrink-0" onClick={addUsersToCart}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar al pedido
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
                Paquetes de 100 timbres a $1 MXN c/u. Saldo actual: <strong>{timbresBalance ?? 0} timbres</strong>.
              </p>

              <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-4">
                <span className="text-sm text-muted-foreground shrink-0">Timbres:</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTimbresPacks(p => Math.max(1, p - 1))} disabled={timbresPacks <= 1}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={timbresPacks}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 1) setTimbresPacks(v);
                      else if (e.target.value === '') setTimbresPacks(1);
                    }}
                    className="w-16 h-8 text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
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

          {/* Invoice History */}
          {facturas.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                  <Receipt className="h-5 w-5 text-primary" /> Historial de facturas
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-semibold text-muted-foreground text-xs">Factura</th>
                        <th className="text-left py-2 px-2 font-semibold text-muted-foreground text-xs">Periodo</th>
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground text-xs">Usuarios</th>
                        <th className="text-right py-2 px-2 font-semibold text-muted-foreground text-xs">Total</th>
                        <th className="text-center py-2 px-2 font-semibold text-muted-foreground text-xs">Estado</th>
                        <th className="text-center py-2 px-2 font-semibold text-muted-foreground text-xs"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.map(f => (
                        <tr key={f.id} className="border-b border-border/50 hover:bg-card">
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-foreground">{f.numero_factura || '—'}</span>
                              {f.es_prorrateo && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">Prorrateo</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground text-xs">
                            {format(new Date(f.periodo_inicio), 'dd MMM', { locale: es })} — {format(new Date(f.periodo_fin), 'dd MMM yy', { locale: es })}
                          </td>
                          <td className="py-2.5 px-2 text-right text-foreground">{f.num_usuarios}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-foreground">${f.total.toLocaleString()}</td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${facturaStatusColor[f.estado] || 'bg-muted text-muted-foreground'}`}>
                              {facturaStatusLabel[f.estado] || f.estado}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {f.estado === 'pendiente' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={payingInvoice === f.id}
                                onClick={() => handlePayInvoice(f)}
                              >
                                {payingInvoice === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                                Pagar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Cart */}
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
                    Configura tu plan y haz clic en <strong>"Agregar al pedido"</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.type} className="flex items-start justify-between gap-2 bg-muted/30 rounded-lg p-3">
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
                    Tarjeta de crédito/débito o transferencia bancaria
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

      {/* Cancel subscription link */}
      {subData && subData.status !== 'cancelled' && subData.status !== 'cancelling' && (
        <div className="text-center pt-4 pb-8">
          <button
            onClick={() => navigate('/cancelar-suscripcion')}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
          >
            Cancelar mi suscripción
          </button>
        </div>
      )}
    </div>
  );
}
