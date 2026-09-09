import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, ArrowLeft, BarChart3, Building2, CalendarClock, CheckCircle2,
  CircleDollarSign, Clock3, History, LayoutDashboard, Loader2, LogOut, Mail,
  MessageCircle, Phone, RefreshCw, Search, ShieldCheck, Target, UsersRound, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  COMMISSION_MODE_LABELS, TEAM_LEVEL_LABELS, TEAM_SCOPE_LABELS,
  type InternalCommissionMode, type TeamAccessLevel, type TeamAccessScope,
} from '@/lib/internalTeam';
import { cn, fmtNum } from '@/lib/utils';

const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type ContactChannel = 'call' | 'whatsapp' | 'email';

interface PortalMember {
  id: string; name: string; email: string; phone: string | null; manager_name: string | null;
  job_title: string | null; access_level: TeamAccessLevel; access_scope: TeamAccessScope;
  commission_mode: InternalCommissionMode; commission_pct: number;
  commission_payment_limit: number | null; commission_fixed_amount: number;
}
interface PortalLead {
  empresa_id: string; nombre: string; licencia: string | null; email: string | null; telefono: string | null;
  stage: string; assigned_to: string; assigned_name: string; next_follow_up_at: string | null;
  last_contact_at: string | null; contact_attempts: number; notes: string | null;
  lost_at: string | null; lost_reason: string | null;
}
interface PortalCompany {
  empresa_id: string; nombre: string; licencia: string | null; email: string | null; telefono: string | null;
  managed_by_name: string | null; commissioned_by_name: string | null; has_partner: boolean; paid_total: number;
}
interface PortalCommission {
  id: string; person_name: string; empresa_nombre: string; invoice_number: string | null; period: string;
  payment_number: number; base_amount: number; commission_mode: InternalCommissionMode; commission_pct: number;
  commission_amount: number; status: string; created_at: string;
}
interface PortalActivity {
  id: string; empresa_id: string; empresa_nombre: string; person_name: string | null;
  activity_type: string; outcome: string | null; note: string | null; new_stage: string | null; created_at: string;
}
interface PortalSnapshot {
  me_id: string; me: PortalMember;
  metrics: { active_leads:number; followups_due:number; companies:number; contacts_30d:number; commission_pending:number; commission_paid:number };
  members: PortalMember[]; leads: PortalLead[]; companies: PortalCompany[];
  commissions: PortalCommission[]; activities: PortalActivity[];
}
interface CrmActivity {
  id: string; activity_type: string; outcome: string | null; note: string | null;
  previous_stage: string | null; new_stage: string | null; created_at: string; actor_name: string;
}
interface CrmDetail {
  company: Record<string, unknown>;
  lead: Record<string, unknown> & { assigned_name?: string | null; lost_by_name?: string | null };
  summary: { products:number; clients:number; users:number; sales:number; invoices:number; paid_invoices:number; paid_total:number; activities:number };
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  activities: CrmActivity[];
}

const money = (value:number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)||0);
const dateLabel = (value?:string|null, pattern='dd MMM yyyy') => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, pattern, { locale: es });
};
const datetimeLocal = (value?: string | null) => value ? format(new Date(value), "yyyy-MM-dd'T'HH:mm") : '';
const errorText = (error:unknown) => error instanceof Error ? error.message : typeof error==='object'&&error&&'message' in error ? String(error.message) : 'No se pudo completar la operación';
const stageLabels:Record<string,string>={sin_contactar:'Sin contactar',por_contactar:'Por contactar',contactado:'Contactado',interesado:'Interesado',seguimiento:'Seguimiento',no_localizado:'No localizado',no_interesado:'No interesado',descartado:'Descartado',convertido:'Convertido'};
const activityLabels:Record<string,string>={call:'Llamada',whatsapp:'WhatsApp',email:'Correo',note:'Nota',stage:'Cambio de etapa',assignment:'Asignación',coupon:'Oferta',system:'Sistema'};

function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:typeof Target}) {
  return <Card><CardContent className="p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></CardContent></Card>;
}

export default function TeamPortalPage() {
  const { profile, signOut } = useAuth();
  const [data,setData]=useState<PortalSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [selectedLead,setSelectedLead]=useState<PortalLead|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{const{data:result,error}=await rpcClient.rpc('fn_team_portal_snapshot');if(error)throw error;setData(result as PortalSnapshot);}
    catch(error){toast.error(errorText(error));}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const openContact=(lead:PortalLead,channel:ContactChannel)=>{
    void rpcClient.rpc('fn_team_crm_log_contact',{p_empresa_id:lead.empresa_id,p_channel:channel})
      .then(({error})=>{if(error)throw error;return load();})
      .catch(error=>toast.error(`Se abrió el contacto, pero no se pudo medir: ${errorText(error)}`));
  };

  const filteredLeads=useMemo(()=>{const term=search.trim().toLocaleLowerCase('es');return(data?.leads??[]).filter(lead=>!term||`${lead.nombre} ${lead.licencia??''} ${lead.email??''} ${lead.telefono??''} ${lead.assigned_name??''}`.toLocaleLowerCase('es').includes(term));},[data?.leads,search]);

  if(loading&&!data)return <div className="flex min-h-[100dvh] items-center justify-center gap-2 bg-background text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Cargando Mi equipo…</div>;
  if(!data)return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6"><Card className="max-w-md"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-500"/><h1 className="mt-4 text-xl font-black">Acceso interno no disponible</h1><p className="mt-2 text-sm text-muted-foreground">Pide al administrador que revise tu vinculación en Panel Master → Equipo.</p><Button className="mt-5" onClick={()=>signOut()}>Cerrar sesión</Button></CardContent></Card></div>;

  if(selectedLead) return <TeamCrmDetail lead={selectedLead} onBack={()=>setSelectedLead(null)} onUpdated={load} onContact={openContact}/>;

  const activeLeads=filteredLeads.filter(lead=>!['no_interesado','descartado','convertido'].includes(lead.stage));
  const lostLeads=filteredLeads.filter(lead=>['no_interesado','descartado'].includes(lead.stage));

  return <div className="min-h-[100dvh] bg-muted/20">
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3"><div className="rounded-xl bg-primary p-2 text-primary-foreground"><UsersRound className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="font-black">Equipo RutApp</p><p className="truncate text-[10px] text-muted-foreground">{data.me.name} · {data.me.job_title||TEAM_LEVEL_LABELS[data.me.access_level]}</p></div>{profile?.empresa_id&&<Button variant="outline" size="sm" onClick={()=>{window.location.href='/dashboard';}}><Building2 className="mr-2 h-4 w-4"/>Mi empresa</Button>}<Button variant="ghost" size="icon" onClick={()=>signOut()}><LogOut className="h-4 w-4"/></Button></div></header>
    <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-black">Hola, {data.me.name}</h1><p className="mt-1 text-sm text-muted-foreground">{TEAM_LEVEL_LABELS[data.me.access_level]} · {TEAM_SCOPE_LABELS[data.me.access_scope]} · Comisión: {COMMISSION_MODE_LABELS[data.me.commission_mode]}</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4',loading&&'animate-spin')}/>Actualizar</Button></div></section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label="Prospectos" value={fmtNum(data.metrics.active_leads)} detail="En seguimiento" icon={Target}/><Metric label="Vencidos" value={fmtNum(data.metrics.followups_due)} detail="Atender hoy" icon={CalendarClock}/><Metric label="Empresas" value={fmtNum(data.metrics.companies)} detail="Cartera visible" icon={Building2}/><Metric label="Contactos 30d" value={fmtNum(data.metrics.contacts_30d)} detail="Llamadas, WA y correo" icon={Phone}/><Metric label="Por cobrar" value={money(data.metrics.commission_pending)} detail="Pendiente/aprobada" icon={Wallet}/><Metric label="Pagado" value={money(data.metrics.commission_paid)} detail="Histórico" icon={CircleDollarSign}/></div>
      <Tabs defaultValue="inicio" className="space-y-4"><div className="overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-full justify-start bg-transparent"><TabsTrigger value="inicio"><LayoutDashboard className="mr-2 h-4 w-4"/>Mi día</TabsTrigger><TabsTrigger value="crm"><Target className="mr-2 h-4 w-4"/>CRM</TabsTrigger><TabsTrigger value="empresas"><Building2 className="mr-2 h-4 w-4"/>Empresas</TabsTrigger><TabsTrigger value="comisiones"><CircleDollarSign className="mr-2 h-4 w-4"/>Comisiones</TabsTrigger><TabsTrigger value="actividad"><Activity className="mr-2 h-4 w-4"/>Actividad</TabsTrigger></TabsList></div>
        <TabsContent value="inicio" className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Seguimientos vencidos</h2><p className="text-xs text-muted-foreground">Ordenados por el compromiso más antiguo.</p></div><LeadList leads={activeLeads.filter(lead=>lead.next_follow_up_at&&new Date(lead.next_follow_up_at)<new Date()).slice(0,20)} onOpen={setSelectedLead} onContact={openContact}/></CardContent></Card><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Actividad reciente</h2><p className="text-xs text-muted-foreground">Evidencia real del trabajo comercial.</p></div><ActivityList activities={data.activities.slice(0,20)}/></CardContent></Card></TabsContent>
        <TabsContent value="crm" className="space-y-4"><section className="rounded-xl border bg-card p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-black">CRM de recuperación</h2><p className="text-xs text-muted-foreground">Mismo expediente comercial del Panel Master, limitado a tu cartera visible.</p></div><div className="relative min-w-[280px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar empresa, licencia, correo o responsable…"/></div></div></section><Tabs defaultValue="activos"><TabsList><TabsTrigger value="activos">Activos ({activeLeads.length})</TabsTrigger><TabsTrigger value="perdidos">Perdidos ({lostLeads.length})</TabsTrigger></TabsList><TabsContent value="activos"><Card><CardContent className="p-0"><LeadList leads={activeLeads} onOpen={setSelectedLead} onContact={openContact}/></CardContent></Card></TabsContent><TabsContent value="perdidos"><Card><CardContent className="p-0"><LeadList leads={lostLeads} onOpen={setSelectedLead} onContact={openContact}/></CardContent></Card></TabsContent></Tabs></TabsContent>
        <TabsContent value="empresas"><CompaniesTable companies={data.companies}/></TabsContent>
        <TabsContent value="comisiones"><CommissionsTable entries={data.commissions}/></TabsContent>
        <TabsContent value="actividad"><Card><CardContent className="p-0"><ActivityList activities={data.activities}/></CardContent></Card></TabsContent>
      </Tabs>
    </main>
  </div>;
}

function TeamCrmDetail({lead,onBack,onUpdated,onContact}:{lead:PortalLead;onBack:()=>void;onUpdated:()=>Promise<void>|void;onContact:(lead:PortalLead,channel:ContactChannel)=>void}) {
  const [detail,setDetail]=useState<CrmDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [stage,setStage]=useState(['no_interesado','descartado'].includes(lead.stage)?'contactado':lead.stage);
  const [activityType,setActivityType]=useState('call');
  const [outcome,setOutcome]=useState('');
  const [nextFollowUp,setNextFollowUp]=useState(datetimeLocal(lead.next_follow_up_at));
  const [note,setNote]=useState('');

  const loadDetail=useCallback(async()=>{
    setLoading(true);
    try{const{data,error}=await rpcClient.rpc('fn_team_crm_detail',{p_empresa_id:lead.empresa_id});if(error)throw error;setDetail(data as CrmDetail);}
    catch(error){toast.error(errorText(error));}finally{setLoading(false);}
  },[lead.empresa_id]);
  useEffect(()=>{void loadDetail();},[loadDetail]);

  const save=async()=>{
    if(stage==='no_interesado'&&note.trim().length<5){toast.error('Escribe el motivo por el que se perdió');return;}
    setSaving(true);
    try{const{error}=await rpcClient.rpc('fn_team_crm_save',{p_empresa_id:lead.empresa_id,p_stage:stage,p_next_follow_up_at:stage==='no_interesado'?null:nextFollowUp?new Date(nextFollowUp).toISOString():null,p_note:note||null,p_activity_type:activityType,p_outcome:outcome||null});if(error)throw error;toast.success(stage==='no_interesado'?'Prospecto enviado a Perdidos':'Seguimiento guardado');setOutcome('');setNote('');await Promise.all([Promise.resolve(onUpdated()),loadDetail()]);}
    catch(error){toast.error(errorText(error));}finally{setSaving(false);}
  };

  const company=detail?.company??{};
  const summary=detail?.summary;
  const currentStage=String(detail?.lead?.stage??lead.stage);
  const phone=lead.telefono?.replace(/\D/g,'')||'';
  const subscription=detail?.subscriptions?.[0]??null;

  return <div className="min-h-[100dvh] bg-muted/20"><main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
    <Button variant="ghost" className="-ml-2" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/>Volver al CRM</Button>
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card"><div className="p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><Target className="h-5 w-5 text-primary"/><h1 className="text-2xl font-black">{lead.nombre}</h1><Badge variant="outline">{stageLabels[currentStage]||currentStage}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Licencia {lead.licencia||'sin asignar'} · Alta {dateLabel(String(company.created_at||''))}</p></div><ContactButtons lead={lead} onContact={onContact}/></div></div><div className="grid grid-cols-2 border-t bg-card/70 md:grid-cols-4"><Mini label="Intentos" value={String(lead.contact_attempts)}/><Mini label="Seguimiento" value={dateLabel(lead.next_follow_up_at,'dd MMM HH:mm')}/><Mini label="Responsable" value={lead.assigned_name||'Sin asignar'}/><Mini label="Último contacto" value={dateLabel(lead.last_contact_at,'dd MMM HH:mm')}/></div></section>
    {loading&&!detail?<div className="flex min-h-[420px] items-center justify-center gap-2 rounded-xl border bg-card text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Cargando expediente CRM…</div>:<Tabs defaultValue="resumen" className="space-y-4"><div className="overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-full justify-start bg-transparent"><TabsTrigger value="resumen"><BarChart3 className="mr-2 h-4 w-4"/>Resumen</TabsTrigger><TabsTrigger value="seguimiento"><CalendarClock className="mr-2 h-4 w-4"/>Seguimiento</TabsTrigger><TabsTrigger value="historial"><History className="mr-2 h-4 w-4"/>Historial ({detail?.activities?.length||0})</TabsTrigger><TabsTrigger value="cobros"><Wallet className="mr-2 h-4 w-4"/>Suscripción y cobros</TabsTrigger></TabsList></div>
      <TabsContent value="resumen" className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"><SummaryBox label="Productos" value={summary?.products}/><SummaryBox label="Clientes" value={summary?.clients}/><SummaryBox label="Usuarios" value={summary?.users}/><SummaryBox label="Ventas" value={summary?.sales}/><SummaryBox label="Facturas" value={summary?.invoices}/><SummaryBox label="Pagadas" value={summary?.paid_invoices}/><SummaryBox label="Actividades" value={summary?.activities}/><SummaryBox label="Cobrado" value={money(summary?.paid_total||0)}/></div><div className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-5"><h3 className="font-black">Contacto principal</h3><p className="mt-3 text-sm">{lead.telefono||'Sin teléfono'}</p><p className="text-sm text-muted-foreground">{lead.email||'Sin correo'}</p><div className="mt-4"><ContactButtons lead={lead} onContact={onContact}/></div></CardContent></Card><Card><CardContent className="p-5"><h3 className="font-black">Cronología de adopción</h3><dl className="mt-4 space-y-3 text-sm"><Row label="Fecha de alta" value={dateLabel(String(company.created_at||''),'dd MMM yyyy HH:mm')}/><Row label="Último contacto" value={dateLabel(lead.last_contact_at,'dd MMM yyyy HH:mm')}/><Row label="Próximo seguimiento" value={dateLabel(lead.next_follow_up_at,'dd MMM yyyy HH:mm')}/><Row label="Perdido" value={dateLabel(lead.lost_at,'dd MMM yyyy HH:mm')}/></dl></CardContent></Card></div><Card><CardContent className="p-5"><h3 className="font-black">Huella de activación</h3><p className="mt-1 text-xs text-muted-foreground">Actividad real detectada dentro de la cuenta antes y durante el seguimiento.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryBox label="Productos" value={summary?.products}/><SummaryBox label="Clientes" value={summary?.clients}/><SummaryBox label="Ventas" value={summary?.sales}/><SummaryBox label="Usuarios" value={summary?.users}/></div></CardContent></Card></TabsContent>
      <TabsContent value="seguimiento"><Card><CardContent className="p-5 sm:p-6"><h3 className="text-lg font-black">Registrar seguimiento</h3><p className="text-sm text-muted-foreground">La etapa, resultado, nota y siguiente compromiso quedan auditados con tu usuario y hora exacta.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div><Label>Etapa comercial</Label><select value={stage} onChange={e=>setStage(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="por_contactar">Por contactar</option><option value="contactado">Contactado</option><option value="interesado">Interesado</option><option value="seguimiento">Seguimiento</option><option value="no_localizado">No localizado</option><option value="no_interesado">No interesado / Perdido</option></select></div><div><Label>Actividad realizada</Label><select value={activityType} onChange={e=>setActivityType(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="call">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="note">Nota interna</option><option value="stage">Cambio de etapa</option></select></div><div><Label>Resultado</Label><Input value={outcome} onChange={e=>setOutcome(e.target.value)} className="mt-1" placeholder="Ej. Contestó; desea demostración"/></div><div><Label>Próximo seguimiento</Label><Input type="datetime-local" value={nextFollowUp} onChange={e=>setNextFollowUp(e.target.value)} disabled={stage==='no_interesado'} className="mt-1"/></div><div className="md:col-span-2"><Label>{stage==='no_interesado'?'Motivo de pérdida *':'Nota comercial'}</Label><Textarea value={note} onChange={e=>setNote(e.target.value)} rows={6} className="mt-1" placeholder="Necesidad, objeción, acuerdo y siguiente paso…"/></div></div><div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row"><ContactButtons lead={lead} onContact={onContact}/><Button onClick={save} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Guardar seguimiento</Button></div></CardContent></Card></TabsContent>
      <TabsContent value="historial"><Card className="overflow-hidden"><CardContent className="p-0"><div className="flex items-center justify-between border-b p-5"><div><h3 className="font-black">Historial comercial completo</h3><p className="text-xs text-muted-foreground">Quién hizo qué, resultado, nota, etapa y momento exacto.</p></div><Button size="sm" variant="outline" onClick={()=>void loadDetail()}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button></div><div className="divide-y">{detail?.activities?.map(item=><div key={item.id} className="flex gap-4 p-4 sm:p-5"><div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary ring-4 ring-primary/10"/><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><div><b>{item.actor_name}</b><span className="ml-2 text-xs text-muted-foreground">{activityLabels[item.activity_type]||item.activity_type}</span></div><span className="text-xs text-muted-foreground">{dateLabel(item.created_at,'dd MMM yyyy HH:mm')}</span></div>{item.outcome&&<p className="mt-1 text-sm font-medium">{item.outcome}</p>}{item.note&&<p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</p>}{item.new_stage&&<p className="mt-2 text-[11px] text-muted-foreground">Etapa: {stageLabels[item.new_stage]||item.new_stage}</p>}</div></div>)}{!detail?.activities?.length&&<p className="py-16 text-center text-sm text-muted-foreground">Todavía no hay movimientos comerciales.</p>}</div></CardContent></Card></TabsContent>
      <TabsContent value="cobros" className="space-y-4"><Card><CardContent className="p-5"><h3 className="font-black">Suscripción actual</h3>{subscription?<div className="mt-4 grid gap-3 sm:grid-cols-3"><Row label="Estado" value={String(subscription.status||'—')}/><Row label="Stripe" value={String(subscription.stripe_subscription_id||'Sin Stripe')}/><Row label="Periodo" value={dateLabel(String(subscription.current_period_end||''))}/></div>:<p className="mt-3 text-sm text-muted-foreground">Sin suscripción registrada.</p>}</CardContent></Card><Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><h3 className="font-black">Facturas y cobros</h3><p className="text-xs text-muted-foreground">Contexto comercial de cobros; este módulo no da permiso para editar facturación.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Factura</th><th className="px-3 py-3 text-left">Estado</th><th className="px-3 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Fecha</th></tr></thead><tbody>{detail?.invoices?.map((invoice,index)=><tr key={String(invoice.id||index)} className="border-t"><td className="px-4 py-3 font-bold">{String(invoice.numero_factura||invoice.id||'—')}</td><td className="px-3 py-3"><Badge variant="outline">{String(invoice.estado||'—')}</Badge></td><td className="px-3 py-3 text-right font-bold">{money(Number(invoice.total)||0)}</td><td className="px-4 py-3 text-right text-muted-foreground">{dateLabel(String(invoice.created_at||invoice.fecha_pago||''),'dd MMM yyyy')}</td></tr>)}{!detail?.invoices?.length&&<tr><td colSpan={4} className="py-14 text-center text-muted-foreground">Sin facturas.</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
    </Tabs>}
  </main></div>;
}

function ContactButtons({lead,onContact}:{lead:PortalLead;onContact:(lead:PortalLead,channel:ContactChannel)=>void}) {const phone=(lead.telefono||'').replace(/\D/g,'');return <div className="flex flex-wrap gap-2">{lead.telefono&&<Button asChild size="sm" variant="outline"><a href={`tel:${lead.telefono}`} onClick={()=>onContact(lead,'call')}><Phone className="mr-1.5 h-3.5 w-3.5"/>Llamar</a></Button>}{phone&&<Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700"><a target="_blank" rel="noreferrer" href={`https://wa.me/${phone}`} onClick={()=>onContact(lead,'whatsapp')}><MessageCircle className="mr-1.5 h-3.5 w-3.5"/>WhatsApp</a></Button>}{lead.email&&<Button asChild size="sm" variant="outline"><a href={`mailto:${lead.email}`} onClick={()=>onContact(lead,'email')}><Mail className="mr-1.5 h-3.5 w-3.5"/>Correo</a></Button>}</div>}
function LeadList({leads,onOpen,onContact}:{leads:PortalLead[];onOpen:(lead:PortalLead)=>void;onContact:(lead:PortalLead,channel:ContactChannel)=>void}) {return <div className="divide-y">{leads.map(lead=><div key={lead.empresa_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button className="font-bold hover:text-primary hover:underline" onClick={()=>onOpen(lead)}>{lead.nombre}</button><Badge variant="outline">{stageLabels[lead.stage]||lead.stage}</Badge></div><p className="mt-1 text-[10px] text-muted-foreground">{lead.licencia||'Sin licencia'} · Responsable: {lead.assigned_name||'—'} · {lead.contact_attempts} intento(s)</p><p className={cn('mt-1 text-xs',lead.next_follow_up_at&&new Date(lead.next_follow_up_at)<new Date()?'font-bold text-red-600':'text-muted-foreground')}><Clock3 className="mr-1 inline h-3 w-3"/>Seguimiento: {dateLabel(lead.next_follow_up_at,'dd MMM HH:mm')}</p>{lead.lost_reason&&<p className="mt-1 text-xs text-red-600">{lead.lost_reason}</p>}</div><div className="flex flex-wrap items-center gap-2"><ContactButtons lead={lead} onContact={onContact}/><Button size="sm" onClick={()=>onOpen(lead)}>Ver CRM</Button></div></div>)}{!leads.length&&<p className="py-14 text-center text-sm text-muted-foreground">No hay prospectos en esta vista.</p>}</div>}
function ActivityList({activities}:{activities:PortalActivity[]}) {return <div className="divide-y">{activities.map(item=><div key={item.id} className="flex gap-3 p-4"><div className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Activity className="h-3.5 w-3.5"/></div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><b className="text-sm">{item.person_name||'Sistema'} · {item.empresa_nombre}</b><span className="text-[10px] text-muted-foreground">{dateLabel(item.created_at,'dd MMM HH:mm')}</span></div><p className="text-xs">{item.outcome||activityLabels[item.activity_type]||item.activity_type}</p>{item.note&&<p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}{!activities.length&&<p className="py-14 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>}</div>}
function CompaniesTable({companies}:{companies:PortalCompany[]}) {return <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3 text-left">Responsable</th><th className="px-3 py-3 text-left">Comisión</th><th className="px-3 py-3 text-right">Pagado por cliente</th><th className="px-4 py-3 text-left">Contacto</th></tr></thead><tbody>{companies.map(company=><tr key={company.empresa_id} className="border-t"><td className="px-4 py-3"><b>{company.nombre}</b><p className="text-[10px] text-muted-foreground">{company.licencia||'Sin licencia'}</p></td><td className="px-3 py-3">{company.managed_by_name||'—'}</td><td className="px-3 py-3">{company.has_partner?'Partner':company.commissioned_by_name||'Sin comisión'}</td><td className="px-3 py-3 text-right font-bold">{money(company.paid_total)}</td><td className="px-4 py-3">{company.telefono||company.email||'—'}</td></tr>)}</tbody></table></div></CardContent></Card>}
function CommissionsTable({entries}:{entries:PortalCommission[]}) {return <Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Mis comisiones</h2><p className="text-xs text-muted-foreground">Factura, base cobrada, regla aplicada y estado. No puedes editar ni aprobar tus propios movimientos.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Empresa/factura</th><th className="px-3 py-3 text-center">Pago</th><th className="px-3 py-3 text-right">Base</th><th className="px-3 py-3 text-left">Regla</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-4 py-3 text-center">Estado</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.id} className="border-t"><td className="px-4 py-3"><b>{entry.empresa_nombre}</b><p className="text-[10px] text-muted-foreground">{entry.invoice_number||'Sin folio'} · {entry.period}</p></td><td className="px-3 py-3 text-center">#{entry.payment_number}</td><td className="px-3 py-3 text-right">{money(entry.base_amount)}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[entry.commission_mode]}{entry.commission_pct>0&&<p className="text-[10px] text-muted-foreground">{entry.commission_pct}%</p>}</td><td className="px-3 py-3 text-right font-black text-emerald-600">{money(entry.commission_amount)}</td><td className="px-4 py-3 text-center"><Badge variant="outline">{entry.status}</Badge></td></tr>)}{!entries.length&&<tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Todavía no hay movimientos de comisión.</td></tr>}</tbody></table></div></CardContent></Card>}
function Mini({label,value}:{label:string;value:string}) {return <div className="border-r p-4 last:border-r-0"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>}
function SummaryBox({label,value}:{label:string;value:string|number|undefined}) {return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><b className="text-lg">{value??0}</b></div>}
function Row({label,value}:{label:string;value:string}) {return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><b className="text-right">{value}</b></div>}
