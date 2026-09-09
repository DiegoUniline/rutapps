import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, ArrowLeft, BadgeDollarSign, BriefcaseBusiness, Building2, Check,
  CircleDollarSign, Clock3, Eye, Loader2, Mail, Network, Pencil, Phone,
  RefreshCw, Search, Send, ShieldCheck, UserPlus, UsersRound, Wallet,
} from 'lucide-react';
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
  COMMISSION_MODE_LABELS, INTERNAL_COMMISSION_MODES, TEAM_LEVEL_LABELS,
  TEAM_SCOPE_LABELS, type InternalCommissionMode, type TeamAccessLevel,
  type TeamAccessScope,
} from '@/lib/internalTeam';

const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_active: boolean;
  notes: string | null;
  user_id: string | null;
  job_title: string | null;
  access_level: TeamAccessLevel;
  access_scope: TeamAccessScope;
  status: 'invited' | 'active' | 'suspended';
  commission_mode: InternalCommissionMode;
  commission_pct: number;
  commission_payment_limit: number | null;
  commission_fixed_amount: number;
  invited_at: string | null;
  last_access_at: string | null;
  reports_count: number;
  crm_leads: number;
  managed_companies: number;
  commissioned_companies: number;
  activities_30d: number;
  commission_pending: number;
  commission_paid: number;
}

interface TeamCompany {
  id: string;
  nombre: string;
  licencia: string | null;
  email: string | null;
  telefono: string | null;
  managed_by_id: string | null;
  managed_by_name: string | null;
  commissioned_by_id: string | null;
  commissioned_by_name: string | null;
  captured_by_name: string | null;
  has_partner: boolean;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  paid_total: number;
}

interface CommissionEntry {
  id: string;
  person_id: string;
  person_name: string;
  empresa_id: string;
  empresa_nombre: string;
  invoice_number: string | null;
  payment_number: number;
  period: string;
  base_amount: number;
  commission_mode: InternalCommissionMode;
  commission_pct: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'reversed' | 'void';
  created_at: string;
}

interface TeamActivity {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  person_id: string | null;
  person_name: string | null;
  activity_type: string;
  outcome: string | null;
  note: string | null;
  new_stage: string | null;
  created_at: string;
}

interface TeamWorkspace {
  generated_at: string;
  metrics: {
    active_members: number;
    invited_members: number;
    crm_leads: number;
    managed_companies: number;
    unassigned_companies: number;
    commission_pending: number;
    commission_paid: number;
  };
  members: TeamMember[];
  companies: TeamCompany[];
  commissions: CommissionEntry[];
  activities: TeamActivity[];
}

interface MemberDraft {
  id: string | null;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  managerId: string;
  accessLevel: TeamAccessLevel;
  accessScope: TeamAccessScope;
  status: 'invited' | 'active' | 'suspended';
  commissionMode: InternalCommissionMode;
  commissionPct: number;
  paymentLimit: number;
  fixedAmount: number;
  notes: string;
  reason: string;
}

const EMPTY_MEMBER: MemberDraft = {
  id: null, userId: null, name: '', email: '', phone: '', jobTitle: 'Ejecutivo comercial', managerId: '',
  accessLevel: 'executive', accessScope: 'own', status: 'invited', commissionMode: 'none',
  commissionPct: 0, paymentLimit: 3, fixedAmount: 0, notes: '', reason: '',
};

const money = (value: number | null | undefined) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 2,
}).format(Number(value) || 0);
const dateLabel = (value?: string | null, pattern = 'dd MMM yyyy') => value
  ? format(new Date(value), pattern, { locale: es })
  : '—';
const errorText = (error: unknown) => error instanceof Error ? error.message
  : typeof error === 'object' && error && 'message' in error ? String(error.message)
    : 'No se pudo completar la operación';

function Metric({ label, value, detail, icon: Icon, tone = 'blue' }: {
  label: string; value: string; detail: string; icon: typeof UsersRound; tone?: 'blue' | 'green' | 'amber' | 'violet';
}) {
  const tones = { blue: 'bg-blue-500/10 text-blue-600', green: 'bg-emerald-500/10 text-emerald-600', amber: 'bg-amber-500/10 text-amber-600', violet: 'bg-violet-500/10 text-violet-600' };
  return <Card><CardContent className="p-4"><div className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-4 w-4" /></div><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></CardContent></Card>;
}

function MemberStatus({ member }: { member: TeamMember }) {
  if (member.status === 'suspended' || !member.is_active) return <Badge variant="destructive">Suspendido</Badge>;
  if (!member.user_id) return <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">Sin cuenta</Badge>;
  if (member.status === 'invited') return <Badge variant="outline">Invitado</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-700">Activo</Badge>;
}

export default function AdminTeamTab() {
  const navigate = useNavigate();
  const { personId } = useParams<{ personId?: string }>();
  const [data, setData] = useState<TeamWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [memberDialog, setMemberDialog] = useState(false);
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_MEMBER);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [assignmentCompany, setAssignmentCompany] = useState<TeamCompany | null>(null);
  const [assignment, setAssignment] = useState({ managerId: '', commissionedId: '', reason: '' });
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [commissionSaving, setCommissionSaving] = useState<string | null>(null);
  const [payoutEntry, setPayoutEntry] = useState<CommissionEntry | null>(null);
  const [payout, setPayout] = useState({ method: 'transferencia', reference: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await rpcClient.rpc('fn_admin_team_workspace');
      if (error) throw error;
      setData(result as TeamWorkspace);
    } catch (error) { toast.error(errorText(error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const activeMembers = useMemo(
    () => members.filter(member => member.status !== 'suspended' && member.is_active),
    [members],
  );
  const selected = personId ? members.find(member => member.id === personId) ?? null : null;
  const filteredMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return members.filter(member => !term || `${member.name} ${member.email} ${member.job_title ?? ''}`.toLocaleLowerCase('es').includes(term));
  }, [members, search]);

  const openNew = () => { setDraft(EMPTY_MEMBER); setMemberDialog(true); };
  const openEdit = (member: TeamMember) => {
    setDraft({
      id: member.id, userId: member.user_id, name: member.name, email: member.email, phone: member.phone ?? '',
      jobTitle: member.job_title ?? '', managerId: member.manager_id ?? '', accessLevel: member.access_level,
      accessScope: member.access_scope, status: member.status, commissionMode: member.commission_mode,
      commissionPct: Number(member.commission_pct), paymentLimit: member.commission_payment_limit ?? 3,
      fixedAmount: Number(member.commission_fixed_amount), notes: member.notes ?? '', reason: '',
    });
    setMemberDialog(true);
  };

  const saveMember = async () => {
    if (!draft.name.trim() || !draft.email.includes('@')) { toast.error('Nombre y correo son obligatorios'); return; }
    setSaving(true);
    try {
      const { error } = await rpcClient.rpc('admin_save_team_member', {
        p_person_id: draft.id, p_name: draft.name, p_email: draft.email, p_phone: draft.phone || null,
        p_job_title: draft.jobTitle || null, p_manager_id: draft.managerId || null,
        p_access_level: draft.accessLevel, p_access_scope: draft.accessScope, p_status: draft.status,
        p_commission_mode: draft.commissionMode, p_commission_pct: draft.commissionPct,
        p_commission_payment_limit: draft.commissionMode === 'first_n_payments' ? draft.paymentLimit : null,
        p_commission_fixed_amount: draft.commissionMode === 'fixed_activation' ? draft.fixedAmount : 0,
        p_notes: draft.notes || null, p_change_reason: draft.reason || null,
      });
      if (error) throw error;
      toast.success(draft.id ? 'Integrante actualizado' : 'Integrante creado');
      setMemberDialog(false); await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };

  const grantAccess = async (member: TeamMember) => {
    setInviting(member.id);
    try {
      const { data: result, error } = await supabase.functions.invoke('admin-team-account', { body: { person_id: member.id } });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast.success(result?.invited ? 'Invitación enviada por correo' : 'Cuenta existente vinculada correctamente');
      await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setInviting(null); }
  };

  const openAssignment = (company: TeamCompany) => {
    setAssignmentCompany(company);
    setAssignment({ managerId: company.managed_by_id ?? '', commissionedId: company.commissioned_by_id ?? '', reason: '' });
  };

  const saveAssignment = async () => {
    if (!assignmentCompany || assignment.reason.trim().length < 3) { toast.error('Indica el motivo de la asignación'); return; }
    setAssignmentSaving(true);
    try {
      const { error } = await rpcClient.rpc('admin_set_team_company_assignment', {
        p_empresa_id: assignmentCompany.id, p_managed_by_id: assignment.managerId || null,
        p_commissioned_by_id: assignment.commissionedId || null, p_reason: assignment.reason,
      });
      if (error) throw error;
      toast.success('Responsable y comisión actualizados para pagos futuros');
      setAssignmentCompany(null); await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setAssignmentSaving(false); }
  };

  const approveCommission = async (entry: CommissionEntry) => {
    setCommissionSaving(entry.id);
    try {
      const { error } = await rpcClient.rpc('admin_set_internal_commission_status', { p_entry_id: entry.id, p_status: 'approved', p_reason: null });
      if (error) throw error;
      toast.success('Comisión aprobada'); await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setCommissionSaving(null); }
  };

  const payCommission = async () => {
    if (!payoutEntry || payout.reference.trim().length < 3) {
      toast.error('Escribe una referencia de pago');
      return;
    }
    setCommissionSaving(payoutEntry.id);
    try {
      const { error } = await rpcClient.rpc('admin_pay_internal_commissions', {
        p_person_id: payoutEntry.person_id,
        p_entry_ids: [payoutEntry.id],
        p_method: payout.method,
        p_reference: payout.reference,
        p_notes: payout.notes || null,
      });
      if (error) throw error;
      toast.success('Pago de comisión registrado');
      setPayoutEntry(null);
      await load();
    } catch (error) { toast.error(errorText(error)); }
    finally { setCommissionSaving(null); }
  };

  const openPayout = (entry: CommissionEntry) => {
    setPayoutEntry(entry);
    setPayout({ method: 'transferencia', reference: '', notes: '' });
  };

  if (loading && !data) return <div className="flex min-h-[520px] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando equipo…</div>;
  if (!data) return <div className="rounded-xl border border-red-500/30 p-6 text-center text-red-600">No se pudo cargar el módulo Equipo. Instala su migración SQL.</div>;

  const memberCompanies = selected ? data.companies.filter(company => company.managed_by_id === selected.id || company.commissioned_by_id === selected.id) : [];
  const memberCommissions = selected ? data.commissions.filter(entry => entry.person_id === selected.id) : [];
  const memberActivities = selected ? data.activities.filter(activity => activity.person_id === selected.id) : [];

  if (personId) {
    if (!selected) return <div className="space-y-4"><Button variant="ghost" onClick={() => navigate('/super-admin')}><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button><Card><CardContent className="p-10 text-center">El integrante no existe o ya no está disponible.</CardContent></Card></div>;
    return <div className="space-y-5">
      <Button variant="ghost" className="-ml-2" onClick={() => navigate('/super-admin')}><ArrowLeft className="mr-2 h-4 w-4" />Volver a Equipo</Button>
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black">{selected.name}</h1><MemberStatus member={selected} /><Badge variant="outline">{TEAM_LEVEL_LABELS[selected.access_level]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{selected.job_title || 'Sin puesto'} · {selected.email} · {TEAM_SCOPE_LABELS[selected.access_scope]}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => openEdit(selected)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>{!selected.user_id && <Button onClick={() => grantAccess(selected)} disabled={inviting === selected.id}><Send className="mr-2 h-4 w-4" />Dar acceso</Button>}</div></div></section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Prospectos" value={fmtNum(selected.crm_leads)} detail="CRM activo" icon={BriefcaseBusiness} /><Metric label="Empresas" value={fmtNum(selected.managed_companies)} detail="A su cargo" icon={Building2} tone="green" /><Metric label="Actividad 30d" value={fmtNum(selected.activities_30d)} detail="Bitácora real" icon={Activity} tone="violet" /><Metric label="Por cobrar" value={money(selected.commission_pending)} detail="Pendiente/aprobada" icon={Wallet} tone="amber" /><Metric label="Pagado" value={money(selected.commission_paid)} detail="Histórico" icon={CircleDollarSign} tone="green" /></div>
      <Tabs defaultValue="cartera" className="space-y-4"><TabsList className="h-auto flex-wrap"><TabsTrigger value="cartera">Empresas ({memberCompanies.length})</TabsTrigger><TabsTrigger value="comisiones">Comisiones ({memberCommissions.length})</TabsTrigger><TabsTrigger value="actividad">Operatividad ({memberActivities.length})</TabsTrigger><TabsTrigger value="acceso">Acceso</TabsTrigger></TabsList>
        <TabsContent value="cartera"><CompaniesTable companies={memberCompanies} onAssign={openAssignment} /></TabsContent>
        <TabsContent value="comisiones"><CommissionsTable entries={memberCommissions} savingId={commissionSaving} onApprove={approveCommission} onPay={openPayout} /></TabsContent>
        <TabsContent value="actividad"><ActivitiesTable activities={memberActivities} /></TabsContent>
        <TabsContent value="acceso"><Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Cuenta vinculada</p><b>{selected.user_id ? 'Sí' : 'No'}</b></div><div><p className="text-xs text-muted-foreground">Último acceso interno</p><b>{dateLabel(selected.last_access_at, 'dd MMM yyyy HH:mm')}</b></div><div><p className="text-xs text-muted-foreground">Nivel</p><b>{TEAM_LEVEL_LABELS[selected.access_level]}</b></div><div><p className="text-xs text-muted-foreground">Visibilidad</p><b>{TEAM_SCOPE_LABELS[selected.access_scope]}</b></div><div className="sm:col-span-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-amber-600" />Auditoría de cobros, administración de empresas y funciones críticas permanecen bloqueadas hasta definir permisos explícitos.</div></CardContent></Card></TabsContent>
      </Tabs>
      {renderDialogs()}
    </div>;
  }

  function renderDialogs() {
    return <>
      <MemberDialog open={memberDialog} setOpen={setMemberDialog} draft={draft} setDraft={setDraft} members={activeMembers} saving={saving} onSave={saveMember} />
      <AssignmentDialog company={assignmentCompany} onClose={() => setAssignmentCompany(null)} assignment={assignment} setAssignment={setAssignment} members={activeMembers} saving={assignmentSaving} onSave={saveAssignment} />
      <PayoutDialog entry={payoutEntry} payout={payout} setPayout={setPayout} saving={commissionSaving === payoutEntry?.id} onClose={() => setPayoutEntry(null)} onSave={payCommission} />
    </>;
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2"><div className="rounded-xl bg-primary p-2.5 text-primary-foreground"><UsersRound className="h-5 w-5" /></div><div><h1 className="text-xl font-black">Equipo RutApp</h1><p className="text-sm text-muted-foreground">Accesos, cartera, CRM y comisiones internas</p></div></div><p className="mt-3 max-w-3xl text-xs text-muted-foreground">Cada integrante conserva su cuenta de empresa por separado. Aquí únicamente administras su identidad interna y lo que puede consultar del trabajo comercial de RutApp.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />Actualizar</Button><Button onClick={openNew}><UserPlus className="mr-2 h-4 w-4" />Agregar integrante</Button></div></div></section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Equipo activo" value={fmtNum(data.metrics.active_members)} detail={`${fmtNum(data.metrics.invited_members)} invitaciones pendientes`} icon={UsersRound} /><Metric label="Prospectos" value={fmtNum(data.metrics.crm_leads)} detail="Asignados en CRM" icon={BriefcaseBusiness} tone="violet" /><Metric label="Cartera asignada" value={fmtNum(data.metrics.managed_companies)} detail={`${fmtNum(data.metrics.unassigned_companies)} sin responsable`} icon={Building2} tone="green" /><Metric label="Comisión pendiente" value={money(data.metrics.commission_pending)} detail={`${money(data.metrics.commission_paid)} pagado histórico`} icon={BadgeDollarSign} tone="amber" /></div>
    <Tabs defaultValue="integrantes" className="space-y-4"><div className="overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-full justify-start bg-transparent"><TabsTrigger value="integrantes">Integrantes</TabsTrigger><TabsTrigger value="cartera">Cartera y asignación</TabsTrigger><TabsTrigger value="comisiones">Comisiones</TabsTrigger><TabsTrigger value="operatividad">Operatividad</TabsTrigger></TabsList></div>
      <TabsContent value="integrantes"><Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><div className="relative max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Buscar nombre, correo o puesto…" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Integrante</th><th className="px-3 py-3 text-left">Acceso</th><th className="px-3 py-3 text-left">Encargado</th><th className="px-3 py-3 text-center">CRM</th><th className="px-3 py-3 text-center">Empresas</th><th className="px-3 py-3 text-left">Plan de comisión</th><th className="px-3 py-3 text-right">Pendiente</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead><tbody>{filteredMembers.map(member => <tr key={member.id} className="border-t hover:bg-muted/30"><td className="px-4 py-3"><button className="font-bold hover:text-primary hover:underline" onClick={() => navigate(`/super-admin/equipo/${member.id}`)}>{member.name}</button><p className="text-[10px] text-muted-foreground">{member.job_title || 'Sin puesto'} · {member.email}</p></td><td className="px-3 py-3"><MemberStatus member={member} /><p className="mt-1 text-[10px] text-muted-foreground">{TEAM_LEVEL_LABELS[member.access_level]} · {TEAM_SCOPE_LABELS[member.access_scope]}</p></td><td className="px-3 py-3">{member.manager_name || 'Sin encargado'}<p className="text-[10px] text-muted-foreground">{member.reports_count} persona(s) a cargo</p></td><td className="px-3 py-3 text-center font-bold">{member.crm_leads}</td><td className="px-3 py-3 text-center font-bold">{member.managed_companies}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[member.commission_mode]}<p className="text-[10px] text-muted-foreground">{member.commission_mode === 'fixed_activation' ? money(member.commission_fixed_amount) : member.commission_mode === 'none' ? 'No genera movimientos' : `${member.commission_pct}%`}</p></td><td className="px-3 py-3 text-right font-bold">{money(member.commission_pending)}</td><td className="px-4 py-3"><div className="flex justify-center gap-1"><Button size="icon" variant="ghost" onClick={() => navigate(`/super-admin/equipo/${member.id}`)}><Eye className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => openEdit(member)}><Pencil className="h-4 w-4" /></Button>{!member.user_id && <Button size="sm" variant="outline" onClick={() => grantAccess(member)} disabled={inviting === member.id}>{inviting === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-3.5 w-3.5" />Acceso</>}</Button>}</div></td></tr>)}{!filteredMembers.length && <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">Todavía no hay integrantes.</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
      <TabsContent value="cartera"><CompaniesTable companies={data.companies} onAssign={openAssignment} /></TabsContent>
      <TabsContent value="comisiones"><CommissionsTable entries={data.commissions} savingId={commissionSaving} onApprove={approveCommission} onPay={openPayout} /></TabsContent>
      <TabsContent value="operatividad"><ActivitiesTable activities={data.activities} /></TabsContent>
    </Tabs>
    {renderDialogs()}
  </div>;
}

function CompaniesTable({ companies, onAssign }: { companies: TeamCompany[]; onAssign: (company: TeamCompany) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => { const term=search.trim().toLocaleLowerCase('es'); return companies.filter(company => !term || `${company.nombre} ${company.licencia ?? ''} ${company.managed_by_name ?? ''}`.toLocaleLowerCase('es').includes(term)); }, [companies, search]);
  return <Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><div className="relative max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Buscar empresa, licencia o responsable…" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3 text-left">Captó</th><th className="px-3 py-3 text-left">Responsable</th><th className="px-3 py-3 text-left">Comisionista</th><th className="px-3 py-3 text-center">Suscripción</th><th className="px-3 py-3 text-right">Pagado</th><th className="px-4 py-3 text-center">Acción</th></tr></thead><tbody>{filtered.map(company => <tr key={company.id} className="border-t hover:bg-muted/30"><td className="px-4 py-3"><b>{company.nombre}</b><p className="text-[10px] text-muted-foreground">{company.licencia || 'Sin licencia'} · {company.email || 'Sin correo'}</p></td><td className="px-3 py-3">{company.captured_by_name || 'Orgánico/sin atribuir'}{company.has_partner && <Badge className="ml-2 text-[9px]">Partner</Badge>}</td><td className="px-3 py-3"><span className={cn(!company.managed_by_name && 'font-bold text-amber-600')}>{company.managed_by_name || 'Sin responsable'}</span></td><td className="px-3 py-3">{company.has_partner ? <span className="text-muted-foreground">Protegida por Partner</span> : company.commissioned_by_name || 'Sin comisión interna'}</td><td className="px-3 py-3 text-center"><Badge variant="outline">{company.subscription_status || 'Sin suscripción'}</Badge><p className="mt-1 text-[9px] text-muted-foreground">{company.stripe_subscription_id ? 'Stripe vinculada' : 'Sin Stripe'}</p></td><td className="px-3 py-3 text-right font-bold">{money(company.paid_total)}</td><td className="px-4 py-3 text-center"><Button size="sm" variant="outline" onClick={() => onAssign(company)}><Network className="mr-1.5 h-3.5 w-3.5" />Asignar</Button></td></tr>)}</tbody></table></div></CardContent></Card>;
}

function CommissionsTable({ entries, savingId, onApprove, onPay }: { entries: CommissionEntry[]; savingId: string | null; onApprove: (entry: CommissionEntry) => void; onPay: (entry: CommissionEntry) => void }) {
  const statusLabel: Record<CommissionEntry['status'], string> = { pending:'Pendiente', approved:'Aprobada', paid:'Pagada', reversed:'Revertida', void:'Anulada' };
  return <Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><h3 className="font-bold">Comisiones originadas por facturas pagadas</h3><p className="text-xs text-muted-foreground">Cada renglón conserva factura, base, regla y porcentaje aplicado.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Integrante</th><th className="px-3 py-3 text-left">Empresa/factura</th><th className="px-3 py-3 text-center">Pago</th><th className="px-3 py-3 text-right">Base cobrada</th><th className="px-3 py-3 text-left">Regla</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-3 py-3 text-center">Estado</th><th className="px-4 py-3 text-center">Acción</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className="border-t"><td className="px-4 py-3 font-bold">{entry.person_name}</td><td className="px-3 py-3">{entry.empresa_nombre}<p className="text-[10px] text-muted-foreground">{entry.invoice_number || 'Sin folio'} · {entry.period}</p></td><td className="px-3 py-3 text-center">#{entry.payment_number}</td><td className="px-3 py-3 text-right">{money(entry.base_amount)}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[entry.commission_mode]}<p className="text-[10px] text-muted-foreground">{entry.commission_pct ? `${entry.commission_pct}%` : 'Monto fijo'}</p></td><td className="px-3 py-3 text-right font-black text-emerald-600">{money(entry.commission_amount)}</td><td className="px-3 py-3 text-center"><Badge variant={entry.status === 'paid' ? 'default' : entry.status === 'reversed' || entry.status === 'void' ? 'destructive' : 'outline'}>{statusLabel[entry.status]}</Badge></td><td className="px-4 py-3 text-center">{entry.status === 'pending' && <Button size="sm" onClick={() => onApprove(entry)} disabled={savingId === entry.id}>{savingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Aprobar</>}</Button>}{entry.status === 'approved' && <Button size="sm" variant="outline" onClick={() => onPay(entry)} disabled={savingId === entry.id}><Wallet className="mr-1 h-3.5 w-3.5" />Registrar pago</Button>}</td></tr>)}{!entries.length && <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">Aún no hay comisiones internas. Se generarán con pagos futuros después de asignar un comisionista.</td></tr>}</tbody></table></div></CardContent></Card>;
}

function PayoutDialog({ entry, payout, setPayout, saving, onClose, onSave }: { entry: CommissionEntry | null; payout: { method: string; reference: string; notes: string }; setPayout: React.Dispatch<React.SetStateAction<{ method: string; reference: string; notes: string }>>; saving: boolean; onClose: () => void; onSave: () => void }) {
  return <Dialog open={!!entry} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Registrar pago de comisión</DialogTitle><DialogDescription>{entry ? `${entry.person_name} · ${entry.empresa_nombre} · ${money(entry.commission_amount)}` : ''}</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Método</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={payout.method} onChange={event => setPayout(current => ({ ...current, method: event.target.value }))}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="nomina">Nómina</option><option value="otro">Otro</option></select></div><div><Label>Referencia o comprobante *</Label><Input value={payout.reference} onChange={event => setPayout(current => ({ ...current, reference: event.target.value }))} placeholder="Folio bancario, recibo o referencia" /></div><div><Label>Notas</Label><Textarea value={payout.notes} onChange={event => setPayout(current => ({ ...current, notes: event.target.value }))} /></div><div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">Al confirmar, la comisión quedará pagada y vinculada a este comprobante. El integrante podrá verla, pero no editarla.</div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={onSave} disabled={saving || payout.reference.trim().length < 3}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar pago</Button></DialogFooter></DialogContent></Dialog>;
}

function ActivitiesTable({ activities }: { activities: TeamActivity[] }) {
  return <Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><h3 className="font-bold">Actividad real del equipo</h3><p className="text-xs text-muted-foreground">Llamadas, WhatsApp, correos, notas, cambios y ofertas guardadas en el CRM.</p></div><div className="divide-y">{activities.slice(0,300).map(activity => <div key={activity.id} className="flex gap-3 p-4"><div className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Activity className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><p className="font-bold">{activity.person_name || 'Sistema'} · {activity.empresa_nombre}</p><span className="text-[10px] text-muted-foreground">{dateLabel(activity.created_at, 'dd MMM yyyy HH:mm')}</span></div><p className="text-xs">{activity.outcome || activity.activity_type}</p>{activity.note && <p className="mt-1 text-xs text-muted-foreground">{activity.note}</p>}</div></div>)}{!activities.length && <p className="py-16 text-center text-sm text-muted-foreground">Todavía no hay actividad del equipo.</p>}</div></CardContent></Card>;
}

function MemberDialog({ open, setOpen, draft, setDraft, members, saving, onSave }: { open:boolean; setOpen:(open:boolean)=>void; draft:MemberDraft; setDraft:React.Dispatch<React.SetStateAction<MemberDraft>>; members:TeamMember[]; saving:boolean; onSave:()=>void }) {
  const set = <K extends keyof MemberDraft>(key:K,value:MemberDraft[K]) => setDraft(current => ({...current,[key]:value}));
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{draft.id ? 'Editar integrante' : 'Agregar integrante del equipo'}</DialogTitle><DialogDescription>Su cuenta interna es independiente de cualquier empresa que tenga dentro de RutApp.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>Nombre *</Label><Input value={draft.name} onChange={event=>set('name',event.target.value)} /></div><div><Label>Correo de acceso *</Label><Input type="email" value={draft.email} onChange={event=>set('email',event.target.value)} /></div><div><Label>Teléfono</Label><Input value={draft.phone} onChange={event=>set('phone',event.target.value)} /></div><div><Label>Puesto</Label><Input value={draft.jobTitle} onChange={event=>set('jobTitle',event.target.value)} /></div><div><Label>Encargado</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.managerId} onChange={event=>set('managerId',event.target.value)}><option value="">Sin encargado</option>{members.filter(member=>member.id!==draft.id).map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></div><div><Label>Estado</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.status} onChange={event=>set('status',event.target.value as MemberDraft['status'])}><option value="invited">Invitado / pendiente</option><option value="active">Activo</option><option value="suspended">Suspendido</option></select></div><div><Label>Nivel de acceso</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.accessLevel} onChange={event=>set('accessLevel',event.target.value as TeamAccessLevel)}>{Object.entries(TEAM_LEVEL_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div><Label>Visibilidad</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.accessScope} onChange={event=>set('accessScope',event.target.value as TeamAccessScope)}>{Object.entries(TEAM_SCOPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="sm:col-span-2 rounded-xl border p-4"><Label>Plan de comisión</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.commissionMode} onChange={event=>set('commissionMode',event.target.value as InternalCommissionMode)}>{INTERNAL_COMMISSION_MODES.map(mode=><option key={mode} value={mode}>{COMMISSION_MODE_LABELS[mode]}</option>)}</select><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{['first_payment','first_n_payments','recurring'].includes(draft.commissionMode)&&<div><Label>Porcentaje sobre lo cobrado</Label><Input type="number" min={0.01} max={100} step={0.01} value={draft.commissionPct} onChange={event=>set('commissionPct',Number(event.target.value))} /></div>}{draft.commissionMode==='first_n_payments'&&<div><Label>Cantidad de pagos</Label><Input type="number" min={1} max={60} value={draft.paymentLimit} onChange={event=>set('paymentLimit',Number(event.target.value))} /></div>}{draft.commissionMode==='fixed_activation'&&<div><Label>Monto por primera activación</Label><Input type="number" min={0.01} step={0.01} value={draft.fixedAmount} onChange={event=>set('fixedAmount',Number(event.target.value))} /></div>}</div><p className="mt-3 text-[11px] text-muted-foreground">Se calcula únicamente sobre facturas de suscripción pagadas después de asignar al comisionista. No aplica si la empresa pertenece a un Partner.</p></div><div className="sm:col-span-2"><Label>Notas internas</Label><Textarea value={draft.notes} onChange={event=>set('notes',event.target.value)} /></div>{draft.id&&<div className="sm:col-span-2"><Label>Motivo del cambio *</Label><Input value={draft.reason} onChange={event=>set('reason',event.target.value)} placeholder="Ej. Cambio de porcentaje autorizado" /></div>}</div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={onSave} disabled={saving}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar integrante</Button></DialogFooter></DialogContent></Dialog>;
}

function AssignmentDialog({ company, onClose, assignment, setAssignment, members, saving, onSave }: { company:TeamCompany|null; onClose:()=>void; assignment:{managerId:string;commissionedId:string;reason:string}; setAssignment:React.Dispatch<React.SetStateAction<{managerId:string;commissionedId:string;reason:string}>>; members:TeamMember[]; saving:boolean; onSave:()=>void }) {
  return <Dialog open={!!company} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Asignar {company?.nombre}</DialogTitle><DialogDescription>Responsabilidad y comisión son decisiones independientes. El cambio solo afecta pagos futuros.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Responsable de seguimiento</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={assignment.managerId} onChange={event=>setAssignment(current=>({...current,managerId:event.target.value}))}><option value="">Sin responsable</option>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></div><div><Label>Comisionista</Label><select disabled={company?.has_partner} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" value={assignment.commissionedId} onChange={event=>setAssignment(current=>({...current,commissionedId:event.target.value}))}><option value="">Sin comisión interna</option>{members.filter(member=>member.commission_mode!=='none').map(member=><option key={member.id} value={member.id}>{member.name} · {COMMISSION_MODE_LABELS[member.commission_mode]}</option>)}</select>{company?.has_partner&&<p className="mt-1 text-xs font-medium text-amber-600">Esta empresa ya pertenece a un Partner; la comisión interna está bloqueada.</p>}</div><div><Label>Motivo *</Label><Textarea value={assignment.reason} onChange={event=>setAssignment(current=>({...current,reason:event.target.value}))} placeholder="Ej. Se asigna cartera y comisión desde septiembre" /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={onSave} disabled={saving||assignment.reason.trim().length<3}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar asignación</Button></DialogFooter></DialogContent></Dialog>;
}
