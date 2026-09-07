import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, CircleDollarSign,
  Edit3, Gift, Landmark, Link2, Loader2, Mail, Phone, Receipt, ShieldCheck,
  Tag, UserCheck, Wallet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { auditPartnerProgram } from '@/lib/partnerProgram';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

const fmt = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
const fmtDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const SUB_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-emerald-100 text-emerald-800' },
  trial: { label: 'Prueba', className: 'bg-blue-100 text-blue-800' },
  gracia: { label: 'Gracia', className: 'bg-amber-100 text-amber-800' },
  past_due: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendida', className: 'bg-slate-200 text-slate-800' },
  cancelled: { label: 'Cancelada', className: 'bg-slate-200 text-slate-800' },
  sin_suscripcion: { label: 'Sin suscripción', className: 'bg-slate-100 text-slate-700' },
};

type EditForm = {
  nombre: string;
  email: string;
  telefono: string;
  estado: string;
  notas: string;
  razon_social: string;
  rfc: string;
  regimen_fiscal: string;
  tipo_persona: string;
  banco: string;
  clabe: string;
  contrato_firmado_at: string;
  contrato_referencia: string;
};

type PartnerRow = Database['public']['Tables']['partners']['Row'];
type LevelRow = Database['public']['Tables']['partner_niveles']['Row'];
type LevelProgress = Database['public']['Functions']['get_partner_nivel']['Returns'][number];
type CouponRow = Database['public']['Tables']['cupones']['Row'];
type PaymentRow = Database['public']['Tables']['partner_pagos']['Row'];
type SubscriptionRow = Pick<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'empresa_id' | 'status' | 'acceso_bloqueado' | 'trial_ends_at' | 'current_period_end' | 'fecha_vencimiento' | 'stripe_subscription_id' | 'updated_at'>;
type AttributionRow = Database['public']['Tables']['partner_atribuciones']['Row'] & { empresas: { id: string; nombre: string; created_at: string } | null };
type CompanyRow = AttributionRow & { subscription: SubscriptionRow | null };
type CommissionRow = Database['public']['Tables']['partner_comisiones']['Row'] & {
  empresas: { nombre: string } | null;
  facturas: { numero_factura: string | null; estado: string | null; total: number; fecha_pago: string | null; stripe_invoice_id: string | null } | null;
};

function emptyEditForm(): EditForm {
  return { nombre: '', email: '', telefono: '', estado: 'activo', notas: '', razon_social: '', rfc: '', regimen_fiscal: '', tipo_persona: '', banco: '', clabe: '', contrato_firmado_at: '', contrato_referencia: '' };
}

export default function PartnerAdminDetailPage() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ metodo: 'Transferencia', referencia: '', notas: '' });
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm());

  const detailQuery = useQuery({
    queryKey: ['admin-partner-detail', partnerId],
    enabled: Boolean(partnerId),
    queryFn: async () => {
      if (!partnerId) throw new Error('Partner no especificado');

      const partnerResult = await supabase.from('partners').select('*').eq('id', partnerId).maybeSingle();
      if (partnerResult.error) throw partnerResult.error;
      if (!partnerResult.data) throw new Error('El partner no existe o no está disponible');

      const [levelResult, levelsResult, attributionsResult, commissionsResult, couponsResult, paymentsResult] = await Promise.all([
        supabase.rpc('get_partner_nivel', { _partner_id: partnerId }),
        supabase.from('partner_niveles').select('*').order('orden'),
        supabase.from('partner_atribuciones')
          .select('id,empresa_id,cupon_id,metodo,ref_slug,created_at,empresas:empresa_id(id,nombre,created_at)')
          .eq('partner_id', partnerId).order('created_at', { ascending: false }),
        supabase.from('partner_comisiones')
          .select('*,empresas:empresa_id(nombre),facturas:factura_id(numero_factura,estado,total,fecha_pago,stripe_invoice_id)')
          .eq('partner_id', partnerId).order('created_at', { ascending: false }),
        supabase.from('cupones').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false }),
        supabase.from('partner_pagos').select('*').eq('partner_id', partnerId).order('pagado_en', { ascending: false }),
      ]);

      const firstError = [levelResult.error, levelsResult.error, attributionsResult.error, commissionsResult.error, couponsResult.error, paymentsResult.error].find(Boolean);
      if (firstError) throw firstError;

      const coupons = (couponsResult.data || []) as CouponRow[];
      const byCompany = new Map<string, AttributionRow>();
      ((attributionsResult.data || []) as unknown as AttributionRow[]).forEach(row => byCompany.set(row.empresa_id, row));
      const couponIds = coupons.map(row => row.id);
      if (couponIds.length) {
        const usageResult = await supabase.from('cupon_usos').select('id,empresa_id,cupon_id,aplicado_at').in('cupon_id', couponIds);
        if (usageResult.error) throw usageResult.error;
        (usageResult.data || []).forEach(usage => {
          if (!byCompany.has(usage.empresa_id)) {
            byCompany.set(usage.empresa_id, {
              id: `coupon-use-${usage.id}`, empresa_id: usage.empresa_id, cupon_id: usage.cupon_id,
              metodo: 'cupon', ref_slug: null, created_at: usage.aplicado_at || new Date(0).toISOString(),
              partner_id: partnerId, empresas: null,
            });
          }
        });
      }
      const attributions = [...byCompany.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const companyIds = [...new Set(attributions.map(row => row.empresa_id).filter(Boolean))];
      let subscriptions: SubscriptionRow[] = [];
      const companyNames = new Map<string, { id: string; nombre: string; created_at: string }>();
      if (companyIds.length) {
        const [subResult, companyResult] = await Promise.all([
          supabase.from('subscriptions')
            .select('id,empresa_id,status,acceso_bloqueado,trial_ends_at,current_period_end,fecha_vencimiento,stripe_subscription_id,updated_at')
            .in('empresa_id', companyIds).order('updated_at', { ascending: true }),
          supabase.from('empresas').select('id,nombre,created_at').in('id', companyIds),
        ]);
        if (subResult.error) throw subResult.error;
        if (companyResult.error) throw companyResult.error;
        subscriptions = subResult.data || [];
        (companyResult.data || []).forEach(company => companyNames.set(company.id, company));
      }

      const subscriptionByCompany = new Map<string, SubscriptionRow>();
      subscriptions.forEach(sub => subscriptionByCompany.set(sub.empresa_id, sub));
      const companies = attributions.map(row => ({ ...row, empresas: row.empresas || companyNames.get(row.empresa_id) || null, subscription: subscriptionByCompany.get(row.empresa_id) || null }));

      return {
        partner: partnerResult.data as PartnerRow,
        level: ((levelResult.data || [])[0] || null) as LevelProgress | null,
        levels: (levelsResult.data || []) as LevelRow[],
        companies: companies as CompanyRow[],
        commissions: (commissionsResult.data || []) as unknown as CommissionRow[],
        coupons,
        payments: (paymentsResult.data || []) as PaymentRow[],
      };
    },
  });

  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail?.partner) return;
    const p = detail.partner;
    setEditForm({
      nombre: p.nombre || '', email: p.email || '', telefono: p.telefono || '', estado: p.estado || 'activo', notas: p.notas || '',
      razon_social: p.razon_social || '', rfc: p.rfc || '', regimen_fiscal: p.regimen_fiscal || '', tipo_persona: p.tipo_persona || '', banco: p.banco || '', clabe: p.clabe || '',
      contrato_firmado_at: p.contrato_firmado_at || '', contrato_referencia: p.contrato_referencia || '',
    });
  }, [detail?.partner]);

  const summary = useMemo(() => {
    const commissions = detail?.commissions || [];
    const valid = commissions.filter(row => row.status !== 'anulada');
    const total = valid.reduce((sum, row) => sum + Number(row.monto_comision || 0), 0);
    const pending = valid.filter(row => row.status === 'pendiente').reduce((sum, row) => sum + Number(row.monto_comision || 0), 0);
    const paid = valid.filter(row => row.status === 'pagada').reduce((sum, row) => sum + Number(row.monto_comision || 0), 0);
    const activeCompanies = (detail?.companies || []).filter(row => row.subscription?.status === 'active' && !row.subscription?.acceso_bloqueado).length;
    return { total, pending, paid, activeCompanies };
  }, [detail]);

  const findings = useMemo(() => {
    if (!detail) return [];
    return auditPartnerProgram({
      currentCommissionPct: Number(detail.level?.comision_pct ?? detail.partner.comision_pct ?? 0),
      currentLevelOrder: Number(detail.level?.orden ?? 0),
      termsAcceptedAt: detail.partner.terms_accepted_at,
      contractSignedAt: detail.partner.contrato_firmado_at,
      coupons: detail.coupons,
      commissions: detail.commissions.map(row => ({ ...row, factura_estado: row.facturas?.estado })),
      payments: detail.payments,
      levels: detail.levels,
    });
  }, [detail]);

  const savePartner = async () => {
    if (!partnerId || !editForm.nombre.trim()) return;
    if (editForm.rfc && !/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(editForm.rfc.trim().toUpperCase())) {
      toast.error('El RFC no tiene un formato válido'); return;
    }
    if (editForm.clabe && !/^\d{18}$/.test(editForm.clabe.trim())) {
      toast.error('La CLABE debe contener exactamente 18 dígitos'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('partners').update({
      nombre: editForm.nombre.trim(), email: editForm.email.trim().toLowerCase() || null,
      telefono: editForm.telefono.trim() || null, estado: editForm.estado, notas: editForm.notas.trim() || null,
      razon_social: editForm.razon_social.trim() || null, rfc: editForm.rfc.trim().toUpperCase() || null,
      regimen_fiscal: editForm.regimen_fiscal.trim() || null, tipo_persona: editForm.tipo_persona || null, banco: editForm.banco.trim() || null,
      clabe: editForm.clabe.trim() || null,
      contrato_firmado_at: editForm.contrato_firmado_at || null, contrato_referencia: editForm.contrato_referencia.trim() || null,
    }).eq('id', partnerId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Expediente del partner actualizado');
    setEditOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-partner-detail', partnerId] });
    queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  const payAllPending = async () => {
    if (!partnerId || summary.pending <= 0) return;
    if (/transfer/i.test(paymentForm.metodo) && !paymentForm.referencia.trim()) {
      toast.error('Captura la referencia bancaria de la transferencia'); return;
    }
    const ids = (detail?.commissions || []).filter(row => row.status === 'pendiente').map(row => row.id);
    setPaying(true);
    const { error } = await supabase.rpc('pagar_comisiones_partner', {
      p_partner_id: partnerId, p_monto: summary.pending, p_metodo: paymentForm.metodo.trim() || null,
      p_referencia: paymentForm.referencia.trim() || null, p_notas: paymentForm.notas.trim() || null, p_comision_ids: ids,
    });
    setPaying(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Pago conciliado y registrado');
    setPayOpen(false);
    setPaymentForm({ metodo: 'Transferencia', referencia: '', notas: '' });
    queryClient.invalidateQueries({ queryKey: ['admin-partner-detail', partnerId] });
    queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  if (detailQuery.isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Cargando expediente…</div>;
  }
  if (detailQuery.error || !detail) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="border-destructive/40"><CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">No se pudo cargar el partner</h1>
          <p className="text-sm text-muted-foreground">{detailQuery.error instanceof Error ? detailQuery.error.message : 'Error desconocido'}</p>
          <Button variant="outline" onClick={() => navigate('/super-admin/partners')}><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Button>
        </CardContent></Card>
      </div>
    );
  }

  const { partner, level, companies, commissions, coupons, payments } = detail;
  const currentPct = Number(level?.comision_pct ?? partner.comision_pct ?? 0);

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <Link to="/super-admin/partners" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Partners</Link>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black">{partner.nombre}</h1>
            <Badge className={partner.estado === 'activo' ? 'bg-emerald-600' : 'bg-slate-500'}>{partner.estado}</Badge>
            {level && <Badge variant="outline" className="text-sm">{level.emoji} {level.nombre} · {currentPct}%</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
            <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {partner.email || 'Sin correo'}</span>
            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {partner.telefono || 'Sin teléfono'}</span>
            <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> rutapp.mx/?ref={partner.ref_slug}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}><Edit3 className="h-4 w-4 mr-1" /> Editar expediente</Button>
          <Button disabled={summary.pending <= 0 || (partner.estado === 'activo' && summary.pending < 500) || paying} onClick={() => setPayOpen(true)} title={partner.estado === 'activo' && summary.pending < 500 ? 'El mínimo de pago es $500 MXN' : undefined}>
            {paying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wallet className="h-4 w-4 mr-1" />} Pagar {fmt(summary.pending)}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Empresas activas', value: summary.activeCompanies, icon: UserCheck, color: '#10B981' },
          { label: 'Comisión vigente', value: `${currentPct}%`, icon: CircleDollarSign, color: '#4F46E5' },
          { label: 'Total ganado', value: fmt(summary.total), icon: Receipt, color: '#0EA5E9' },
          { label: 'Total pagado', value: fmt(summary.paid), icon: CheckCircle2, color: '#059669' },
          { label: 'Por pagar', value: fmt(summary.pending), icon: Wallet, color: '#8B5CF6' },
        ].map(item => (
          <Card key={item.label}><CardContent className="p-4">
            <item.icon className="h-5 w-5 mb-3" style={{ color: item.color }} />
            <div className="text-xl md:text-2xl font-black">{item.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="resumen">Resumen y metas</TabsTrigger>
          <TabsTrigger value="empresas">Empresas ({companies.length})</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones ({commissions.length})</TabsTrigger>
          <TabsTrigger value="cupones">Cupones ({coupons.length})</TabsTrigger>
          <TabsTrigger value="pagos">Pagos ({payments.length})</TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-1">Auditoría {findings.length > 0 && <Badge variant="destructive" className="h-5 px-1.5">{findings.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Meta y nivel actual</CardTitle></CardHeader><CardContent>
              {level ? <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-4xl" style={{ background: `${level.color}18` }}>{level.emoji}</div>
                  <div><div className="text-2xl font-black" style={{ color: level.color }}>{level.nombre}</div><div className="text-sm text-muted-foreground">{level.empresas_actuales} empresas activas · {level.comision_pct}% recurrente</div></div>
                </div>
                {level.siguiente_nombre ? <>
                  <div className="flex justify-between text-sm"><span>Siguiente: <b>{level.siguiente_nombre} ({level.siguiente_pct}%)</b></span><span>Faltan <b>{level.empresas_para_siguiente}</b></span></div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, ((level.empresas_actuales - level.empresas_min) / Math.max(1, (level.empresas_max - level.empresas_min + 1))) * 100)}%`, background: level.color }} /></div>
                </> : <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><b>Nivel máximo alcanzado.</b> Ya no existe una meta superior.</div>}
              </div> : <p className="text-sm text-muted-foreground">Sin nivel calculado.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Expediente</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Alta</span><b>{fmtDate(partner.created_at)}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">RFC</span><b>{partner.rfc || 'Pendiente'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cuenta pago</span><b>{partner.clabe ? `•••• ${partner.clabe.slice(-4)}` : 'Pendiente'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Términos</span><b className={partner.terms_accepted_at ? 'text-emerald-700' : 'text-amber-700'}>{partner.terms_accepted_at ? `v${partner.terms_version}` : 'Sin evidencia'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Contrato</span><b className={partner.contrato_firmado_at ? 'text-emerald-700' : 'text-amber-700'}>{partner.contrato_firmado_at ? fmtDate(partner.contrato_firmado_at) : 'Pendiente'}</b></div>
              {partner.notas && <div className="pt-2 border-t"><div className="text-muted-foreground text-xs mb-1">Notas internas</div><p>{partner.notas}</p></div>}
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Escalera publicada de metas y bonos únicos</CardTitle></CardHeader><CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">{detail.levels.map(item => {
              const reached = Number(item.orden) <= Number(level?.orden || 0);
              const bonusRow = commissions.find(row => row.tipo === 'bono_nivel' && row.nivel_id === item.id);
              return <div key={item.id} className={`rounded-xl border-2 p-4 ${reached ? 'bg-emerald-50/40' : ''}`} style={{ borderColor: reached ? item.color : '#e5e7eb' }}>
                <div className="text-2xl">{item.emoji}</div><div className="font-black mt-1" style={{ color: item.color }}>{item.nombre}</div>
                <div className="text-sm font-bold">{item.comision_pct}%</div><div className="text-xs text-muted-foreground">Desde {item.empresas_min} activas</div>
                {Number(item.bono_mxn || 0) > 0 && <div className="mt-2 text-xs font-semibold flex items-center gap-1"><Gift className="h-3 w-3" /> {fmt(Number(item.bono_mxn))} · {bonusRow ? bonusRow.status : reached ? 'FALTA' : 'Por alcanzar'}</div>}
              </div>;
            })}</div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="empresas"><Card><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Estado</TableHead><TableHead>Origen</TableHead><TableHead>Alta</TableHead><TableHead>Stripe</TableHead></TableRow></TableHeader><TableBody>
          {companies.map(row => { const status = row.subscription?.acceso_bloqueado ? 'suspended' : row.subscription?.status || 'sin_suscripcion'; const meta = SUB_STATUS[status] || { label: status, className: 'bg-slate-100' }; return <TableRow key={row.id}>
            <TableCell className="font-medium">{row.empresas?.nombre || 'Empresa referida'}</TableCell><TableCell><Badge className={meta.className}>{meta.label}</Badge></TableCell>
            <TableCell>{row.metodo}{row.ref_slug ? ` · /${row.ref_slug}` : ''}</TableCell><TableCell>{fmtDate(row.created_at)}</TableCell><TableCell className="font-mono text-xs">{row.subscription?.stripe_subscription_id || '—'}</TableCell>
          </TableRow>; })}
          {!companies.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin empresas referidas</TableCell></TableRow>}
        </TableBody></Table></Card></TabsContent>

        <TabsContent value="comisiones"><Card><Table><TableHeader><TableRow><TableHead>Periodo</TableHead><TableHead>Tipo / empresa</TableHead><TableHead>Base</TableHead><TableHead>Regla</TableHead><TableHead className="text-right">Comisión</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>
          {commissions.map(row => <TableRow key={row.id}><TableCell>{row.periodo}</TableCell><TableCell>{row.tipo === 'bono_nivel' ? <Badge className="bg-amber-100 text-amber-800"><Gift className="h-3 w-3 mr-1" /> Bono de nivel</Badge> : row.empresas?.nombre || 'Empresa'}</TableCell>
            <TableCell>{fmt(Number(row.monto_factura))}</TableCell><TableCell>{row.tipo === 'bono_nivel' ? row.notas : `${row.partner_pct}% − ${row.cupon_pct}%`}</TableCell><TableCell className="text-right font-bold">{fmt(Number(row.monto_comision))}</TableCell><TableCell><Badge variant={row.status === 'pagada' ? 'default' : row.status === 'pendiente' ? 'secondary' : 'outline'}>{row.status}</Badge></TableCell></TableRow>)}
          {!commissions.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin comisiones</TableCell></TableRow>}
        </TableBody></Table></Card></TabsContent>

        <TabsContent value="cupones"><Card><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descuento</TableHead><TableHead>Comisión disponible</TableHead><TableHead>Usos</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>
          {coupons.map(row => { const over = Number(row.descuento_pct) > currentPct; return <TableRow key={row.id} className={over && row.activo ? 'bg-red-50' : ''}><TableCell className="font-mono font-bold">{row.codigo}</TableCell><TableCell>{row.descuento_pct}%</TableCell><TableCell>{currentPct}% − {row.descuento_pct}% = <b>{Math.max(currentPct - Number(row.descuento_pct), 0)}%</b></TableCell><TableCell>{row.usos_actuales || 0}</TableCell><TableCell>{over && row.activo ? <Badge variant="destructive">Fuera de regla</Badge> : <Badge variant={row.activo ? 'default' : 'secondary'}>{row.activo ? 'Activo' : 'Inactivo'}</Badge>}</TableCell></TableRow>; })}
          {!coupons.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin cupones</TableCell></TableRow>}
        </TableBody></Table></Card></TabsContent>

        <TabsContent value="pagos"><Card><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Método</TableHead><TableHead>Referencia</TableHead><TableHead>Notas</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader><TableBody>
          {payments.map(row => <TableRow key={row.id}><TableCell>{fmtDate(row.pagado_en)}</TableCell><TableCell>{row.metodo || '—'}</TableCell><TableCell>{row.referencia || '—'}</TableCell><TableCell>{row.notas || '—'}</TableCell><TableCell className="text-right font-bold">{fmt(Number(row.monto))}</TableCell></TableRow>)}
          {!payments.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin pagos registrados</TableCell></TableRow>}
        </TableBody></Table></Card></TabsContent>

        <TabsContent value="auditoria" className="space-y-3">
          {findings.length === 0 ? <Card className="border-emerald-300 bg-emerald-50"><CardContent className="p-6 flex gap-3"><ShieldCheck className="h-7 w-7 text-emerald-600" /><div><div className="font-bold text-emerald-900">Sin discrepancias detectadas</div><p className="text-sm text-emerald-800">Cupones, fórmulas, bonos y pagos coinciden con las reglas registradas.</p></div></CardContent></Card> : findings.map(item => <Card key={item.id} className={item.severity === 'critical' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}><CardContent className="p-4 flex gap-3"><AlertTriangle className={`h-5 w-5 shrink-0 ${item.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} /><div><div className="font-bold">{item.title}</div><p className="text-sm text-muted-foreground">{item.detail}</p></div></CardContent></Card>)}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar expediente de partner</DialogTitle></DialogHeader><div className="grid md:grid-cols-2 gap-3">
        <div><Label>Nombre</Label><Input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} /></div>
        <div><Label>Estado</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
        <div><Label>Correo</Label><Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
        <div><Label>Teléfono</Label><Input value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })} /></div>
        <div><Label>Razón social</Label><Input value={editForm.razon_social} onChange={e => setEditForm({ ...editForm, razon_social: e.target.value })} /></div>
        <div><Label>RFC</Label><Input value={editForm.rfc} maxLength={13} onChange={e => setEditForm({ ...editForm, rfc: e.target.value.toUpperCase().replace(/\s/g, '') })} /></div>
        <div><Label>Régimen fiscal</Label><Input value={editForm.regimen_fiscal} onChange={e => setEditForm({ ...editForm, regimen_fiscal: e.target.value })} /></div>
        <div><Label>Tipo de persona</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editForm.tipo_persona} onChange={e => setEditForm({ ...editForm, tipo_persona: e.target.value })}><option value="">Sin definir</option><option value="fisica">Persona física</option><option value="moral">Persona moral</option></select></div>
        <div><Label>Banco</Label><Input value={editForm.banco} onChange={e => setEditForm({ ...editForm, banco: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>CLABE (18 dígitos)</Label><Input value={editForm.clabe} maxLength={18} inputMode="numeric" onChange={e => setEditForm({ ...editForm, clabe: e.target.value.replace(/\D/g, '') })} /></div>
        <div><Label>Fecha de contrato firmado</Label><Input type="date" value={editForm.contrato_firmado_at} onChange={e => setEditForm({ ...editForm, contrato_firmado_at: e.target.value })} /></div>
        <div><Label>Referencia del contrato</Label><Input value={editForm.contrato_referencia} onChange={e => setEditForm({ ...editForm, contrato_referencia: e.target.value })} placeholder="Folio o enlace interno" /></div>
        <div className="md:col-span-2"><Label>Notas internas</Label><Textarea rows={3} value={editForm.notas} onChange={e => setEditForm({ ...editForm, notas: e.target.value })} /></div>
      </div><div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2"><Landmark className="h-4 w-4 shrink-0" /> Los datos fiscales y bancarios son para pagos y comprobación. Verifica el RFC y la titularidad de la CLABE antes de transferir.</div><Button onClick={savePartner} disabled={saving} className="w-full">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Guardar expediente</Button></DialogContent></Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}><DialogContent><DialogHeader><DialogTitle>Registrar pago conciliado</DialogTitle></DialogHeader><div className="rounded-xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">Total de movimientos pendientes</div><div className="text-3xl font-black">{fmt(summary.pending)}</div></div><div><Label>Método</Label><Input value={paymentForm.metodo} onChange={e => setPaymentForm({ ...paymentForm, metodo: e.target.value })} /></div><div><Label>Referencia bancaria</Label><Input value={paymentForm.referencia} onChange={e => setPaymentForm({ ...paymentForm, referencia: e.target.value })} placeholder="Folio SPEI / referencia" /></div><div><Label>Notas</Label><Textarea value={paymentForm.notas} onChange={e => setPaymentForm({ ...paymentForm, notas: e.target.value })} /></div><p className="text-xs text-muted-foreground">El monto se calcula desde los movimientos y no puede editarse. La base validará todo dentro de una sola transacción.</p><Button onClick={payAllPending} disabled={paying} className="w-full">{paying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirmar pago</Button></DialogContent></Dialog>
    </div>
  );
}
