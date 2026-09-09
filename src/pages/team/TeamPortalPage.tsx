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
  created_at?: string | null; age_days?: number; products?: number; clients?: number; sales?: number;
  draft_sales?: number; users?: number; subscription_status?: string; coupon_active?: boolean;
  activation_score?: number; setup_level?: string;
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

const money=(value:number)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)||0);
const dateLabel=(value?:string|null,pattern='dd MMM yyyy')=>{if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':format(d,pattern,{locale:es});};
const datetimeLocal=(value?:string|null)=>value?format(new Date(value),"yyyy-MM-dd'T'HH:mm"):'';
const errorText=(error:unknown)=>error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):'No se pudo completar la operación';
const stageLabels:Record<string,string>={sin_contactar:'Sin contactar',por_contactar:'Por contactar',contactado:'Contactado',interesado:'Interesado',seguimiento:'Seguimiento',no_localizado:'No localizado',no_interesado:'No interesado',descartado:'Descartado',convertido:'Convertido'};
const setupLabels:Record<string,string>={sin_configurar:'No configuró',exploro:'Exploró el sistema',casi_listo:'Casi listo'};
const subscriptionLabels:Record<string,string>={trial:'Prueba',active:'Activa',past_due:'Pago vencido',suspended:'Suspendida',cancelada:'Cancelada',cancelled:'Cancelada',pendiente_pago:'Pago pendiente',sin_suscripcion:'Sin suscripción'};

function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:typeof Target}){
  return <Card><CardContent className="p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></CardContent></Card>;
}

export default function TeamPortalPage(){
  const{profile,signOut}=useAuth();
  const[data,setData]=useState<PortalSnapshot|null>(null);
  const[loading,setLoading]=useState(true);
  const[selectedLead,setSelectedLead]=useState<PortalLead|null>(null);
  const[search,setSearch]=useState('');
  const[stage,setStage]=useState('todos');
  const[setup,setSetup]=useState('todos');
  const[age,setAge]=useState('todos');
  const[special,setSpecial]=useState('todos');

  const load=useCallback(async()=>{setLoading(true);try{const{data:result,error}=await rpcClient.rpc('fn_team_portal_snapshot');if(error)throw error;setData(result as PortalSnapshot);}catch(error){toast.error(errorText(error));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);

  const openContact=(lead:PortalLead,channel:ContactChannel)=>{void rpcClient.rpc('fn_team_crm_log_contact',{p_empresa_id:lead.empresa_id,p_channel:channel}).then(({error})=>{if(error)throw error;return load();}).catch(error=>toast.error(`Se abrió el contacto, pero no se pudo medir: ${errorText(error)}`));};

  const filteredLeads=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('es');
    const now=Date.now();
    return(data?.leads??[]).filter(lead=>{
      if(stage!=='todos'&&lead.stage!==stage)return false;
      if(setup!=='todos'&&lead.setup_level!==setup)return false;
      if(age!=='todos'){const[min,max]=age.split('-').map(Number);const days=Number(lead.age_days||0);if(days<min||days>max)return false;}
      if(special==='seguimiento_vencido'&&!(lead.next_follow_up_at&&new Date(lead.next_follow_up_at).getTime()<now))return false;
      if(special==='con_oferta'&&!lead.coupon_active)return false;
      return !term||`${lead.nombre} ${lead.licencia??''} ${lead.email??''} ${lead.telefono??''} ${lead.assigned_name??''}`.toLocaleLowerCase('es').includes(term);
    });
  },[data?.leads,search,stage,setup,age,special]);

  if(loading&&!data)return <div className="flex min-h-[100dvh] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Cargando Mi equipo…</div>;
  if(!data)return <div className="flex min-h-[100dvh] items-center justify-center p-6"><Card className="max-w-md"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-500"/><h1 className="mt-4 text-xl font-black">Acceso interno no disponible</h1><p className="mt-2 text-sm text-muted-foreground">Pide al administrador que revise tu vinculación.</p><Button className="mt-5" onClick={()=>signOut()}>Cerrar sesión</Button></CardContent></Card></div>;
  if(selectedLead)return <TeamCrmDetail lead={selectedLead} onBack={()=>setSelectedLead(null)} onUpdated={load} onContact={openContact}/>;

  const activeLeads=filteredLeads.filter(l=>!['no_interesado','descartado','convertido'].includes(l.stage));
  const lostLeads=filteredLeads.filter(l=>['no_interesado','descartado'].includes(l.stage));

  return <div className="min-h-[100dvh] bg-muted/20">
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-[1900px] items-center gap-3 px-4 py-3"><div className="rounded-xl bg-primary p-2 text-primary-foreground"><UsersRound className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="font-black">Equipo RutApp</p><p className="truncate text-[10px] text-muted-foreground">{data.me.name} · {data.me.job_title||TEAM_LEVEL_LABELS[data.me.access_level]}</p></div>{profile?.empresa_id&&<Button variant="outline" size="sm" onClick={()=>{window.location.href='/dashboard';}}><Building2 className="mr-2 h-4 w-4"/>Mi empresa</Button>}<Button variant="ghost" size="icon" onClick={()=>signOut()}><LogOut className="h-4 w-4"/></Button></div></header>
    <main className="mx-auto max-w-[1900px] space-y-3 p-3 sm:p-4">
      <Tabs defaultValue="crm" className="space-y-3"><div className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-0 flex-1 justify-start bg-transparent"><TabsTrigger value="inicio"><LayoutDashboard className="mr-2 h-4 w-4"/>Mi día</TabsTrigger><TabsTrigger value="crm"><Target className="mr-2 h-4 w-4"/>CRM</TabsTrigger><TabsTrigger value="empresas"><Building2 className="mr-2 h-4 w-4"/>Empresas</TabsTrigger><TabsTrigger value="comisiones"><CircleDollarSign className="mr-2 h-4 w-4"/>Comisiones</TabsTrigger><TabsTrigger value="actividad"><Activity className="mr-2 h-4 w-4"/>Actividad</TabsTrigger></TabsList><Button variant="outline" size="sm" className="mr-1 shrink-0" onClick={()=>void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4',loading&&'animate-spin')}/>Actualizar</Button></div>
        <TabsContent value="inicio" className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Seguimientos vencidos</h2></div><CompactLeadList leads={activeLeads.filter(l=>l.next_follow_up_at&&new Date(l.next_follow_up_at)<new Date()).slice(0,20)} onOpen={setSelectedLead}/></CardContent></Card><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Actividad reciente</h2></div><ActivityList activities={data.activities.slice(0,20)}/></CardContent></Card></TabsContent>

        <TabsContent value="crm" className="space-y-4">
          <Card className="overflow-hidden"><CardContent className="p-0">
            <div className="border-b p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">Prospectos sin primera venta</h2><p className="mt-1 text-sm text-muted-foreground">{activeLeads.length} resultados con los filtros actuales</p></div><Target className="h-5 w-5 text-primary"/></div>
              <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(320px,1.4fr)_repeat(4,minmax(170px,1fr))]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar empresa, licencia, correo, teléfono o responsable…"/></div><select className="h-10 rounded-md border bg-background px-3 text-sm" value={stage} onChange={e=>setStage(e.target.value)}><option value="todos">Todas las etapas</option><option value="sin_contactar">Sin contactar</option><option value="por_contactar">Por contactar</option><option value="contactado">Contactado</option><option value="interesado">Interesado</option><option value="seguimiento">Seguimiento</option><option value="no_localizado">No localizado</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={setup} onChange={e=>setSetup(e.target.value)}><option value="todos">Toda configuración</option><option value="sin_configurar">No configuró nada</option><option value="exploro">Exploró el sistema</option><option value="casi_listo">Casi listo</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={age} onChange={e=>setAge(e.target.value)}><option value="todos">Cualquier antigüedad</option><option value="0-7">0–7 días</option><option value="8-30">8–30 días</option><option value="31-90">31–90 días</option><option value="91-36500">Más de 90 días</option></select><select className="h-10 rounded-md border bg-background px-3 text-sm" value={special} onChange={e=>setSpecial(e.target.value)}><option value="todos">Todos los casos</option><option value="seguimiento_vencido">Seguimiento vencido</option><option value="con_oferta">Con oferta</option></select></div>
            </div>
            <Tabs defaultValue="activos"><div className="border-b px-4 pt-3"><TabsList><TabsTrigger value="activos">Activos ({activeLeads.length})</TabsTrigger><TabsTrigger value="perdidos">Perdidos ({lostLeads.length})</TabsTrigger></TabsList></div><TabsContent value="activos" className="m-0"><MasterLeadTable leads={activeLeads} onOpen={setSelectedLead} onContact={openContact}/></TabsContent><TabsContent value="perdidos" className="m-0"><MasterLeadTable leads={lostLeads} onOpen={setSelectedLead} onContact={openContact}/></TabsContent></Tabs>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="empresas"><CompaniesTable companies={data.companies}/></TabsContent>
        <TabsContent value="comisiones"><CommissionsTable entries={data.commissions}/></TabsContent>
        <TabsContent value="actividad"><Card><CardContent className="p-0"><ActivityList activities={data.activities}/></CardContent></Card></TabsContent>
      </Tabs>
    </main>
  </div>;
}

function MasterLeadTable({leads,onOpen,onContact}:{leads:PortalLead[];onOpen:(lead:PortalLead)=>void;onContact:(lead:PortalLead,channel:ContactChannel)=>void}){
  return <div className="overflow-auto"><table className="w-full min-w-[1580px] text-xs"><thead className="sticky top-0 z-10 bg-muted/95"><tr className="border-b text-muted-foreground"><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3 text-center">Etapa</th><th className="px-3 py-3 text-center">Antigüedad</th><th className="px-3 py-3 text-center">Uso detectado</th><th className="px-3 py-3 text-center">Activación</th><th className="px-3 py-3 text-left">Contacto</th><th className="px-3 py-3 text-left">Responsable</th><th className="px-3 py-3 text-center">Próximo seguimiento</th><th className="px-3 py-3 text-center">Suscripción</th><th className="px-3 py-3 text-center">Oferta</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead><tbody>{leads.map(lead=>{const phone=(lead.telefono||'').replace(/\D/g,'');const score=Number(lead.activation_score||0);return <tr key={lead.empresa_id} className="border-b hover:bg-primary/[0.035]"><td className="px-4 py-3"><button onClick={()=>onOpen(lead)} className="font-bold text-left hover:text-primary hover:underline">{lead.nombre}</button><p className="mt-0.5 text-[10px] text-muted-foreground">{lead.licencia||'Sin licencia'} · Alta {dateLabel(lead.created_at)}</p></td><td className="px-3 py-3 text-center"><Badge variant="outline">{stageLabels[lead.stage]||lead.stage}</Badge><p className="mt-1 text-[9px] text-muted-foreground">{lead.contact_attempts} intento(s)</p></td><td className="px-3 py-3 text-center"><b>{fmtNum(lead.age_days||0)} días</b><p className="text-[10px] text-muted-foreground">{lead.last_contact_at?`Contacto ${dateLabel(lead.last_contact_at,'dd MMM')}`:'Sin contacto'}</p></td><td className="px-3 py-3 text-center"><Badge className={cn('border',lead.setup_level==='casi_listo'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-700':'border-amber-500/30 bg-amber-500/10 text-amber-700')}>{setupLabels[lead.setup_level||'']||'No configuró'}</Badge><p className="mt-1 text-[9px] text-muted-foreground">{fmtNum(lead.products||0)} prod · {fmtNum(lead.clients||0)} clientes · {fmtNum(lead.draft_sales||0)} borr.</p></td><td className="px-3 py-3 text-center"><div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${Math.max(0,Math.min(100,score))}%`}}/></div><b className="mt-1 block">{score}%</b></td><td className="px-3 py-3"><p className="font-medium">{lead.telefono||'—'}</p><p className="max-w-[230px] truncate text-[10px] text-muted-foreground">{lead.email||'—'}</p></td><td className="px-3 py-3"><b>{lead.assigned_name||'Sin asignar'}</b><p className="text-[10px] text-muted-foreground">{lead.last_contact_at?'Con contacto':'Sin contacto'}</p></td><td className={cn('px-3 py-3 text-center',lead.next_follow_up_at&&new Date(lead.next_follow_up_at)<new Date()&&'font-bold text-red-600')}>{dateLabel(lead.next_follow_up_at,'dd MMM HH:mm')}</td><td className="px-3 py-3 text-center"><Badge variant="outline">{subscriptionLabels[lead.subscription_status||'']||lead.subscription_status||'Sin suscripción'}</Badge></td><td className="px-3 py-3 text-center">{lead.coupon_active?<Badge className="bg-violet-500/10 text-violet-700">Activa</Badge>:<span className="text-muted-foreground">—</span>}</td><td className="px-4 py-3"><div className="flex justify-center gap-1">{lead.telefono&&<Button asChild size="icon" variant="outline"><a href={`tel:${lead.telefono}`} onClick={()=>onContact(lead,'call')}><Phone className="h-3.5 w-3.5"/></a></Button>}{phone&&<Button asChild size="icon" className="bg-emerald-600 hover:bg-emerald-700"><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" onClick={()=>onContact(lead,'whatsapp')}><MessageCircle className="h-3.5 w-3.5"/></a></Button>}{lead.email&&<Button asChild size="icon" variant="outline"><a href={`mailto:${lead.email}`} onClick={()=>onContact(lead,'email')}><Mail className="h-3.5 w-3.5"/></a></Button>}<Button size="sm" onClick={()=>onOpen(lead)}>Ver CRM</Button></div></td></tr>;})}{!leads.length&&<tr><td colSpan={11} className="py-16 text-center text-sm text-muted-foreground">No hay prospectos en esta vista.</td></tr>}</tbody></table></div>;
}

function CompactLeadList({leads,onOpen}:{leads:PortalLead[];onOpen:(lead:PortalLead)=>void}){return <div className="divide-y">{leads.map(l=><button key={l.empresa_id} onClick={()=>onOpen(l)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"><div><b>{l.nombre}</b><p className="text-[10px] text-muted-foreground">{stageLabels[l.stage]||l.stage} · {dateLabel(l.next_follow_up_at,'dd MMM HH:mm')}</p></div><ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground"/></button>)}{!leads.length&&<p className="py-12 text-center text-sm text-muted-foreground">Sin pendientes.</p>}</div>;}

function TeamCrmDetail({lead,onBack,onUpdated,onContact}:{lead:PortalLead;onBack:()=>void;onUpdated:()=>Promise<void>|void;onContact:(lead:PortalLead,channel:ContactChannel)=>void}){
  const[detail,setDetail]=useState<CrmDetail|null>(null);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[stage,setStage]=useState(['no_interesado','descartado'].includes(lead.stage)?'contactado':lead.stage);const[activityType,setActivityType]=useState('call');const[outcome,setOutcome]=useState('');const[nextFollowUp,setNextFollowUp]=useState(datetimeLocal(lead.next_follow_up_at));const[note,setNote]=useState('');
  const loadDetail=useCallback(async()=>{setLoading(true);try{const{data,error}=await rpcClient.rpc('fn_team_crm_detail',{p_empresa_id:lead.empresa_id});if(error)throw error;setDetail(data as CrmDetail);}catch(error){toast.error(errorText(error));}finally{setLoading(false);}},[lead.empresa_id]);useEffect(()=>{void loadDetail();},[loadDetail]);
  const save=async()=>{if(stage==='no_interesado'&&note.trim().length<5){toast.error('Escribe el motivo por el que se perdió');return;}setSaving(true);try{const{error}=await rpcClient.rpc('fn_team_crm_save',{p_empresa_id:lead.empresa_id,p_stage:stage,p_next_follow_up_at:nextFollowUp?new Date(nextFollowUp).toISOString():null,p_note:note||null,p_activity_type:activityType,p_outcome:outcome||null});if(error)throw error;toast.success('Seguimiento guardado');setNote('');setOutcome('');await Promise.all([loadDetail(),Promise.resolve(onUpdated())]);}catch(error){toast.error(errorText(error));}finally{setSaving(false);}};
  if(loading&&!detail)return <div className="flex min-h-[100dvh] items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/>Cargando expediente CRM…</div>;
  const summary=detail?.summary??{products:0,clients:0,users:0,sales:0,invoices:0,paid_invoices:0,paid_total:0,activities:0};const phone=(lead.telefono||'').replace(/\D/g,'');
  return <div className="min-h-[100dvh] bg-muted/20"><main className="mx-auto max-w-[1700px] space-y-5 p-4 sm:p-6"><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/>Volver al CRM</Button><section className="rounded-2xl border border-primary/20 bg-card p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Target className="h-5 w-5 text-primary"/><h1 className="text-2xl font-black">{lead.nombre}</h1><Badge variant="outline">{stageLabels[lead.stage]||lead.stage}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{lead.licencia||'Sin licencia'} · Responsable: {lead.assigned_name||'—'} · {lead.contact_attempts} intento(s)</p></div><div className="flex flex-wrap gap-2">{lead.telefono&&<Button asChild variant="outline"><a href={`tel:${lead.telefono}`} onClick={()=>onContact(lead,'call')}><Phone className="mr-2 h-4 w-4"/>Llamar</a></Button>}{phone&&<Button asChild className="bg-emerald-600 hover:bg-emerald-700"><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" onClick={()=>onContact(lead,'whatsapp')}><MessageCircle className="mr-2 h-4 w-4"/>WhatsApp</a></Button>}{lead.email&&<Button asChild variant="outline"><a href={`mailto:${lead.email}`} onClick={()=>onContact(lead,'email')}><Mail className="mr-2 h-4 w-4"/>Correo</a></Button>}</div></div></section><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"><Metric label="Activación" value={`${lead.activation_score||0}%`} detail={setupLabels[lead.setup_level||'']||'Sin configurar'} icon={BarChart3}/><Metric label="Productos" value={fmtNum(summary.products)} detail="Configurados" icon={Building2}/><Metric label="Clientes" value={fmtNum(summary.clients)} detail="Registrados" icon={UsersRound}/><Metric label="Ventas" value={fmtNum(summary.sales)} detail="Detectadas" icon={Target}/><Metric label="Usuarios" value={fmtNum(summary.users)} detail="Cuenta" icon={UsersRound}/><Metric label="Facturas" value={fmtNum(summary.invoices)} detail={`${summary.paid_invoices} pagadas`} icon={CircleDollarSign}/><Metric label="Pagado" value={money(summary.paid_total)} detail="Histórico" icon={Wallet}/><Metric label="Actividades" value={fmtNum(summary.activities)} detail="Bitácora CRM" icon={Activity}/></div><Tabs defaultValue="resumen" className="space-y-4"><TabsList><TabsTrigger value="resumen"><BarChart3 className="mr-2 h-4 w-4"/>Resumen</TabsTrigger><TabsTrigger value="seguimiento"><CalendarClock className="mr-2 h-4 w-4"/>Seguimiento</TabsTrigger><TabsTrigger value="historial"><History className="mr-2 h-4 w-4"/>Historial ({detail?.activities.length||0})</TabsTrigger><TabsTrigger value="cobros"><CircleDollarSign className="mr-2 h-4 w-4"/>Suscripción y cobros</TabsTrigger></TabsList><TabsContent value="resumen"><Card><CardContent className="grid gap-4 p-5 md:grid-cols-2"><div><h3 className="font-black">Contacto principal</h3><p className="mt-3">{lead.telefono||'Sin teléfono'}</p><p className="text-sm text-muted-foreground">{lead.email||'Sin correo'}</p></div><div><h3 className="font-black">Estado comercial</h3><p className="mt-3"><Badge variant="outline">{stageLabels[lead.stage]||lead.stage}</Badge></p><p className="mt-2 text-sm text-muted-foreground">Próximo seguimiento: {dateLabel(lead.next_follow_up_at,'dd MMM yyyy HH:mm')}</p></div></CardContent></Card></TabsContent><TabsContent value="seguimiento"><Card><CardContent className="p-5"><div className="grid gap-4 md:grid-cols-2"><div><Label>Etapa comercial</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={stage} onChange={e=>setStage(e.target.value)}><option value="por_contactar">Por contactar</option><option value="contactado">Contactado</option><option value="interesado">Interesado</option><option value="seguimiento">Seguimiento</option><option value="no_localizado">No localizado</option><option value="no_interesado">No interesado / Perdido</option></select></div><div><Label>Actividad realizada</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={activityType} onChange={e=>setActivityType(e.target.value)}><option value="call">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="note">Nota</option><option value="stage">Cambio de etapa</option></select></div><div><Label>Resultado</Label><Input className="mt-1" value={outcome} onChange={e=>setOutcome(e.target.value)} placeholder="Ej. Contestó; quiere demostración"/></div><div><Label>Próximo seguimiento</Label><Input className="mt-1" type="datetime-local" value={nextFollowUp} onChange={e=>setNextFollowUp(e.target.value)} disabled={stage==='no_interesado'}/></div><div className="md:col-span-2"><Label>{stage==='no_interesado'?'Motivo de pérdida *':'Nota comercial'}</Label><Textarea className="mt-1" rows={5} value={note} onChange={e=>setNote(e.target.value)}/></div></div><div className="mt-4 flex justify-end"><Button onClick={save} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Guardar seguimiento</Button></div></CardContent></Card></TabsContent><TabsContent value="historial"><Card><CardContent className="p-0"><div className="divide-y">{detail?.activities.map(item=><div key={item.id} className="flex gap-4 p-4"><div className="mt-1 h-3 w-3 rounded-full bg-primary ring-4 ring-primary/10"/><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><b>{item.actor_name} · {item.activity_type}</b><span className="text-xs text-muted-foreground">{dateLabel(item.created_at,'dd MMM yyyy HH:mm')}</span></div>{item.outcome&&<p className="mt-1 text-sm">{item.outcome}</p>}{item.note&&<p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</p>}{item.new_stage&&<p className="mt-2 text-[11px] text-muted-foreground">Etapa: {stageLabels[item.new_stage]||item.new_stage}</p>}</div></div>)}{!detail?.activities.length&&<p className="py-14 text-center text-sm text-muted-foreground">Sin movimientos comerciales.</p>}</div></CardContent></Card></TabsContent><TabsContent value="cobros" className="space-y-4"><Card><CardContent className="p-5"><h3 className="font-black">Suscripciones</h3><div className="mt-3 space-y-2">{detail?.subscriptions.map((s,i)=><div key={String(s.id??i)} className="rounded-lg border p-3 text-sm"><b>{String(s.status??s.estado??'Suscripción')}</b><p className="text-xs text-muted-foreground">{String(s.current_period_end??s.fecha_vencimiento??'')}</p></div>)}{!detail?.subscriptions.length&&<p className="text-sm text-muted-foreground">Sin suscripción.</p>}</div></CardContent></Card><Card><CardContent className="p-0"><div className="border-b p-4"><h3 className="font-black">Facturas</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="bg-muted"><tr><th className="px-4 py-3 text-left">Folio</th><th className="px-3 py-3 text-left">Estado</th><th className="px-3 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Fecha</th></tr></thead><tbody>{detail?.invoices.map((f,i)=><tr key={String(f.id??i)} className="border-t"><td className="px-4 py-3 font-bold">{String(f.numero_factura??f.folio??'—')}</td><td className="px-3 py-3">{String(f.estado??'—')}</td><td className="px-3 py-3 text-right">{money(Number(f.total??0))}</td><td className="px-4 py-3 text-right">{dateLabel(String(f.created_at??''))}</td></tr>)}</tbody></table></div></CardContent></Card></TabsContent></Tabs></main></div>;
}

function CompaniesTable({companies}:{companies:PortalCompany[]}){return <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted"><tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3">Responsable</th><th className="px-3 py-3">Comisión</th><th className="px-3 py-3 text-right">Pagado</th><th className="px-4 py-3">Contacto</th></tr></thead><tbody>{companies.map(c=><tr key={c.empresa_id} className="border-t"><td className="px-4 py-3"><b>{c.nombre}</b><p className="text-[10px] text-muted-foreground">{c.licencia||'Sin licencia'}</p></td><td className="px-3 py-3">{c.managed_by_name||'—'}</td><td className="px-3 py-3">{c.has_partner?'Partner':c.commissioned_by_name||'Sin comisión'}</td><td className="px-3 py-3 text-right font-bold">{money(c.paid_total)}</td><td className="px-4 py-3">{c.telefono||c.email||'—'}</td></tr>)}</tbody></table></div></CardContent></Card>;}
function CommissionsTable({entries}:{entries:PortalCommission[]}){return <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted"><tr><th className="px-4 py-3 text-left">Empresa/factura</th><th className="px-3 py-3 text-center">Pago</th><th className="px-3 py-3 text-right">Base</th><th className="px-3 py-3">Regla</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-4 py-3 text-center">Estado</th></tr></thead><tbody>{entries.map(e=><tr key={e.id} className="border-t"><td className="px-4 py-3"><b>{e.empresa_nombre}</b><p className="text-[10px] text-muted-foreground">{e.invoice_number||'Sin folio'} · {e.period}</p></td><td className="px-3 py-3 text-center">#{e.payment_number}</td><td className="px-3 py-3 text-right">{money(e.base_amount)}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[e.commission_mode]}</td><td className="px-3 py-3 text-right font-black text-emerald-600">{money(e.commission_amount)}</td><td className="px-4 py-3 text-center"><Badge variant="outline">{e.status}</Badge></td></tr>)}</tbody></table></div></CardContent></Card>;}
function ActivityList({activities}:{activities:PortalActivity[]}){return <div className="divide-y">{activities.map(item=><div key={item.id} className="flex gap-3 p-4"><div className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Activity className="h-3.5 w-3.5"/></div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><b className="text-sm">{item.person_name||'Sistema'} · {item.empresa_nombre}</b><span className="text-[10px] text-muted-foreground">{dateLabel(item.created_at,'dd MMM HH:mm')}</span></div><p className="text-xs">{item.outcome||item.activity_type}</p>{item.note&&<p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}{!activities.length&&<p className="py-14 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>}</div>;}
