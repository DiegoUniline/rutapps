import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CalendarClock, CheckCircle2,
  Clipboard, Download, Eye, Filter, Gift, History,
  Loader2, Mail, MessageCircle, Phone, RefreshCw, Search, ShieldCheck,
  Sparkles, Target, Trash2, Users,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn, fmtNum } from '@/lib/utils';
import {
  TRIAL_CRM_STAGES, TRIAL_CRM_STAGE_INFO, TRIAL_SETUP_INFO,
  canDeleteTrialLead, canOfferTrialLead, normalizeWhatsappPhone, trialLeadPriority,
  type TrialCrmStage, type TrialSetupLevel,
} from '@/lib/adminTrialCrm';

interface TrialCrmLead {
  empresa_id: string;
  nombre: string;
  licencia: string | null;
  email: string | null;
  telefono: string | null;
  created_at: string;
  age_days: number;
  onboarding_completado: boolean | null;
  all_sales: number;
  valid_sales: number;
  draft_sales: number;
  last_sale_record_at: string | null;
  products: number;
  active_products: number;
  last_product_at: string | null;
  clients: number;
  last_client_at: string | null;
  users: number;
  last_sign_in_at: string | null;
  days_since_login: number | null;
  invoices: number;
  paid_invoices: number;
  paid_total: number;
  last_payment_at: string | null;
  subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  fecha_vencimiento: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  manual_subscription: boolean;
  access_blocked: boolean;
  crm_stage: TrialCrmStage;
  assigned_to: string | null;
  assigned_name: string | null;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  contact_attempts: number;
  notes: string | null;
  coupon_id: string | null;
  coupon_code: string | null;
  coupon_discount_pct: number | null;
  coupon_months: number | null;
  coupon_expires_at: string | null;
  coupon_active: boolean;
  last_activity_type: string | null;
  last_activity_outcome: string | null;
  last_activity_note: string | null;
  last_activity_at: string | null;
  setup_level: TrialSetupLevel;
  activation_score: number;
  deletion_eligible: boolean;
}

interface TrialCrmSnapshot {
  generated_at: string;
  metrics: {
    total: number;
    uncontacted: number;
    overdue_followups: number;
    registered_7d: number;
    registered_30d: number;
    with_setup: number;
    almost_ready: number;
    expired_trial: number;
    offers_active: number;
    deletion_eligible: number;
  };
  stages: Partial<Record<TrialCrmStage, number>>;
  monthly_signups: Array<{ month: string; signups: number }>;
  assignees: Array<{ id: string; name: string }>;
  leads: TrialCrmLead[];
}

interface TrialCrmActivity {
  id: string;
  activity_type: string;
  outcome: string | null;
  note: string | null;
  previous_stage: string | null;
  new_stage: string | null;
  created_at: string;
  created_by: string | null;
}

interface OfferResult {
  code: string;
  discount_pct: number;
  months: number;
  expires_at: string;
}

type RpcResponse = { data: unknown; error: { message: string } | null };
const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<RpcResponse>;
};

const dateLabel = (value?: string | null, pattern = 'dd MMM yyyy') => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, pattern, { locale: es });
};

const datetimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm");
};

const errorText = (error: unknown) => {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '');
  if (message.includes('fn_admin_trial_crm_') || message.includes('schema cache')) {
    return 'Falta instalar la migración SQL del CRM en Supabase.';
  }
  return message || 'Ocurrió un error inesperado.';
};

const SUBSCRIPTION_LABELS: Record<string, string> = {
  trial: 'Prueba', active: 'Activa', past_due: 'Pago vencido', suspended: 'Suspendida',
  cancelada: 'Cancelada', cancelled: 'Cancelada', pendiente_pago: 'Pago pendiente',
  sin_suscripcion: 'Sin suscripción',
};

function StageBadge({ stage }: { stage: TrialCrmStage }) {
  const info = TRIAL_CRM_STAGE_INFO[stage];
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold', info.badgeClass)}>{info.label}</span>;
}

function SetupBadge({ level }: { level: TrialSetupLevel }) {
  const info = TRIAL_SETUP_INFO[level];
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold', info.badgeClass)}>{info.label}</span>;
}

function Kpi({ label, value, detail, icon: Icon, tone }: {
  label: string; value: string; detail: string; icon: typeof Users;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-600', green: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600', red: 'bg-red-500/10 text-red-600',
    violet: 'bg-violet-500/10 text-violet-600',
  };
  return (
    <Card className="border-border/70"><CardContent className="p-4">
      <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black tabular-nums">{value}</p></div><div className={cn('rounded-lg p-2', tones[tone])}><Icon className="h-4 w-4" /></div></div>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{detail}</p>
    </CardContent></Card>
  );
}

function ContactButtons({ lead }: { lead: TrialCrmLead }) {
  const whatsapp = normalizeWhatsappPhone(lead.telefono);
  const message = encodeURIComponent(`Hola, ${lead.nombre}. Soy del equipo de RutApp. Vimos que creaste tu cuenta y queremos ayudarte a dejarla lista para que puedas probar el sistema correctamente.`);
  return (
    <div className="flex flex-wrap gap-2">
      {lead.telefono && <Button asChild size="sm" variant="outline"><a href={`tel:${lead.telefono}`}><Phone className="mr-1.5 h-3.5 w-3.5" /> Llamar</a></Button>}
      {whatsapp && <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700"><a href={`https://wa.me/${whatsapp}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp</a></Button>}
      {lead.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${lead.email}?subject=${encodeURIComponent('Te ayudamos a comenzar con RutApp')}`}><Mail className="mr-1.5 h-3.5 w-3.5" /> Correo</a></Button>}
    </div>
  );
}

function LeadDetailView({
  lead, assignees, onBack, onUpdated, onOffer, onDelete,
}: {
  lead: TrialCrmLead;
  assignees: TrialCrmSnapshot['assignees'];
  onBack: () => void;
  onUpdated: () => Promise<void>;
  onOffer: (lead: TrialCrmLead) => void;
  onDelete: (lead: TrialCrmLead) => void;
}) {
  const [stage, setStage] = useState<TrialCrmStage>('sin_contactar');
  const [assignedTo, setAssignedTo] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [activityType, setActivityType] = useState('call');
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<TrialCrmActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await rpcClient.rpc('fn_admin_trial_crm_history', { p_empresa_id: lead.empresa_id });
      if (error) throw error;
      setHistory(Array.isArray(data) ? data as TrialCrmActivity[] : []);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setStage(lead.crm_stage);
    setAssignedTo(lead.assigned_to ?? '');
    setNextFollowUp(datetimeLocal(lead.next_follow_up_at));
    setActivityType('call');
    setOutcome('');
    setNote('');
    void loadHistory();
    // Refreshes the routed record after follow-ups or offers update its activity stamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.empresa_id, lead.crm_stage, lead.assigned_to, lead.next_follow_up_at, lead.last_activity_at]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await rpcClient.rpc('fn_admin_trial_crm_save', {
        p_empresa_id: lead.empresa_id,
        p_stage: stage,
        p_assigned_to: assignedTo || null,
        p_next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
        p_note: note || null,
        p_activity_type: activityType,
        p_outcome: outcome || null,
      });
      if (error) throw error;
      toast.success('Seguimiento guardado');
      await onUpdated();
      setOutcome('');
      setNote('');
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };

  const canDelete = canDeleteTrialLead({
    stage: lead.crm_stage, deletionEligible: lead.deletion_eligible,
    validSales: lead.valid_sales, paidInvoices: lead.paid_invoices,
    stripeSubscriptionId: lead.stripe_subscription_id,
  });
  const canOffer = canOfferTrialLead({
    validSales: lead.valid_sales, paidInvoices: lead.paid_invoices,
    stripeSubscriptionId: lead.stripe_subscription_id,
    subscriptionStatus: lead.subscription_status,
  });

  const paidTotal = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(lead.paid_total || 0);

  return (
    <div className="space-y-5">
      <Button variant="ghost" className="-ml-2" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Volver al CRM</Button>

      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Target className="h-5 w-5 text-primary" /><h1 className="truncate text-2xl font-black">{lead.nombre}</h1><StageBadge stage={lead.crm_stage} /><SetupBadge level={lead.setup_level} /></div>
              <p className="mt-1 text-sm text-muted-foreground">Licencia {lead.licencia || 'sin asignar'} · Alta {dateLabel(lead.created_at)} · {lead.age_days} días sin primera venta operativa</p>
            </div>
            <div className="flex flex-wrap gap-2"><ContactButtons lead={lead} /><Button onClick={() => onOffer(lead)} disabled={!canOffer}><Gift className="mr-2 h-4 w-4" />{lead.coupon_active ? 'Reemplazar oferta' : 'Crear oferta'}</Button></div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border/70 bg-card/70 md:grid-cols-4">
          <div className="border-r border-border/70 p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Activación</p><p className="mt-1 text-xl font-black">{lead.activation_score}/100</p></div>
          <div className="border-r border-border/70 p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Intentos</p><p className="mt-1 text-xl font-black">{fmtNum(lead.contact_attempts)}</p></div>
          <div className="border-r border-border/70 p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Seguimiento</p><p className="mt-1 text-sm font-black">{dateLabel(lead.next_follow_up_at, 'dd MMM HH:mm')}</p></div>
          <div className="p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Responsable</p><p className={cn('mt-1 text-sm font-black', !lead.assigned_name && 'text-red-600')}>{lead.assigned_name || 'Sin asignar'}</p></div>
        </div>
      </section>

      <Tabs defaultValue="resumen" className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-1">
          <TabsList className="h-auto w-max min-w-full justify-start bg-transparent">
            <TabsTrigger value="resumen" className="gap-2"><BarChart3 className="h-4 w-4" />Resumen</TabsTrigger>
            <TabsTrigger value="seguimiento" className="gap-2"><CalendarClock className="h-4 w-4" />Seguimiento</TabsTrigger>
            <TabsTrigger value="oferta" className="gap-2"><Gift className="h-4 w-4" />Oferta</TabsTrigger>
            <TabsTrigger value="historial" className="gap-2"><History className="h-4 w-4" />Historial ({history.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <Card><CardContent className="p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="font-bold">Contacto principal</h3><p className="mt-1 text-sm">{lead.telefono || 'Sin teléfono'}</p><p className="text-sm text-muted-foreground">{lead.email || 'Sin correo'}</p></div><ContactButtons lead={lead} /></div></CardContent></Card>
              <Card><CardContent className="p-5"><h3 className="font-bold">Huella de activación</h3><p className="mt-1 text-xs text-muted-foreground">Qué tanto configuró antes de abandonar el proceso.</p><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${lead.activation_score}%` }} /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Productos</p><b className="text-lg">{fmtNum(lead.products)}</b><p className="text-[10px] text-muted-foreground">{fmtNum(lead.active_products)} activos</p></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Clientes</p><b className="text-lg">{fmtNum(lead.clients)}</b></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Borradores</p><b className="text-lg">{fmtNum(lead.draft_sales)}</b></div><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Usuarios</p><b className="text-lg">{fmtNum(lead.users)}</b></div></div></CardContent></Card>
              <Card><CardContent className="p-5"><h3 className="font-bold">Cronología de adopción</h3><div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2"><p className="flex justify-between gap-4"><span className="text-muted-foreground">Fecha de alta</span><b>{dateLabel(lead.created_at, 'dd MMM yyyy HH:mm')}</b></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Último acceso</span><b>{dateLabel(lead.last_sign_in_at, 'dd MMM yyyy HH:mm')}</b></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Último producto</span><b>{dateLabel(lead.last_product_at)}</b></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Último cliente</span><b>{dateLabel(lead.last_client_at)}</b></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Último borrador</span><b>{dateLabel(lead.last_sale_record_at)}</b></p><p className="flex justify-between gap-4"><span className="text-muted-foreground">Prueba termina</span><b>{dateLabel(lead.trial_ends_at)}</b></p></div></CardContent></Card>
            </div>
            <div className="space-y-4">
              <Card><CardContent className="p-5"><p className="text-[10px] font-bold uppercase text-muted-foreground">Estado comercial</p><div className="mt-2"><StageBadge stage={lead.crm_stage} /></div><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Responsable</dt><dd className="font-bold">{lead.assigned_name || 'Sin asignar'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Último contacto</dt><dd className="font-bold">{dateLabel(lead.last_contact_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Próxima acción</dt><dd className="font-bold">{dateLabel(lead.next_follow_up_at, 'dd MMM HH:mm')}</dd></div></dl>{lead.notes && <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs"><p className="font-bold">Nota vigente</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lead.notes}</p></div>}</CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-[10px] font-bold uppercase text-muted-foreground">Suscripción y cobros</p><p className="mt-1 text-lg font-black">{SUBSCRIPTION_LABELS[lead.subscription_status] || lead.subscription_status}</p><div className="mt-4 space-y-2 text-xs"><p className="flex justify-between"><span>Facturas</span><b>{fmtNum(lead.invoices)}</b></p><p className="flex justify-between"><span>Pagadas</span><b>{fmtNum(lead.paid_invoices)}</b></p><p className="flex justify-between"><span>Total pagado</span><b>{paidTotal}</b></p><p className="flex justify-between"><span>Último pago</span><b>{dateLabel(lead.last_payment_at)}</b></p><p className="flex justify-between"><span>Periodo actual</span><b>{dateLabel(lead.current_period_end)}</b></p><p className="flex justify-between"><span>Vencimiento</span><b>{dateLabel(lead.fecha_vencimiento)}</b></p></div><div className="mt-4 space-y-1 rounded-lg bg-muted/50 p-3 text-[10px] text-muted-foreground"><p className="break-all">Stripe customer: {lead.stripe_customer_id || '—'}</p><p className="break-all">Stripe subscription: {lead.stripe_subscription_id || '—'}</p><p>Suscripción manual: {lead.manual_subscription ? 'Sí' : 'No'} · Acceso bloqueado: {lead.access_blocked ? 'Sí' : 'No'}</p></div></CardContent></Card>
              <div className={cn('rounded-xl border p-4', canDelete ? 'border-red-500/30 bg-red-500/[0.035]' : 'border-border bg-muted/20')}><div className="flex items-center gap-2"><ShieldCheck className={cn('h-4 w-4', canDelete ? 'text-red-600' : 'text-muted-foreground')} /><p className="font-bold text-sm">Depuración protegida</p></div><p className="mt-2 text-[11px] text-muted-foreground">{canDelete ? 'Cumple las condiciones comerciales y técnicas para solicitar eliminación.' : 'Sólo se habilita sin ventas, pagos ni Stripe, después de marcar No interesado o Descartado.'}</p><Button className="mt-3 w-full" size="sm" variant="destructive" disabled={!canDelete} onClick={() => onDelete(lead)}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar empresa y datos</Button></div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seguimiento">
          <Card><CardContent className="p-5 sm:p-6"><div><h3 className="text-lg font-black">Registrar seguimiento</h3><p className="text-sm text-muted-foreground">La etapa, responsable, resultado y siguiente compromiso quedan auditados.</p></div><div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"><div><Label>Etapa comercial</Label><select value={stage} onChange={e => setStage(e.target.value as TrialCrmStage)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{TRIAL_CRM_STAGES.map(value => <option key={value} value={value}>{TRIAL_CRM_STAGE_INFO[value].label}</option>)}</select></div><div><Label>Responsable</Label><select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Sin asignar</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div><div><Label>Actividad realizada</Label><select value={activityType} onChange={e => setActivityType(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="call">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="note">Nota interna</option><option value="stage">Cambio de etapa</option><option value="assignment">Asignación</option></select></div><div><Label>Resultado</Label><Input value={outcome} onChange={e => setOutcome(e.target.value)} className="mt-1" placeholder="Ej. Contestó; desea una demostración" /></div><div><Label>Próximo seguimiento</Label><Input type="datetime-local" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} className="mt-1" /></div><div className="md:col-span-2"><Label>Nota comercial</Label><Textarea value={note} onChange={e => setNote(e.target.value)} className="mt-1" rows={6} placeholder="Necesidad, objeción, acuerdo y siguiente paso…" /></div></div><div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center"><ContactButtons lead={lead} /><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Guardar seguimiento</Button></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="oferta">
          <Card className="overflow-hidden border-violet-500/25"><CardContent className="p-0"><div className="bg-violet-500/[0.06] p-5 sm:p-6"><div className="flex items-center gap-2 text-violet-700"><Gift className="h-5 w-5" /><h3 className="text-lg font-black">Oferta individual de recuperación</h3></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Crea un cupón exclusivo para esta empresa. No altera su periodo de prueba, no genera un cobro y sólo se aplica cuando el prospecto continúa al checkout.</p></div><div className="grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-2"><div className="rounded-xl border border-border p-5">{lead.coupon_active ? <><p className="text-xs font-bold uppercase text-emerald-600">Oferta activa</p><p className="mt-2 font-mono text-2xl font-black">{lead.coupon_code}</p><p className="mt-2 text-sm text-muted-foreground">{lead.coupon_discount_pct}% durante {lead.coupon_months} mes(es)</p><p className="text-sm text-muted-foreground">Vigente hasta {dateLabel(lead.coupon_expires_at)}</p><Button className="mt-5" variant="outline" onClick={() => navigator.clipboard?.writeText(lead.coupon_code || '').then(() => toast.success('Código copiado'))}><Clipboard className="mr-2 h-4 w-4" />Copiar código</Button></> : <><p className="font-bold">Todavía no tiene una oferta</p><p className="mt-2 text-sm text-muted-foreground">Puedes definir descuento, meses de beneficio, vigencia y el motivo comercial.</p></>}</div><div className={cn('rounded-xl border p-5', canOffer ? 'border-violet-500/30 bg-violet-500/[0.035]' : 'border-amber-500/30 bg-amber-500/[0.04]')}><p className="font-bold">{canOffer ? 'Oferta permitida' : 'Cuenta protegida'}</p><p className="mt-2 text-sm text-muted-foreground">{canOffer ? 'PostgreSQL volverá a validar que no tenga ventas, pagos ni una suscripción Stripe antes de crearla.' : 'Ya existe un pago o una suscripción activa/pendiente; el CRM no permitirá regalar meses por error.'}</p><Button className="mt-5 w-full" disabled={!canOffer} onClick={() => onOffer(lead)}><Sparkles className="mr-2 h-4 w-4" />{lead.coupon_active ? 'Crear oferta de reemplazo' : 'Configurar nueva oferta'}</Button></div></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card className="overflow-hidden"><CardContent className="p-0"><div className="flex items-center justify-between gap-3 border-b border-border p-5"><div><h3 className="font-black">Historial comercial completo</h3><p className="text-xs text-muted-foreground">Llamadas, mensajes, cambios de etapa, asignaciones y ofertas.</p></div><Button size="sm" variant="outline" onClick={() => void loadHistory()} disabled={historyLoading}><RefreshCw className={cn('mr-2 h-4 w-4', historyLoading && 'animate-spin')} />Actualizar</Button></div>{historyLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div> : history.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Todavía no hay movimientos comerciales.</p> : <div className="divide-y divide-border">{history.map(item => <div key={item.id} className="flex gap-4 p-4 sm:p-5"><div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" /><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="font-bold capitalize">{item.activity_type.replace('_', ' ')}</span><span className="text-xs text-muted-foreground">{dateLabel(item.created_at, 'dd MMM yyyy HH:mm')}</span></div>{item.outcome && <p className="mt-1 text-sm font-medium">{item.outcome}</p>}{item.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</p>}{item.new_stage && <p className="mt-2 text-[11px] text-muted-foreground">Etapa: {TRIAL_CRM_STAGE_INFO[item.new_stage as TrialCrmStage]?.label ?? item.new_stage}</p>}</div></div>)}</div>}</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminTrialCrmTab() {
  const navigate = useNavigate();
  const { empresaId: crmEmpresaId } = useParams<{ empresaId?: string }>();
  const [snapshot, setSnapshot] = useState<TrialCrmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<'todos' | TrialCrmStage>('todos');
  const [setup, setSetup] = useState<'todos' | TrialSetupLevel>('todos');
  const [age, setAge] = useState('todos');
  const [assigned, setAssigned] = useState('todos');
  const [special, setSpecial] = useState('todos');
  const [visibleRows, setVisibleRows] = useState(100);
  const [offerLead, setOfferLead] = useState<TrialCrmLead | null>(null);
  const [offer, setOffer] = useState({ discount: 20, months: 2, validDays: 7, note: '' });
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerResult, setOfferResult] = useState<OfferResult | null>(null);
  const [deleteLead, setDeleteLead] = useState<TrialCrmLead | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await rpcClient.rpc('fn_admin_trial_crm_snapshot', { p_min_age_days: 0, p_max_age_days: 36500 });
      if (error) throw error;
      setSnapshot(data as TrialCrmSnapshot);
    } catch (error) { toast.error(errorText(error)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const leads = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    const now = Date.now();
    return (snapshot?.leads ?? []).filter(lead => {
      if (stage !== 'todos' && lead.crm_stage !== stage) return false;
      if (setup !== 'todos' && lead.setup_level !== setup) return false;
      if (assigned !== 'todos' && (assigned === 'sin_asignar' ? !!lead.assigned_to : lead.assigned_to !== assigned)) return false;
      if (age !== 'todos') {
        const [min, max] = age.split('-').map(Number);
        if (lead.age_days < min || (Number.isFinite(max) && lead.age_days > max)) return false;
      }
      if (special === 'vencidos' && !(lead.trial_ends_at && new Date(lead.trial_ends_at).getTime() < now)) return false;
      if (special === 'seguimiento_vencido' && !(lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < now)) return false;
      if (special === 'con_oferta' && !lead.coupon_active) return false;
      const finalDeleteEligible = canDeleteTrialLead({ stage: lead.crm_stage, deletionEligible: lead.deletion_eligible, validSales: lead.valid_sales, paidInvoices: lead.paid_invoices, stripeSubscriptionId: lead.stripe_subscription_id });
      if (special === 'eliminables' && !finalDeleteEligible) return false;
      if (special === 'protegidos' && finalDeleteEligible) return false;
      return !term || `${lead.nombre} ${lead.licencia ?? ''} ${lead.email ?? ''} ${lead.telefono ?? ''} ${lead.assigned_name ?? ''}`.toLocaleLowerCase('es').includes(term);
    });
  }, [snapshot?.leads, search, stage, setup, age, assigned, special]);

  const openLead = (lead: TrialCrmLead) => navigate(`/super-admin/crm/${lead.empresa_id}`);
  const openOffer = (lead: TrialCrmLead) => {
    if (!canOfferTrialLead({ validSales: lead.valid_sales, paidInvoices: lead.paid_invoices, stripeSubscriptionId: lead.stripe_subscription_id, subscriptionStatus: lead.subscription_status })) {
      toast.error('No se puede crear una oferta de recuperación para una cuenta que ya pagó o tiene suscripción Stripe activa.');
      return;
    }
    setOfferLead(lead); setOfferResult(null); setOffer({ discount: 20, months: 2, validDays: 7, note: '' });
  };
  const openDelete = (lead: TrialCrmLead) => { setDeleteLead(lead); setDeleteReason(''); setDeleteConfirmation(''); };

  const createOffer = async () => {
    if (!offerLead) return;
    setOfferSaving(true);
    try {
      const { data, error } = await rpcClient.rpc('fn_admin_trial_crm_create_offer', {
        p_empresa_id: offerLead.empresa_id, p_discount_pct: offer.discount,
        p_months: offer.months, p_valid_days: offer.validDays, p_note: offer.note || null,
      });
      if (error) throw error;
      const result = data as OfferResult;
      setOfferResult(result);
      await navigator.clipboard?.writeText(result.code).catch(() => undefined);
      toast.success('Oferta creada y asignada; código copiado');
      await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setOfferSaving(false); }
  };

  const deleteCandidate = async () => {
    if (!deleteLead) return;
    setDeleting(true);
    try {
      const { error } = await rpcClient.rpc('fn_admin_trial_crm_delete_candidate', {
        p_empresa_id: deleteLead.empresa_id,
        p_confirmation: deleteConfirmation,
        p_reason: deleteReason,
      });
      if (error) throw error;
      toast.success(`${deleteLead.nombre} y sus datos fueron eliminados`);
      setDeleteLead(null);
      await load();
      if (crmEmpresaId === deleteLead.empresa_id) navigate('/super-admin');
    } catch (error) { toast.error(errorText(error)); }
    finally { setDeleting(false); }
  };

  const exportCsv = () => {
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Empresa', 'Licencia', 'Correo', 'Telefono', 'Alta', 'Dias', 'Etapa', 'Responsable', 'Configuracion', 'Productos', 'Clientes', 'Borradores', 'Ultimo acceso', 'Seguimiento', 'Cupon'];
    const rows = leads.map(lead => [lead.nombre, lead.licencia, lead.email, lead.telefono, lead.created_at, lead.age_days, TRIAL_CRM_STAGE_INFO[lead.crm_stage].label, lead.assigned_name, TRIAL_SETUP_INFO[lead.setup_level].label, lead.products, lead.clients, lead.draft_sales, lead.last_sign_in_at, lead.next_follow_up_at, lead.coupon_code]);
    const blob = new Blob([[header, ...rows].map(row => row.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `crm-recuperacion-${format(new Date(), 'yyyy-MM-dd')}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const metrics = snapshot?.metrics;
  const detailLead = crmEmpresaId
    ? snapshot?.leads.find(lead => lead.empresa_id === crmEmpresaId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {crmEmpresaId ? (
        loading && !snapshot ? (
          <div className="flex min-h-[520px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Cargando expediente CRM…</div>
        ) : detailLead ? (
          <LeadDetailView lead={detailLead} assignees={snapshot?.assignees ?? []} onBack={() => navigate('/super-admin')} onUpdated={load} onOffer={openOffer} onDelete={openDelete} />
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center"><AlertTriangle className="h-10 w-10 text-amber-500" /><h2 className="mt-4 text-lg font-black">Este prospecto ya no está disponible en recuperación</h2><p className="mt-2 max-w-lg text-sm text-muted-foreground">Puede haber registrado su primera venta, haber sido eliminado o la dirección no corresponde a una empresa válida.</p><Button className="mt-5" onClick={() => navigate('/super-admin')}><ArrowLeft className="mr-2 h-4 w-4" />Volver al CRM</Button></div>
        )
      ) : <>
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div><div className="flex items-center gap-2"><div className="rounded-xl bg-primary p-2.5 text-primary-foreground"><Target className="h-5 w-5" /></div><div><h2 className="text-xl font-black">CRM de recuperación</h2><p className="text-sm text-muted-foreground">Empresas registradas que todavía no tienen una venta operativa</p></div></div><p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">Organiza llamadas, asigna responsables, programa seguimientos y crea ofertas antes de depurar. Una venta borrador no se considera uso real; una venta confirmada convierte automáticamente al prospecto.</p></div>
          <div className="flex gap-2"><Button variant="outline" onClick={exportCsv} disabled={!leads.length}><Download className="mr-1.5 h-4 w-4" /> Exportar</Button><Button onClick={load} disabled={loading}>{loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Actualizar</Button></div>
        </div>
      </div>

      {loading && !snapshot ? <div className="flex min-h-[420px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Analizando altas, actividad, ventas y suscripciones…</div> : !snapshot ? <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-600"><p className="font-bold">No se pudo cargar el CRM</p><p className="mt-1">Instala la migración SQL y vuelve a intentar.</p></div> : <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Nunca vendieron" value={fmtNum(metrics?.total ?? 0)} detail="Cero ventas operativas" icon={Users} tone="blue" />
          <Kpi label="Sin contactar" value={fmtNum(metrics?.uncontacted ?? 0)} detail="Oportunidades sin atender" icon={Phone} tone="red" />
          <Kpi label="Seguimientos vencidos" value={fmtNum(metrics?.overdue_followups ?? 0)} detail="Requieren acción hoy" icon={CalendarClock} tone="amber" />
          <Kpi label="Sí exploraron" value={fmtNum(metrics?.with_setup ?? 0)} detail={`${fmtNum(metrics?.almost_ready ?? 0)} estuvieron casi listos`} icon={BarChart3} tone="violet" />
          <Kpi label="Ofertas activas" value={fmtNum(metrics?.offers_active ?? 0)} detail="Cupones individuales vigentes" icon={Gift} tone="green" />
          <Kpi label="Depurables" value={fmtNum(metrics?.deletion_eligible ?? 0)} detail="Aún requieren descarte comercial" icon={ShieldCheck} tone="red" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2"><CardContent className="p-4"><h3 className="font-bold text-sm">Altas sin activación por mes</h3><p className="text-[11px] text-muted-foreground">Permite medir si el problema de adopción está creciendo o bajando</p><ResponsiveContainer width="100%" height={230}><BarChart data={snapshot.monthly_signups}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => dateLabel(v, 'MMM yy')} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={v => dateLabel(String(v), 'MMMM yyyy')} formatter={(value: number) => [`${value} empresas`, 'Altas sin venta']} /><Bar dataKey="signups" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
          <Card><CardContent className="p-4"><h3 className="font-bold text-sm">Embudo comercial</h3><p className="text-[11px] text-muted-foreground">Haz clic para filtrar la tabla</p><div className="mt-4 space-y-2">{TRIAL_CRM_STAGES.filter(value => (snapshot.stages[value] ?? 0) > 0).map(value => <button key={value} onClick={() => setStage(value)} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-accent"><i className="h-2.5 w-2.5 rounded-full" style={{ background: TRIAL_CRM_STAGE_INFO[value].color }} /><span className="flex-1 text-left text-xs font-medium">{TRIAL_CRM_STAGE_INFO[value].label}</span><b>{snapshot.stages[value]}</b><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></button>)}</div></CardContent></Card>
        </div>

        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="border-b border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">Prospectos sin primera venta</h3><p className="text-xs text-muted-foreground">{fmtNum(leads.length)} resultados con los filtros actuales</p></div><Filter className="h-4 w-4 text-primary" /></div>
            <div className="flex flex-wrap gap-2"><div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Buscar empresa, licencia, correo, teléfono o responsable…" /></div>
              <select value={stage} onChange={e => setStage(e.target.value as 'todos' | TrialCrmStage)} className="h-10 rounded-md border border-input bg-background px-3 text-xs"><option value="todos">Todas las etapas</option>{TRIAL_CRM_STAGES.map(value => <option key={value} value={value}>{TRIAL_CRM_STAGE_INFO[value].label}</option>)}</select>
              <select value={setup} onChange={e => setSetup(e.target.value as 'todos' | TrialSetupLevel)} className="h-10 rounded-md border border-input bg-background px-3 text-xs"><option value="todos">Toda configuración</option><option value="sin_configurar">No configuró nada</option><option value="exploro">Exploró</option><option value="casi_listo">Casi listo</option></select>
              <select value={age} onChange={e => setAge(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs"><option value="todos">Cualquier antigüedad</option><option value="0-7">0–7 días</option><option value="8-30">8–30 días</option><option value="31-90">31–90 días</option><option value="91-36500">Más de 90 días</option></select>
              <select value={assigned} onChange={e => setAssigned(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs"><option value="todos">Todos los responsables</option><option value="sin_asignar">Sin asignar</option>{snapshot.assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
              <select value={special} onChange={e => setSpecial(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs"><option value="todos">Todos los casos</option><option value="seguimiento_vencido">Seguimiento vencido</option><option value="vencidos">Prueba vencida</option><option value="con_oferta">Con oferta</option><option value="eliminables">Depurables</option><option value="protegidos">Protegidos contra eliminación</option></select>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1480px] text-xs"><thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr className="border-b border-border text-muted-foreground"><th className="px-4 py-2.5 text-left">Empresa</th><th className="px-3 py-2.5 text-center">Etapa</th><th className="px-3 py-2.5 text-center">Antigüedad</th><th className="px-3 py-2.5 text-center">Uso detectado</th><th className="px-3 py-2.5 text-center">Activación</th><th className="px-3 py-2.5 text-left">Contacto</th><th className="px-3 py-2.5 text-left">Responsable</th><th className="px-3 py-2.5 text-center">Próximo seguimiento</th><th className="px-3 py-2.5 text-center">Suscripción</th><th className="px-3 py-2.5 text-center">Oferta</th><th className="px-4 py-2.5 text-center">Acciones</th></tr></thead><tbody>
            {leads.slice(0, visibleRows).map(lead => {
              const priority = trialLeadPriority({ setupLevel: lead.setup_level, ageDays: lead.age_days, followUpAt: lead.next_follow_up_at });
              const followOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now();
              return <tr key={lead.empresa_id} className="border-b border-border/70 hover:bg-primary/[0.035]"><td className="px-4 py-2.5"><div className="flex items-start gap-2"><i className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', priority === 'urgente' ? 'bg-red-500' : priority === 'alta' ? 'bg-amber-500' : 'bg-slate-300')} /><div><button onClick={() => openLead(lead)} className="font-bold text-left hover:text-primary hover:underline">{lead.nombre}</button><p className="text-[10px] text-muted-foreground">{lead.licencia || 'Sin licencia'} · Alta {dateLabel(lead.created_at)}</p></div></div></td><td className="px-3 py-2.5 text-center"><StageBadge stage={lead.crm_stage} /><p className="mt-1 text-[9px] text-muted-foreground">{lead.contact_attempts} intento(s)</p></td><td className="px-3 py-2.5 text-center"><b>{lead.age_days} días</b><p className="text-[10px] text-muted-foreground">{lead.days_since_login == null ? 'Nunca ingresó' : `Acceso hace ${lead.days_since_login} d`}</p></td><td className="px-3 py-2.5 text-center"><SetupBadge level={lead.setup_level} /><p className="mt-1 text-[9px] text-muted-foreground">{lead.products} prod · {lead.clients} clientes · {lead.draft_sales} borr.</p></td><td className="px-3 py-2.5 text-center"><div className="mx-auto h-1.5 w-20 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${lead.activation_score}%` }} /></div><b className="mt-1 block text-[10px]">{lead.activation_score}%</b></td><td className="px-3 py-2.5"><p>{lead.telefono || '—'}</p><p className="max-w-[190px] truncate text-[10px] text-muted-foreground">{lead.email || '—'}</p></td><td className="px-3 py-2.5"><p className={cn(!lead.assigned_name && 'text-red-600 font-bold')}>{lead.assigned_name || 'Sin asignar'}</p><p className="text-[10px] text-muted-foreground">{lead.last_contact_at ? `Último: ${dateLabel(lead.last_contact_at)}` : 'Sin contacto'}</p></td><td className="px-3 py-2.5 text-center"><p className={cn('font-semibold', followOverdue && 'text-red-600')}>{dateLabel(lead.next_follow_up_at, 'dd MMM HH:mm')}</p>{followOverdue && <span className="text-[9px] font-bold text-red-600">VENCIDO</span>}</td><td className="px-3 py-2.5 text-center"><Badge variant="outline" className="text-[10px]">{SUBSCRIPTION_LABELS[lead.subscription_status] || lead.subscription_status}</Badge><p className="mt-1 text-[9px] text-muted-foreground">{lead.paid_invoices} pagadas · {lead.stripe_subscription_id ? 'Stripe' : 'sin Stripe'}</p></td><td className="px-3 py-2.5 text-center">{lead.coupon_active ? <button onClick={() => openOffer(lead)} className="font-mono font-bold text-violet-600 hover:underline">{lead.coupon_code}</button> : <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openOffer(lead)}><Gift className="mr-1 h-3 w-3" /> Crear</Button>}</td><td className="px-4 py-2.5"><div className="flex justify-center gap-1"><Button size="sm" variant="outline" className="h-8 whitespace-nowrap" onClick={() => openLead(lead)}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver CRM</Button>{lead.telefono && <Button asChild size="icon" variant="ghost" className="h-8 w-8"><a href={`tel:${lead.telefono}`} title="Llamar"><Phone className="h-4 w-4" /></a></Button>}<Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openOffer(lead)} title="Crear oferta"><Gift className="h-4 w-4" /></Button></div></td></tr>;
            })}
            {!leads.length && <tr><td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">No hay prospectos que coincidan con estos filtros.</td></tr>}
          </tbody></table></div>
          {visibleRows < leads.length && <div className="border-t border-border p-3 text-center"><Button size="sm" variant="outline" onClick={() => setVisibleRows(value => value + 100)}>Mostrar 100 más</Button></div>}
        </CardContent></Card>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 text-[10px] text-muted-foreground"><span>Último cálculo: {dateLabel(snapshot.generated_at, 'dd MMM yyyy HH:mm')}</span><span>Las eliminaciones siempre se revalidan en PostgreSQL y quedan auditadas</span></div>
      </>}
      </>}

      <Dialog open={!!offerLead} onOpenChange={open => { if (!open) { setOfferLead(null); setOfferResult(null); } }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-violet-600" /> Oferta para {offerLead?.nombre}</DialogTitle><DialogDescription>Se crea un código individual y se vincula a esta empresa. El checkout lo aplicará automáticamente.</DialogDescription></DialogHeader>{offerResult ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-sm text-muted-foreground">Oferta creada correctamente</p><p className="mt-2 font-mono text-2xl font-black">{offerResult.code}</p><p className="mt-1 text-xs text-muted-foreground">{offerResult.discount_pct}% por {offerResult.months} mes(es) · vence {dateLabel(offerResult.expires_at)}</p><Button className="mt-4" variant="outline" onClick={() => navigator.clipboard?.writeText(offerResult.code).then(() => toast.success('Código copiado'))}><Clipboard className="mr-1.5 h-4 w-4" /> Copiar código</Button></div> : <div className="space-y-4"><div className="grid grid-cols-3 gap-3"><div><Label>Descuento %</Label><Input type="number" min={1} max={50} value={offer.discount} onChange={e => setOffer(v => ({ ...v, discount: Number(e.target.value) }))} /></div><div><Label>Durante meses</Label><Input type="number" min={1} max={12} value={offer.months} onChange={e => setOffer(v => ({ ...v, months: Number(e.target.value) }))} /></div><div><Label>Vence en días</Label><Input type="number" min={1} max={90} value={offer.validDays} onChange={e => setOffer(v => ({ ...v, validDays: Number(e.target.value) }))} /></div></div><div><Label>Motivo o acuerdo</Label><Textarea rows={3} value={offer.note} onChange={e => setOffer(v => ({ ...v, note: e.target.value }))} placeholder="Ej. No pudo configurar productos; ofrecer acompañamiento y 20% por 2 meses." /></div><div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-muted-foreground"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-violet-600" /> El cupón no modifica el periodo de prueba ni cobra nada por sí solo.</div></div>}<DialogFooter>{offerResult ? <Button onClick={() => { setOfferLead(null); setOfferResult(null); }}>Cerrar</Button> : <><Button variant="outline" onClick={() => setOfferLead(null)}>Cancelar</Button><Button onClick={createOffer} disabled={offerSaving || offer.discount < 1 || offer.discount > 50}>{offerSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Crear y asignar oferta</Button></>}</DialogFooter></DialogContent></Dialog>

      <Dialog open={!!deleteLead} onOpenChange={open => { if (!open) setDeleteLead(null); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /> Eliminar empresa definitivamente</DialogTitle><DialogDescription>PostgreSQL volverá a comprobar que no tenga ventas, pagos ni suscripción Stripe. Si detecta cualquiera, no eliminará nada.</DialogDescription></DialogHeader>{deleteLead && <div className="space-y-4"><div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs"><b>{deleteLead.nombre}</b><br />{deleteLead.products} productos · {deleteLead.clients} clientes · {deleteLead.users} usuarios<br /><span className="font-semibold text-red-600">También se eliminarán accesos y el contacto quedará bloqueado para otro trial.</span></div><div><Label>Motivo detallado</Label><Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} rows={3} placeholder="Ej. Confirmó por llamada que no utilizará el sistema." /></div><div><Label>Escribe exactamente para confirmar</Label><p className="my-1 rounded bg-muted px-2 py-1 font-mono text-xs">ELIMINAR {deleteLead.licencia || deleteLead.nombre}</p><Input value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setDeleteLead(null)}>Cancelar</Button><Button variant="destructive" onClick={deleteCandidate} disabled={deleting || deleteReason.trim().length < 10 || deleteConfirmation !== `ELIMINAR ${deleteLead?.licencia || deleteLead?.nombre}`}>{deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Eliminar todo</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
