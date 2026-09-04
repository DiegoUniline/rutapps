import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import ModalSelect from '@/components/ModalSelect';
import { Receipt, Search, ExternalLink, Download, Plus, Send, Mail, MessageCircle, Building2, Users, Percent, FileText, Copy, AlertTriangle, CheckCircle2, Clock3, Eye, RefreshCw, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminInvoice {
  id: string; number: string | null; status: string; amount_due: number; amount_paid: number;
  amount_remaining?: number; truly_paid?: boolean; stripe_status?: string;
  currency: string; created: number; due_date: number | null;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
  customer_email: string | null; customer_name?: string | null;
  customer_id?: string | null; subscription_id?: string | null;
  empresa_id?: string | null; empresa_nombre?: string | null;
  description: string;
  attempt_count?: number; attempted?: boolean;
  next_payment_attempt?: number | null; paid_at?: number | null;
  collection_method?: string | null; billing_reason?: string | null;
}

type PaymentState = 'all' | 'paid' | 'failed' | 'pending' | 'draft' | 'void';

interface EmpresaOption {
  id: string; nombre: string; email: string | null; telefono: string | null;
  rfc: string | null; logo_url: string | null;
}

interface PlanOption {
  id: string; nombre: string; precio_por_usuario: number; periodo: string;
  descuento_pct: number; meses: number;
}

const PLANES_PREDEFINIDOS = [
  { id: 'mensual', nombre: 'Mensual', precio_por_usuario: 300, periodo: 'mensual', descuento_pct: 0, meses: 1 },
  { id: 'semestral', nombre: 'Semestral', precio_por_usuario: 300, periodo: 'semestral', descuento_pct: 10, meses: 6 },
  { id: 'anual', nombre: 'Anual', precio_por_usuario: 300, periodo: 'anual', descuento_pct: 20, meses: 12 },
];

const COUNTRY_CODES = [
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
  { code: '+1', flag: '🇺🇸', name: 'EE.UU./Canadá' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { code: '+809', flag: '🇩🇴', name: 'Rep. Dominicana' },
];

function detectCountryCode(phone: string): { lada: string; number: string } {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  for (const cc of COUNTRY_CODES) {
    if (clean.startsWith(cc.code)) {
      return { lada: cc.code, number: clean.slice(cc.code.length) };
    }
  }
  // Default to MX if starts with digit
  if (clean.startsWith('52')) return { lada: '+52', number: clean.slice(2) };
  return { lada: '+52', number: clean.replace(/^\+/, '') };
}

function getPaymentState(invoice: AdminInvoice): Exclude<PaymentState, 'all'> {
  const remaining = typeof invoice.amount_remaining === 'number'
    ? invoice.amount_remaining
    : invoice.amount_due - (invoice.amount_paid || 0);
  const paid = remaining === 0 && (
    invoice.truly_paid === true ||
    (invoice.amount_paid || 0) > 0 ||
    invoice.status === 'paid' ||
    invoice.stripe_status === 'paid'
  );
  if (paid) return 'paid';
  if (invoice.status === 'void') return 'void';
  if (invoice.status === 'uncollectible') return 'failed';
  if (invoice.status === 'draft') return 'draft';
  if ((invoice.attempted || (invoice.attempt_count || 0) > 0) && remaining > 0) return 'failed';
  return 'pending';
}

const PAYMENT_STATE_LABELS: Record<Exclude<PaymentState, 'all'>, string> = {
  paid: 'Pagada',
  failed: 'Fallida',
  pending: 'Pendiente',
  draft: 'Borrador',
  void: 'Anulada',
};

export default function AdminInvoicesTab() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentState>('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoice | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // Profiles cache: empresa_id -> { email, telefono, nombre }
  const [profilesMap, setProfilesMap] = useState<Record<string, { email: string; telefono: string; nombre: string }>>({});

  const [form, setForm] = useState({
    empresa_id: '',
    plan_id: 'mensual',
    num_usuarios: 3,
    timbres: 0,
    precio_timbre: 1,
    descuento_extra_pct: 0,
    dias_pagar: 3,
    mensaje_personal: '',
    concepto: '',
    // Contact info
    correo: '',
    lada: '+52',
    telefono: '',
    enviar_email: true,
    enviar_whatsapp: true,
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [invoiceRes, empresasRes, plansRes, profilesRes] = await Promise.all([
      (async () => {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices&status=all`,
            { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
          );
          return await res.json();
        } catch { return { invoices: [] }; }
      })(),
      supabase.from('empresas').select('id, nombre, email, telefono, rfc, logo_url'),
      supabase.from('subscription_plans').select('id, nombre, precio_por_usuario, periodo, descuento_pct, meses').eq('activo', true),
      supabase.from('profiles').select('empresa_id, nombre, telefono, user_id'),
    ]);
    setInvoices(invoiceRes.invoices || []);
    setEmpresas((empresasRes.data || []) as EmpresaOption[]);
    const dbPlans = (plansRes.data || []) as PlanOption[];
    setPlans(dbPlans.length > 0 ? dbPlans : PLANES_PREDEFINIDOS);

    // Build profiles map (first profile per empresa)
    const pm: Record<string, { email: string; telefono: string; nombre: string }> = {};
    for (const p of (profilesRes.data || []) as any[]) {
      if (!pm[p.empresa_id]) {
        pm[p.empresa_id] = { email: '', telefono: p.telefono || '', nombre: p.nombre || '' };
      }
    }
    // Get emails from empresas directly
    for (const e of (empresasRes.data || []) as EmpresaOption[]) {
      if (pm[e.id]) {
        pm[e.id].email = e.email || '';
        if (!pm[e.id].telefono && e.telefono) pm[e.id].telefono = e.telefono;
      } else {
        pm[e.id] = { email: e.email || '', telefono: e.telefono || '', nombre: e.nombre };
      }
    }
    setProfilesMap(pm);
    setLoading(false);
  }

  // When empresa changes, auto-fill contact
  function handleEmpresaChange(empresaId: string) {
    const profile = profilesMap[empresaId];
    const empresa = empresas.find(e => e.id === empresaId);
    const tel = profile?.telefono || empresa?.telefono || '';
    const email = profile?.email || empresa?.email || '';
    const detected = tel ? detectCountryCode(tel) : { lada: '+52', number: '' };

    setForm(f => ({
      ...f,
      empresa_id: empresaId,
      correo: email,
      lada: detected.lada,
      telefono: detected.number,
    }));
  }

  // Calculated values
  const selectedPlan = plans.find(p => p.id === form.plan_id) || PLANES_PREDEFINIDOS[0];
  const selectedEmpresa = empresas.find(e => e.id === form.empresa_id);
  const subtotalUsuarios = selectedPlan.precio_por_usuario * form.num_usuarios * (selectedPlan.meses || 1);
  const descuentoPlan = subtotalUsuarios * (selectedPlan.descuento_pct / 100);
  const subtotalTimbres = form.timbres * form.precio_timbre;
  const subtotal = subtotalUsuarios - descuentoPlan + subtotalTimbres;
  const descuentoExtra = subtotal * (form.descuento_extra_pct / 100);
  const total = subtotal - descuentoExtra;

  const fmtMXN = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function handleCreateInvoice() {
    if (!form.empresa_id) { toast.error('Selecciona una empresa'); return; }
    if (form.num_usuarios < 1) { toast.error('Mínimo 1 usuario'); return; }
    if (form.enviar_email && !form.correo) { toast.error('Ingresa un correo para enviar'); return; }
    if (form.enviar_whatsapp && !form.telefono) { toast.error('Ingresa un teléfono para WhatsApp'); return; }
    setCreating(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const items: { description: string; amount: number }[] = [];
      const subDesc = `Suscripción ${selectedPlan.nombre} — ${form.num_usuarios} usuario${form.num_usuarios > 1 ? 's' : ''} × ${fmtMXN(selectedPlan.precio_por_usuario)}/usr${selectedPlan.meses > 1 ? ` × ${selectedPlan.meses} meses` : ''}`;
      items.push({ description: subDesc, amount: Math.round((subtotalUsuarios - descuentoPlan) * 100) });

      if (form.timbres > 0) {
        items.push({
          description: `${form.timbres} timbres CFDI × ${fmtMXN(form.precio_timbre)}/timbre`,
          amount: Math.round(subtotalTimbres * 100),
        });
      }
      if (descuentoExtra > 0) {
        items.push({
          description: `Descuento adicional (${form.descuento_extra_pct}%)`,
          amount: -Math.round(descuentoExtra * 100),
        });
      }

      const concepto = form.concepto || `Suscripción Rutapp ${selectedPlan.nombre} — ${selectedEmpresa?.nombre || ''}`;
      const fullPhone = form.telefono ? `${form.lada}${form.telefono.replace(/\D/g, '')}` : '';

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
            empresa_id: form.empresa_id,
            empresa_nombre: selectedEmpresa?.nombre || '',
            empresa_email: form.correo,
            empresa_telefono: fullPhone,
            empresa_rfc: selectedEmpresa?.rfc || '',
            items,
            concepto,
            days_until_due: form.dias_pagar,
            plan_nombre: selectedPlan.nombre,
            num_usuarios: form.num_usuarios,
            timbres: form.timbres,
            descuento_plan_pct: selectedPlan.descuento_pct,
            descuento_extra_pct: form.descuento_extra_pct,
            total_centavos: Math.round(total * 100),
            mensaje_personal: form.mensaje_personal,
            enviar_email: form.enviar_email,
            enviar_whatsapp: form.enviar_whatsapp,
            telefono_envio: fullPhone,
            correo_envio: form.correo,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const channels: string[] = [];
      if (form.enviar_email) channels.push('correo');
      if (form.enviar_whatsapp) channels.push('WhatsApp');
      toast.success(`Factura creada y enviada por ${channels.join(' y ')}`);
      setShowCreate(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear factura');
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setForm({ empresa_id: '', plan_id: 'mensual', num_usuarios: 3, timbres: 0, precio_timbre: 1, descuento_extra_pct: 0, dias_pagar: 3, mensaje_personal: '', concepto: '', correo: '', lada: '+52', telefono: '', enviar_email: true, enviar_whatsapp: true });
  }

  async function sendInvoiceNotification(inv: AdminInvoice, channel: 'email' | 'whatsapp') {
    setSendingId(inv.id);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=send_invoice_notification`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: inv.id,
            channel,
            customer_email: inv.customer_email,
            amount: inv.amount_due,
            hosted_url: inv.hosted_invoice_url,
            description: inv.description,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Enviada por ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar');
    } finally {
      setSendingId(null);
    }
  }

  const statusBadge = (state: Exclude<PaymentState, 'all'>) => {
    const styles: Record<Exclude<PaymentState, 'all'>, string> = {
      paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      failed: 'border-red-200 bg-red-50 text-red-700',
      pending: 'border-amber-200 bg-amber-50 text-amber-700',
      draft: 'border-slate-200 bg-slate-50 text-slate-600',
      void: 'border-zinc-200 bg-zinc-50 text-zinc-600',
    };
    return <Badge variant="outline" className={styles[state]}>{PAYMENT_STATE_LABELS[state]}</Badge>;
  };

  const baseFiltered = invoices.filter(invoice => {
    const q = search.trim().toLowerCase();
    const invoiceDate = new Date(invoice.created * 1000);
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    if (empresaFilter !== 'all' && invoice.empresa_id !== empresaFilter) return false;
    if (from && invoiceDate < from) return false;
    if (to && invoiceDate > to) return false;
    if (!q) return true;
    return (
      (invoice.customer_email || '').toLowerCase().includes(q) ||
      (invoice.empresa_nombre || '').toLowerCase().includes(q) ||
      (invoice.customer_name || '').toLowerCase().includes(q) ||
      (invoice.number || '').toLowerCase().includes(q) ||
      (invoice.id || '').toLowerCase().includes(q) ||
      (invoice.description || '').toLowerCase().includes(q)
    );
  });

  const filtered = baseFiltered.filter(invoice => statusFilter === 'all' || getPaymentState(invoice) === statusFilter);
  const paidInvoices = baseFiltered.filter(invoice => getPaymentState(invoice) === 'paid');
  const failedInvoices = baseFiltered.filter(invoice => getPaymentState(invoice) === 'failed');
  const pendingInvoices = baseFiltered.filter(invoice => getPaymentState(invoice) === 'pending');
  const totalGenerado = baseFiltered.reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due || 0), 0) / 100;
  const totalCobrado = paidInvoices.reduce((sum, invoice) => sum + (invoice.amount_paid || 0), 0) / 100;
  const totalFallido = failedInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount_remaining ?? invoice.amount_due), 0) / 100;
  const totalPendiente = pendingInvoices.reduce((sum, invoice) => {
    const remaining = invoice.amount_remaining ?? invoice.amount_due - (invoice.amount_paid || 0);
    return sum + Math.max(0, remaining);
  }, 0) / 100;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setEmpresaFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const empresaOptions = empresas.map(e => ({ value: e.id, label: `${e.nombre}${e.email ? ` (${e.email})` : ''}` }));
  const planOptions = plans.map(p => ({
    value: p.id,
    label: `${p.nombre} — ${fmtMXN(p.precio_por_usuario)}/usr${p.descuento_pct > 0 ? ` (${p.descuento_pct}% desc.)` : ''}`,
  }));
  const ladaOptions = COUNTRY_CODES.map(c => ({ value: c.code, label: `${c.flag} ${c.code} ${c.name}` }));

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" /> Historial Facturas
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Todas las facturas generadas en Stripe, incluidos los intentos rechazados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Nueva factura
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
            <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === 'all' ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/40'}`}>
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Generadas</span><Receipt className="h-4 w-4" /></div>
              <div className="mt-1 text-xl font-bold">{fmtMXN(totalGenerado)}</div>
              <div className="text-[11px] text-muted-foreground">{baseFiltered.length} {baseFiltered.length === 1 ? 'factura' : 'facturas'}</div>
            </button>
            <button type="button" onClick={() => setStatusFilter('paid')} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === 'paid' ? 'border-emerald-400 bg-emerald-50' : 'border-border/60 hover:bg-muted/40'}`}>
              <div className="flex items-center justify-between text-xs text-emerald-700"><span>Pagadas</span><CheckCircle2 className="h-4 w-4" /></div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{fmtMXN(totalCobrado)}</div>
              <div className="text-[11px] text-muted-foreground">{paidInvoices.length} {paidInvoices.length === 1 ? 'factura' : 'facturas'}</div>
            </button>
            <button type="button" onClick={() => setStatusFilter('failed')} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === 'failed' ? 'border-red-400 bg-red-50' : 'border-border/60 hover:bg-muted/40'}`}>
              <div className="flex items-center justify-between text-xs text-red-700"><span>Intentos fallidos</span><AlertTriangle className="h-4 w-4" /></div>
              <div className="mt-1 text-xl font-bold text-red-700">{fmtMXN(totalFallido)}</div>
              <div className="text-[11px] text-muted-foreground">{failedInvoices.length} {failedInvoices.length === 1 ? 'factura' : 'facturas'}</div>
            </button>
            <button type="button" onClick={() => setStatusFilter('pending')} className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === 'pending' ? 'border-amber-400 bg-amber-50' : 'border-border/60 hover:bg-muted/40'}`}>
              <div className="flex items-center justify-between text-xs text-amber-700"><span>Pendientes</span><Clock3 className="h-4 w-4" /></div>
              <div className="mt-1 text-xl font-bold text-amber-700">{fmtMXN(totalPendiente)}</div>
              <div className="text-[11px] text-muted-foreground">{pendingInvoices.length} {pendingInvoices.length === 1 ? 'factura' : 'facturas'}</div>
            </button>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(200px,1fr)_150px_150px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Empresa, cliente, correo, folio o ID Stripe..." value={search} onChange={event => setSearch(event.target.value)} className="pl-9 bg-background" />
            </div>
            <ModalSelect
              options={[{ value: 'all', label: 'Todas las empresas' }, ...empresaOptions]}
              value={empresaFilter}
              onChange={setEmpresaFilter}
              placeholder="Todas las empresas"
            />
            <Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="bg-background" aria-label="Fecha inicial" />
            <Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="bg-background" aria-label="Fecha final" />
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-10 px-3">
              <XCircle className="h-4 w-4 mr-1.5" /> Limpiar
            </Button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {(['all', 'paid', 'failed', 'pending', 'draft', 'void'] as PaymentState[]).map(state => (
              <Button key={state} size="sm" variant={statusFilter === state ? 'default' : 'outline'} className="h-8 whitespace-nowrap text-xs" onClick={() => setStatusFilter(state)}>
                {state === 'all' ? 'Todas' : PAYMENT_STATE_LABELS[state]}
              </Button>
            ))}
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando facturas...</div> : (
            <div className="overflow-x-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cliente (Stripe)</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Intentos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-32">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sin facturas con estos filtros</TableCell></TableRow>
                ) : filtered.map(inv => {
                  const remaining = typeof inv.amount_remaining === 'number' ? inv.amount_remaining : (inv.amount_due - (inv.amount_paid || 0));
                  const paymentState = getPaymentState(inv);
                  const isPaid = paymentState === 'paid';
                  return (
                  <TableRow key={inv.id} className={paymentState === 'failed' ? 'bg-red-50/40' : undefined}>
                    <TableCell className="text-sm">
                      {inv.empresa_nombre ? (
                        <span className="font-medium text-foreground">{inv.empresa_nombre}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Sin asociar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.customer_email || inv.customer_name || '—'}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{inv.number || '—'}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px] text-muted-foreground">{inv.description}</TableCell>
                    <TableCell>{statusBadge(paymentState)}</TableCell>
                    <TableCell className="text-center text-sm font-medium">{inv.attempt_count || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtMXN(inv.amount_due / 100)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMXN((inv.amount_paid || 0) / 100)}</TableCell>
                    <TableCell className={`text-right font-semibold ${remaining > 0 ? 'text-destructive' : 'text-primary'}`}>{fmtMXN(remaining / 100)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created * 1000), 'dd MMM yy', { locale: es })}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedInvoice(inv)} title="Ver detalle completo">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {inv.hosted_invoice_url && !isPaid && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(inv.hosted_invoice_url!);
                                toast.success('Link de pago copiado');
                              }}
                              title="Copiar link de pago"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => {
                                const tel = (profilesMap[inv.empresa_id || '']?.telefono || '').replace(/\D/g, '');
                                const nombre = profilesMap[inv.empresa_id || '']?.nombre?.split(' ')[0] || '';
                                const empresa = inv.empresa_nombre || '';
                                const monto = fmtMXN(remaining / 100);
                                const folio = inv.number ? ` (${inv.number})` : '';
                                const msg =
                                  `¡Hola${nombre ? ' ' + nombre : ''}! 👋\n\n` +
                                  `Te compartimos el link de pago de tu factura${folio}${empresa ? ` de *${empresa}*` : ''} por *${monto}*.\n\n` +
                                  `💳 Paga en línea de forma segura aquí:\n${inv.hosted_invoice_url}\n\n` +
                                  `Aceptamos tarjeta de crédito/débito. Una vez pagada, tu cuenta se reactiva automáticamente. ✅\n\n` +
                                  `Cualquier duda, estamos para ayudarte. ¡Gracias por confiar en Rutapp! 🚀`;
                                const url = tel
                                  ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
                                  : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                                window.open(url, '_blank');
                              }}
                              title="Enviar link por WhatsApp (abre WhatsApp con mensaje listo)"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {inv.status === 'open' && (
                          <Button size="sm" variant="ghost" disabled={sendingId === inv.id} onClick={() => sendInvoiceNotification(inv, 'email')} title="Enviar por correo">
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.hosted_invoice_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="Abrir página de pago"><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        {inv.invoice_pdf && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" title="Descargar PDF"><Download className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedInvoice} onOpenChange={open => { if (!open) setSelectedInvoice(null); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          {selectedInvoice && (() => {
            const state = getPaymentState(selectedInvoice);
            const remaining = selectedInvoice.amount_remaining ?? (selectedInvoice.amount_due - (selectedInvoice.amount_paid || 0));
            const dateTime = (seconds?: number | null) => seconds
              ? format(new Date(seconds * 1000), "dd MMM yyyy, HH:mm", { locale: es })
              : '—';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" /> {selectedInvoice.number || 'Factura Stripe'}
                  </DialogTitle>
                  <DialogDescription>Información completa registrada por Stripe.</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] text-muted-foreground">Total</div>
                    <div className="font-bold">{fmtMXN(selectedInvoice.amount_due / 100)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] text-muted-foreground">Pagado</div>
                    <div className="font-bold text-emerald-700">{fmtMXN((selectedInvoice.amount_paid || 0) / 100)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] text-muted-foreground">Saldo</div>
                    <div className={`font-bold ${remaining > 0 ? 'text-red-700' : ''}`}>{fmtMXN(remaining / 100)}</div>
                  </div>
                </div>

                <div className="rounded-xl border divide-y text-sm">
                  {[
                    ['Estado interpretado', statusBadge(state)],
                    ['Estado original Stripe', selectedInvoice.stripe_status || selectedInvoice.status || '—'],
                    ['Empresa RutApp', selectedInvoice.empresa_nombre || 'Sin asociar'],
                    ['Cliente Stripe', selectedInvoice.customer_name || '—'],
                    ['Correo', selectedInvoice.customer_email || '—'],
                    ['ID factura Stripe', selectedInvoice.id],
                    ['ID cliente Stripe', selectedInvoice.customer_id || '—'],
                    ['ID suscripción Stripe', selectedInvoice.subscription_id || '—'],
                    ['Descripción', selectedInvoice.description || '—'],
                    ['Generada', dateTime(selectedInvoice.created)],
                    ['Vencimiento', dateTime(selectedInvoice.due_date)],
                    ['Pagada', dateTime(selectedInvoice.paid_at)],
                    ['Intentos de cobro', String(selectedInvoice.attempt_count || 0)],
                    ['Próximo intento', dateTime(selectedInvoice.next_payment_attempt)],
                    ['Método de cobro', selectedInvoice.collection_method === 'charge_automatically' ? 'Cargo automático' : selectedInvoice.collection_method || '—'],
                    ['Motivo', selectedInvoice.billing_reason || '—'],
                    ['Moneda', (selectedInvoice.currency || 'mxn').toUpperCase()],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="grid grid-cols-[155px_minmax(0,1fr)] gap-3 px-3 py-2.5">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium break-all">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  {selectedInvoice.hosted_invoice_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={selectedInvoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" /> Abrir en Stripe</a>
                    </Button>
                  )}
                  {selectedInvoice.invoice_pdf && (
                    <Button size="sm" asChild>
                      <a href={selectedInvoice.invoice_pdf} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1.5" /> Descargar PDF</a>
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create invoice dialog */}
      <Dialog open={showCreate} onOpenChange={v => { if (!v) resetForm(); setShowCreate(v); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Nueva factura profesional
            </DialogTitle>
            <DialogDescription>Selecciona la empresa, plan y usuarios para generar la factura automáticamente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Empresa selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Empresa</Label>
              <ModalSelect
                options={empresaOptions}
                value={form.empresa_id}
                onChange={handleEmpresaChange}
                placeholder="Buscar empresa..."
              />
            </div>

            {/* Contact info - auto filled, editable */}
            {form.empresa_id && (
              <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-accent/30">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Datos de envío
                </h4>
                {/* Email */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enviar_email"
                      checked={form.enviar_email}
                      onCheckedChange={v => setForm(f => ({ ...f, enviar_email: !!v }))}
                    />
                    <Label htmlFor="enviar_email" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <Mail className="h-3.5 w-3.5" /> Enviar por correo
                    </Label>
                  </div>
                  {form.enviar_email && (
                    <Input
                      type="email"
                      placeholder="correo@empresa.com"
                      value={form.correo}
                      onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                      className="mt-1"
                    />
                  )}
                </div>
                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enviar_whatsapp"
                      checked={form.enviar_whatsapp}
                      onCheckedChange={v => setForm(f => ({ ...f, enviar_whatsapp: !!v }))}
                    />
                    <Label htmlFor="enviar_whatsapp" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
                    </Label>
                  </div>
                  {form.enviar_whatsapp && (
                    <div className="flex gap-2 mt-1">
                      <div className="w-[180px] shrink-0">
                        <ModalSelect
                          options={ladaOptions}
                          value={form.lada}
                          onChange={v => setForm(f => ({ ...f, lada: v }))}
                          placeholder="Lada..."
                        />
                      </div>
                      <Input
                        type="tel"
                        placeholder="55 1234 5678"
                        value={form.telefono}
                        onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Plan + usuarios */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <ModalSelect
                  options={planOptions}
                  value={form.plan_id}
                  onChange={v => setForm(f => ({ ...f, plan_id: v }))}
                  placeholder="Seleccionar plan..."
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Usuarios</Label>
                <Input type="number" min={1} max={100} value={form.num_usuarios}
                  onChange={e => setForm(f => ({ ...f, num_usuarios: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
            </div>

            {/* Timbres */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Timbres CFDI</Label>
                <Input type="number" min={0} value={form.timbres}
                  onChange={e => setForm(f => ({ ...f, timbres: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Precio por timbre (MXN)</Label>
                <Input type="number" min={0} step={0.5} value={form.precio_timbre}
                  onChange={e => setForm(f => ({ ...f, precio_timbre: Math.max(0, parseFloat(e.target.value) || 0) }))} />
              </div>
            </div>

            {/* Descuento extra + días */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Descuento extra (%)</Label>
                <Input type="number" min={0} max={100} value={form.descuento_extra_pct}
                  onChange={e => setForm(f => ({ ...f, descuento_extra_pct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
              </div>
              <div className="space-y-2">
                <Label>Días para pagar</Label>
                <Input type="number" min={1} value={form.dias_pagar}
                  onChange={e => setForm(f => ({ ...f, dias_pagar: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
            </div>

            {/* Concepto personalizado */}
            <div className="space-y-2">
              <Label>Concepto (opcional)</Label>
              <Input placeholder={`Suscripción Rutapp ${selectedPlan?.nombre || ''}`} value={form.concepto}
                onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} />
            </div>

            {/* Mensaje personal */}
            <div className="space-y-2">
              <Label>Mensaje personal para el email (opcional)</Label>
              <Textarea placeholder="Ej: Gracias por confiar en nosotros..." rows={2} value={form.mensaje_personal}
                onChange={e => setForm(f => ({ ...f, mensaje_personal: e.target.value }))} />
            </div>

            <Separator />

            {/* Resumen de cobro */}
            <div className="bg-accent/50 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-sm text-foreground">Resumen de cobro</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {form.num_usuarios} usuario{form.num_usuarios > 1 ? 's' : ''} × {fmtMXN(selectedPlan.precio_por_usuario)}
                    {selectedPlan.meses > 1 && ` × ${selectedPlan.meses} meses`}
                  </span>
                  <span>{fmtMXN(subtotalUsuarios)}</span>
                </div>
                {descuentoPlan > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descuento plan {selectedPlan.descuento_pct}%</span>
                    <span>-{fmtMXN(descuentoPlan)}</span>
                  </div>
                )}
                {form.timbres > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{form.timbres} timbres × {fmtMXN(form.precio_timbre)}</span>
                    <span>{fmtMXN(subtotalTimbres)}</span>
                  </div>
                )}
                {descuentoExtra > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descuento extra {form.descuento_extra_pct}%</span>
                    <span>-{fmtMXN(descuentoExtra)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary">{fmtMXN(total)} MXN</span>
                </div>
              </div>

              {/* Send summary */}
              {(form.enviar_email || form.enviar_whatsapp) && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Se enviará por:</p>
                  {form.enviar_email && form.correo && (
                    <p className="text-xs flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-primary" /> {form.correo}
                    </p>
                  )}
                  {form.enviar_whatsapp && form.telefono && (
                    <p className="text-xs flex items-center gap-1.5">
                      <MessageCircle className="h-3 w-3 text-primary" /> {form.lada} {form.telefono}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowCreate(false); }}>Cancelar</Button>
              <Button disabled={creating || !form.empresa_id} onClick={handleCreateInvoice}>
                <Send className="h-4 w-4 mr-1.5" />
                {creating ? 'Creando...' : 'Crear y enviar factura'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
