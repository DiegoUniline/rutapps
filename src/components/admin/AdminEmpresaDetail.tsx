import { useState, useEffect, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, CreditCard, Receipt, Users, Calendar,
  Mail, Phone, MapPin, Edit2, ExternalLink, Download, FileText,
  History, KeyRound, ShieldAlert, Loader2, Trash2,
  Copy, MessageCircle, AlertCircle, TrendingUp, Wallet, Clock,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { es } from 'date-fns/locale';
import { confirmDialog } from '@/lib/confirm';

interface Props {
  empresaId: string;
  onBack: () => void;
  initialTab?: 'usuarios' | 'facturas' | 'pagos' | 'historial';
}

const STATUS_MAP: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trial: { l: 'Prueba', v: 'secondary' }, active: { l: 'Activa', v: 'default' },
  past_due: { l: 'Vencida', v: 'destructive' }, cancelled: { l: 'Cancelada', v: 'outline' },
  suspended: { l: 'Suspendida', v: 'destructive' }, gracia: { l: 'Gracia', v: 'destructive' },
  pendiente_pago: { l: 'Pendiente pago', v: 'secondary' },
};
const STATUSES = ['trial', 'active', 'past_due', 'gracia', 'suspended', 'cancelled'] as const;
const fmtMXN = (v: number) =>
  `$${(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const datePart = (value: any) => {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseCalendarDate = (value: any) => {
  const part = datePart(value);
  const match = part.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return new Date(value);
};

const todayInput = () => datePart(new Date());
const addMonthsInput = (value: string, months: number) => {
  const d = parseCalendarDate(value);
  d.setMonth(d.getMonth() + months);
  return datePart(d);
};
const fmtDate = (value: any, pattern = 'dd MMM yyyy') => value ? format(parseCalendarDate(value), pattern, { locale: es }) : '—';

function getEffectiveStatus(sub: any): { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (!sub) return { l: '—', v: 'outline' };
  if (sub.acceso_bloqueado) return { l: 'Suspendida', v: 'destructive' };
  const ref = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
  if (ref && new Date(ref) < new Date()) return { l: 'Vencida', v: 'destructive' };
  return STATUS_MAP[sub.status] || { l: sub.status, v: 'outline' };
}

function estadoFacturaBadge(estado: string) {
  const m: Record<string, { l: string; cls: string }> = {
    pagada: { l: 'Pagada', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    pendiente: { l: 'Pendiente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    fallida: { l: 'Fallida', cls: 'bg-red-100 text-red-700 border-red-200' },
    parcial: { l: 'Parcial', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    cancelada: { l: 'Cancelada', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const x = m[estado] || m.pendiente;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${x.cls}`}>{x.l}</span>;
}

export default function AdminEmpresaDetail({ empresaId, onBack, initialTab = 'usuarios' }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersDetailed, setUsersDetailed] = useState<any[]>([]);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [stripeInvoices, setStripeInvoices] = useState<any[]>([]);

  // Dialogs
  const [editDatosOpen, setEditDatosOpen] = useState(false);
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [empresaForm, setEmpresaForm] = useState<any>({});
  const [subForm, setSubForm] = useState<any>({});
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  const [resetDialog, setResetDialog] = useState<{ userId: string; email: string; nombre: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [forcingAll, setForcingAll] = useState(false);

  const [showSubInvoice, setShowSubInvoice] = useState(false);
  const [creatingSubInvoice, setCreatingSubInvoice] = useState(false);
  const [subInvoiceForm, setSubInvoiceForm] = useState({
    plan_id: '' as string,
    crear_con_stripe: true,
    meses: 1,
    num_usuarios: 1,
    precio_por_usuario_mes: 300,
    descuento_pct: 0,
    descuento_permanente: false,
    days_until_due: 7,
    concepto: '',
    periodo_inicio: todayInput(),
    periodo_fin: todayInput(),
  });

  const [markPaidFactura, setMarkPaidFactura] = useState<any | null>(null);
  const [editFactura, setEditFactura] = useState<any | null>(null);
  const [editFacturaForm, setEditFacturaForm] = useState<any>({});
  const [savingFactura, setSavingFactura] = useState(false);
  const [deletingFacturaId, setDeletingFacturaId] = useState<string | null>(null);
  const [confirmDeleteFactura, setConfirmDeleteFactura] = useState<any | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState({
    metodo_pago: 'transferencia',
    referencia_pago: '',
    fecha_pago: todayInput(),
    reflect_in_stripe: true,
    extender_periodo: true,
  });
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => { load(); }, [empresaId]);

  async function load() {
    setLoading(true);
    const [empRes, subRes, plansRes, profilesRes] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
      supabase.from('subscriptions').select('*, subscription_plans(nombre, precio_por_usuario, periodo, descuento_pct, meses)').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('subscription_plans').select('*').eq('activo', true),
      supabase.from('profiles').select('id, nombre, telefono, rol, user_id, estado, archivado_en, archivado_motivo').eq('empresa_id', empresaId),
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
        current_period_start: datePart(subRes.data.current_period_start),
        current_period_end: datePart(subRes.data.current_period_end),
        trial_ends_at: datePart(subRes.data.trial_ends_at),
        descuento_porcentaje: (subRes.data as any).descuento_porcentaje || 0,
        acceso_bloqueado: !!(subRes.data as any).acceso_bloqueado,
      });
    }

    setLoading(false);

    supabase.from('facturas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(50)
      .then(({ data }) => setFacturas((data || []) as any[]));

    supabase.functions.invoke('admin-users', {
      body: { action: 'list-empresa-users', empresa_id: empresaId },
    }).then(({ data: usersData, error: usersErr }) => {
      if (!usersErr && usersData?.users) setUsersDetailed(usersData.users);
    }).catch(() => { });

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
        } catch { }
      })();
    }
  }

  async function saveEmpresa() {
    setSavingEmpresa(true);
    const { error } = await supabase.from('empresas').update(empresaForm).eq('id', empresaId);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa actualizada'); setEditDatosOpen(false); load(); }
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
    else { toast.success('Suscripción actualizada'); setEditPlanOpen(false); load(); }
    setSavingSub(false);
  }

  async function handleResetPassword() {
    if (!resetDialog || !resetPassword) return;
    if (resetPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setResettingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'reset-password', user_id: resetDialog.userId, password: resetPassword, force_change: resetForceChange },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Contraseña restablecida${resetForceChange ? ' — deberá cambiarla al entrar' : ''}`);
      setResetDialog(null);
      setResetPassword('');
    } catch (e: any) { toast.error(e.message); }
    finally { setResettingPw(false); }
  }

  async function handleForceChangeAll() {
    if (!await confirmDialog(`¿Forzar cambio de contraseña para TODOS los usuarios de ${empresa?.nombre}?`)) return;
    setForcingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'force-change-all', empresa_id: empresaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.count} usuarios deberán cambiar su contraseña`);
    } catch (e: any) { toast.error(e.message); }
    finally { setForcingAll(false); }
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
    // Periodo: arranca al fin del periodo vigente (si está en el futuro) o hoy, sin conversión UTC
    const currentEnd = datePart(subscription?.current_period_end);
    const today = todayInput();
    const base = currentEnd && parseCalendarDate(currentEnd) > parseCalendarDate(today) ? currentEnd : today;
    setSubInvoiceForm({
      plan_id: planId, crear_con_stripe: true, meses, num_usuarios: subscription?.max_usuarios || 1,
      precio_por_usuario_mes: precio, descuento_pct: descPlan, descuento_permanente: false,
      days_until_due: 7, concepto: `Suscripción Rutapp ${planNombre}`,
      periodo_inicio: base,
      periodo_fin: addMonthsInput(base, meses),
    });
    setShowSubInvoice(true);
  }

  function applyPlanToInvoice(planId: string) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setSubInvoiceForm(f => {
      return {
        ...f, plan_id: planId, meses: plan.meses,
        precio_por_usuario_mes: plan.precio_por_usuario, concepto: `Suscripción Rutapp ${plan.nombre}`,
        periodo_fin: addMonthsInput(f.periodo_inicio, plan.meses),
      };
    });
  }

  function updateInvoiceMeses(meses: number) {
    setSubInvoiceForm(f => {
      return { ...f, meses, periodo_fin: addMonthsInput(f.periodo_inicio, meses) };
    });
  }

  function updateInvoicePeriodoInicio(value: string) {
    setSubInvoiceForm(f => {
      return { ...f, periodo_inicio: value, periodo_fin: addMonthsInput(value, f.meses) };
    });
  }


  async function handleCreateSubInvoice() {
    if (subInvoiceForm.num_usuarios < 1 || subInvoiceForm.meses < 1) {
      toast.error('Verifica usuarios y meses'); return;
    }
    setCreatingSubInvoice(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      // Refresh to avoid session_not_found (403) when the cached token has been revoked
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session) session = refreshed.data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
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
            crear_con_stripe: subInvoiceForm.crear_con_stripe,
            days_until_due: subInvoiceForm.days_until_due,
            concepto: subInvoiceForm.concepto,
            periodo_inicio: subInvoiceForm.periodo_inicio || undefined,
            periodo_fin: subInvoiceForm.periodo_fin || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error al crear factura');
      toast.success(`Factura ${data.folio} creada por ${fmtMXN(data.total)}${data.stripe === false ? ' · pendiente manual' : ' · enviada por Stripe'}`);
      setShowSubInvoice(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingSubInvoice(false); }
  }

  function openMarkPaid(f: any) {
    setMarkPaidFactura(f);
    setMarkPaidForm({
      metodo_pago: 'transferencia',
      referencia_pago: '',
      fecha_pago: todayInput(),
      reflect_in_stripe: !!f.stripe_invoice_id,
      extender_periodo: !f.es_prorrateo,
    });
  }

  async function handleMarkPaid() {
    if (!markPaidFactura) return;
    setMarkingPaid(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session) session = refreshed.data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
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
        msgParts.push(`período hasta ${fmtDate(data.nuevo_fin_periodo)}`);
      }
      toast.success(msgParts.join(' · '));
      setMarkPaidFactura(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setMarkingPaid(false); }
  }

  function openEditFactura(f: any) {
    setEditFactura(f);
    setEditFacturaForm({
      numero_factura: f.numero_factura || '',
      total: Number(f.total || 0),
      num_usuarios: Number(f.num_usuarios || 1),
      precio_unitario: Number(f.precio_unitario || 0),
      descuento_porcentaje: Number(f.descuento_porcentaje || 0),
      periodo_inicio: datePart(f.periodo_inicio),
      periodo_fin: datePart(f.periodo_fin),
      fecha_vencimiento: datePart(f.fecha_vencimiento),
      estado: f.estado || 'pendiente',
      metodo_pago: f.metodo_pago || '',
      referencia_pago: f.referencia_pago || '',
      concepto: f.concepto || '',
    });
  }

  async function handleSaveFactura() {
    if (!editFactura) return;
    setSavingFactura(true);
    try {
      const subtotal = editFacturaForm.num_usuarios * editFacturaForm.precio_unitario;
      const payload: any = {
        numero_factura: editFacturaForm.numero_factura || null,
        total: editFacturaForm.total,
        num_usuarios: editFacturaForm.num_usuarios,
        precio_unitario: editFacturaForm.precio_unitario,
        descuento_porcentaje: editFacturaForm.descuento_porcentaje,
        subtotal,
        concepto: editFacturaForm.concepto || null,
        periodo_inicio: editFacturaForm.periodo_inicio || null,
        periodo_fin: editFacturaForm.periodo_fin || null,
        fecha_vencimiento: editFacturaForm.fecha_vencimiento || null,
        estado: editFacturaForm.estado,
        metodo_pago: editFacturaForm.metodo_pago || null,
        referencia_pago: editFacturaForm.referencia_pago || null,
      };
      // If transitioning to "pagada", set fecha_pago to today if missing
      if (editFacturaForm.estado === 'pagada' && !editFactura.fecha_pago) {
        payload.fecha_pago = new Date().toISOString();
      }
      const { error } = await supabase.from('facturas').update(payload).eq('id', editFactura.id);
      if (error) throw error;

      // If invoice is now paid, sync subscription period with factura's periodo
      if (editFacturaForm.estado === 'pagada' && subscription?.id
          && editFacturaForm.periodo_inicio && editFacturaForm.periodo_fin) {
        const { error: subErr } = await supabase.from('subscriptions').update({
          current_period_start: editFacturaForm.periodo_inicio,
          current_period_end: editFacturaForm.periodo_fin,
          status: 'active',
          acceso_bloqueado: false,
          updated_at: new Date().toISOString(),
        }).eq('id', subscription.id);
        if (subErr) console.error('[sync sub period]', subErr);
      }

      toast.success('Factura actualizada');
      setEditFactura(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
    finally { setSavingFactura(false); }
  }

  async function handleDeleteFactura(f: any) {
    setDeletingFacturaId(f.id);
    try {
      const { error } = await supabase.from('facturas').delete().eq('id', f.id);
      if (error) throw error;
      toast.success('Factura eliminada');
      setConfirmDeleteFactura(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Error al eliminar'); }
    finally { setDeletingFacturaId(null); }
  }

  async function handleDeleteEmpresa() {
    if (!user) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_empresa_cascade', {
        p_empresa_id: empresaId, p_deleted_by: user.id,
      });
      if (error) throw error;
      toast.success(`Empresa "${empresa?.nombre}" eliminada`);
      onBack();
    } catch (e: any) { toast.error(e.message || 'Error al eliminar empresa'); }
    finally { setDeleting(false); }
  }

  // Merge estado/archivado_en from profiles into detailed users (admin-users doesn't include it)
  const profilesByUserId = useMemo(() => {
    const m = new Map<string, any>();
    profiles.forEach(p => { if (p.user_id) m.set(p.user_id, p); });
    return m;
  }, [profiles]);
  const allUsers = useMemo(() => {
    const base = usersDetailed.length > 0 ? usersDetailed : profiles;
    return base.map((u: any) => {
      const p = profilesByUserId.get(u.user_id ?? u.id) || (usersDetailed.length === 0 ? u : null);
      return {
        ...u,
        estado: p?.estado ?? u.estado ?? 'activo',
        archivado_en: p?.archivado_en ?? u.archivado_en ?? null,
        archivado_motivo: p?.archivado_motivo ?? u.archivado_motivo ?? null,
      };
    });
  }, [usersDetailed, profiles, profilesByUserId]);
  const [userStatusFilter, setUserStatusFilter] = useState<'todos' | 'activo' | 'baja' | 'archivado'>('todos');
  const classifyUser = (u: any): 'activo' | 'baja' | 'archivado' => {
    if (u?.archivado_en) return 'archivado';
    return (u?.estado || 'activo') === 'activo' ? 'activo' : 'baja';
  };
  const usersCounts = useMemo(() => {
    const c = { todos: allUsers.length, activo: 0, baja: 0, archivado: 0 } as Record<string, number>;
    allUsers.forEach((u: any) => { c[classifyUser(u)]++; });
    return c;
  }, [allUsers]);
  const filteredUsers = useMemo(
    () => userStatusFilter === 'todos' ? allUsers : allUsers.filter((u: any) => classifyUser(u) === userStatusFilter),
    [allUsers, userStatusFilter]
  );

  // ── KPIs / derivados ─────────────────────────────────────────
  const kpis = useMemo(() => {
    const noCanceladas = facturas.filter(f => (f.estado || '') !== 'cancelada');
    const totalCobrar = noCanceladas.reduce((s, f) => s + Number(f.total || 0), 0);
    const totalCobrado = noCanceladas
      .filter(f => f.estado === 'pagada')
      .reduce((s, f) => s + Number(f.total || 0), 0);
    const saldo = totalCobrar - totalCobrado;
    const proxima = noCanceladas
      .filter(f => f.estado !== 'pagada' && f.fecha_vencimiento)
      .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())[0];
    return { totalCobrar, totalCobrado, saldo, proxima };
  }, [facturas]);

  const pagos = useMemo(() => {
    return facturas
      .filter(f => f.estado === 'pagada')
      .map(f => ({
        id: f.id,
        fecha: f.fecha_pago || f.fecha_emision,
        factura: f.numero_factura,
        monto: Number(f.total || 0),
        metodo: f.metodo_pago || (f.stripe_payment_intent_id ? 'stripe' : 'manual'),
        origen: f.stripe_payment_intent_id && !f.metodo_pago ? 'automatico' : 'manual',
        referencia: f.referencia_pago,
      }))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [facturas]);

  const historial = useMemo(() => {
    const items: any[] = [];
    facturas.forEach(f => {
      if (f.creado_en || f.fecha_emision) {
        items.push({
          fecha: f.creado_en || f.fecha_emision,
          accion: 'Factura emitida',
          detalle: `${f.numero_factura || 'sin folio'} · ${fmtMXN(Number(f.total || 0))}`,
        });
      }
      if (f.estado === 'pagada' && f.fecha_pago) {
        items.push({
          fecha: f.fecha_pago,
          accion: 'Pago aplicado',
          detalle: `${f.numero_factura || 'sin folio'} · ${fmtMXN(Number(f.total || 0))} · ${f.metodo_pago || (f.stripe_payment_intent_id ? 'Stripe' : 'manual')}`,
        });
      }
    });
    return items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [facturas]);

  // Lista de campos visibles de la empresa (oculta vacíos)
  const datosVisibles = useMemo(() => {
    const items = [
      { icon: Mail, label: 'Email', value: empresa?.email },
      { icon: Phone, label: 'Teléfono', value: empresa?.telefono },
      { icon: FileText, label: 'RFC', value: empresa?.rfc },
      { icon: FileText, label: 'Razón Social', value: empresa?.razon_social },
      { icon: MapPin, label: 'Dirección', value: empresa?.direccion },
      { icon: MapPin, label: 'C.P.', value: empresa?.cp },
      { icon: MapPin, label: 'Ciudad', value: [empresa?.ciudad, empresa?.estado].filter(Boolean).join(', ') || null },
    ];
    return items.filter(i => i.value);
  }, [empresa]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando detalle de empresa…
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

  const planActual = subscription?.subscription_plans;
  const planNombre = planActual?.nombre || '—';
  const precioFinal = (planActual?.precio_por_usuario || 0) * (1 - (subscription?.descuento_porcentaje || 0) / 100);
  const baseUsuarios = planActual?.usuarios_incluidos ?? null;
  const usuariosActivos = usersCounts.activo;
  const asientosExtra = baseUsuarios != null ? Math.max(0, usuariosActivos - baseUsuarios) : 0;

  return (
    <div className="space-y-6 w-full">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Empresas
        </Button>
        <Separator orientation="vertical" className="h-6 hidden sm:block" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate">{empresa.nombre}</h2>
            <p className="text-xs text-muted-foreground">
              Registrada {format(new Date(empresa.created_at), "dd MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subscription && (
            <Badge variant={getEffectiveStatus(subscription).v} className="text-xs">
              {getEffectiveStatus(subscription).l}
            </Badge>
          )}
          {subscription?.acceso_bloqueado && (
            <Badge variant="destructive" className="text-xs gap-1">🔒 Bloqueada</Badge>
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
                  Esta acción es <strong>irreversible</strong>. Se eliminarán todos los datos de
                  "{empresa.nombre}" y los correos quedarán bloqueados para nuevos trials.
                  <div className="pt-2">
                    <Label className="text-xs text-foreground">Escribe <strong>{empresa.nombre}</strong> para confirmar:</Label>
                    <Input className="mt-1" value={deleteConfirmName} onChange={e => setDeleteConfirmName(e.target.value)} placeholder={empresa.nombre} />
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

      {/* ── KPI Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} label="Total a cobrar" value={fmtMXN(kpis.totalCobrar)} />
        <Kpi icon={Wallet} label="Total cobrado" value={fmtMXN(kpis.totalCobrado)} tone="success" />
        <Kpi
          icon={AlertCircle}
          label="Saldo pendiente"
          value={fmtMXN(kpis.saldo)}
          tone={kpis.saldo > 0 ? 'danger' : 'success'}
        />
        <Kpi
          icon={Clock}
          label="Próximo cobro"
          value={kpis.proxima ? fmtMXN(Number(kpis.proxima.total)) : '—'}
          sub={
            kpis.proxima
              ? `${format(new Date(kpis.proxima.fecha_vencimiento), 'dd MMM yyyy', { locale: es })} · ${usuariosActivos} usuarios`
              : `${usuariosActivos} usuarios activos`
          }
        />
      </div>

      {/* ── Datos | Suscripción ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Datos empresa (60%) */}
        <Card className="lg:col-span-3 border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Datos de empresa
              </h3>
              <Button size="sm" variant="outline" onClick={() => setEditDatosOpen(true)}>
                <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            </div>

            {datosVisibles.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Datos fiscales incompletos</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditDatosOpen(true)}>
                  Completar
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                {datosVisibles.map((d, i) => (
                  <InfoRow key={i} icon={d.icon} label={d.label} value={d.value} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suscripción (40%) */}
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" /> Suscripción
              </h3>
              {subscription && (
                <Button size="sm" variant="outline" onClick={() => setEditPlanOpen(true)}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Editar plan
                </Button>
              )}
            </div>

            {!subscription ? (
              <p className="text-muted-foreground text-sm">Sin suscripción</p>
            ) : (
              <div className="space-y-3 text-sm">
                {subscription.stripe_sync_error && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-xs">
                    <p className="font-semibold text-destructive flex items-center gap-1">⚠️ No se pudo sincronizar con Stripe</p>
                    <p className="mt-0.5 text-destructive/90 break-words">{subscription.stripe_sync_error}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">La cantidad cobrada en Stripe puede estar desactualizada — revísala a mano.</p>
                  </div>
                )}
                <Row label="Plan" value={planNombre} />
                <Row label="Status" value={STATUS_MAP[subscription.status]?.l || subscription.status} />
                <Row label="Máx. usuarios" value={String(subscription.max_usuarios ?? '—')} />
                {baseUsuarios != null && (
                  <Row label="Base prepagada" value={`${baseUsuarios} · extras: ${asientosExtra}`} />
                )}
                <Row label="Precio / usuario" value={fmtMXN(precioFinal)} />
                {subscription.status === 'trial' && subscription.trial_ends_at && (
                  <Row label="Fin de prueba" value={fmtDate(subscription.trial_ends_at)} />
                )}
                {subscription.status !== 'trial' && (
                  <>
                    {subscription.current_period_start && (
                      <Row label="Inicio período" value={fmtDate(subscription.current_period_start)} />
                    )}
                    {subscription.current_period_end && (
                      <Row label="Fin período" value={fmtDate(subscription.current_period_end)} />
                    )}
                  </>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-border/40">
                  <div>
                    <p className="text-sm font-medium">Acceso bloqueado</p>
                    <p className="text-xs text-muted-foreground">Impide usar la app aunque el plan esté activo.</p>
                  </div>
                  <Switch
                    checked={!!subscription.acceso_bloqueado}
                    onCheckedChange={async (v) => {
                      const { error } = await supabase.from('subscriptions')
                        .update({ acceso_bloqueado: v, updated_at: new Date().toISOString() })
                        .eq('id', subscription.id);
                      if (error) toast.error(error.message);
                      else { toast.success(v ? 'Acceso bloqueado' : 'Acceso restaurado'); load(); }
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <Tabs defaultValue={initialTab} className="space-y-4">
        <div className="-mx-3 sm:mx-0 overflow-x-auto">
          <TabsList className="border border-border/60 p-1 h-auto bg-muted/30 w-max min-w-full mx-3 sm:mx-0">
            <TabsTrigger value="usuarios" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              <Users className="h-4 w-4" /> Usuarios ({allUsers.length})
            </TabsTrigger>
            <TabsTrigger value="facturas" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              <Receipt className="h-4 w-4" /> Facturas ({facturas.length})
            </TabsTrigger>
            <TabsTrigger value="pagos" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              <Wallet className="h-4 w-4" /> Pagos ({pagos.length})
            </TabsTrigger>
            <TabsTrigger value="historial" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
              <History className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── USUARIOS ───────────────────────────────── */}
        <TabsContent value="usuarios">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { k: 'todos', l: 'Todos', cls: 'bg-muted text-foreground' },
                  { k: 'activo', l: 'Activos', cls: 'bg-green-500/10 text-green-700 dark:text-green-400' },
                  { k: 'baja', l: 'Baja', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
                  { k: 'archivado', l: 'Archivados', cls: 'bg-destructive/10 text-destructive' },
                ] as const).map(opt => {
                  const active = userStatusFilter === opt.k;
                  const n = usersCounts[opt.k] || 0;
                  return (
                    <button key={opt.k} onClick={() => setUserStatusFilter(opt.k as any)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${active ? 'bg-primary text-primary-foreground border-primary' : `${opt.cls} border-transparent hover:border-border`}`}>
                      {opt.l} <span className="opacity-70 ml-1">({n})</span>
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" disabled={forcingAll || allUsers.length === 0}
                onClick={handleForceChangeAll} className="gap-1.5">
                {forcingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Forzar cambio de contraseña a todos
              </Button>
            </div>

            {filteredUsers.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-12 text-center text-muted-foreground">Sin usuarios</CardContent>
              </Card>
            ) : (
              <div className="border border-border/60 rounded-lg overflow-x-auto bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Nombre</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Teléfono</TableHead>
                      <TableHead className="font-semibold">Rol</TableHead>
                      <TableHead className="font-semibold">Estado</TableHead>
                      <TableHead className="font-semibold">Último acceso</TableHead>
                      <TableHead className="font-semibold">Registro</TableHead>
                      <TableHead className="font-semibold text-center w-32">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u: any) => {
                      const est = classifyUser(u);
                      const estCls = est === 'activo'
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30'
                        : est === 'baja'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          : 'bg-destructive/10 text-destructive border-destructive/30';
                      const estLabel = est === 'activo' ? 'Activo' : est === 'baja' ? 'Baja' : 'Archivado';
                      return (
                        <TableRow key={u.id} className={`hover:bg-muted/30 ${est !== 'activo' ? 'opacity-70' : ''}`}>
                          <TableCell className="font-medium py-3">{u.nombre || 'Sin nombre'}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{u.telefono || '—'}</TableCell>
                          <TableCell><Badge variant="outline">{u.rol || 'Sin rol'}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="outline" className={estCls}>{estLabel}</Badge>
                              {u.archivado_en && (
                                <span className="text-[10px] text-muted-foreground">
                                  {format(new Date(u.archivado_en), 'dd MMM yyyy', { locale: es })}
                                  {u.archivado_motivo ? ` · ${u.archivado_motivo}` : ''}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy HH:mm', { locale: es }) : 'Nunca'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="outline" size="sm" className="gap-1.5"
                              onClick={() => {
                                setResetDialog({ userId: u.id, email: u.email, nombre: u.nombre || u.email });
                                setResetPassword(''); setResetForceChange(true);
                              }}>
                              <KeyRound className="h-3.5 w-3.5" /> Resetear
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>



        {/* ── FACTURAS ───────────────────────────────── */}
        <TabsContent value="facturas">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button onClick={openSubInvoice} className="gap-1.5">
                <Receipt className="h-4 w-4" /> Nueva factura
              </Button>
            </div>

            {facturas.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-12 text-center text-muted-foreground">Sin facturas</CardContent>
              </Card>
            ) : (
              <div className="border border-border/60 rounded-lg overflow-x-auto bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Folio</TableHead>
                      <TableHead>Concepto / período</TableHead>
                      <TableHead>Emitida</TableHead>
                      <TableHead>Vence</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...facturas].sort((a, b) => new Date(b.creado_en || b.fecha_emision || 0).getTime() - new Date(a.creado_en || a.fecha_emision || 0).getTime()).map(f => {
                      const stripeMatch = stripeInvoices.find((si: any) => si.id === f.stripe_invoice_id);
                      const hostedUrl = stripeMatch?.hosted_invoice_url || null;
                      const isPending = (f.estado || 'pendiente') !== 'pagada' && f.estado !== 'cancelada';
                      const periodo = f.periodo_inicio && f.periodo_fin
                        ? `${fmtDate(f.periodo_inicio, 'dd MMM')} – ${fmtDate(f.periodo_fin)}`
                        : `${f.num_usuarios ?? '—'} usuarios`;
                      return (
                        <TableRow key={f.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono font-semibold text-sm">{f.numero_factura || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                            <div className="truncate font-medium text-foreground/80">{f.concepto || 'Suscripción Rutapp'}</div>
                            <div className="truncate text-xs">{periodo}</div>
                          </TableCell>
                          <TableCell className="text-sm">{f.fecha_emision ? fmtDate(f.fecha_emision) : '—'}</TableCell>
                          <TableCell className="text-sm">{f.fecha_vencimiento ? fmtDate(f.fecha_vencimiento) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{fmtMXN(Number(f.total || 0))}</TableCell>
                          <TableCell>{estadoFacturaBadge(f.estado || 'pendiente')}</TableCell>
                          <TableCell className="text-xs">
                            {f.estado === 'pagada' ? (
                              <div className="flex flex-col">
                                <span className="capitalize font-medium">{f.metodo_pago || (f.stripe_payment_intent_id || f.stripe_invoice_id ? 'Stripe' : '—')}</span>
                                {f.referencia_pago && (
                                  <span className="text-muted-foreground font-mono truncate max-w-[140px]" title={f.referencia_pago}>{f.referencia_pago}</span>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground">{f.stripe_invoice_id ? 'Stripe' : 'Manual'}</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              {isPending && (
                                <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openMarkPaid(f)}>
                                  ✓ Aplicar pago
                                </Button>
                              )}
                              {isPending && hostedUrl && (
                                <>
                                  <Button size="sm" variant="ghost" title="Copiar link"
                                    onClick={() => { navigator.clipboard.writeText(hostedUrl); toast.success('Link copiado'); }}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8" disabled={sendingWaId === f.id} title="Enviar por WhatsApp"
                                    onClick={async () => {
                                      const tel = (empresa?.telefono || '').replace(/\D/g, '');
                                      if (!tel) { toast.error('La empresa no tiene teléfono registrado'); return; }
                                      try {
                                        setSendingWaId(f.id);
                                        const { data, error } = await supabase.functions.invoke('admin-billing', {
                                          body: {
                                            action: 'send_invoice_notification', channel: 'whatsapp', phone_override: tel,
                                            empresa_id: empresaId, empresa_nombre: empresa?.nombre || '',
                                            folio: f.numero_factura || '', fecha_vencimiento: f.fecha_vencimiento || null,
                                            amount: Math.round(Number(f.total || 0) * 100), hosted_url: hostedUrl,
                                            invoice_id: f.stripe_invoice_id || null, description: `Factura ${f.numero_factura || ''}`,
                                          },
                                        });
                                        if (error) throw error;
                                        if (data?.success === false) throw new Error(data?.error || 'Error');
                                        toast.success('WhatsApp enviado ✅');
                                      } catch (e: any) { toast.error(`No se pudo enviar: ${e.message || e}`); }
                                      finally { setSendingWaId(null); }
                                    }}>
                                    {sendingWaId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button size="sm" variant="ghost" asChild title="Abrir página de pago">
                                    <a href={hostedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                                  </Button>
                                </>
                              )}
                              {f.estado === 'pagada' && <span className="text-xs text-emerald-700 font-medium px-2">✓ Pagada</span>}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Editar factura"
                                onClick={() => openEditFactura(f)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="Eliminar factura"
                                onClick={() => setConfirmDeleteFactura(f)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── PAGOS (estado de cuenta) ───────────────── */}
        <TabsContent value="pagos">
          {pagos.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center text-muted-foreground">Sin pagos registrados</CardContent>
            </Card>
          ) : (
            <div className="border border-border/60 rounded-lg overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Referencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagos.map(p => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{p.fecha ? format(new Date(p.fecha), 'dd MMM yyyy', { locale: es }) : '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{p.factura || '—'}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">{fmtMXN(p.monto)}</TableCell>
                      <TableCell className="capitalize text-sm">{p.metodo}</TableCell>
                      <TableCell>
                        <Badge variant={p.origen === 'automatico' ? 'default' : 'outline'} className="text-xs capitalize">
                          {p.origen}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{p.referencia || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── HISTÓRICO ──────────────────────────────── */}
        <TabsContent value="historial">
          {historial.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center text-muted-foreground">Sin movimientos</CardContent>
            </Card>
          ) : (
            <Card className="border-border/60">
              <CardContent className="pt-6">
                <ol className="relative border-l border-border/60 ml-3 space-y-4">
                  {historial.map((h, i) => (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                      <p className="text-sm font-medium">{h.accion}</p>
                      <p className="text-xs text-muted-foreground">{h.detalle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(h.fecha), 'dd MMM yyyy HH:mm', { locale: es })}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─────── Dialog: Editar Datos Empresa ─────── */}
      <Dialog open={editDatosOpen} onOpenChange={setEditDatosOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Editar datos de empresa
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {[
              { key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Email' },
              { key: 'telefono', label: 'Teléfono' }, { key: 'rfc', label: 'RFC' },
              { key: 'razon_social', label: 'Razón Social' }, { key: 'direccion', label: 'Dirección' },
              { key: 'cp', label: 'C.P.' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'estado', label: 'Estado' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <Input value={empresaForm[key] || ''} onChange={e => setEmpresaForm((f: any) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditDatosOpen(false)} disabled={savingEmpresa}>Cancelar</Button>
            <Button onClick={saveEmpresa} disabled={savingEmpresa}>
              {savingEmpresa && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Dialog: Editar Plan / Suscripción ─────── */}
      <Dialog open={editPlanOpen} onOpenChange={setEditPlanOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Editar plan
            </DialogTitle>
            <DialogDescription>Cambios aplican a la suscripción de {empresa.nombre}.</DialogDescription>
          </DialogHeader>
          {subscription && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm">Plan</Label>
                  <Select value={subForm.plan_id} onValueChange={v => setSubForm((f: any) => ({ ...f, plan_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Sin plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre} — ${p.precio_por_usuario}/usr × {p.meses} {p.meses === 1 ? 'mes' : 'meses'}
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Descuento %</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={subForm.descuento_porcentaje}
                    onChange={e => setSubForm((f: any) => ({ ...f, descuento_porcentaje: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
                </div>
                {subForm.status === 'trial' ? (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fin de prueba</Label>
                    <Input type="date" value={subForm.trial_ends_at}
                      onChange={e => setSubForm((f: any) => ({ ...f, trial_ends_at: e.target.value }))} />
                  </div>
                ) : (
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
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Acceso bloqueado</p>
                  <p className="text-xs text-muted-foreground">
                    Si está activo, la empresa no puede usar la app aunque el status sea Activa.
                    Desactívalo al confirmar el pago o para dar acceso manual.
                  </p>
                </div>
                <Switch checked={!!subForm.acceso_bloqueado}
                  onCheckedChange={(v) => setSubForm((f: any) => ({ ...f, acceso_bloqueado: !!v }))} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditPlanOpen(false)} disabled={savingSub}>Cancelar</Button>
            <Button onClick={saveSub} disabled={savingSub}>
              {savingSub && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Dialog: Nueva factura ─────── */}
      <Dialog open={showSubInvoice} onOpenChange={setShowSubInvoice}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Nueva factura
            </DialogTitle>
            <DialogDescription>
              Para <strong>{empresa?.nombre}</strong>. Al pagarse, el plan se activa/extiende automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <Checkbox id="crear-stripe" checked={subInvoiceForm.crear_con_stripe}
                  onCheckedChange={(v) => setSubInvoiceForm(f => ({ ...f, crear_con_stripe: !!v }))} />
                <label htmlFor="crear-stripe" className="text-sm cursor-pointer leading-tight">
                  <span className="font-medium">Crear con Stripe y enviar cobro</span><br />
                  <span className="text-muted-foreground text-xs">
                    Si lo desactivas, se crea solo como factura pendiente manual para transferencia/efectivo.
                  </span>
                </label>
              </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={subInvoiceForm.plan_id} onChange={e => applyPlanToInvoice(e.target.value)}>
                <option value="">— Personalizado —</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.meses} {p.meses === 1 ? 'mes' : 'meses'} · ${p.precio_por_usuario}/usuario/mes
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meses</Label>
                <Input type="number" min={1} value={subInvoiceForm.meses}
                  onChange={e => updateInvoiceMeses(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="space-y-1.5">
                <Label>Usuarios</Label>
                <Input type="number" min={1} value={subInvoiceForm.num_usuarios}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, num_usuarios: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Precio / usuario / mes</Label>
                <Input type="number" min={0} step="0.01" value={subInvoiceForm.precio_por_usuario_mes}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, precio_por_usuario_mes: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Descuento (%)</Label>
                <Input type="number" min={0} max={100} step="0.01" value={subInvoiceForm.descuento_pct}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, descuento_pct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
              </div>
              <div className="col-span-2 flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <Checkbox id="desc-permanente" checked={subInvoiceForm.descuento_permanente}
                  onCheckedChange={(v) => setSubInvoiceForm(f => ({ ...f, descuento_permanente: !!v }))}
                  disabled={subInvoiceForm.descuento_pct <= 0} />
                <label htmlFor="desc-permanente" className="text-sm cursor-pointer leading-tight">
                  <span className="font-medium">Aplicar descuento permanente</span><br />
                  <span className="text-muted-foreground text-xs">
                    {subInvoiceForm.descuento_permanente
                      ? 'El descuento se mantendrá en cobros futuros.'
                      : 'Solo para esta factura.'}
                  </span>
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>Período: inicio</Label>
                <Input type="date" value={subInvoiceForm.periodo_inicio}
                  onChange={e => updateInvoicePeriodoInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Período: fin</Label>
                <Input type="date" value={subInvoiceForm.periodo_fin}
                  onChange={e => setSubInvoiceForm(f => ({ ...f, periodo_fin: e.target.value }))} />
              </div>
              <div className="col-span-2 -mt-1 text-xs text-muted-foreground">
                Al pagarse, la suscripción quedará vigente del{' '}
                <strong>{fmtDate(subInvoiceForm.periodo_inicio)}</strong>
                {' '}al{' '}
                <strong>{fmtDate(subInvoiceForm.periodo_fin)}</strong>.
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
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span>{fmtMXN(subInvoiceSubtotal)}</span>
              </div>
              {subInvoiceForm.descuento_pct > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento ({subInvoiceForm.descuento_pct}%)</span><span>-{fmtMXN(subInvoiceDescMonto)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span><span className="text-primary">{fmtMXN(subInvoiceTotal)}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowSubInvoice(false)} disabled={creatingSubInvoice}>Cancelar</Button>
            <Button onClick={handleCreateSubInvoice} disabled={creatingSubInvoice}>
              {creatingSubInvoice ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Receipt className="h-4 w-4 mr-1.5" />}
              {subInvoiceForm.crear_con_stripe ? 'Crear y cobrar con Stripe' : 'Crear pendiente manual'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Dialog: Reset Password ─────── */}
      <Dialog open={!!resetDialog} onOpenChange={open => { if (!open) setResetDialog(null); }}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Restablecer contraseña</DialogTitle>
            <DialogDescription>{resetDialog?.nombre} — <span className="font-mono">{resetDialog?.email}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Nueva contraseña temporal</Label>
              <Input type="text" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres" className="font-mono text-base" />
            </div>
            <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
              <Checkbox id="force-change" checked={resetForceChange} onCheckedChange={(v) => setResetForceChange(!!v)} />
              <label htmlFor="force-change" className="text-sm cursor-pointer leading-tight">
                <span className="font-medium">Forzar cambio al iniciar sesión</span><br />
                <span className="text-muted-foreground text-xs">El usuario verá un modal para crear una nueva contraseña</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setResetDialog(null)}>Cancelar</Button>
              <Button disabled={resettingPw || resetPassword.length < 6} onClick={handleResetPassword}>
                {resettingPw ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Restablecer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Dialog: Aplicar pago ─────── */}
      <Dialog open={!!markPaidFactura} onOpenChange={(o) => !o && setMarkPaidFactura(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aplicar pago a factura</DialogTitle>
            <DialogDescription>
              {markPaidFactura?.numero_factura ? `Factura ${markPaidFactura.numero_factura}` : 'Factura interna'}
              {' · '}
              <span className="font-semibold text-primary">
                {markPaidFactura?.total != null ? fmtMXN(Number(markPaidFactura.total)) : ''}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Método de pago</Label>
              <Select value={markPaidForm.metodo_pago} onValueChange={(v) => setMarkPaidForm((f) => ({ ...f, metodo_pago: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="deposito">Depósito</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Fecha de pago</Label>
              <Input type="date" value={markPaidForm.fecha_pago} onChange={(e) => setMarkPaidForm((f) => ({ ...f, fecha_pago: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Referencia</Label>
              <Input placeholder="Ej: ABC-1234" value={markPaidForm.referencia_pago}
                onChange={(e) => setMarkPaidForm((f) => ({ ...f, referencia_pago: e.target.value }))} />
            </div>
            {markPaidFactura?.stripe_invoice_id && (
              <div className="flex items-start gap-2 rounded-lg border p-3 bg-muted/30">
                <Checkbox id="reflect-stripe" checked={markPaidForm.reflect_in_stripe}
                  onCheckedChange={(v) => setMarkPaidForm((f) => ({ ...f, reflect_in_stripe: !!v }))} />
                <div className="flex-1">
                  <Label htmlFor="reflect-stripe" className="text-sm cursor-pointer font-medium">Reflejar también en Stripe</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Marca la factura como "paid out of band".</p>
                </div>
              </div>
            )}
            {!markPaidFactura?.es_prorrateo && (
              <div className="flex items-start gap-2 rounded-lg border p-3 bg-emerald-50">
                <Checkbox id="extender-periodo" checked={markPaidForm.extender_periodo}
                  onCheckedChange={(v) => setMarkPaidForm((f) => ({ ...f, extender_periodo: !!v }))} />
                <div className="flex-1">
                  <Label htmlFor="extender-periodo" className="text-sm cursor-pointer font-medium">Extender período</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Mueve "Fin período" según los meses cubiertos.</p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMarkPaidFactura(null)} disabled={markingPaid}>Cancelar</Button>
              <Button onClick={handleMarkPaid} disabled={markingPaid}>
                {markingPaid ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : '✓ '} Registrar pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Dialog: Editar factura ─────── */}
      <Dialog open={!!editFactura} onOpenChange={(o) => !o && setEditFactura(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar factura</DialogTitle>
            <DialogDescription>
              Los cambios solo aplican localmente. No se reflejan en Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Folio</Label>
                <Input value={editFacturaForm.numero_factura || ''}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, numero_factura: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Select value={editFacturaForm.estado}
                  onValueChange={v => setEditFacturaForm((f: any) => ({ ...f, estado: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="pagada">Pagada</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="fallida">Fallida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Concepto</Label>
              <Input value={editFacturaForm.concepto || ''}
                onChange={e => setEditFacturaForm((f: any) => ({ ...f, concepto: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Usuarios</Label>
                <Input type="number" min={1} value={editFacturaForm.num_usuarios}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, num_usuarios: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
              <div>
                <Label className="text-xs">Precio/usuario</Label>
                <Input type="number" step="0.01" value={editFacturaForm.precio_unitario}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, precio_unitario: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label className="text-xs">Total (MXN)</Label>
                <Input type="number" step="0.01" value={editFacturaForm.total}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, total: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Período inicio</Label>
                <Input type="date" value={editFacturaForm.periodo_inicio}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, periodo_inicio: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Período fin</Label>
                <Input type="date" value={editFacturaForm.periodo_fin}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, periodo_fin: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Vencimiento</Label>
                <Input type="date" value={editFacturaForm.fecha_vencimiento}
                  onChange={e => setEditFacturaForm((f: any) => ({ ...f, fecha_vencimiento: e.target.value }))} />
              </div>
            </div>
            {editFacturaForm.estado === 'pagada' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Método de pago</Label>
                  <Select value={editFacturaForm.metodo_pago || 'transferencia'}
                    onValueChange={v => setEditFacturaForm((f: any) => ({ ...f, metodo_pago: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Referencia</Label>
                  <Input value={editFacturaForm.referencia_pago || ''}
                    onChange={e => setEditFacturaForm((f: any) => ({ ...f, referencia_pago: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditFactura(null)} disabled={savingFactura}>Cancelar</Button>
            <Button onClick={handleSaveFactura} disabled={savingFactura}>
              {savingFactura && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────── Confirmar eliminar factura ─────── */}
      <AlertDialog open={!!confirmDeleteFactura} onOpenChange={(o) => !o && setConfirmDeleteFactura(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la factura <strong>{confirmDeleteFactura?.numero_factura || 'sin folio'}</strong> por{' '}
              <strong>{fmtMXN(Number(confirmDeleteFactura?.total || 0))}</strong>. Esta acción no se puede deshacer
              y no afecta a Stripe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingFacturaId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingFacturaId}
              onClick={(e) => { e.preventDefault(); if (confirmDeleteFactura) handleDeleteFactura(confirmDeleteFactura); }}>
              {deletingFacturaId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground font-medium text-sm break-words">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: { icon?: any; label: string; value: string; sub?: string; tone?: 'success' | 'danger' }) {
  const toneCls =
    tone === 'success' ? 'text-emerald-700' :
    tone === 'danger' ? 'text-destructive' :
    'text-foreground';
  const bgCls =
    tone === 'success' ? 'bg-emerald-50 border-emerald-200' :
    tone === 'danger' ? 'bg-red-50 border-red-200' :
    'bg-card border-border/60';
  return (
    <Card className={`border ${bgCls} shadow-sm`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span>{label}</span>
        </div>
        <p className={`text-2xl font-bold ${toneCls} leading-tight`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
