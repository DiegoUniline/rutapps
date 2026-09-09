import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, ArrowLeft, BarChart3, Building2, CalendarClock, CheckCircle2,
  CircleDollarSign, Clock3, History, LayoutDashboard, Loader2, LogOut, Mail,
  MessageCircle, Phone, RefreshCw, Search, ShieldCheck, Target, UsersRound, Wallet,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import AdminTrialCrmTab from '@/components/admin/AdminTrialCrmTab';
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
  const navigate=useNavigate();
  const{empresaId:crmEmpresaId}=useParams<{empresaId?:string}>();
  const openLeadCrm=(lead:PortalLead)=>navigate(`/equipo/crm/${lead.empresa_id}`);
  const[data,setData]=useState<PortalSnapshot|null>(null);
  const[loading,setLoading]=useState(true);
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

  const activeLeads=filteredLeads.filter(l=>!['no_interesado','descartado','convertido'].includes(l.stage));
  const lostLeads=filteredLeads.filter(l=>['no_interesado','descartado'].includes(l.stage));

  return <div className="min-h-[100dvh] bg-muted/20">
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-[1900px] items-center gap-3 px-4 py-3"><div className="rounded-xl bg-primary p-2 text-primary-foreground"><UsersRound className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="font-black">Equipo RutApp</p><p className="truncate text-[10px] text-muted-foreground">{data.me.name} · {data.me.job_title||TEAM_LEVEL_LABELS[data.me.access_level]}</p></div>{profile?.empresa_id&&<Button variant="outline" size="sm" onClick={()=>{window.location.href='/dashboard';}}><Building2 className="mr-2 h-4 w-4"/>Mi empresa</Button>}<Button variant="ghost" size="icon" onClick={()=>signOut()}><LogOut className="h-4 w-4"/></Button></div></header>
    <main className="mx-auto max-w-[1900px] space-y-3 p-3 sm:p-4">
      <Tabs defaultValue="crm" value={crmEmpresaId?'crm':undefined} className="space-y-3"><div className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-0 flex-1 justify-start bg-transparent"><TabsTrigger value="inicio"><LayoutDashboard className="mr-2 h-4 w-4"/>Mi día</TabsTrigger><TabsTrigger value="crm"><Target className="mr-2 h-4 w-4"/>CRM</TabsTrigger><TabsTrigger value="empresas"><Building2 className="mr-2 h-4 w-4"/>Empresas</TabsTrigger><TabsTrigger value="comisiones"><CircleDollarSign className="mr-2 h-4 w-4"/>Comisiones</TabsTrigger><TabsTrigger value="actividad"><Activity className="mr-2 h-4 w-4"/>Actividad</TabsTrigger></TabsList><Button variant="outline" size="sm" className="mr-1 shrink-0" onClick={()=>void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4',loading&&'animate-spin')}/>Actualizar</Button></div>
        <TabsContent value="inicio" className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Seguimientos vencidos</h2></div><CompactLeadList leads={activeLeads.filter(l=>l.next_follow_up_at&&new Date(l.next_follow_up_at)<new Date()).slice(0,20)} onOpen={openLeadCrm}/></CardContent></Card><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Actividad reciente</h2></div><ActivityList activities={data.activities.slice(0,20)}/></CardContent></Card></TabsContent>

        <TabsContent value="crm" className="space-y-4">
          <AdminTrialCrmTab scope="team" />
        </TabsContent>

        <TabsContent value="empresas"><CompaniesTable companies={data.companies}/></TabsContent>
        <TabsContent value="comisiones"><CommissionsTable entries={data.commissions}/></TabsContent>
        <TabsContent value="actividad"><Card><CardContent className="p-0"><ActivityList activities={data.activities}/></CardContent></Card></TabsContent>
      </Tabs>
    </main>
  </div>;
}


function CompactLeadList({leads,onOpen}:{leads:PortalLead[];onOpen:(lead:PortalLead)=>void}){return <div className="divide-y">{leads.map(l=><button key={l.empresa_id} onClick={()=>onOpen(l)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"><div><b>{l.nombre}</b><p className="text-[10px] text-muted-foreground">{stageLabels[l.stage]||l.stage} · {dateLabel(l.next_follow_up_at,'dd MMM HH:mm')}</p></div><ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground"/></button>)}{!leads.length&&<p className="py-12 text-center text-sm text-muted-foreground">Sin pendientes.</p>}</div>;}


function CompaniesTable({companies}:{companies:PortalCompany[]}){return <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted"><tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3">Responsable</th><th className="px-3 py-3">Comisión</th><th className="px-3 py-3 text-right">Pagado</th><th className="px-4 py-3">Contacto</th></tr></thead><tbody>{companies.map(c=><tr key={c.empresa_id} className="border-t"><td className="px-4 py-3"><b>{c.nombre}</b><p className="text-[10px] text-muted-foreground">{c.licencia||'Sin licencia'}</p></td><td className="px-3 py-3">{c.managed_by_name||'—'}</td><td className="px-3 py-3">{c.has_partner?'Partner':c.commissioned_by_name||'Sin comisión'}</td><td className="px-3 py-3 text-right font-bold">{money(c.paid_total)}</td><td className="px-4 py-3">{c.telefono||c.email||'—'}</td></tr>)}</tbody></table></div></CardContent></Card>;}
function CommissionsTable({entries}:{entries:PortalCommission[]}){return <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted"><tr><th className="px-4 py-3 text-left">Empresa/factura</th><th className="px-3 py-3 text-center">Pago</th><th className="px-3 py-3 text-right">Base</th><th className="px-3 py-3">Regla</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-4 py-3 text-center">Estado</th></tr></thead><tbody>{entries.map(e=><tr key={e.id} className="border-t"><td className="px-4 py-3"><b>{e.empresa_nombre}</b><p className="text-[10px] text-muted-foreground">{e.invoice_number||'Sin folio'} · {e.period}</p></td><td className="px-3 py-3 text-center">#{e.payment_number}</td><td className="px-3 py-3 text-right">{money(e.base_amount)}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[e.commission_mode]}</td><td className="px-3 py-3 text-right font-black text-emerald-600">{money(e.commission_amount)}</td><td className="px-4 py-3 text-center"><Badge variant="outline">{e.status}</Badge></td></tr>)}</tbody></table></div></CardContent></Card>;}
function ActivityList({activities}:{activities:PortalActivity[]}){return <div className="divide-y">{activities.map(item=><div key={item.id} className="flex gap-3 p-4"><div className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Activity className="h-3.5 w-3.5"/></div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><b className="text-sm">{item.person_name||'Sistema'} · {item.empresa_nombre}</b><span className="text-[10px] text-muted-foreground">{dateLabel(item.created_at,'dd MMM HH:mm')}</span></div><p className="text-xs">{item.outcome||item.activity_type}</p>{item.note&&<p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}{!activities.length&&<p className="py-14 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>}</div>;}
