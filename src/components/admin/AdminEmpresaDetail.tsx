import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, CreditCard, Receipt, Stamp, Users, Calendar,
  Mail, Phone, MapPin, Edit2, Save, X, ExternalLink, Download, FileText,
  ShoppingCart, History, Percent, KeyRound, ShieldAlert, Loader2, Trash2,
  Copy, MessageCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format, differenceInDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { es } from 'date-fns/locale';

interface Props {
  empresaId: string;
  onBack: () => void;
}

const STATUS_MAP: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trial: { l: 'Trial', v: 'secondary' }, active: { l: 'Activa', v: 'default' },
  past_due: { l: 'Vencida', v: 'destructive' }, cancelled: { l: 'Cancelada', v: 'outline' },
  suspended: { l: 'Suspendida', v: 'destructive' }, gracia: { l: 'Gracia', v: 'destructive' },
  pendiente_pago: { l: 'Pendiente pago', v: 'secondary' },
};
const STATUSES = ['trial', 'active', 'past_due', 'gracia', 'suspended', 'cancelled'] as const;
const fmtMXN = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Estado efectivo basado en bloqueo + fin de período (no solo en el campo status)
function getEffectiveStatus(sub: any): { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (!sub) return { l: '—', v: 'outline' };
  if (sub.acceso_bloqueado) return { l: 'Suspendida', v: 'destructive' };
  const ref = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
  if (ref && new Date(ref) < new Date()) return { l: 'Vencida', v: 'destructive' };
  return STATUS_MAP[sub.status] || { l: sub.status, v: 'outline' };
}

export default function AdminEmpresaDetail({ empresaId, onBack }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [timbres, setTimbres] = useState(0);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersDetailed, setUsersDetailed] = useState<any[]>([]);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [expandedFacturaId, setExpandedFacturaId] = useState<string | null>(null);
  const [stripeInvoices, setStripeInvoices] = useState<any[]>([]);
  const [timbresMovimientos, setTimbresMovimientos] = useState<any[]>([]);

  // Edit states
  const [editingEmpresa, setEditingEmpresa] = useState(false);
  const [empresaForm, setEmpresaForm] = useState<any>({});
  const [editingSub, setEditingSub] = useState(true);
  const [subForm, setSubForm] = useState<any>({});
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  // Timbres sale form
  const [showTimbresSale, setShowTimbresSale] = useState(false);
  const [addingTimbres, setAddingTimbres] = useState(false);
  const [timbresForm, setTimbresForm] = useState({
    paquetes: 1,
    precio_timbre: 1,
    descuento_pct: 0,
    notas: '',
    generar_factura: false,
  });

  // Password reset states
  const [resetDialog, setResetDialog] = useState<{ userId: string; email: string; nombre: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [forcingAll, setForcingAll] = useState(false);

  // Subscription invoice
  const [showSubInvoice, setShowSubInvoice] = useState(false);
  const [creatingSubInvoice, setCreatingSubInvoice] = useState(false);
  const [subInvoiceForm, setSubInvoiceForm] = useState({
    plan_id: '' as string,
    meses: 1,
    num_usuarios: 1,
    precio_por_usuario_mes: 300,
    descuento_pct: 0,
    descuento_permanente: false,
    days_until_due: 7,
    concepto: '',
  });

  // Mark invoice as paid (manual: transferencia/efectivo/...)
  const [markPaidFactura, setMarkPaidFactura] = useState<any | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState({
    metodo_pago: 'transferencia',
    referencia_pago: '',
    fecha_pago: new Date().toISOString().slice(0, 10),
    reflect_in_stripe: true,
    extender_periodo: true,
  });
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => { load(); }, [empresaId]);

  async function load() {
    setLoading(true);

    // 1) Carga rápida (lo que se ve en pantalla). Bloquea solo lo esencial.
    const [empRes, subRes, plansRes, profilesRes] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
      supabase.from('subscriptions').select('*, subscription_plans(nombre, precio_por_usuario, periodo, descuento_pct, meses)').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('subscription_plans').select('*').eq('activo', true),
      supabase.from('profiles').select('id, nombre, telefono, rol, user_id').eq('empresa_id', empresaId),
    ]);

    setEmpresa(empRes.data);
    setSubscription(subRes.data);
    setPlans((plansRes.data || []) as any[]);
    setProfiles((profilesRes.data || []) as any[]);

    if (empRes.data) {
      setEmpresaForm({
        nombre: empRes.data.nombre || '',
        email: empRes.data.email || '',
        telefono: empRes.data.telefono || '',
        rfc: empRes.data.rfc || '',
        razon_social: empRes.data.razon_social || '',
        direccion: empRes.data.direccion || '',
        cp: empRes.data.cp || '',
        ciudad: empRes.data.ciudad || '',
        estado: empRes.data.estado || '',
      });
    }

    if (subRes.data) {
      setSubForm({
        plan_id: subRes.data.plan_id || '',
        max_usuarios: subRes.data.max_usuarios || 3,
        status: subRes.data.status || 'trial',
        current_period_start: subRes.data.current_period_start?.split('T')[0] || '',
        current_period_end: subRes.data.current_period_end?.split('T')[0] || '',
        trial_ends_at: subRes.data.trial_ends_at?.split('T')[0] || '',
        descuento_porcentaje: (subRes.data as any).descuento_porcentaje || 0,
        meses_cobro: (subRes.data as any).subscription_plans?.meses || 1,
        acceso_bloqueado: !!(subRes.data as any).acceso_bloqueado,
      });
    }

    // YA mostramos la pantalla. Lo demás carga en segundo plano.
    setLoading(false);

    // 2) Datos secundarios en paralelo (no bloquean el render principal).
    supabase.from('facturas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(20)
      .then(({ data }) => setFacturas((data || []) as any[]));

    supabase.from('timbres_saldo').select('saldo').eq('empresa_id', empresaId).maybeSingle()
      .then(({ data }) => setTimbres(data?.saldo ?? 0));

    supabase.from('timbres_movimientos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setTimbresMovimientos((data || []) as any[]));

    // 3) Edge function de usuarios detallados (lenta) — en background
    supabase.functions.invoke('admin-users', {
      body: { action: 'list-empresa-users', empresa_id: empresaId },
    }).then(({ data: usersData, error: usersErr }) => {
      if (!usersErr && usersData?.users) setUsersDetailed(usersData.users);
    }).catch(() => { /* silent */ });

    // 4) Stripe invoices (MUY lenta: lista todas las del platform y filtra)
    //    Solo dispararla si hay customer_id. En background.
    if (subRes.data?.stripe_customer_id) {
      (async () => {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices&status=all&empresa_id=${empresaId}`,
            { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
          );
          const data = await res.json();
          setStripeInvoices(data.invoices || []);
        } catch { /* silent */ }
      })();
    }
  }


  async function saveEmpresa() {
    setSavingEmpresa(true);
    const { error } = await supabase.from('empresas').update(empresaForm).eq('id', empresaId);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa actualizada'); setEditingEmpresa(false); load(); }
    setSavingEmpresa(false);
  }

  async function saveSub() {
    if (!subscription) return;
    setSavingSub(true);
    const payload: any = {
      plan_id: subForm.plan_id || null,
      max_usuarios: subForm.max_usuarios,
      status: subForm.status,
      acceso_bloqueado: !!subForm.acceso_bloqueado,
      descuento_porcentaje: subForm.descuento_porcentaje || 0,
      updated_at: new Date().toISOString(),
    };
    if (subForm.current_period_start) payload.current_period_start = subForm.current_period_start;
    if (subForm.current_period_end) payload.current_period_end = subForm.current_period_end;
    if (subForm.trial_ends_at) payload.trial_ends_at = subForm.trial_ends_at;

    const { error } = await supabase.from('subscriptions').update(payload).eq('id', subscription.id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Suscripción actualizada'); load(); }
    setSavingSub(false);
  }

  const timbresCount = timbresForm.paquetes * 100;
  const timbresSubtotal = timbresCount * timbresForm.precio_timbre;
  const timbresDescuento = timbresSubtotal * (timbresForm.descuento_pct / 100);
  const timbresTotal = timbresSubtotal - timbresDescuento;

  async function handleTimbresSale() {
    if (!user) return;
    if (timbresForm.paquetes < 1) { toast.error('Mínimo 1 paquete'); return; }
    setAddingTimbres(true);
    try {
      const notaParts = [
        `Venta: ${timbresCount} timbres (${timbresForm.paquetes} paq × $${timbresForm.precio_timbre}/timbre)`,
      ];
      if (timbresForm.descuento_pct > 0) notaParts.push(`Descuento: ${timbresForm.descuento_pct}%`);
      notaParts.push(`Total: $${timbresTotal.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN`);
      if (timbresForm.notas) notaParts.push(timbresForm.notas);

      if (timbresForm.generar_factura && subscription?.stripe_customer_id) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const items = [
          { description: `${timbresCount} timbres CFDI × $${timbresForm.precio_timbre}/timbre`, amount: Math.round(timbresSubtotal * 100) }
        ];
        if (timbresDescuento > 0) {
          items.push({ description: `Descuento (${timbresForm.descuento_pct}%)`, amount: -Math.round(timbresDescuento * 100) });
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=create_pro_invoice`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              empresa_id: empresaId,
              empresa_nombre: empresa?.nombre || '',
              empresa_email: empresa?.email || '',
              empresa_telefono: empresa?.telefono || '',
              empresa_rfc: empresa?.rfc || '',
              items,
              concepto: `Compra de ${timbresCount} timbres CFDI — ${empresa?.nombre}`,
              days_until_due: 3,
              plan_nombre: 'Timbres CFDI',
              num_usuarios: 0,
              timbres: timbresCount,
              descuento_plan_pct: 0,
              descuento_extra_pct: timbresForm.descuento_pct,
              total_centavos: Math.round(timbresTotal * 100),
              mensaje_personal: '',
              enviar_email: !!empresa?.email,
              enviar_whatsapp: false,
              telefono_envio: '',
              correo_envio: empresa?.email || '',
            }),
          }
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast.success(`Factura creada por ${timbresCount} timbres — $${timbresTotal.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN`);
      } else {
        const { data, error } = await supabase.rpc('add_timbres', {
          p_empresa_id: empresaId,
          p_cantidad: timbresCount,
          p_user_id: user.id,
          p_notas: notaParts.join(' | '),
        });
        if (error) throw error;
        toast.success(`+${timbresCount} timbres acreditados. Saldo: ${data}`);
      }

      setShowTimbresSale(false);
      setTimbresForm({ paquetes: 1, precio_timbre: 1, descuento_pct: 0, notas: '', generar_factura: false });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingTimbres(false);
    }
  }

  async function handleResetPassword() {
    if (!resetDialog || !resetPassword) return;
    if (resetPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setResettingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'reset-password',
          user_id: resetDialog.userId,
          password: resetPassword,
          force_change: resetForceChange,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Contraseña restablecida para ${resetDialog.email}${resetForceChange ? ' — deberá cambiarla al entrar' : ''}`);
      setResetDialog(null);
      setResetPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResettingPw(false);
    }
  }

  async function handleForceChangeAll() {
    if (!confirm(`¿Forzar cambio de contraseña para TODOS los usuarios de ${empresa?.nombre}?`)) return;
    setForcingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'force-change-all', empresa_id: empresaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.count} usuarios deberán cambiar su contraseña al entrar`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setForcingAll(false);
    }
  }

  const subInvoiceSubtotal = subInvoiceForm.num_usuarios * subInvoiceForm.meses * subInvoiceForm.precio_por_usuario_mes;
  const subInvoiceDescMonto = subInvoiceSubtotal * (subInvoiceForm.descuento_pct / 100);
  const subInvoiceTotal = subInvoiceSubtotal - subInvoiceDescMonto;

  function openSubInvoice() {
    const currentPlan = subscription?.subscription_plans;
    const planId = subscription?.plan_id || (plans[0]?.id ?? '');
    const plan = plans.find(p => p.id === planId) || currentPlan;
    const meses = plan?.meses || currentPlan?.meses || 1;
    const precio = plan?.precio_por_usuario || currentPlan?.precio_por_usuario || 300;
    const planNombre = plan?.nombre || currentPlan?.nombre || 'Mensual';
    const descPlan = currentPlan?.descuento_pct || 0;
    setSubInvoiceForm({
      plan_id: planId,
      meses,
      num_usuarios: subscription?.max_usuarios || 1,
      precio_por_usuario_mes: precio,
      descuento_pct: descPlan,
      descuento_permanente: false,
      days_until_due: 7,
      concepto: `Suscripción Rutapp ${planNombre}`,
    });
    setShowSubInvoice(true);
  }

  function applyPlanToInvoice(planId: string) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setSubInvoiceForm(f => ({
      ...f,
      plan_id: planId,
      meses: plan.meses,
      precio_por_usuario_mes: plan.precio_por_usuario,
      concepto: `Suscripción Rutapp ${plan.nombre}`,
    }));
  }

  async function handleCreateSubInvoice() {
    if (subInvoiceForm.num_usuarios < 1 || subInvoiceForm.meses < 1) {
      toast.error('Verifica usuarios y meses');
      return;
    }
    setCreatingSubInvoice(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=create_subscription_invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            empresa_id: empresaId,
            plan_id: subInvoiceForm.plan_id || undefined,
            num_usuarios: subInvoiceForm.num_usuarios,
            meses: subInvoiceForm.meses,
            precio_por_usuario_mes: subInvoiceForm.precio_por_usuario_mes,
            descuento_pct: subInvoiceForm.descuento_pct,
            descuento_permanente: subInvoiceForm.descuento_permanente,
            days_until_due: subInvoiceForm.days_until_due,
            concepto: subInvoiceForm.concepto,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al crear factura');
      toast.success(`Factura ${data.folio} creada por ${fmtMXN(data.total)}. Al pagarla se activará el plan por ${data.meses} ${data.meses === 1 ? 'mes' : 'meses'}.`);
      setShowSubInvoice(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingSubInvoice(false);
    }
  }

  function openMarkPaid(f: any) {
    setMarkPaidFactura(f);
    setMarkPaidForm({
      metodo_pago: 'transferencia',
      referencia_pago: '',
      fecha_pago: new Date().toISOString().slice(0, 10),
      reflect_in_stripe: !!f.stripe_invoice_id,
      extender_periodo: !f.es_prorrateo,
    });
  }

  async function handleMarkPaid() {
    if (!markPaidFactura) return;
    setMarkingPaid(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=mark_invoice_paid_out_of_band`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            factura_id: markPaidFactura.id,
            empresa_id: empresaId,
            metodo_pago: markPaidForm.metodo_pago,
            referencia_pago: markPaidForm.referencia_pago,
            fecha_pago: markPaidForm.fecha_pago,
            reflect_in_stripe: markPaidForm.reflect_in_stripe,
            extender_periodo: markPaidForm.extender_periodo,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al marcar pago');
      const msgParts = ['Pago registrado'];
      if (data.stripe_paid) msgParts.push('reflejado en Stripe');
      if (data.nuevo_fin_periodo) {
        msgParts.push(`período activo hasta ${format(new Date(data.nuevo_fin_periodo), 'dd MMM yyyy', { locale: es })}`);
      }
      toast.success(msgParts.join(' · '));
      setMarkPaidFactura(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMarkingPaid(false);
    }
  }


  async function handleDeleteEmpresa() {
    if (!user) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_empresa_cascade', {
        p_empresa_id: empresaId,
        p_deleted_by: user.id,
      });
      if (error) throw error;
      toast.success(`Empresa "${empresa?.nombre}" eliminada permanentemente`);
      onBack();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar empresa');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando detalle de empresa...
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Empresa no encontrada</p>
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1.5" /> Volver</Button>
      </div>
    );
  }

  const daysLeft = subscription
    ? differenceInDays(
        new Date(subscription.status === 'trial' ? subscription.trial_ends_at : subscription.current_period_end),
        new Date()
      )
    : null;

  const allUsers = usersDetailed.length > 0 ? usersDetailed : profiles;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Empresas
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{empresa.nombre}</h2>
            <p className="text-xs text-muted-foreground">
              Registrada {format(new Date(empresa.created_at), "dd MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {subscription && (
            <>
              <Badge variant={getEffectiveStatus(subscription).v} className="text-xs">
                {getEffectiveStatus(subscription).l}
              </Badge>
              {subscription.acceso_bloqueado && (
                <Badge variant="destructive" className="text-xs gap-1">🔒 Bloqueada</Badge>
              )}
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="h-5 w-5" /> Eliminar empresa permanentemente
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    Esta acción es <strong>irreversible</strong>. Se eliminarán <strong>todos los datos</strong> de "{empresa.nombre}":
                    productos, clientes, ventas, cobros, inventario, facturas, usuarios, etc.
                  </p>
                  <p>
                    Los correos de los usuarios serán bloqueados para que no puedan volver a obtener un trial gratuito.
                  </p>
                  <div className="pt-2">
                    <Label className="text-xs text-foreground">Escribe <strong>{empresa.nombre}</strong> para confirmar:</Label>
                    <Input
                      className="mt-1"
                      value={deleteConfirmName}
                      onChange={e => setDeleteConfirmName(e.target.value)}
                      placeholder={empresa.nombre}
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmName('')}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirmName !== empresa.nombre || deleting}
                  onClick={handleDeleteEmpresa}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Eliminar permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Single stacked view */}
      <div className="space-y-6">
        {/* ═══ General ═══ */}
        <div>

          <Card className="border border-border/60 shadow-sm max-w-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Datos de empresa
                </h3>
                {!editingEmpresa ? (
                  <Button size="sm" variant="outline" onClick={() => setEditingEmpresa(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingEmpresa(false)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button size="sm" disabled={savingEmpresa} onClick={saveEmpresa}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Guardar
                    </Button>
                  </div>
                )}
              </div>

              {editingEmpresa ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'nombre', label: 'Nombre' },
                    { key: 'email', label: 'Email' },
                    { key: 'telefono', label: 'Teléfono' },
                    { key: 'rfc', label: 'RFC' },
                    { key: 'razon_social', label: 'Razón Social' },
                    { key: 'direccion', label: 'Dirección' },
                    { key: 'cp', label: 'C.P.' },
                    { key: 'ciudad', label: 'Ciudad' },
                    { key: 'estado', label: 'Estado' },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm text-muted-foreground">{label}</Label>
                      <Input
                        value={empresaForm[key] || ''}
                        onChange={e => setEmpresaForm((f: any) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                  <InfoRow icon={Mail} label="Email" value={empresa.email} />
                  <InfoRow icon={Phone} label="Teléfono" value={empresa.telefono} />
                  <InfoRow icon={FileText} label="RFC" value={empresa.rfc} />
                  <InfoRow icon={FileText} label="Razón Social" value={empresa.razon_social} />
                  <InfoRow icon={MapPin} label="Dirección" value={empresa.direccion} />
                  <InfoRow icon={MapPin} label="C.P." value={empresa.cp} />
                  <InfoRow icon={MapPin} label="Ciudad" value={[empresa.ciudad, empresa.estado].filter(Boolean).join(', ')} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ Usuarios ═══ */}
        <div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Usuarios de {empresa.nombre}
              </h3>
              <Button
                variant="outline"
                size="sm"
                disabled={forcingAll || allUsers.length === 0}
                onClick={handleForceChangeAll}
                className="gap-1.5"
              >
                {forcingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Forzar cambio de contraseña a todos
              </Button>
            </div>

            {allUsers.length === 0 ? (
              <Card className="border border-border/60">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sin usuarios registrados
                </CardContent>
              </Card>
            ) : (
              <div className="border border-border/60 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-card">
                      <TableHead className="font-semibold">Nombre</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Teléfono</TableHead>
                      <TableHead className="font-semibold">Rol</TableHead>
                      <TableHead className="font-semibold">Último acceso</TableHead>
                      <TableHead className="font-semibold">Registro</TableHead>
                      <TableHead className="font-semibold text-center w-28">Contraseña</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map((u: any) => (
                      <TableRow key={u.id} className="hover:bg-card/50">
                        <TableCell className="font-medium">{u.nombre || 'Sin nombre'}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{u.telefono || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.rol || 'Sin rol'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.last_sign_in_at
                            ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy HH:mm', { locale: es })
                            : 'Nunca'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              setResetDialog({ userId: u.id, email: u.email, nombre: u.nombre || u.email });
                              setResetPassword('');
                              setResetForceChange(true);
                            }}
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Resetear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Suscripción ═══ */}
        <div>

          <Card className="border border-border/60 shadow-sm max-w-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Suscripción
                </h3>
                {subscription && (
                  <Button size="sm" disabled={savingSub} onClick={saveSub}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Guardar cambios
                  </Button>
                )}
              </div>

              {!subscription ? (
                <p className="text-muted-foreground py-8 text-center">Sin suscripción activa</p>
              ) : editingSub ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Plan</Label>
                    <Select value={subForm.plan_id} onValueChange={v => {
                      const p = plans.find(pl => pl.id === v);
                      setSubForm((f: any) => ({ ...f, plan_id: v, meses_cobro: p?.meses || 1 }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Sin plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre} — ${p.precio_por_usuario}/usr × {p.meses}{' '}
                            {p.meses === 1 ? 'mes' : 'meses'}
                            {p.descuento_pct > 0 ? ` (-${p.descuento_pct}%)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Status</Label>
                    <Select value={subForm.status} onValueChange={v => setSubForm((f: any) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s]?.l || s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Máx. usuarios</Label>
                    <Input type="number" min={1} value={subForm.max_usuarios}
                      onChange={e => setSubForm((f: any) => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} />
                    {subscription?.max_usuarios != null && subForm.max_usuarios > subscription.max_usuarios && (
                      <p className="text-xs text-amber-600 font-medium">
                        +{subForm.max_usuarios - subscription.max_usuarios} usuarios nuevos
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Precio final por usuario</Label>
                    {(() => {
                      const selectedPlan = plans.find(p => p.id === subForm.plan_id);
                      const precioBase = selectedPlan?.precio_por_usuario || 0;
                      const precioConDescuento = precioBase * (1 - (subForm.descuento_porcentaje || 0) / 100);
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input
                              type="number" min={0} max={precioBase || 99999} step={1}
                              value={Math.round(precioConDescuento)}
                              onChange={e => {
                                const nuevo = parseFloat(e.target.value) || 0;
                                const pct = precioBase > 0 ? Math.round(((precioBase - nuevo) / precioBase) * 10000) / 100 : 0;
                                setSubForm((f: any) => ({ ...f, descuento_porcentaje: Math.max(0, Math.min(100, pct)) }));
                              }}
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">/usr</span>
                          </div>
                          {subForm.descuento_porcentaje > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Base: ${precioBase} → <span className="text-primary font-medium">{subForm.descuento_porcentaje.toFixed(1)}% desc.</span>
                              {subForm.max_usuarios > 0 && <> · Total: <span className="font-semibold">${Math.round(precioConDescuento * subForm.max_usuarios)}/mes</span></>}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Fin trial — solo si status = trial */}
                  {subForm.status === 'trial' && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Fin trial</Label>
                      <Input
                        type="date"
                        value={subForm.trial_ends_at}
                        disabled={!!subForm.trial_ends_at && new Date(subForm.trial_ends_at) < new Date()}
                        onChange={e => setSubForm((f: any) => ({ ...f, trial_ends_at: e.target.value }))}
                      />
                      {subForm.trial_ends_at && new Date(subForm.trial_ends_at) < new Date() && (
                        <p className="text-xs text-destructive">El trial ya venció (no editable).</p>
                      )}
                    </div>
                  )}

                  {/* Inicio/Fin período — solo si NO está en trial */}
                  {subForm.status !== 'trial' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Inicio período</Label>
                        <Input type="date" value={subForm.current_period_start}
                          onChange={e => setSubForm((f: any) => ({ ...f, current_period_start: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Fin período</Label>
                        <Input type="date" value={subForm.current_period_end}
                          onChange={e => setSubForm((f: any) => ({ ...f, current_period_end: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">El estado efectivo se calcula con esta fecha.</p>
                      </div>
                    </>
                  )}

                  {/* Banner de prorrateo cuando agregas usuarios mid-período */}
                  {(() => {
                    const usuariosExtra = subForm.max_usuarios - (subscription?.max_usuarios || 0);
                    if (usuariosExtra <= 0) return null;
                    if (!subscription?.current_period_end || !subscription?.current_period_start) return null;
                    if (subForm.status === 'trial') return null;
                    const hoy = new Date();
                    const fin = new Date(subscription.current_period_end);
                    const ini = new Date(subscription.current_period_start);
                    if (fin <= hoy) return null;
                    const diasRest = Math.max(0, Math.ceil((fin.getTime() - hoy.getTime()) / 86400000));
                    const totalDias = Math.max(1, Math.ceil((fin.getTime() - ini.getTime()) / 86400000));
                    const selectedPlan = plans.find(p => p.id === subForm.plan_id);
                    const precioBase = selectedPlan?.precio_por_usuario || 0;
                    const precioFinal = precioBase * (1 - (subForm.descuento_porcentaje || 0) / 100);
                    const mesesPeriodo = selectedPlan?.meses || 1;
                    const proporcion = diasRest / totalDias;
                    const prorrateo = usuariosExtra * precioFinal * mesesPeriodo * proporcion;
                    return (
                      <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
                        <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                          ⚠️ Prorrateo por usuarios extra
                        </p>
                        <p className="text-sm text-amber-900">
                          Estás agregando <strong>{usuariosExtra} usuario{usuariosExtra > 1 ? 's' : ''}</strong> con{' '}
                          <strong>{diasRest} día{diasRest !== 1 ? 's' : ''}</strong> restantes del período actual de{' '}
                          {totalDias} días.
                        </p>
                        <div className="bg-white rounded p-2 text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {usuariosExtra} × ${Math.round(precioFinal)}/usr × {mesesPeriodo} {mesesPeriodo === 1 ? 'mes' : 'meses'} × ({diasRest}/{totalDias} días)
                            </span>
                            <span className="font-bold text-amber-900">{fmtMXN(prorrateo)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-amber-800">
                          Al guardar puedes generar una factura de prorrateo desde la pestaña <strong>Facturación → Nueva factura</strong>{' '}
                          (marcando "es prorrateo" en concepto) o simplemente guardar sin cobrar este excedente.
                        </p>
                      </div>
                    );
                  })()}


                  {/* Toggle acceso bloqueado */}
                  <div className="sm:col-span-2 rounded-lg border p-3 flex items-start justify-between gap-3 bg-muted/20">
                    <div>
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        🔒 Acceso bloqueado
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Si está activo, la empresa <strong>no puede usar la app</strong> aunque el status sea "Activa".
                        Desactívalo cuando confirmes el pago o quieras dar acceso manual.
                      </p>
                    </div>
                    <Switch
                      checked={!!subForm.acceso_bloqueado}
                      onCheckedChange={(v) => setSubForm((f: any) => ({ ...f, acceso_bloqueado: v }))}
                    />
                  </div>


                  {/* Resumen de cobro */}
                  {(() => {
                    const selectedPlan = plans.find(p => p.id === subForm.plan_id);
                    if (!selectedPlan) return null;
                    const precioBase = selectedPlan.precio_por_usuario;
                    const desc = subForm.descuento_porcentaje || 0;
                    const precioFinal = precioBase * (1 - desc / 100);
                    const usuarios = subForm.max_usuarios || 1;
                    const totalMes = precioFinal * usuarios;
                    const meses = selectedPlan.meses || 1;
                    const totalPeriodo = totalMes * meses;
                    return (
                      <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-4 space-y-2">
                        <p className="text-sm font-semibold">💰 Resumen de cobro</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Precio base</p>
                            <p className="font-medium">${precioBase.toLocaleString("es-MX", { maximumFractionDigits: 2 })}/usr</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Descuento</p>
                            <p className="font-medium">{desc > 0 ? `${desc.toFixed(1)}%` : 'Sin descuento'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Precio final</p>
                            <p className="font-medium text-primary">${Math.round(precioFinal).toLocaleString("es-MX", { maximumFractionDigits: 2 })}/usr</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Usuarios</p>
                            <p className="font-medium">{usuarios}</p>
                          </div>
                        </div>
                        <div className="border-t pt-2 flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total mensual</span>
                          <span className="text-sm font-semibold text-foreground">${Math.round(totalMes).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            Total del periodo ({meses} {meses === 1 ? 'mes' : 'meses'})
                          </span>
                          <span className="text-lg font-bold text-primary">${Math.round(totalPeriodo).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN</span>
                        </div>
                        {desc > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Sin descuento sería ${(precioBase * usuarios * meses).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN — ahorro: ${Math.round(precioBase * usuarios * meses - totalPeriodo).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <Badge variant={getEffectiveStatus(subscription).v} className="mt-1">
                      {getEffectiveStatus(subscription).l}
                    </Badge>
                    {subscription.acceso_bloqueado && (
                      <Badge variant="destructive" className="mt-1 ml-1">🔒 Bloqueada</Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="font-medium mt-1">{subscription.subscription_plans?.nombre || 'Sin plan'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Usuarios</p>
                    <p className="font-medium mt-1">{profiles.length} / {subscription.max_usuarios}</p>
                  </div>
                  {subscription.subscription_plans?.precio_por_usuario && (
                    <div>
                      <p className="text-sm text-muted-foreground">Precio/usuario</p>
                      <p className="font-medium mt-1">{fmtMXN(subscription.subscription_plans.precio_por_usuario)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Próximo cobro</p>
                    <p className="font-medium mt-1">
                      {subscription.current_period_end
                        ? (() => {
                            const d = new Date(subscription.current_period_end);
                            const normalized = d.getDate() === 1 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
                            return format(normalized, "dd MMM yyyy", { locale: es });
                          })()
                        : '—'}
                    </p>
                  </div>
                  {daysLeft !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Días restantes</p>
                      <Badge variant={daysLeft <= 3 ? 'destructive' : daysLeft <= 7 ? 'secondary' : 'outline'} className="mt-1">
                        {daysLeft <= 0 ? 'Vencido' : `${daysLeft} días`}
                      </Badge>
                    </div>
                  )}
                  {subscription.trial_ends_at && subscription.status === 'trial' && (
                    <div>
                      <p className="text-sm text-muted-foreground">Fin trial</p>
                      <p className="font-medium mt-1">{format(new Date(subscription.trial_ends_at), "dd MMM yyyy", { locale: es })}</p>
                    </div>
                  )}
                  {subscription.stripe_customer_id && (
                    <div>
                      <p className="text-sm text-muted-foreground">Stripe Customer</p>
                      <p className="font-mono text-sm mt-1 text-muted-foreground">{subscription.stripe_customer_id}</p>
                    </div>
                  )}
                  {subscription.card_last4 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Tarjeta</p>
                      <p className="font-mono font-medium mt-1">
                        {subscription.card_brand ? `${subscription.card_brand} ` : ''}•••• {subscription.card_last4}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Timbres ═══ */}
        <TabsContent value="timbres">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Saldo + Venta */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-primary" /> Timbres CFDI
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => setShowTimbresSale(!showTimbresSale)}>
                    <ShoppingCart className="h-4 w-4 mr-1.5" /> Nueva venta
                  </Button>
                </div>

                <div className="flex items-center justify-between bg-card rounded-lg p-4">
                  <span className="text-muted-foreground">Saldo actual</span>
                  <span className={`text-3xl font-bold font-mono ${timbres > 0 ? 'text-primary' : 'text-destructive'}`}>
                    {timbres}
                  </span>
                </div>

                {showTimbresSale && (
                  <div className="border border-border/60 rounded-lg p-4 space-y-3 bg-card/80">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <ShoppingCart className="h-4 w-4 text-primary" /> Registrar venta de timbres
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Paquetes (×100)</Label>
                        <Input type="number" min={1} value={timbresForm.paquetes}
                          onChange={e => setTimbresForm(f => ({ ...f, paquetes: parseInt(e.target.value) || 1 }))}
                          className="font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Precio/timbre</Label>
                        <Input type="number" min={0} step={0.5} value={timbresForm.precio_timbre}
                          onChange={e => setTimbresForm(f => ({ ...f, precio_timbre: parseFloat(e.target.value) || 0 }))}
                          className="font-mono" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1">
                        <Percent className="h-3.5 w-3.5" /> Descuento (%)
                      </Label>
                      <Input type="number" min={0} max={100} value={timbresForm.descuento_pct}
                        onChange={e => setTimbresForm(f => ({ ...f, descuento_pct: parseFloat(e.target.value) || 0 }))}
                        className="font-mono" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Notas</Label>
                      <Textarea value={timbresForm.notas}
                        onChange={e => setTimbresForm(f => ({ ...f, notas: e.target.value }))}
                        className="resize-none h-16" placeholder="Notas de la venta..." />
                    </div>

                    <div className="bg-background border border-border/40 rounded-lg p-3 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{timbresCount} timbres × ${timbresForm.precio_timbre}</span>
                        <span>{fmtMXN(timbresSubtotal)}</span>
                      </div>
                      {timbresForm.descuento_pct > 0 && (
                        <div className="flex justify-between text-sm text-primary">
                          <span>Descuento ({timbresForm.descuento_pct}%)</span>
                          <span>-{fmtMXN(timbresDescuento)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span>{fmtMXN(timbresTotal)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="generar-factura"
                        checked={timbresForm.generar_factura}
                        onCheckedChange={v => setTimbresForm(f => ({ ...f, generar_factura: !!v }))}
                      />
                      <Label htmlFor="generar-factura" className="text-sm cursor-pointer">
                        Generar factura Stripe y enviar por correo
                      </Label>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowTimbresSale(false)}>
                        Cancelar
                      </Button>
                      <Button className="flex-1" disabled={addingTimbres} onClick={handleTimbresSale}>
                        {addingTimbres ? 'Procesando...' : `Vender ${timbresCount} timbres`}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historial */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <History className="h-4 w-4 text-primary" /> Historial de movimientos
                </h3>
                {timbresMovimientos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Sin movimientos</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {timbresMovimientos.map(m => (
                      <div key={m.id} className="flex items-start justify-between border border-border/30 rounded-lg p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={m.tipo === 'compra' || m.tipo === 'recarga' ? 'default' : 'secondary'}>
                              {m.tipo === 'compra' ? '🛒 Compra' : m.tipo === 'consumo' ? '📄 Uso' : m.tipo === 'recarga' ? '🔄 Recarga' : m.tipo}
                            </Badge>
                            <span className={`font-mono font-semibold ${m.cantidad >= 0 ? 'text-primary' : 'text-destructive'}`}>
                              {m.cantidad >= 0 ? '+' : ''}{m.cantidad}
                            </span>
                          </div>
                          {m.notas && <p className="text-sm text-muted-foreground mt-1 truncate">{m.notas}</p>}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-mono text-muted-foreground text-sm">→ {m.saldo_nuevo}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'dd/MM/yy HH:mm')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB: Facturación ═══ */}
        <TabsContent value="facturacion">
          <div className="space-y-6">
            {/* Action: Create subscription invoice */}
            <Card className="border border-primary/30 bg-primary/5 shadow-sm">
              <CardContent className="pt-6 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Crear factura de suscripción
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Genera una factura por N meses con descuento. Al pagarse, el plan se activa/extiende automáticamente y aparece en el panel del cliente.
                  </p>
                </div>
                <Button onClick={openSubInvoice} className="gap-1.5">
                  <Receipt className="h-4 w-4" /> Nueva factura
                </Button>
              </CardContent>
            </Card>

            {/* Internal invoices */}
            <Card className="border border-border/60 shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                  <Receipt className="h-4 w-4 text-primary" /> Facturas internas ({facturas.length})
                </h3>
                {facturas.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Sin facturas registradas</p>
                ) : (
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Número</TableHead>
                          <TableHead>Fecha emisión</TableHead>
                          <TableHead>Vencimiento</TableHead>
                          <TableHead>Usuarios</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...facturas]
                          .sort((a, b) => {
                            const da = new Date(a.creado_en || a.fecha_emision || 0).getTime();
                            const db = new Date(b.creado_en || b.fecha_emision || 0).getTime();
                            return db - da;
                          })
                          .map(f => {
                            const fmtDate = (v: any, withTime = false) => {
                              if (!v) return '—';
                              try { return format(new Date(v), withTime ? 'dd MMM yyyy HH:mm' : 'dd MMM yyyy', { locale: es }); }
                              catch { return String(v); }
                            };
                            const stripeMatch = stripeInvoices.find((si: any) => si.id === f.stripe_invoice_id);
                            const hostedUrl = stripeMatch?.hosted_invoice_url || null;
                            const hasStripeInvoice = Boolean(f.stripe_invoice_id);
                            const isPending = (f.estado || 'pendiente') !== 'pagada';
                            const isExpanded = expandedFacturaId === f.id;
                            const fields: Array<[string, any]> = [
                              ['ID', f.id],
                              ['Empresa ID', f.empresa_id],
                              ['Suscripción ID', f.suscripcion_id],
                              ['Período inicio', f.periodo_inicio ? fmtDate(f.periodo_inicio) : '—'],
                              ['Período fin', f.periodo_fin ? fmtDate(f.periodo_fin) : '—'],
                              ['Precio unitario', f.precio_unitario != null ? fmtMXN(Number(f.precio_unitario)) : '—'],
                              ['Descuento %', f.descuento_porcentaje ?? 0],
                              ['Subtotal', f.subtotal != null ? fmtMXN(Number(f.subtotal)) : '—'],
                              ['Es prorrateo', f.es_prorrateo ? 'Sí' : 'No'],
                              ['Fecha pago', fmtDate(f.fecha_pago, true)],
                              ['Stripe invoice ID', f.stripe_invoice_id],
                              ['Stripe payment intent', f.stripe_payment_intent_id],
                              ['Creado en', fmtDate(f.creado_en, true)],
                            ];
                            return (
                              <>
                                <TableRow
                                  key={f.id}
                                  className="cursor-pointer hover:bg-muted/30"
                                  onClick={() => setExpandedFacturaId(isExpanded ? null : f.id)}
                                >
                                  <TableCell className="py-2">
                                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  </TableCell>
                                  <TableCell className="font-mono font-semibold text-sm">{f.numero_factura || '—'}</TableCell>
                                  <TableCell className="text-sm">{fmtDate(f.fecha_emision)}</TableCell>
                                  <TableCell className="text-sm">{fmtDate(f.fecha_vencimiento)}</TableCell>
                                  <TableCell className="text-sm">{f.num_usuarios ?? '—'}</TableCell>
                                  <TableCell className="text-right font-semibold text-primary">
                                    {f.total != null ? fmtMXN(Number(f.total)) : '—'}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={f.estado === 'pagada' ? 'default' : f.estado === 'pendiente' ? 'destructive' : 'secondary'}>
                                      {f.estado || 'pendiente'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {f.estado === 'pagada' ? (
                                      <div className="flex flex-col">
                                        <span className="capitalize font-medium">
                                          {f.metodo_pago || (f.stripe_payment_intent_id ? 'Stripe' : '—')}
                                        </span>
                                        {f.referencia_pago && (
                                          <span className="text-muted-foreground font-mono truncate max-w-[140px]" title={f.referencia_pago}>
                                            {f.referencia_pago}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1 flex-wrap">
                                      {isPending && (
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                          title="Registrar pago manual (transferencia/efectivo)"
                                          onClick={() => openMarkPaid(f)}
                                        >
                                          ✓ Marcar pagada
                                        </Button>
                                      )}
                                      {isPending && hostedUrl && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            title="Copiar link"
                                            onClick={() => {
                                              navigator.clipboard.writeText(hostedUrl);
                                              toast.success('Link de pago copiado');
                                            }}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 text-white h-8"
                                            disabled={sendingWaId === f.id}
                                            title="Enviar por WhatsApp"
                                            onClick={async () => {
                                              const tel = (empresa?.telefono || '').replace(/\D/g, '');
                                              if (!tel) {
                                                toast.error('La empresa no tiene teléfono registrado');
                                                return;
                                              }
                                              try {
                                                setSendingWaId(f.id);
                                                const { data, error } = await supabase.functions.invoke('admin-billing', {
                                                  body: {
                                                    action: 'send_invoice_notification',
                                                    channel: 'whatsapp',
                                                    phone_override: tel,
                                                    empresa_id: empresaId,
                                                    empresa_nombre: empresa?.nombre || '',
                                                    folio: f.numero_factura || '',
                                                    fecha_vencimiento: f.fecha_vencimiento || null,
                                                    amount: Math.round(Number(f.total || 0) * 100),
                                                    hosted_url: hostedUrl,
                                                    invoice_id: f.stripe_invoice_id || null,
                                                    description: `Factura ${f.numero_factura || ''}`,
                                                  },
                                                });
                                                if (error) throw error;
                                                if (data?.success === false) throw new Error(data?.error || 'Error');
                                                toast.success('WhatsApp enviado al cliente ✅');
                                              } catch (e: any) {
                                                toast.error(`No se pudo enviar: ${e.message || e}`);
                                              } finally {
                                                setSendingWaId(null);
                                              }
                                            }}
                                          >
                                            {sendingWaId === f.id
                                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              : <MessageCircle className="h-3.5 w-3.5" />}
                                          </Button>
                                          <Button size="sm" variant="ghost" asChild title="Abrir página de pago">
                                            <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                          </Button>
                                        </>
                                      )}
                                      {!isPending && (
                                        <span className="text-xs text-emerald-700 font-medium">✓ Pagada</span>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <TableRow key={`${f.id}-exp`} className="bg-muted/20 hover:bg-muted/20">
                                    <TableCell colSpan={9} className="p-4">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                                        {fields.map(([k, v]) => (
                                          <div key={k} className="flex flex-col border-b border-border/30 pb-1">
                                            <span className="text-xs text-muted-foreground uppercase tracking-wide">{k}</span>
                                            <span className="font-mono text-xs break-all">{v == null || v === '' ? '—' : String(v)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stripe invoices */}
            {stripeInvoices.length > 0 && (
              <Card className="border border-border/60 shadow-sm">
                <CardContent className="pt-6">
                  <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
                    <ExternalLink className="h-4 w-4 text-primary" /> Facturas Stripe ({stripeInvoices.length})
                  </h3>
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-card">
                          <TableHead>Número</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stripeInvoices.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-sm">{inv.number || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={inv.status === 'paid' ? 'default' : 'destructive'}>
                                {inv.status === 'paid' ? 'Pagada' : inv.status === 'open' ? 'Pendiente' : inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{fmtMXN(inv.amount_due / 100)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(inv.created * 1000), 'dd MMM yy', { locale: es })}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {inv.hosted_invoice_url && (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                                  </Button>
                                )}
                                {inv.invoice_pdf && (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Subscription Invoice Dialog */}
      <Dialog open={showSubInvoice} onOpenChange={setShowSubInvoice}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Nueva factura de suscripción
            </DialogTitle>
            <DialogDescription>
              Para <strong>{empresa?.nombre}</strong>. Al pagarse, el plan se activa/extiende automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={subInvoiceForm.plan_id}
                onChange={e => applyPlanToInvoice(e.target.value)}
              >
                <option value="">— Personalizado —</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.meses} {p.meses === 1 ? 'mes' : 'meses'} · ${p.precio_por_usuario}/usuario/mes
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Al pagar, este plan se asigna a la empresa para los próximos cobros.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meses</Label>
                <Input type="number" min={1} value={subInvoiceForm.meses}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, meses: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Usuarios</Label>
                <Input type="number" min={1} value={subInvoiceForm.num_usuarios}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, num_usuarios: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Precio / usuario / mes (MXN)</Label>
                <Input type="number" min={0} step="0.01" value={subInvoiceForm.precio_por_usuario_mes}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, precio_por_usuario_mes: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Descuento (%)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={subInvoiceForm.descuento_pct}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, descuento_pct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
              </div>
              <div className="col-span-2 flex items-start gap-3 rounded-md border border-border/60 bg-card p-3">
                <Checkbox
                  id="desc-permanente"
                  checked={subInvoiceForm.descuento_permanente}
                  onCheckedChange={(v) => setSubInvoiceForm(f => ({ ...f, descuento_permanente: !!v }))}
                  disabled={subInvoiceForm.descuento_pct <= 0}
                />
                <label htmlFor="desc-permanente" className="text-sm cursor-pointer leading-tight">
                  <span className="font-medium">Aplicar descuento de forma permanente</span>
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {subInvoiceForm.descuento_permanente
                      ? 'El descuento se guardará en la suscripción y se mantendrá en cobros futuros.'
                      : 'Descuento solo para esta factura. Los próximos cobros usarán el precio normal del plan.'}
                  </span>
                </label>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Días para pagar</Label>
                <Input type="number" min={1} value={subInvoiceForm.days_until_due}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, days_until_due: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Concepto</Label>
                <Input value={subInvoiceForm.concepto}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, concepto: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmtMXN(subInvoiceSubtotal)}</span>
              </div>
              {subInvoiceForm.descuento_pct > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento ({subInvoiceForm.descuento_pct}%)</span>
                  <span>-{fmtMXN(subInvoiceDescMonto)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span>
                <span className="text-primary">{fmtMXN(subInvoiceTotal)}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowSubInvoice(false)} disabled={creatingSubInvoice}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSubInvoice} disabled={creatingSubInvoice}>
              {creatingSubInvoice ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Receipt className="h-4 w-4 mr-1.5" />}
              Crear factura
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" /> Restablecer contraseña
            </DialogTitle>
            <DialogDescription className="text-base">
              {resetDialog?.nombre} — <span className="font-mono">{resetDialog?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Nueva contraseña temporal</Label>
              <Input
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="font-mono text-base"
              />
            </div>
            <div className="flex items-center gap-3 bg-card rounded-lg p-3">
              <Checkbox
                id="force-change"
                checked={resetForceChange}
                onCheckedChange={(v) => setResetForceChange(!!v)}
              />
              <label htmlFor="force-change" className="text-sm cursor-pointer leading-tight">
                <span className="font-medium">Forzar cambio al iniciar sesión</span>
                <br />
                <span className="text-muted-foreground text-xs">El usuario verá un modal para crear una nueva contraseña antes de poder usar la app</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setResetDialog(null)}>
                Cancelar
              </Button>
              <Button
                disabled={resettingPw || resetPassword.length < 6}
                onClick={handleResetPassword}
              >
                {resettingPw ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Restablecer contraseña
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Modal: Marcar factura como pagada (pago manual) ═══ */}
      <Dialog open={!!markPaidFactura} onOpenChange={(o) => !o && setMarkPaidFactura(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago de factura</DialogTitle>
            <DialogDescription>
              {markPaidFactura?.numero_factura
                ? `Factura ${markPaidFactura.numero_factura}`
                : 'Factura interna'}
              {' · '}
              <span className="font-semibold text-primary">
                {markPaidFactura?.total != null ? fmtMXN(Number(markPaidFactura.total)) : ''}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Método de pago</Label>
              <Select
                value={markPaidForm.metodo_pago}
                onValueChange={(v) => setMarkPaidForm((f) => ({ ...f, metodo_pago: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="deposito">Depósito</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Fecha de pago</Label>
              <Input
                type="date"
                value={markPaidForm.fecha_pago}
                onChange={(e) => setMarkPaidForm((f) => ({ ...f, fecha_pago: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Referencia / Folio</Label>
              <Input
                placeholder="Ej: ABC-1234, últimos 4 dígitos, número de transferencia…"
                value={markPaidForm.referencia_pago}
                onChange={(e) => setMarkPaidForm((f) => ({ ...f, referencia_pago: e.target.value }))}
              />
            </div>

            {markPaidFactura?.stripe_invoice_id && (
              <div className="flex items-start gap-2 rounded-lg border p-3 bg-muted/20">
                <Checkbox
                  id="reflect-stripe"
                  checked={markPaidForm.reflect_in_stripe}
                  onCheckedChange={(v) => setMarkPaidForm((f) => ({ ...f, reflect_in_stripe: !!v }))}
                />
                <div className="flex-1">
                  <Label htmlFor="reflect-stripe" className="text-sm cursor-pointer font-medium">
                    Reflejar también en Stripe
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Marca la factura de Stripe como pagada ("paid out of band").
                  </p>
                </div>
              </div>
            )}

            {!markPaidFactura?.es_prorrateo && (
              <div className="flex items-start gap-2 rounded-lg border p-3 bg-emerald-50">
                <Checkbox
                  id="extender-periodo"
                  checked={markPaidForm.extender_periodo}
                  onCheckedChange={(v) => setMarkPaidForm((f) => ({ ...f, extender_periodo: !!v }))}
                />
                <div className="flex-1">
                  <Label htmlFor="extender-periodo" className="text-sm cursor-pointer font-medium">
                    Extender período de la suscripción
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activa la suscripción y mueve "Fin período" según los meses cubiertos por esta factura.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMarkPaidFactura(null)} disabled={markingPaid}>
                Cancelar
              </Button>
              <Button onClick={handleMarkPaid} disabled={markingPaid}>
                {markingPaid ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : '✓ '}
                Registrar pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-foreground font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}
