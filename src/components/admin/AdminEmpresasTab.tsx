import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Search, Trash2, Stamp, CheckCircle2, XCircle, AlertCircle, Clock, Plus, User, Mail, Phone, Lock, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { confirmDialog } from '@/lib/confirm';
import { SortableTh, useSortableTable } from '@/hooks/useSortableTable';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import { ColumnVisibilityMenu, type ColumnDef, type ColumnPreset } from '@/components/ColumnVisibilityMenu';
import {
  auditSubscription,
  type AuditInvoiceSnapshot,
  type BillingAuditRecord,
  type SubscriptionAuditResult,
} from '@/lib/subscriptionAudit';

const COUNTRY_CODES = [
  { code: '+52', country: 'MX', label: '🇲🇽 México (+52)', digits: 10 },
  { code: '+34', country: 'ES', label: '🇪🇸 España (+34)', digits: 9 },
  { code: '+1', country: 'US', label: '🇺🇸 EE.UU./Canadá (+1)', digits: 10 },
  { code: '+502', country: 'GT', label: '🇬🇹 Guatemala (+502)', digits: 8 },
  { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)', digits: 10 },
  { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)', digits: 10 },
  { code: '+51', country: 'PE', label: '🇵🇪 Perú (+51)', digits: 9 },
  { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)', digits: 9 },
  { code: '+55', country: 'BR', label: '🇧🇷 Brasil (+55)', digits: 11 },
  { code: '+593', country: 'EC', label: '🇪🇨 Ecuador (+593)', digits: 9 },
  { code: '+591', country: 'BO', label: '🇧🇴 Bolivia (+591)', digits: 8 },
  { code: '+595', country: 'PY', label: '🇵🇾 Paraguay (+595)', digits: 9 },
  { code: '+598', country: 'UY', label: '🇺🇾 Uruguay (+598)', digits: 8 },
  { code: '+507', country: 'PA', label: '🇵🇦 Panamá (+507)', digits: 8 },
  { code: '+506', country: 'CR', label: '🇨🇷 Costa Rica (+506)', digits: 8 },
  { code: '+503', country: 'SV', label: '🇸🇻 El Salvador (+503)', digits: 8 },
  { code: '+504', country: 'HN', label: '🇭🇳 Honduras (+504)', digits: 8 },
  { code: '+505', country: 'NI', label: '🇳🇮 Nicaragua (+505)', digits: 8 },
  { code: '+58', country: 'VE', label: '🇻🇪 Venezuela (+58)', digits: 10 },
  { code: '+809', country: 'DO', label: '🇩🇴 Rep. Dominicana (+809)', digits: 10 },
];

interface SubRow {
  status: string | null;
  max_usuarios: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan_id: string | null;
}

interface EmpresaRow {
  id: string; nombre: string; email: string | null; telefono: string | null; created_at: string;
  timbres_saldo?: { saldo: number }[];
  subscriptions?: SubRow[];
}

interface AuditApiResponse {
  generated_at: string;
  records: BillingAuditRecord[];
}

type EmpresaColumn =
  | 'empresa'
  | 'correo'
  | 'telefono'
  | 'alta'
  | 'estado'
  | 'plan'
  | 'max_usuarios'
  | 'usuarios_rutapp'
  | 'usuarios_facturables'
  | 'usuarios_stripe'
  | 'diferencia_usuarios'
  | 'ultimo_cobro_monto'
  | 'ultimo_cobro_fecha'
  | 'ultimo_cobro_estado'
  | 'ultimo_pago_monto'
  | 'ultimo_pago_fecha'
  | 'saldo'
  | 'revision'
  | 'ultima_venta_monto'
  | 'ultima_venta_fecha'
  | 'ultima_venta_folio'
  | 'dias_sin_venta'
  | 'proximo_cobro'
  | 'proximo_cobro_estado'
  | 'timbres'
  | 'stripe_estado'
  | 'stripe_id';

type ActivityFilter = 'todas' | 'hoy' | '7' | '30' | '60' | '90' | 'sin_ventas';

const EMPRESA_COLUMNS: ColumnDef[] = [
  { key: 'empresa', label: 'Empresa', required: true, group: 'Empresa' },
  { key: 'correo', label: 'Correo', group: 'Empresa' },
  { key: 'telefono', label: 'Teléfono', group: 'Empresa' },
  { key: 'alta', label: 'Fecha de alta', group: 'Empresa' },
  { key: 'estado', label: 'Estado', group: 'Suscripción' },
  { key: 'plan', label: 'Plan contratado', group: 'Suscripción' },
  { key: 'max_usuarios', label: 'Máximo de usuarios', group: 'Suscripción' },
  { key: 'usuarios_rutapp', label: 'Usuarios activos RutApp', group: 'Suscripción' },
  { key: 'usuarios_facturables', label: 'Usuarios facturables', group: 'Suscripción' },
  { key: 'usuarios_stripe', label: 'Usuarios Stripe', group: 'Suscripción' },
  { key: 'diferencia_usuarios', label: 'Diferencia de usuarios', group: 'Suscripción' },
  { key: 'proximo_cobro', label: 'Próximo cobro', group: 'Suscripción' },
  { key: 'proximo_cobro_estado', label: 'Estado próximo cobro', group: 'Suscripción' },
  { key: 'stripe_estado', label: 'Estado Stripe', group: 'Suscripción' },
  { key: 'stripe_id', label: 'ID Stripe', group: 'Suscripción' },
  { key: 'ultimo_cobro_monto', label: 'Último cobro — monto', group: 'Cobranza' },
  { key: 'ultimo_cobro_fecha', label: 'Último cobro — fecha', group: 'Cobranza' },
  { key: 'ultimo_cobro_estado', label: 'Último cobro — estado', group: 'Cobranza' },
  { key: 'ultimo_pago_monto', label: 'Último pago — monto', group: 'Cobranza' },
  { key: 'ultimo_pago_fecha', label: 'Último pago — fecha', group: 'Cobranza' },
  { key: 'saldo', label: 'Saldo pendiente', group: 'Cobranza' },
  { key: 'revision', label: 'Revisión', group: 'Cobranza' },
  { key: 'ultima_venta_monto', label: 'Última venta — monto', group: 'Actividad' },
  { key: 'ultima_venta_fecha', label: 'Última venta — fecha', group: 'Actividad' },
  { key: 'ultima_venta_folio', label: 'Última venta — folio', group: 'Actividad' },
  { key: 'dias_sin_venta', label: 'Días sin vender', group: 'Actividad' },
  { key: 'timbres', label: 'Timbres', group: 'Actividad' },
];

const DEFAULT_EMPRESA_COLUMNS = Object.fromEntries(
  EMPRESA_COLUMNS.map(column => [column.key, true]),
) as Record<EmpresaColumn, boolean>;

const EMPRESA_PRESETS: ColumnPreset[] = [
  {
    key: 'control',
    label: 'Control rápido',
    columns: ['empresa', 'estado', 'usuarios_rutapp', 'usuarios_stripe', 'ultimo_pago_monto', 'ultimo_pago_fecha', 'saldo', 'revision', 'ultima_venta_fecha', 'dias_sin_venta', 'proximo_cobro'],
  },
  {
    key: 'cobranza',
    label: 'Cobranza',
    columns: ['empresa', 'correo', 'telefono', 'estado', 'plan', 'ultimo_cobro_monto', 'ultimo_cobro_fecha', 'ultimo_cobro_estado', 'ultimo_pago_monto', 'ultimo_pago_fecha', 'saldo', 'revision', 'proximo_cobro'],
  },
  {
    key: 'actividad',
    label: 'Actividad',
    columns: ['empresa', 'correo', 'telefono', 'estado', 'ultima_venta_monto', 'ultima_venta_fecha', 'ultima_venta_folio', 'dias_sin_venta'],
  },
  {
    key: 'suscripcion',
    label: 'Suscripción',
    columns: ['empresa', 'estado', 'plan', 'max_usuarios', 'usuarios_rutapp', 'usuarios_facturables', 'usuarios_stripe', 'diferencia_usuarios', 'proximo_cobro', 'stripe_estado', 'stripe_id'],
  },
];

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

function outstandingAmount(row?: SubscriptionAuditResult): number {
  if (!row) return 0;
  return Number(row.payments.stripe_outstanding_amount || 0)
    + Number(row.payments.local_manual_outstanding_amount || 0);
}

function hasSeatMismatch(row?: SubscriptionAuditResult): boolean {
  if (!row?.stripe_subscription || !Number.isFinite(row.expected_billable_users)) return false;
  return row.stripe_subscription.quantity !== row.expected_billable_users
    || Boolean(row.db_subscription && row.db_subscription.max_usuarios !== row.expected_billable_users);
}

function fmtBillingDate(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'dd MMM yyyy', { locale: es });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Error desconocido');
}

function newestInvoice(
  first?: AuditInvoiceSnapshot | null,
  second?: AuditInvoiceSnapshot | null,
): AuditInvoiceSnapshot | null {
  if (!first) return second || null;
  if (!second) return first;
  if (first.stripe_invoice_id && first.stripe_invoice_id === second.stripe_invoice_id) return first;
  const firstTime = new Date(first.created_at || first.paid_at || 0).getTime();
  const secondTime = new Date(second.created_at || second.paid_at || 0).getTime();
  return secondTime > firstTime ? second : first;
}

function latestInvoiceFor(row?: SubscriptionAuditResult): AuditInvoiceSnapshot | null {
  if (!row) return null;
  return newestInvoice(row.payments.latest_stripe_invoice, row.payments.latest_local_invoice);
}

function latestPaidFor(row?: SubscriptionAuditResult): AuditInvoiceSnapshot | null {
  if (!row) return null;
  return newestInvoice(row.payments.latest_stripe_paid_invoice, row.payments.latest_local_paid_invoice);
}

function invoiceStatusLabel(status?: string | null): string {
  const normalized = (status || '').toLowerCase();
  if (['paid', 'pagada'].includes(normalized)) return 'Pagado';
  if (['open', 'pending', 'pendiente', 'past_due', 'unpaid'].includes(normalized)) return 'Pendiente';
  if (['void', 'cancelled', 'canceled', 'cancelada'].includes(normalized)) return 'Cancelado';
  if (normalized === 'draft') return 'Borrador';
  if (normalized === 'uncollectible') return 'Incobrable';
  return status || 'Sin estado';
}

function reviewLabel(row?: SubscriptionAuditResult): string {
  if (!row) return 'Consultando';
  if (outstandingAmount(row) > 0) return 'Nos debe';
  if (row.active_without_payment) return 'Activa sin pagos';
  if (hasSeatMismatch(row)) return 'Revisar usuarios';
  return 'Al corriente';
}

function lastSaleAt(row?: SubscriptionAuditResult): string | null {
  return row?.last_sale?.fecha || row?.last_sale?.created_at || null;
}

function mexicoDateOnly(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const saleDay = mexicoDateOnly(value);
  const todayDay = mexicoDateOnly(new Date().toISOString());
  if (!saleDay || !todayDay) return null;
  const saleParts = saleDay.split('-').map(Number);
  const todayParts = todayDay.split('-').map(Number);
  const sale = Date.UTC(saleParts[0], saleParts[1] - 1, saleParts[2]);
  const today = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  return Math.max(0, Math.floor((today - sale) / 86_400_000));
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Activa', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  trial: { label: 'Trial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  past_due: { label: 'Vencida', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  suspended: { label: 'Suspendida', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  gracia: { label: 'Gracia', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertCircle },
  cancelada: { label: 'Cancelada', color: 'bg-muted text-muted-foreground', icon: XCircle },
  pendiente_pago: { label: 'Pendiente pago', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  sin_sub: { label: 'Sin suscripción', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

export default function AdminEmpresasTab({ onSelectEmpresa }: { onSelectEmpresa?: (id: string) => void }) {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('todas');
  const [loading, setLoading] = useState(true);
  const [showAddTimbres, setShowAddTimbres] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaRow | null>(null);
  const [cantidadTimbres, setCantidadTimbres] = useState('10');
  const [addingTimbres, setAddingTimbres] = useState(false);
  const [showCreateEmpresa, setShowCreateEmpresa] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmpresa, setNewEmpresa] = useState({
    nombre: '', empresa: '', email: '', password: '123456', countryCode: '+52', telefono: '',
  });
  const columnPreferences = useColumnPreferences('admin_empresas_control', DEFAULT_EMPRESA_COLUMNS);

  const auditQuery = useQuery<AuditApiResponse>({
    queryKey: ['admin-billing-audit'],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sesión no disponible');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=audit_subscriptions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'No fue posible consultar la facturación');
      return payload as AuditApiResponse;
    },
  });

  const auditByEmpresa = useMemo(() => new Map(
    (auditQuery.data?.records || [])
      .map(record => auditSubscription(record))
      .map(record => [record.empresa_id, record] as const),
  ), [auditQuery.data?.records]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre, email, telefono, created_at, timbres_saldo(saldo), subscriptions(status, max_usuarios, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at, plan_id)')
      .order('created_at', { ascending: false });
    setEmpresas((data as unknown as EmpresaRow[] | null) || []);
    setLoading(false);
  }

  async function deleteEmpresa(id: string, nombre: string) {
    if (!await confirmDialog(`¿Eliminar empresa "${nombre}" y TODOS sus datos? Esta acción es irreversible.`)) return;
    await supabase.from('subscriptions').delete().eq('empresa_id', id);
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa eliminada'); load(); }
  }

  async function handleAddTimbres() {
    if (!selectedEmpresa || !user) return;
    const cant = parseInt(cantidadTimbres);
    if (!cant || cant < 1) { toast.error('Cantidad inválida'); return; }

    setAddingTimbres(true);
    try {
      const { data, error } = await supabase.rpc('add_timbres', {
        p_empresa_id: selectedEmpresa.id,
        p_cantidad: cant,
        p_user_id: user.id,
        p_notas: `Recarga de ${cant} timbres por admin`,
      });
      if (error) throw error;
      toast.success(`Se agregaron ${cant} timbres. Nuevo saldo: ${data}`);
      setShowAddTimbres(false);
      setCantidadTimbres('10');
      load();
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    } finally {
      setAddingTimbres(false);
    }
  }

  async function handleCreateEmpresa() {
    const { nombre, empresa, email, password, countryCode, telefono } = newEmpresa;
    if (!nombre.trim() || !empresa.trim() || !email.trim() || !password) {
      toast.error('Todos los campos son obligatorios');
      return;
    }
    const country = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
    const digits = telefono.replace(/\D/g, '');
    if (digits.length !== country.digits) {
      toast.error(`El teléfono debe tener ${country.digits} dígitos para ${country.country}`);
      return;
    }
    const fullPhone = countryCode + digits;

    setCreating(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: nombre,
            phone: fullPhone,
            empresa_nombre: empresa,
            accepted_terms_at: new Date().toISOString(),
            verified_via: 'admin',
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      // Auto-confirm the email via admin edge function
      if (data.user) {
        await supabase.functions.invoke('admin-users', {
          body: { action: 'confirm-email', user_id: data.user.id },
        });
      }

      toast.success(`Empresa "${empresa}" creada exitosamente`);
      setShowCreateEmpresa(false);
      setNewEmpresa({ nombre: '', empresa: '', email: '', password: '123456', countryCode: '+52', telefono: '' });
      setTimeout(() => load(), 1500); // wait for triggers
    } catch (error: unknown) {
      toast.error(errorMessage(error) || 'Error al crear empresa');
    } finally {
      setCreating(false);
    }
  }

  // Deriva el status real considerando la fecha de próximo cobro.
  // Si el status en BD dice past_due/suspended/gracia pero current_period_end aún es futuro,
  // se considera 'active' (la cobranza aún no vence).
  const getEffectiveStatus = (sub?: SubRow): string => {
    if (!sub?.status) return 'sin_sub';
    const now = new Date();
    const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    if (sub.status === 'trial') {
      if (trialEnd && trialEnd > now) return 'trial';
      // Trial vencido pero con suscripción activa por current_period_end futuro
      if (end && end > now) return 'active';
      return sub.status;
    }
    if (['past_due', 'gracia', 'suspended'].includes(sub.status)) {
      if (end && end > now) return 'active';
    }
    return sub.status;
  };

  const filtered = empresas.filter(e => {
    const matchSearch = e.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.telefono || '').toLowerCase().includes(search.toLowerCase());
    const audit = auditByEmpresa.get(e.id);
    const statusMatches = statusFilter === 'todos'
      || (statusFilter === 'con_saldo' && outstandingAmount(audit) > 0)
      || (statusFilter === 'usuarios_desfasados' && hasSeatMismatch(audit))
      || (statusFilter === 'sin_cobros' && audit?.active_without_payment === true)
      || getEffectiveStatus(e.subscriptions?.[0]) === statusFilter;
    if (!matchSearch || !statusMatches) return false;

    const inactivityDays = daysSince(lastSaleAt(audit));
    if (activityFilter === 'sin_ventas') return inactivityDays == null;
    if (activityFilter === 'hoy') return inactivityDays === 0;
    if (activityFilter !== 'todas') return inactivityDays != null && inactivityDays >= Number(activityFilter);
    return true;
  });

  const { sorted: sortedFiltered, sort, toggle: toggleSort } = useSortableTable(
    filtered,
    (empresa, key) => {
      const audit = auditByEmpresa.get(empresa.id);
      const sub = empresa.subscriptions?.[0];
      if (key === 'empresa') return empresa.nombre;
      if (key === 'correo') return empresa.email;
      if (key === 'telefono') return empresa.telefono;
      if (key === 'alta') return empresa.created_at;
      if (key === 'estado') return getEffectiveStatus(sub);
      if (key === 'plan') return audit?.db_subscription?.plan_nombre || sub?.plan_id;
      if (key === 'max_usuarios') return sub?.max_usuarios;
      if (key === 'usuarios_rutapp') return audit?.active_user_count;
      if (key === 'usuarios_facturables') return audit?.expected_billable_users;
      if (key === 'usuarios_stripe') return audit?.stripe_subscription?.quantity;
      if (key === 'diferencia_usuarios') return audit?.stripe_subscription && Number.isFinite(audit.expected_billable_users)
        ? audit.stripe_subscription.quantity - Number(audit.expected_billable_users)
        : null;
      if (key === 'ultimo_cobro_monto') return latestInvoiceFor(audit)?.amount;
      if (key === 'ultimo_cobro_fecha') return latestInvoiceFor(audit)?.created_at;
      if (key === 'ultimo_cobro_estado') {
        const invoice = latestInvoiceFor(audit);
        return invoice ? invoiceStatusLabel(invoice.status) : null;
      }
      if (key === 'ultimo_pago_monto') return latestPaidFor(audit)?.amount_paid ?? latestPaidFor(audit)?.amount;
      if (key === 'ultimo_pago_fecha') return latestPaidFor(audit)?.paid_at;
      if (key === 'saldo') return outstandingAmount(audit);
      if (key === 'revision') return reviewLabel(audit);
      if (key === 'ultima_venta_monto') return audit?.last_sale?.total;
      if (key === 'ultima_venta_fecha') return lastSaleAt(audit);
      if (key === 'ultima_venta_folio') return audit?.last_sale?.folio;
      if (key === 'dias_sin_venta') return daysSince(lastSaleAt(audit));
      if (key === 'proximo_cobro') return sub?.status === 'trial' ? sub.trial_ends_at : sub?.current_period_end;
      if (key === 'proximo_cobro_estado') {
        const value = sub?.status === 'trial' ? sub.trial_ends_at : sub?.current_period_end;
        return value && new Date(value) < new Date() ? 'Vencido' : value ? 'Programado' : null;
      }
      if (key === 'timbres') return empresa.timbres_saldo?.[0]?.saldo ?? 0;
      if (key === 'stripe_estado') return audit?.stripe_subscription?.status || (sub?.stripe_customer_id ? 'Conectado' : null);
      if (key === 'stripe_id') return sub?.stripe_subscription_id;
      return null;
    },
  );

  const STATUS_ORDER = ['active', 'trial', 'past_due', 'gracia', 'suspended', 'cancelada', 'sin_sub', 'pendiente_pago'];

  // Counts per status for filter chips
  const statusCounts = empresas.reduce<Record<string, number>>((acc, e) => {
    const s = getEffectiveStatus(e.subscriptions?.[0]);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const quickCounts = {
    conSaldo: empresas.filter(e => outstandingAmount(auditByEmpresa.get(e.id)) > 0).length,
    usuariosDesfasados: empresas.filter(e => hasSeatMismatch(auditByEmpresa.get(e.id))).length,
    sinCobros: empresas.filter(e => auditByEmpresa.get(e.id)?.active_without_payment === true).length,
  };

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Empresas ({empresas.length})
            </CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ColumnVisibilityMenu
                columns={EMPRESA_COLUMNS}
                visible={columnPreferences.visible}
                onToggle={columnPreferences.toggleColumn}
                onShowAll={() => columnPreferences.setAll(true)}
                onReset={columnPreferences.reset}
                presets={EMPRESA_PRESETS}
                onApplyPreset={columnPreferences.applyPreset}
                groupOrder={['Empresa', 'Suscripción', 'Cobranza', 'Actividad']}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={loading || auditQuery.isFetching}
                onClick={() => { load(); auditQuery.refetch(); }}
                title="Actualizar empresas y facturación"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading || auditQuery.isFetching ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button size="sm" onClick={() => setShowCreateEmpresa(true)}>
                <Plus className="h-4 w-4 mr-1" /> Crear empresa
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa, correo o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-72" />
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Status filter chips */}
        <div className="px-6 pb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'todos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Todos ({empresas.length})
          </button>
          {STATUS_ORDER.filter(s => statusCounts[s]).map(s => {
            const info = STATUS_MAP[s] || { label: s, color: 'text-muted-foreground' };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? 'todos' : s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {info.label} ({statusCounts[s]})
              </button>
            );
          })}
          <span className="mx-1 h-6 w-px bg-border" />
          <button
            onClick={() => setStatusFilter(statusFilter === 'con_saldo' ? 'todos' : 'con_saldo')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'con_saldo' ? 'border-red-500 bg-red-50 text-red-700' : 'border-red-200 text-red-700 hover:bg-red-50'}`}
          >
            Nos deben ({auditQuery.isLoading ? '…' : quickCounts.conSaldo})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'usuarios_desfasados' ? 'todos' : 'usuarios_desfasados')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'usuarios_desfasados' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}
          >
            Usuarios desfasados ({auditQuery.isLoading ? '…' : quickCounts.usuariosDesfasados})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'sin_cobros' ? 'todos' : 'sin_cobros')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'sin_cobros' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-orange-200 text-orange-700 hover:bg-orange-50'}`}
          >
            Activas sin cobro ({auditQuery.isLoading ? '…' : quickCounts.sinCobros})
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Actividad:</span>
            <Select value={activityFilter} onValueChange={value => setActivityFilter(value as ActivityFilter)}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las empresas</SelectItem>
                <SelectItem value="hoy">Vendieron hoy</SelectItem>
                <SelectItem value="7">7+ días sin vender</SelectItem>
                <SelectItem value="30">30+ días sin vender</SelectItem>
                <SelectItem value="60">60+ días sin vender</SelectItem>
                <SelectItem value="90">90+ días sin vender</SelectItem>
                <SelectItem value="sin_ventas">Sin ventas registradas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {auditQuery.isError && (
          <div className="mx-6 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Las empresas están disponibles, pero Stripe no respondió. Pulsa Actualizar para consultar cobros y saldos.
          </div>
        )}

        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="overflow-x-auto">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <SortableTh sortKey="empresa" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Empresa</SortableTh>
                    {columnPreferences.isVisible('correo') && <SortableTh sortKey="correo" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Correo</SortableTh>}
                    {columnPreferences.isVisible('telefono') && <SortableTh sortKey="telefono" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Teléfono</SortableTh>}
                    {columnPreferences.isVisible('alta') && <SortableTh sortKey="alta" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Fecha de alta</SortableTh>}
                    {columnPreferences.isVisible('estado') && <SortableTh sortKey="estado" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Estado</SortableTh>}
                    {columnPreferences.isVisible('plan') && <SortableTh sortKey="plan" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Plan</SortableTh>}
                    {columnPreferences.isVisible('max_usuarios') && <SortableTh sortKey="max_usuarios" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Máx. usuarios</SortableTh>}
                    {columnPreferences.isVisible('usuarios_rutapp') && <SortableTh sortKey="usuarios_rutapp" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Usuarios activos</SortableTh>}
                    {columnPreferences.isVisible('usuarios_facturables') && <SortableTh sortKey="usuarios_facturables" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Usuarios facturables</SortableTh>}
                    {columnPreferences.isVisible('usuarios_stripe') && <SortableTh sortKey="usuarios_stripe" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Usuarios Stripe</SortableTh>}
                    {columnPreferences.isVisible('diferencia_usuarios') && <SortableTh sortKey="diferencia_usuarios" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Dif. usuarios</SortableTh>}
                    {columnPreferences.isVisible('ultimo_cobro_monto') && <SortableTh sortKey="ultimo_cobro_monto" sort={sort} onToggle={toggleSort} align="right" className="h-10 px-2 text-xs">Cobro monto</SortableTh>}
                    {columnPreferences.isVisible('ultimo_cobro_fecha') && <SortableTh sortKey="ultimo_cobro_fecha" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Cobro fecha</SortableTh>}
                    {columnPreferences.isVisible('ultimo_cobro_estado') && <SortableTh sortKey="ultimo_cobro_estado" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Cobro estado</SortableTh>}
                    {columnPreferences.isVisible('ultimo_pago_monto') && <SortableTh sortKey="ultimo_pago_monto" sort={sort} onToggle={toggleSort} align="right" className="h-10 px-2 text-xs">Pago monto</SortableTh>}
                    {columnPreferences.isVisible('ultimo_pago_fecha') && <SortableTh sortKey="ultimo_pago_fecha" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Pago fecha</SortableTh>}
                    {columnPreferences.isVisible('saldo') && <SortableTh sortKey="saldo" sort={sort} onToggle={toggleSort} align="right" className="h-10 px-2 text-xs">Saldo pendiente</SortableTh>}
                    {columnPreferences.isVisible('revision') && <SortableTh sortKey="revision" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Revisión</SortableTh>}
                    {columnPreferences.isVisible('ultima_venta_monto') && <SortableTh sortKey="ultima_venta_monto" sort={sort} onToggle={toggleSort} align="right" className="h-10 px-2 text-xs">Venta monto</SortableTh>}
                    {columnPreferences.isVisible('ultima_venta_fecha') && <SortableTh sortKey="ultima_venta_fecha" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Venta fecha</SortableTh>}
                    {columnPreferences.isVisible('ultima_venta_folio') && <SortableTh sortKey="ultima_venta_folio" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Venta folio</SortableTh>}
                    {columnPreferences.isVisible('dias_sin_venta') && <SortableTh sortKey="dias_sin_venta" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Días sin vender</SortableTh>}
                    {columnPreferences.isVisible('proximo_cobro') && <SortableTh sortKey="proximo_cobro" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Próximo cobro</SortableTh>}
                    {columnPreferences.isVisible('proximo_cobro_estado') && <SortableTh sortKey="proximo_cobro_estado" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Próximo estado</SortableTh>}
                    {columnPreferences.isVisible('timbres') && <SortableTh sortKey="timbres" sort={sort} onToggle={toggleSort} align="center" className="h-10 px-2 text-xs">Timbres</SortableTh>}
                    {columnPreferences.isVisible('stripe_estado') && <SortableTh sortKey="stripe_estado" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Stripe estado</SortableTh>}
                    {columnPreferences.isVisible('stripe_id') && <SortableTh sortKey="stripe_id" sort={sort} onToggle={toggleSort} className="h-10 px-2 text-xs">Stripe ID</SortableTh>}
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFiltered.map(e => {
                    const saldo = e.timbres_saldo?.[0]?.saldo ?? 0;
                    const sub = e.subscriptions?.[0];
                    const status = getEffectiveStatus(sub);
                    const statusInfo = STATUS_MAP[status];
                    const hasStripeCustomer = !!sub?.stripe_customer_id;
                    const audit = auditByEmpresa.get(e.id);
                    const rutappUsers = audit?.active_user_count;
                    const stripeUsers = audit?.stripe_subscription?.quantity;
                    const expectedUsers = audit?.expected_billable_users;
                    const seatMismatch = hasSeatMismatch(audit);
                    const latestInvoice = latestInvoiceFor(audit);
                    const latestPaid = latestPaidFor(audit);
                    const pendingAmount = outstandingAmount(audit);
                    const lastSale = audit?.last_sale;
                    const inactivityDays = daysSince(lastSaleAt(audit));
                    return (
                      <TableRow key={e.id} className="cursor-pointer hover:bg-card" onClick={() => onSelectEmpresa?.(e.id)}>
                        <TableCell className="min-w-[190px] py-2"><div className="font-medium">{e.nombre}</div></TableCell>
                        {columnPreferences.isVisible('correo') && <TableCell className="min-w-[200px] py-2 text-xs">{e.email || 'Sin correo'}</TableCell>}
                        {columnPreferences.isVisible('telefono') && <TableCell className="min-w-[120px] py-2 text-xs">{e.telefono || 'Sin teléfono'}</TableCell>}
                        {columnPreferences.isVisible('alta') && <TableCell className="py-2 text-xs">{fmtBillingDate(e.created_at)}</TableCell>}
                        {columnPreferences.isVisible('estado') && (
                          <TableCell className="py-2">
                            {statusInfo ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusInfo.color}`}>
                                <statusInfo.icon className="h-3 w-3" />{statusInfo.label}
                              </span>
                            ) : <span className="text-[11px] text-muted-foreground">Sin suscripción</span>}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('plan') && (
                          <TableCell className="py-2 min-w-[120px] text-xs font-medium">{audit?.db_subscription?.plan_nombre || 'Sin plan'}</TableCell>
                        )}
                        {columnPreferences.isVisible('max_usuarios') && <TableCell className="text-center py-2 font-mono text-sm">{sub?.max_usuarios ?? '—'}</TableCell>}
                        {columnPreferences.isVisible('usuarios_rutapp') && (
                          <TableCell className="text-center py-2 font-mono font-bold text-sm">{rutappUsers ?? (auditQuery.isLoading ? '…' : '—')}</TableCell>
                        )}
                        {columnPreferences.isVisible('usuarios_facturables') && <TableCell className="text-center py-2 font-mono text-sm">{expectedUsers ?? (auditQuery.isLoading ? '…' : '—')}</TableCell>}
                        {columnPreferences.isVisible('usuarios_stripe') && (
                          <TableCell className={`text-center py-2 font-mono font-bold text-sm ${seatMismatch ? 'text-amber-700' : stripeUsers != null ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            {stripeUsers ?? (auditQuery.isLoading ? '…' : '—')}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('diferencia_usuarios') && (
                          <TableCell className={`text-center py-2 font-mono font-bold text-sm ${seatMismatch ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {stripeUsers != null && expectedUsers != null ? stripeUsers - expectedUsers : '—'}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultimo_cobro_monto') && (
                          <TableCell className="text-right py-2 min-w-[115px] font-mono font-semibold text-sm">
                            {latestInvoice ? money.format(latestInvoice.amount) : '—'}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultimo_cobro_fecha') && <TableCell className="py-2 min-w-[105px] text-xs">{fmtBillingDate(latestInvoice?.created_at)}</TableCell>}
                        {columnPreferences.isVisible('ultimo_cobro_estado') && (
                          <TableCell className={`py-2 min-w-[95px] text-xs font-medium ${latestInvoice && ['paid', 'pagada'].includes(latestInvoice.status) ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {latestInvoice ? invoiceStatusLabel(latestInvoice.status) : 'Sin cobros'}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultimo_pago_monto') && (
                          <TableCell className="text-right py-2 min-w-[115px] font-mono font-semibold text-sm text-emerald-700">
                            {latestPaid ? money.format(latestPaid.amount_paid ?? latestPaid.amount) : '—'}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultimo_pago_fecha') && <TableCell className="py-2 min-w-[105px] text-xs">{fmtBillingDate(latestPaid?.paid_at)}</TableCell>}
                        {columnPreferences.isVisible('saldo') && (
                          <TableCell className={`text-right py-2 min-w-[115px] font-mono font-bold text-sm ${pendingAmount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {money.format(pendingAmount)}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('revision') && (
                          <TableCell className="py-2 min-w-[125px]">
                            {pendingAmount > 0 ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Nos debe</Badge>
                              : audit?.active_without_payment ? <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Activa sin pagos</Badge>
                              : seatMismatch ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Revisar usuarios</Badge>
                              : audit ? <span className="text-xs font-semibold text-emerald-700">Al corriente</span>
                              : <span className="text-xs text-muted-foreground">Consultando…</span>}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultima_venta_monto') && (
                          <TableCell className="text-right py-2 min-w-[115px] font-mono font-semibold text-sm">
                            {lastSale ? money.format(Number(lastSale.total || 0)) : '—'}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('ultima_venta_fecha') && <TableCell className="py-2 min-w-[105px] text-xs">{fmtBillingDate(lastSaleAt(audit))}</TableCell>}
                        {columnPreferences.isVisible('ultima_venta_folio') && <TableCell className="py-2 min-w-[100px] text-xs">{lastSale?.folio || '—'}</TableCell>}
                        {columnPreferences.isVisible('dias_sin_venta') && (
                          <TableCell className="text-center py-2">
                            {inactivityDays == null ? (
                              <Badge variant="outline" className="text-muted-foreground">Sin ventas</Badge>
                            ) : (
                              <span className={`font-mono font-bold ${inactivityDays >= 30 ? 'text-red-700' : inactivityDays >= 7 ? 'text-amber-700' : 'text-emerald-700'}`}>{inactivityDays}</span>
                            )}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('proximo_cobro') && (
                          <TableCell className="py-2 min-w-[120px]">
                            {(() => {
                              const endDate = sub?.status === 'trial' ? sub?.trial_ends_at : sub?.current_period_end;
                              if (!endDate) return <span className="text-xs text-muted-foreground">—</span>;
                              const d = new Date(endDate);
                              const normalized = d.getDate() === 1 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
                              return <span className="text-xs font-medium">{format(normalized, 'dd MMM yyyy', { locale: es })}</span>;
                            })()}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('proximo_cobro_estado') && (
                          <TableCell className="py-2 min-w-[105px] text-xs font-medium">
                            {(() => {
                              const endDate = sub?.status === 'trial' ? sub?.trial_ends_at : sub?.current_period_end;
                              if (!endDate) return 'Sin fecha';
                              return new Date(endDate) < new Date() ? <span className="text-destructive">Vencido</span> : <span className="text-emerald-700">Programado</span>;
                            })()}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('timbres') && <TableCell className="text-center py-2 font-mono text-sm">{saldo}</TableCell>}
                        {columnPreferences.isVisible('stripe_estado') && (
                          <TableCell className={`py-2 min-w-[105px] text-xs font-medium ${hasStripeCustomer ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            {audit?.stripe_subscription?.status || (hasStripeCustomer ? 'Conectado' : 'Sin cliente')}
                          </TableCell>
                        )}
                        {columnPreferences.isVisible('stripe_id') && (
                          <TableCell className="py-2 min-w-[155px] max-w-[180px] truncate font-mono text-[10px] text-muted-foreground" title={sub?.stripe_subscription_id || ''}>
                            {sub?.stripe_subscription_id || '—'}
                          </TableCell>
                        )}
                        <TableCell className="py-2">
                          <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                            <Button size="sm" variant="ghost" title="Agregar timbres" onClick={() => { setSelectedEmpresa(e); setShowAddTimbres(true); }}>
                              <Stamp className="h-4 w-4 text-primary" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteEmpresa(e.id, e.nombre)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!sortedFiltered.length && (
                    <TableRow>
                      <TableCell colSpan={EMPRESA_COLUMNS.length + 1} className="h-24 text-center text-sm text-muted-foreground">
                        No hay empresas que coincidan con los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Timbres Dialog */}
      <Dialog open={showAddTimbres} onOpenChange={setShowAddTimbres}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stamp className="h-5 w-5 text-primary" /> Agregar Timbres
            </DialogTitle>
            <DialogDescription>
              Agregar timbres a <strong>{selectedEmpresa?.nombre}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad de timbres</Label>
              <Input
                type="number"
                min="1"
                value={cantidadTimbres}
                onChange={e => setCantidadTimbres(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddTimbres(false)}>Cancelar</Button>
              <Button className="flex-1" disabled={addingTimbres} onClick={handleAddTimbres}>
                {addingTimbres ? 'Agregando...' : `Agregar ${cantidadTimbres || 0} timbres`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Empresa Dialog */}
      <Dialog open={showCreateEmpresa} onOpenChange={setShowCreateEmpresa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Crear nueva empresa
            </DialogTitle>
            <DialogDescription>
              Crea una empresa con su usuario administrador. No requiere verificación OTP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Nombre del dueño</Label>
              <Input value={newEmpresa.nombre} onChange={e => setNewEmpresa(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan Pérez" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Nombre de empresa</Label>
              <Input value={newEmpresa.empresa} onChange={e => setNewEmpresa(f => ({ ...f, empresa: e.target.value }))} placeholder="Distribuidora Norte" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
              <Input type="email" value={newEmpresa.email} onChange={e => setNewEmpresa(f => ({ ...f, email: e.target.value }))} placeholder="usuario@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Teléfono</Label>
              <div className="flex gap-2">
                <Select value={newEmpresa.countryCode} onValueChange={v => setNewEmpresa(f => ({ ...f, countryCode: v }))}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={newEmpresa.telefono} onChange={e => setNewEmpresa(f => ({ ...f, telefono: e.target.value }))} placeholder="1234567890" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Contraseña</Label>
              <Input value={newEmpresa.password} onChange={e => setNewEmpresa(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateEmpresa(false)}>Cancelar</Button>
              <Button className="flex-1" disabled={creating} onClick={handleCreateEmpresa}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Crear empresa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
