import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';
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
  Receipt, FileText, Clock, Sparkles, ShoppingCart, ArrowRight, RefreshCw, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fmtDate, fmtDateLongMx } from '@/lib/utils';
import CostoSimuladorCard from '@/components/suscripcion/CostoSimuladorCard';
import DatosFiscalesCard from '@/components/suscripcion/DatosFiscalesCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { refreshAppVersion } from '@/lib/appUpdate';

interface SubPlanRow {
  id: string;
  nombre: string;
  periodo: string;
  meses: number;
  precio_por_usuario: number;
  precio_base: number;
  usuarios_incluidos: number;
  precio_extra_usuario: number;
  slug: string | null;
  orden: number;
  popular: boolean;
  ideal_para: string | null;
  descuento_pct: number;
  stripe_price_id: string | null;
  activo: boolean;
}

// Returns the monthly cost for a plan + qty.
// New plans (with slug): precio_base + max(0, qty - incluidos) * precio_extra_usuario
// Legacy plans: precio_por_usuario * qty
function planMonthlyCost(plan: SubPlanRow | null | undefined, qty: number): number {
  if (!plan) return 0;
  if (plan.slug) {
    const extras = Math.max(0, qty - (plan.usuarios_incluidos || 0));
    return Number(plan.precio_base || 0) + extras * Number(plan.precio_extra_usuario || 0);
  }
  return Number(plan.precio_por_usuario || 0) * qty;
}

function planMinUsers(plan: SubPlanRow | null | undefined, isLegacy: boolean): number {
  if (!plan) return isLegacy ? 3 : 1;
  if (plan.slug) return Math.max(1, plan.usuarios_incluidos || 1);
  return 3;
}


interface FacturaRow {
  id: string;
  numero_factura: string | null;
  concepto: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  num_usuarios: number;
  total: number;
  estado: string;
  es_prorrateo: boolean;
  fecha_emision: string;
  fecha_pago: string | null;
  stripe_invoice_id: string | null;
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
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [invoiceTransfer, setInvoiceTransfer] = useState<FacturaRow | null>(null);
  const [deleteFacturaDialog, setDeleteFacturaDialog] = useState<FacturaRow | null>(null);

  // Coupons (multiple allowed)
  const [cuponCode, setCuponCode] = useState('');
  const [cuponLoading, setCuponLoading] = useState(false);
  const [activeCupones, setActiveCupones] = useState<any[]>([]);

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
    const [subRes, timbresRes, solRes, plansRes, facturasRes, cuponRes] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresa!.id).maybeSingle(),
      supabase.from('solicitudes_pago').select('*').eq('empresa_id', empresa!.id).eq('status', 'pendiente').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').order('orden', { ascending: true }),
      supabase.from('facturas').select('id, numero_factura, concepto, periodo_inicio, periodo_fin, num_usuarios, total, estado, es_prorrateo, fecha_emision, fecha_pago, stripe_invoice_id').eq('empresa_id', empresa!.id).order('fecha_emision', { ascending: false }).limit(20),
      supabase.from('cupon_usos').select('*, cupones:cupon_id(codigo, descuento_pct, acumulable, meses_duracion, vigencia_fin)').eq('empresa_id', empresa!.id).order('aplicado_at', { ascending: false }),
    ]);
    setSubData(subRes.data);
    setTimbresBalance(timbresRes.data?.saldo ?? 0);
    setPendingSolicitudes(solRes.data || []);
    const allPlansRaw = (plansRes.data as SubPlanRow[]) || [];
    // Show: active plans + current plan (even if inactive, for legacy customers)
    const currentPlanId = subRes.data?.plan_id;
    const plans = allPlansRaw.filter(p => p.activo || p.id === currentPlanId);
    setSubPlans(plans);

    setFacturas((facturasRes.data as any[]) || []);

    // Active coupons (still valid: meses_restantes null or > 0, and not expired)
    const today = new Date().toISOString().slice(0, 10);
    const allUsos = (cuponRes.data as any[]) || [];
    const activos = allUsos.filter(u => {
      const stillHasMonths = u.meses_restantes === null || u.meses_restantes > 0;
      const notExpired = !u.cupones?.vigencia_fin || u.cupones.vigencia_fin >= today;
      return stillHasMonths && notExpired;
    });
    setActiveCupones(activos);

    // Resolve current plan
    if (subRes.data?.plan_id) {
      const cp = plans.find(p => p.id === subRes.data.plan_id) || null;
      setCurrentPlan(cp);
      if (cp) setSelectedFreq(cp.id);
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

  async function handleApplyCupon() {
    if (!cuponCode.trim() || !empresa?.id) return;
    setCuponLoading(true);
    try {
      const code = cuponCode.trim().toUpperCase();
      // Fetch coupon
      const { data: cupon, error: cErr } = await supabase
        .from('cupones')
        .select('*')
        .eq('activo', true)
        .ilike('codigo', code)
        .maybeSingle();

      if (cErr) throw cErr;
      if (!cupon) throw new Error('Cupón no encontrado o inactivo');

      // Validate vigencia
      const today = new Date().toISOString().slice(0, 10);
      if (cupon.vigencia_inicio && today < cupon.vigencia_inicio) throw new Error('Este cupón aún no es válido');
      if (cupon.vigencia_fin && today > cupon.vigencia_fin) throw new Error('Este cupón ha expirado');

      // Validate uso_maximo
      if (cupon.uso_maximo && cupon.usos_actuales >= cupon.uso_maximo) throw new Error('Este cupón ya alcanzó su límite de usos');

      // Validate uso_por_empresa
      const { count } = await supabase
        .from('cupon_usos')
        .select('id', { count: 'exact', head: true })
        .eq('cupon_id', cupon.id)
        .eq('empresa_id', empresa.id);
      if ((count || 0) >= (cupon.uso_por_empresa || 1)) throw new Error('Ya usaste este cupón el número máximo de veces');

      // Validate planes_aplicables
      if (cupon.planes_aplicables?.length > 0 && currentPlan) {
        if (!cupon.planes_aplicables.includes(currentPlan.periodo)) {
          throw new Error(`Este cupón solo aplica para planes: ${cupon.planes_aplicables.join(', ')}`);
        }
      }

      // Apply: insert cupon_usos
      const { error: insertErr } = await supabase.from('cupon_usos').insert({
        cupon_id: cupon.id,
        empresa_id: empresa.id,
        subscription_id: subData?.id || null,
        meses_restantes: cupon.meses_duracion || null,
      });
      if (insertErr) throw insertErr;

      // Increment usos_actuales
      await supabase.from('cupones').update({ usos_actuales: (cupon.usos_actuales || 0) + 1 }).eq('id', cupon.id);

      // Calculate effective discount
      const companyDiscount = subData?.descuento_porcentaje ? Number(subData.descuento_porcentaje) : 0;
      let newDiscount: number;
      if (cupon.acumulable) {
        newDiscount = Math.min(100, companyDiscount + cupon.descuento_pct);
      } else {
        newDiscount = Math.max(companyDiscount, cupon.descuento_pct);
      }

      // Update subscription discount
      if (subData?.id && newDiscount !== companyDiscount) {
        await supabase.from('subscriptions').update({ descuento_porcentaje: newDiscount }).eq('id', subData.id);
      }

      // Recalculate pending invoices with new discount
      if (currentPlan) {
        const { data: pendingInvoices } = await supabase
          .from('facturas')
          .select('id, num_usuarios, precio_unitario')
          .eq('empresa_id', empresa.id)
          .eq('estado', 'pendiente');

        if (pendingInvoices && pendingInvoices.length > 0) {
          for (const inv of pendingInvoices) {
            const pu = inv.precio_unitario || currentPlan.precio_por_usuario;
            const precioConDescuento = newDiscount > 0
              ? Math.round(pu * (1 - newDiscount / 100))
              : pu;
            const qty = inv.num_usuarios || 3;
            const newTotal = precioConDescuento * qty;
            const newSubtotal = pu * qty;
            await supabase.from('facturas').update({
              descuento_porcentaje: newDiscount,
              subtotal: newSubtotal,
              total: newTotal,
            }).eq('id', inv.id);
          }
          toast.success(`Se actualizaron ${pendingInvoices.length} factura(s) pendiente(s) con el nuevo descuento`);
        }
      }

      toast.success(`¡Cupón ${cupon.codigo} aplicado! ${cupon.descuento_pct}% de descuento${cupon.meses_duracion ? ` por ${cupon.meses_duracion} meses` : ''}`);
      setCuponCode('');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error al aplicar cupón');
    } finally {
      setCuponLoading(false);
    }
  }

  const isLegacyCustomer = subData?.legacy_pricing === true;
  const minCurrentUsuarios = isLegacyCustomer ? 3 : 1;
  const currentUsuarios = subData?.max_usuarios || sub.maxUsuarios || minCurrentUsuarios;
  // selectedFreq now stores plan_id
  const newSelectedPlan = subPlans.find(p => p.id === selectedFreq) || null;

  // ─── Inactive subscription detection ───
  // Cancelled/suspended/past_due, acceso bloqueado, o cobertura ya vencida (no manual)
  // → cualquier contratación es alta nueva, no un cambio.
  const isInactiveSubscription = (() => {
    if (!subData) return false;
    if (subData.acceso_bloqueado === true) return true;
    if (['cancelled', 'cancelada', 'suspended', 'past_due'].includes(subData.status || '')) return true;
    const candidates = [subData.current_period_end, subData.fecha_vencimiento]
      .filter(Boolean)
      .map((d: string) => new Date(d));
    if (!subData.es_manual && candidates.length) {
      const endDate = new Date(Math.max(...candidates.map((d: Date) => d.getTime())));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (endDate < today) return true;
    }
    return false;
  })();

  // ─── Derived update state ───
  const targetPlan = newSelectedPlan || currentPlan;
  const targetMin = planMinUsers(targetPlan, isLegacyCustomer);
  const totalNewUsers = Math.max(targetMin, currentUsuarios + extraUsers);
  // Si la suscripción está inactiva, tratamos como alta nueva aunque haya currentPlan.
  const isInitialPlanSelection = (!currentPlan && !!selectedFreq) || (isInactiveSubscription && !!selectedFreq);
  const isFreqChange = !isInactiveSubscription && !!selectedFreq && !!currentPlan && selectedFreq !== currentPlan.id;
  const isUserChange = extraUsers !== 0;
  const hasChanges = isInitialPlanSelection || isFreqChange || isUserChange;

  function calcUpdateCharge(): { amount: number; label: string; detail: string; isDowngrade: boolean; totalPeriodo: number } {
    if (!targetPlan) return { amount: 0, label: '', detail: '', isDowngrade: false, totalPeriodo: 0 };

    const monthsBilled = targetPlan.meses || 1;
    const newMonthly = planMonthlyCost(targetPlan, totalNewUsers);
    const newTotalPeriodo = newMonthly * monthsBilled;
    const currentMonthly = currentPlan ? planMonthlyCost(currentPlan, currentUsuarios) : 0;
    const currentTotalPeriodo = currentMonthly * (currentPlan?.meses || 1);

    // Si la suscripción está inactiva, no hay "plan actual" contra el cual comparar:
    // se trata como contratación nueva (cobro completo, nunca downgrade).
    const effectiveCurrentMonthly = isInactiveSubscription ? 0 : currentMonthly;
    const effectiveCurrentTotalPeriodo = isInactiveSubscription ? 0 : currentTotalPeriodo;
    const diff = newTotalPeriodo - effectiveCurrentTotalPeriodo;
    const isDowngrade = !isInactiveSubscription && diff < 0;

    const parts: string[] = [];
    if (isFreqChange) parts.push(targetPlan.nombre);
    if (isUserChange && extraUsers > 0) parts.push(`+${extraUsers} usuario${extraUsers > 1 ? 's' : ''}`);
    if (isUserChange && extraUsers < 0) parts.push(`${extraUsers} usuario${extraUsers < -1 ? 's' : ''}`);

    const planLabel = targetPlan.slug ? targetPlan.nombre : (PERIODO_LABEL[targetPlan.periodo] || targetPlan.nombre);
    const fmtBreakdown = () => {
      if (targetPlan.slug) {
        const extras = Math.max(0, totalNewUsers - (targetPlan.usuarios_incluidos || 0));
        return `Base ${targetPlan.nombre} $${Number(targetPlan.precio_base).toLocaleString()} + ${extras} usuario${extras !== 1 ? 's' : ''} extra × $${targetPlan.precio_extra_usuario} = $${newMonthly.toLocaleString()} MXN/mes`;
      }
      return `${totalNewUsers} usuarios × $${targetPlan.precio_por_usuario}/mes × ${monthsBilled} mes${monthsBilled !== 1 ? 'es' : ''} = $${newTotalPeriodo.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN`;
    };

    if (isDowngrade) {
      return {
        amount: 0,
        label: 'Reducción de plan',
        detail: `Se aplica al siguiente periodo. Nuevo total: $${newTotalPeriodo.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN/${planLabel.toLowerCase()}`,
        isDowngrade: true,
        totalPeriodo: newTotalPeriodo,
      };
    }

    const hasPendingInvoice = pendingFacturas.length > 0;
    const pendingTotal = pendingFacturas.reduce((s, f) => s + f.total, 0);

    let chargeAmount: number;
    let chargeDetail: string;

    if (hasPendingInvoice) {
      chargeAmount = newTotalPeriodo;
      chargeDetail = `${fmtBreakdown()}\nSe cancela factura pendiente de $${pendingTotal.toLocaleString("es-MX", { maximumFractionDigits: 2 })} y se genera la nueva.`;
    } else if (isInactiveSubscription) {
      chargeAmount = newTotalPeriodo;
      chargeDetail = `${fmtBreakdown()}\nContratación nueva — se generará la factura correspondiente.`;
    } else if (currentPlan && diff > 0) {
      chargeAmount = diff;
      chargeDetail = `${fmtBreakdown()}\nDiferencia vs plan actual: $${chargeAmount.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN`;
    } else {
      chargeAmount = newTotalPeriodo;
      chargeDetail = fmtBreakdown();
    }

    return {
      amount: Math.round(chargeAmount * 100),
      label: `Actualizar plan${parts.length ? ': ' + parts.join(', ') : ''}`,
      detail: chargeDetail,
      isDowngrade: false,
      totalPeriodo: newTotalPeriodo,

    };
  }

  // ─── Cart helpers ───
  function addUpdateToCart() {
    if (!targetPlan || !hasChanges) return;
    if (totalNewUsers < targetMin) {
      toast.error(`Mínimo ${targetMin} usuario${targetMin !== 1 ? 's' : ''} para el plan ${targetPlan.nombre}`);
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
    toast.success(
      isInitialPlanSelection
        ? (isInactiveSubscription ? 'Plan agregado al pedido — se generará factura' : 'Plan agregado al pedido')
        : charge.isDowngrade
          ? 'Cambio programado para el siguiente periodo'
          : 'Actualización agregada al pedido'
    );
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
      const updateItem = cart.find(c => c.type === 'actualizacion');
      const timbresItem = cart.find(c => c.type === 'timbres');
      let redirectUrl = '';

      const tgtPlan = newSelectedPlan || currentPlan;
      const tgtQty = totalNewUsers;

      if (updateItem) {
        // Cancel pending invoices before updating
        if (pendingFacturas.length > 0) {
          for (const f of pendingFacturas) {
            await supabase.from('facturas').update({ estado: 'cancelada' }).eq('id', f.id);
          }
        }

        if (!tgtPlan?.stripe_price_id) throw new Error('El plan seleccionado no tiene precio configurado en Stripe');

        if (subData?.stripe_subscription_id && !isInactiveSubscription) {
          // Update existing Stripe subscription
          if (isFreqChange && tgtPlan) {
            const { data, error } = await supabase.functions.invoke('manage-subscription', {
              body: { action: 'change_plan', new_price_id: tgtPlan.stripe_price_id },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
          }
          if (tgtQty !== currentUsuarios) {
            await supabase.functions.invoke('manage-subscription', {
              body: { action: 'update_quantity', new_quantity: tgtQty },
            });
          }
          // Update locally
          await supabase.from('subscriptions')
            .update({
              plan_id: tgtPlan.id,
              max_usuarios: tgtQty,
              updated_at: new Date().toISOString(),
            })
            .eq('id', subData.id);
          toast.success('Plan actualizado correctamente');
          setShowPayMethod(false);
          setCart([]);
          setExtraUsers(0);
          loadData();
          return;
        } else {
          // Sin Stripe sub activa, o suscripción inactiva (cancelada/suspendida/vencida)
          // → ruta de alta nueva: select-plan genera factura + checkout fresco.
          if (!tgtPlan?.stripe_price_id) throw new Error('Sin precio de Stripe configurado');

          const { data: spData, error: spError } = await supabase.functions.invoke('select-plan', {
            body: { plan_id: tgtPlan.id, num_usuarios: tgtQty },
          });
          if (spError) throw spError;
          if (spData?.error) throw new Error(spData.error);

          if (spData?.checkout_url) {
            redirectUrl = spData.checkout_url;
          } else {
            const { data, error } = await supabase.functions.invoke('create-checkout', {
              body: { price_id: tgtPlan.stripe_price_id, quantity: tgtQty, empresa_id: empresa?.id },
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
      const updateItem = cart.find(c => c.type === 'actualizacion');
      const timbresItem = cart.find(c => c.type === 'timbres');
      const concepto = cart.map(c => c.label).join(' + ');
      const tgtPlan = newSelectedPlan || currentPlan;
      const tgtQty = totalNewUsers;

      // Cancel pending invoices before updating
      if (updateItem && pendingFacturas.length > 0) {
        for (const f of pendingFacturas) {
          await supabase.from('facturas').update({ estado: 'cancelada' }).eq('id', f.id);
        }
      }

      if (updateItem) {
        if (tgtPlan) {
          await supabase.functions.invoke('select-plan', {
            body: { plan_id: tgtPlan.id, num_usuarios: tgtQty },
          });
        }
      }

      const { error } = await supabase.from('solicitudes_pago').insert({
        empresa_id: empresa.id,
        user_id: user.id,
        tipo: updateItem ? 'suscripcion' : 'timbres',
        concepto,
        monto_centavos: cartTotal,
        metodo: 'transferencia',
        notas: transferNotes || null,
        plan_price_id: tgtPlan?.stripe_price_id || null,
        cantidad_usuarios: updateItem ? tgtQty : null,
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
      // 1) If the invoice already exists in Stripe (e.g. manually created/finalized),
      //    redirect to its hosted_invoice_url instead of generating a new checkout —
      //    otherwise the customer would be charged twice.
      if (factura.stripe_invoice_id) {
        const { data: invData, error: invErr } = await supabase.functions.invoke('get-stripe-invoice-url', {
          body: { invoice_id: factura.stripe_invoice_id },
        });
        if (invErr) throw invErr;
        if (invData?.status === 'paid') {
          await supabase
            .from('facturas')
            .update({ estado: 'pagada', fecha_pago: new Date().toISOString() })
            .eq('id', factura.id);
          toast.success('Factura marcada como pagada');
          loadData();
          return;
        }
        if (invData?.hosted_invoice_url && invData.status !== 'void') {
          window.location.href = invData.hosted_invoice_url;
          return;
        }
        throw new Error('No se encontró un enlace de pago válido para esta factura');
      }

      // 2) Factura manual: no se cobra por Stripe; se muestra transferencia.
      setTransferNotes('');
      setInvoiceTransfer(factura);
    } catch (e: any) {
      toast.error(e.message || 'Error al generar enlace de pago');
    } finally {
      setPayingInvoice(null);
    }
  }

  async function handleSubmitInvoiceTransfer() {
    if (!empresa?.id || !user || !invoiceTransfer) return;
    setPayingInvoice(invoiceTransfer.id);
    try {
      const { error } = await supabase.from('solicitudes_pago').insert({
        empresa_id: empresa.id,
        user_id: user.id,
        tipo: 'suscripcion',
        concepto: invoiceTransfer.concepto || invoiceTransfer.numero_factura || 'Factura de suscripción',
        monto_centavos: Math.round(Number(invoiceTransfer.total || 0) * 100),
        metodo: 'transferencia',
        notas: transferNotes || null,
        cantidad_usuarios: invoiceTransfer.num_usuarios,
      } as any);
      if (error) throw error;
      toast.success('Solicitud enviada. Te avisaremos cuando confirmemos tu pago.');
      setInvoiceTransfer(null);
      setTransferNotes('');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar solicitud');
    } finally {
      setPayingInvoice(null);
    }
  }

  const isSuperAdminUser = isSuperAdminEmail(user?.email);

  // ─── Eliminar factura (solo super admin) ───
  async function handleDeleteFactura(factura: FacturaRow) {
    if (!isSuperAdminUser) return;
    try {
      const { error } = await supabase.from('facturas').delete().eq('id', factura.id);
      if (error) throw error;
      toast.success('Factura eliminada');
      setDeleteFacturaDialog(null);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo eliminar la factura');
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
  const trialChargeDate = sub.status === 'trial' && subData?.trial_ends_at
    ? new Date(new Date(subData.trial_ends_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Pending invoices
  const pendingFacturas = facturas.filter(f => f.estado === 'pendiente');

  const updateCharge = hasChanges ? calcUpdateCharge() : null;

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-0 pb-8 [&_.bg-card]:bg-white">
      <style>{`[data-slot="card"], .rounded-lg.border.bg-card { background-color: #ffffff !important; }`}</style>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Crown className="h-6 w-6 text-primary" /> Mi Suscripción
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administra tu plan, usuarios y timbres de facturación.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={async () => {
            try {
              toast.loading('Sincronizando app...', { id: 'sync-app' });
              // Limpiar cache local de suscripción
              Object.keys(localStorage)
                .filter(k => k.startsWith('uniline_subscription_state'))
                .forEach(k => localStorage.removeItem(k));
              toast.success('App actualizada, recargando...', { id: 'sync-app' });
              await refreshAppVersion();
            } catch {
              window.location.reload();
            }
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Sincronizar app
        </Button>
      </div>

      {(() => {
        const cartCard = (
          <Card className="lg:sticky lg:top-6 border-2 border-primary/20">
            <CardContent className="p-4 sm:p-5 space-y-4">
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
                          <span className="text-sm font-bold text-foreground">${(item.amount / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}</span>
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
                    <span className="text-xl font-black text-foreground">${(cartTotal / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
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
        );

        return (
      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-white border border-border">
          <TabsTrigger value="resumen" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Resumen</TabsTrigger>
          <TabsTrigger value="plan" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Plan & Cupones</TabsTrigger>
          <TabsTrigger value="facturas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Facturas{isSuperAdminUser ? ' & Timbres' : ''}</TabsTrigger>
          <TabsTrigger value="fiscal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Datos fiscales</TabsTrigger>
          <TabsTrigger value="simulador" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Simulador de costos</TabsTrigger>
        </TabsList>

        {/* ─── Tab: Resumen ─── */}
        <TabsContent value="resumen" className="space-y-6 mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Status Banner */}
              <Card className={`overflow-hidden border-2 ${
                sub.isBlocked ? 'border-destructive/50' :
                sub.status === 'active' ? 'border-green-300 dark:border-green-700' :
                sub.status === 'trial' ? 'border-blue-300 dark:border-blue-700' :
                'border-border'
              }`}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 ${
                        sub.isBlocked ? 'bg-destructive/10' :
                        sub.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
                        'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        {sub.isBlocked ? <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7 text-destructive" /> :
                         sub.status === 'active' ? <Check className="h-6 w-6 sm:h-7 sm:w-7 text-green-600" /> :
                         <Clock className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
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

                    <div className="flex items-center gap-4 sm:gap-6 justify-around sm:justify-end">
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

                  {subData && (subData.current_period_start || subData.current_period_end || subData.trial_ends_at) && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-border">
                      {subData.current_period_start && sub.status !== 'trial' && (
                        <div className="flex items-center gap-2 text-sm">
                          <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Periodo actual:</span>
                          <span className="font-medium text-foreground">
                            {fmtDateLongMx(subData.current_period_start)}
                          </span>
                        </div>
                      )}
                      {sub.status === 'trial' && subData.trial_ends_at && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Vence:</span>
                          <span className="font-medium text-foreground">
                            {fmtDateLongMx(subData.trial_ends_at)}
                          </span>
                        </div>
                      )}
                      {sub.status === 'trial' && trialChargeDate && (
                        <div className="flex items-center gap-2 text-sm">
                          <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Próximo cobro:</span>
                          <span className="font-medium text-foreground">
                            {fmtDateLongMx(trialChargeDate)}
                          </span>
                        </div>
                      )}
                      {sub.status !== 'trial' && subData.current_period_end && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Próximo cobro:</span>
                          <span className="font-medium text-foreground">
                            {fmtDateLongMx(subData.current_period_end)}
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
                  <CardContent className="p-4 sm:p-5">
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
                            ${pendingFacturas.reduce((sum, f) => sum + f.total, 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN
                          </p>
                        </div>
                      </div>
                      <Button
                        size="lg"
                        className="h-12 text-base font-bold gap-2 shrink-0 w-full sm:w-auto"
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

              {/* Quick: Últimas facturas */}
              {facturas.length > 0 && (
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
                      <Receipt className="h-5 w-5 text-primary" /> Últimas facturas
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-semibold text-muted-foreground text-xs">Factura</th>
                            <th className="text-left py-2 px-2 font-semibold text-muted-foreground text-xs">Periodo</th>
                            <th className="text-right py-2 px-2 font-semibold text-muted-foreground text-xs">Total</th>
                            <th className="text-center py-2 px-2 font-semibold text-muted-foreground text-xs">Estado</th>
                            <th className="text-center py-2 px-2 font-semibold text-muted-foreground text-xs"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {facturas.slice(0, 5).map(f => (
                            <tr key={f.id} className="border-b border-border/50 hover:bg-card">
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground">{f.numero_factura || '—'}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {fmtDate(f.periodo_inicio)} — {fmtDate(f.periodo_fin)}
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-foreground">${f.total.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
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
                                    {payingInvoice === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : f.stripe_invoice_id ? <CreditCard className="h-3 w-3" /> : <BanknoteIcon className="h-3 w-3" />}
                                    Pagar
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {facturas.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Ver historial completo en la pestaña <strong>Facturas</strong>.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="lg:col-span-1">{cartCard}</div>
          </div>
        </TabsContent>

        {/* ─── Tab: Plan & Cupones ─── */}
        <TabsContent value="plan" className="space-y-6 mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* ─── Tu plan actual + Actualizar ─── */}
              <Card className="border-primary/20">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
                        <Crown className="h-5 w-5 text-primary" /> Tu plan actual
                      </h2>
                      {currentPlan ? (() => {
                        const companyDiscount = subData?.descuento_porcentaje ? Number(subData.descuento_porcentaje) : 0;
                        const baseMonthly = planMonthlyCost(currentPlan, currentUsuarios);
                        const effectiveMonthly = companyDiscount > 0
                          ? Math.round(baseMonthly * (1 - companyDiscount / 100))
                          : baseMonthly;
                        const totalPeriodo = effectiveMonthly * (currentPlan.meses || 1);
                        const totalMes = effectiveMonthly;
                        const totalSinDescuento = baseMonthly * (currentPlan.meses || 1);
                        const hasAnyDiscount = companyDiscount > 0 || currentPlan.descuento_pct > 0;
                        const planLabel = currentPlan.slug ? currentPlan.nombre : (PERIODO_LABEL[currentPlan.periodo] || currentPlan.nombre);

                        return (
                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 rounded-xl border border-border p-3 sm:p-4">
                          <Badge variant="outline" className="text-sm font-bold border-primary text-primary px-3 py-1">
                            {planLabel}
                          </Badge>
                          {isLegacyCustomer && (
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">
                              Plan anterior
                            </Badge>
                          )}
                          {companyDiscount > 0 && (
                            <Badge className="bg-green-600 text-white text-xs">
                              {companyDiscount}% descuento especial
                            </Badge>
                          )}
                          {currentPlan.descuento_pct > 0 && (
                            <Badge className="bg-primary text-primary-foreground text-xs">
                              +{currentPlan.descuento_pct}% por plan {planLabel}
                            </Badge>
                          )}

                          <Separator orientation="vertical" className="h-8 hidden sm:block" />
                          <div className="text-sm text-foreground w-full sm:w-auto">
                            <strong>{currentUsuarios}</strong> usuarios{currentPlan.slug ? ` (${currentPlan.usuarios_incluidos} incluidos)` : ''} — <strong>${effectiveMonthly.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</strong> MXN/mes{currentPlan.meses > 1 ? ` × ${currentPlan.meses} meses` : ''}
                            {hasAnyDiscount && (
                              <span className="block text-xs text-muted-foreground line-through">
                                Sin descuento: ${totalSinDescuento.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN
                              </span>
                            )}
                          </div>
                          <Separator orientation="vertical" className="h-8 hidden sm:block" />
                          <div className="w-full sm:w-auto">
                            <div className="text-lg font-black text-foreground">
                              ${totalPeriodo.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              ${totalMes.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN/mes
                              {hasAnyDiscount && (
                                <span className="ml-1 text-green-600 font-semibold">
                                  (ahorras ${(totalSinDescuento - totalPeriodo).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })() : (
                        <p className="text-sm text-muted-foreground">Sin plan activo — elige uno para continuar.</p>
                      )}
                    </div>
                    <Button
                      size="lg"
                      className="h-12 text-base font-bold gap-2 shrink-0 w-full sm:w-auto"
                      onClick={() => {
                        setExtraUsers(0);
                        if (currentPlan) setSelectedFreq(currentPlan.id);
                        setShowUpdateDialog(true);
                      }}
                    >
                      <RefreshCw className="h-5 w-5" />
                      {currentPlan ? 'Actualizar plan' : 'Elegir plan'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {/* ─── Cupones de descuento ─── */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                    <Ticket className="h-5 w-5 text-primary" /> Cupones de descuento
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Puedes aplicar varios cupones. Los <strong>acumulables</strong> se suman; los <strong>no acumulables</strong> usan el de mayor descuento.
                  </p>

                  {activeCupones.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {activeCupones.map((u) => {
                        const c = u.cupones as any;
                        return (
                          <div
                            key={u.id}
                            className="rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 p-3 flex items-center justify-between gap-3 flex-wrap"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-green-600 text-white font-mono">{c?.codigo}</Badge>
                              <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                                {c?.descuento_pct}% de descuento
                              </span>
                              {c?.acumulable ? (
                                <Badge variant="outline" className="text-[10px] border-green-600 text-green-700">Acumulable</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">No acumulable</Badge>
                              )}
                            </div>
                            <div className="text-xs text-green-700 dark:text-green-400">
                              {u.meses_restantes === null
                                ? 'Permanente'
                                : u.meses_restantes > 0
                                  ? `${u.meses_restantes} mes${u.meses_restantes > 1 ? 'es' : ''} restante${u.meses_restantes > 1 ? 's' : ''}`
                                  : 'Último mes'}
                              {c?.vigencia_fin ? ` · Vence ${format(new Date(c.vigencia_fin), 'dd MMM yy', { locale: es })}` : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      value={cuponCode}
                      onChange={e => setCuponCode(e.target.value.toUpperCase())}
                      placeholder={activeCupones.length > 0 ? 'Aplicar otro código' : 'Ingresa tu código'}
                      className="max-w-[220px] font-mono"
                    />
                    <Button onClick={handleApplyCupon} disabled={cuponLoading || !cuponCode.trim()} size="sm">
                      {cuponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1">{cartCard}</div>
          </div>
        </TabsContent>

        {/* ─── Tab: Facturas (& Timbres super admin) ─── */}
        <TabsContent value="facturas" className="space-y-6 mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Timbres Section — solo visible para super admin */}
              {isSuperAdminUser && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-1">
                    <Stamp className="h-5 w-5 text-primary" /> Timbres CFDI
                  </h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    Paquetes de 100 timbres a $1 MXN c/u. Saldo actual: <strong>{timbresBalance ?? 0} timbres</strong>.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 bg-muted/30 rounded-xl p-3 sm:p-4">
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
                    <span className="text-sm font-semibold text-foreground">{timbresPacks * 100} timbres = ${(timbresPacks * 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
                    <Button size="sm" className="ml-auto" onClick={addTimbresToCart}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Invoice History */}
              {facturas.length > 0 ? (
                <Card>
                  <CardContent className="p-4 sm:p-6">
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
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground">{f.numero_factura || '—'}</span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">{f.stripe_invoice_id ? 'Stripe' : 'Manual'}</Badge>
                                  {f.es_prorrateo && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">Prorrateo</Badge>
                                  )}
                                </div>
                                {f.concepto && <div className="text-[11px] text-muted-foreground truncate max-w-[220px] mt-0.5">{f.concepto}</div>}
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground text-xs">
                                {fmtDate(f.periodo_inicio)} — {fmtDate(f.periodo_fin)}
                              </td>
                              <td className="py-2.5 px-2 text-right text-foreground">{f.num_usuarios}</td>
                              <td className="py-2.5 px-2 text-right font-semibold text-foreground">${f.total.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                              <td className="py-2.5 px-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${facturaStatusColor[f.estado] || 'bg-muted text-muted-foreground'}`}>
                                  {facturaStatusLabel[f.estado] || f.estado}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {f.estado === 'pendiente' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1"
                                      disabled={payingInvoice === f.id}
                                      onClick={() => handlePayInvoice(f)}
                                    >
                                      {payingInvoice === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : f.stripe_invoice_id ? <CreditCard className="h-3 w-3" /> : <BanknoteIcon className="h-3 w-3" />}
                                      Pagar
                                    </Button>
                                  )}
                                  {isSuperAdminUser && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      title="Eliminar factura (Super Admin)"
                                      onClick={() => setDeleteFacturaDialog(f)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    Aún no tienes facturas emitidas.
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="lg:col-span-1">{cartCard}</div>
          </div>
        </TabsContent>

        {/* ─── Tab: Datos fiscales ─── */}
        <TabsContent value="fiscal" className="mt-4">
          {empresa?.id && <DatosFiscalesCard empresaId={empresa.id} />}
        </TabsContent>

        {/* ─── Tab: Simulador de costos ─── */}
        <TabsContent value="simulador" className="mt-4">
          <CostoSimuladorCard defaultUsers={currentUsuarios} />
        </TabsContent>
      </Tabs>
        );
      })()}


      {/* ─── Dialog: Actualizar plan ─── */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" /> {currentPlan ? 'Actualizar plan' : 'Elige tu plan'}
            </DialogTitle>
            <DialogDescription>
              {currentPlan
                ? 'Cambia la frecuencia de cobro o ajusta el número de usuarios.'
                : 'Todos los usuarios comparten el mismo plan y frecuencia.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Plan selector */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Elige tu plan</label>
              <div className="grid grid-cols-3 gap-2">
                {subPlans.map(plan => {
                  const isPlanCurrent = currentPlan?.id === plan.id;
                  const isSelected = selectedFreq === plan.id;
                  const displayPrice = plan.slug ? plan.precio_base : plan.precio_por_usuario;
                  const displaySuffix = plan.slug ? ' / mes' : ' / u / mes';
                  return (
                    <button
                      key={plan.id}
                      onClick={() => {
                        setSelectedFreq(plan.id);
                        if (plan.slug) {
                          const minU = Math.max(1, plan.usuarios_incluidos || 1);
                          setExtraUsers(minU - currentUsuarios);
                        }
                      }}
                      className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      {isPlanCurrent && (
                        <span className="absolute -top-2.5 left-2 bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          Actual
                        </span>
                      )}
                      {plan.popular && !isPlanCurrent && (
                        <span className="absolute -top-2.5 right-2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      <div className="text-xs font-bold text-foreground">{plan.nombre}</div>
                      <div className="text-xl font-black text-foreground mt-0.5">${displayPrice.toLocaleString()}</div>
                      <div className="text-[9px] text-muted-foreground">{displaySuffix.trim()}</div>
                      {plan.slug && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">{plan.usuarios_incluidos} usuario{plan.usuarios_incluidos !== 1 ? 's' : ''}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Users control */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Número de usuarios</label>
              <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setExtraUsers(q => Math.max(targetMin - currentUsuarios, q - 1))} disabled={totalNewUsers <= targetMin}>

                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="text-center min-w-[50px]">
                    <div className="text-2xl font-black text-foreground">{totalNewUsers}</div>
                    <div className="text-[10px] text-muted-foreground">usuarios</div>
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setExtraUsers(q => q + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {extraUsers !== 0 && (
                  <span className="text-sm text-muted-foreground">
                    {extraUsers > 0 ? `+${extraUsers} nuevo${extraUsers > 1 ? 's' : ''}` : `${extraUsers}`}
                  </span>
                )}
              </div>
            </div>

            {/* Summary */}
            {targetPlan && (() => {
              const monthsBilled = targetPlan.meses || 1;
              const monthlyBase = planMonthlyCost(targetPlan, totalNewUsers);
              const baseSubtotal = monthlyBase * monthsBilled;
              const companyDiscount = subData?.descuento_porcentaje ? Number(subData.descuento_porcentaje) : 0;
              const totalConDesc = companyDiscount > 0
                ? Math.round(baseSubtotal * (1 - companyDiscount / 100))
                : baseSubtotal;
              const ahorro = baseSubtotal - totalConDesc;
              const extras = targetPlan.slug ? Math.max(0, totalNewUsers - (targetPlan.usuarios_incluidos || 0)) : 0;
              return (
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {targetPlan.slug
                      ? <>Base {targetPlan.nombre} ${Number(targetPlan.precio_base).toLocaleString()} + {extras} extra × ${targetPlan.precio_extra_usuario}</>
                      : <>{totalNewUsers} usuarios × ${targetPlan.precio_por_usuario}/mes × {monthsBilled} mes{monthsBilled !== 1 ? 'es' : ''}</>}
                  </div>

                  <div className="text-right">
                    {companyDiscount > 0 && (
                      <div className="text-xs text-muted-foreground line-through">
                        ${baseSubtotal.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                      </div>
                    )}
                    <div className="text-xl font-black text-foreground">
                      ${totalConDesc.toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN
                    </div>
                  </div>
                </div>
                {companyDiscount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-700 dark:text-green-400 font-semibold">
                      Descuento aplicado: {companyDiscount}%
                      {activeCupones.length > 0 && ` (cupón${activeCupones.length > 1 ? 'es' : ''}: ${activeCupones.map((u: any) => u.cupones?.codigo).filter(Boolean).join(', ')})`}
                    </span>
                    <span className="text-green-700 dark:text-green-400 font-semibold">
                      Ahorras ${ahorro.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="text-xs text-muted-foreground">
                  Equivalente a <strong className="text-foreground">${Math.round(totalConDesc / monthsBilled).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN/mes</strong>
                </div>


                {hasChanges && updateCharge && (
                  <>
                    {updateCharge.isDowngrade ? (
                      <div className="text-xs text-muted-foreground border border-border rounded-lg p-3">
                        ℹ️ {updateCharge.detail}
                      </div>
                    ) : updateCharge.amount > 0 ? (
                      <div className="border border-primary/30 rounded-lg p-3 space-y-1">
                        <div className="text-sm font-semibold text-foreground">
                          💳 Cobro por actualización: <span className="text-primary">${(updateCharge.amount / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
                        </div>
                        {pendingFacturas.length > 0 && (
                          <p className="text-xs text-amber-600">⚠️ Se cancelará tu factura pendiente y se genera una nueva.</p>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>Cancelar</Button>
            <Button
              size="lg"
              className="font-bold"
              disabled={!hasChanges}
              onClick={() => {
                addUpdateToCart();
                setShowUpdateDialog(false);
              }}
            >
              <ArrowRight className="h-4 w-4 mr-2" /> Confirmar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFacturaDialog} onOpenChange={(open) => !open && setDeleteFacturaDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Eliminar factura
            </DialogTitle>
            <DialogDescription>
              ¿Eliminar la factura <strong>{deleteFacturaDialog?.numero_factura || deleteFacturaDialog?.id}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFacturaDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteFacturaDialog && handleDeleteFactura(deleteFacturaDialog)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Payment Method ─── */}
      <Dialog open={showPayMethod} onOpenChange={setShowPayMethod}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cómo deseas pagar?</DialogTitle>
            <DialogDescription>Total: ${(cartTotal / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</DialogDescription>
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
                <span className="font-bold text-foreground text-lg">${(cartTotal / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
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

      <Dialog open={!!invoiceTransfer} onOpenChange={(open) => { if (!open) setInvoiceTransfer(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar factura por transferencia</DialogTitle>
            <DialogDescription>{invoiceTransfer?.numero_factura || 'Factura pendiente'} · {invoiceTransfer?.concepto || 'Suscripción'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border-2 border-border bg-card p-5 space-y-3 text-center">
              <div className="text-lg font-bold text-foreground">{BANK_INFO.banco}</div>
              <div className="text-muted-foreground">{BANK_INFO.titular}</div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase">Cuenta</div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-mono font-semibold text-foreground">{BANK_INFO.cuenta}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(BANK_INFO.cuenta)}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase">CLABE</div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-mono font-semibold text-foreground">{BANK_INFO.clabe}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(BANK_INFO.clabe)}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Monto: </span>
                <span className="font-bold text-foreground text-lg">${Number(invoiceTransfer?.total || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Referencia / notas</label>
              <Textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Referencia de transferencia, fecha, etc." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceTransfer(null)}>Cancelar</Button>
            <Button onClick={handleSubmitInvoiceTransfer} disabled={!!payingInvoice}>
              {payingInvoice && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <BanknoteIcon className="h-4 w-4 mr-1" /> Ya transferí
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
