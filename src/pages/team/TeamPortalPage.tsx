import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity, Building2, CalendarClock, CheckCircle2, CircleDollarSign, Clock3,
  LayoutDashboard, Loader2, LogOut, Mail, MessageCircle, Phone, RefreshCw,
  Search, ShieldCheck, Target, UsersRound, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { COMMISSION_MODE_LABELS, TEAM_LEVEL_LABELS, TEAM_SCOPE_LABELS, type InternalCommissionMode, type TeamAccessLevel, type TeamAccessScope } from '@/lib/internalTeam';
import { cn, fmtNum } from '@/lib/utils';

const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

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

const money = (value:number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)||0);
const dateLabel = (value?:string|null, pattern='dd MMM yyyy') => value ? format(new Date(value),pattern,{locale:es}) : '—';
const errorText = (error:unknown) => error instanceof Error ? error.message : typeof error==='object'&&error&&'message' in error ? String(error.message) : 'No se pudo completar la operación';
const stageLabels:Record<string,string>={sin_contactar:'Sin contactar',por_contactar:'Por contactar',contactado:'Contactado',interesado:'Interesado',seguimiento:'Seguimiento',no_localizado:'No localizado',no_interesado:'No interesado',descartado:'Descartado',convertido:'Convertido'};

function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:typeof Target}) {
  return <Card><CardContent className="p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></CardContent></Card>;
}

export default function TeamPortalPage() {
  const { profile, signOut } = useAuth();
  const [data,setData]=useState<PortalSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [selectedLead,setSelectedLead]=useState<PortalLead|null>(null);
  const [follow,setFollow]=useState({stage:'contactado',activityType:'call',outcome:'',nextFollowUp:'',note:''});
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{const{data:result,error}=await rpcClient.rpc('fn_team_portal_snapshot');if(error)throw error;setData(result as PortalSnapshot);}
    catch(error){toast.error(errorText(error));}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const openContact=(lead:PortalLead,channel:'call'|'whatsapp'|'email')=>{
    void rpcClient.rpc('fn_team_crm_log_contact',{p_empresa_id:lead.empresa_id,p_channel:channel})
      .then(({error})=>{if(error)throw error;return load();})
      .catch(error=>toast.error(`Se abrió el contacto, pero no se pudo medir: ${errorText(error)}`));
  };
  const openFollow=(lead:PortalLead)=>{
    setSelectedLead(lead);setFollow({stage:['no_interesado','descartado'].includes(lead.stage)?'contactado':lead.stage,activityType:'call',outcome:'',nextFollowUp:'',note:''});
  };
  const saveFollow=async()=>{
    if(!selectedLead)return;
    if(follow.stage==='no_interesado'&&follow.note.trim().length<5){toast.error('Escribe el motivo por el que se perdió');return;}
    setSaving(true);
    try{const{error}=await rpcClient.rpc('fn_team_crm_save',{p_empresa_id:selectedLead.empresa_id,p_stage:follow.stage,p_next_follow_up_at:follow.nextFollowUp?new Date(follow.nextFollowUp).toISOString():null,p_note:follow.note||null,p_activity_type:follow.activityType,p_outcome:follow.outcome||null});if(error)throw error;toast.success(follow.stage==='no_interesado'?'Prospecto enviado a Perdidos':'Seguimiento guardado');setSelectedLead(null);await load();}
    catch(error){toast.error(errorText(error));}finally{setSaving(false);}
  };
  const filteredLeads=useMemo(()=>{const term=search.trim().toLocaleLowerCase('es');return(data?.leads??[]).filter(lead=>!term||`${lead.nombre} ${lead.licencia??''} ${lead.email??''}`.toLocaleLowerCase('es').includes(term));},[data?.leads,search]);

  if(loading&&!data)return <div className="flex min-h-[100dvh] items-center justify-center gap-2 bg-background text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Cargando Mi equipo…</div>;
  if(!data)return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6"><Card className="max-w-md"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-500"/><h1 className="mt-4 text-xl font-black">Acceso interno no disponible</h1><p className="mt-2 text-sm text-muted-foreground">Pide al administrador que revise tu vinculación en Panel Master → Equipo.</p><Button className="mt-5" onClick={()=>signOut()}>Cerrar sesión</Button></CardContent></Card></div>;
  const activeLeads=filteredLeads.filter(lead=>!['no_interesado','descartado','convertido'].includes(lead.stage));
  const lostLeads=filteredLeads.filter(lead=>['no_interesado','descartado'].includes(lead.stage));

  return <div className="min-h-[100dvh] bg-muted/20">
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur"><div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3"><div className="rounded-xl bg-primary p-2 text-primary-foreground"><UsersRound className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="font-black">Equipo RutApp</p><p className="truncate text-[10px] text-muted-foreground">{data.me.name} · {data.me.job_title||TEAM_LEVEL_LABELS[data.me.access_level]}</p></div>{profile?.empresa_id&&<Button variant="outline" size="sm" onClick={()=>{window.location.href='/dashboard';}}><Building2 className="mr-2 h-4 w-4"/>Mi empresa</Button>}<Button variant="ghost" size="icon" onClick={()=>signOut()}><LogOut className="h-4 w-4"/></Button></div></header>
    <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-black">Hola, {data.me.name}</h1><p className="mt-1 text-sm text-muted-foreground">{TEAM_LEVEL_LABELS[data.me.access_level]} · {TEAM_SCOPE_LABELS[data.me.access_scope]} · Comisión: {COMMISSION_MODE_LABELS[data.me.commission_mode]}</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4',loading&&'animate-spin')}/>Actualizar</Button></div></section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label="Prospectos" value={fmtNum(data.metrics.active_leads)} detail="En seguimiento" icon={Target}/><Metric label="Vencidos" value={fmtNum(data.metrics.followups_due)} detail="Atender hoy" icon={CalendarClock}/><Metric label="Empresas" value={fmtNum(data.metrics.companies)} detail="Cartera visible" icon={Building2}/><Metric label="Contactos 30d" value={fmtNum(data.metrics.contacts_30d)} detail="Llamadas, WA y correo" icon={Phone}/><Metric label="Por cobrar" value={money(data.metrics.commission_pending)} detail="Pendiente/aprobada" icon={Wallet}/><Metric label="Pagado" value={money(data.metrics.commission_paid)} detail="Histórico" icon={CircleDollarSign}/></div>
      <Tabs defaultValue="inicio" className="space-y-4"><div className="overflow-x-auto rounded-xl border bg-card p-1"><TabsList className="h-auto w-max min-w-full justify-start bg-transparent"><TabsTrigger value="inicio"><LayoutDashboard className="mr-2 h-4 w-4"/>Mi día</TabsTrigger><TabsTrigger value="crm"><Target className="mr-2 h-4 w-4"/>CRM</TabsTrigger><TabsTrigger value="empresas"><Building2 className="mr-2 h-4 w-4"/>Empresas</TabsTrigger><TabsTrigger value="comisiones"><CircleDollarSign className="mr-2 h-4 w-4"/>Comisiones</TabsTrigger><TabsTrigger value="actividad"><Activity className="mr-2 h-4 w-4"/>Actividad</TabsTrigger></TabsList></div>
        <TabsContent value="inicio" className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Seguimientos vencidos</h2><p className="text-xs text-muted-foreground">Ordenados por el compromiso más antiguo.</p></div><LeadList leads={activeLeads.filter(lead=>lead.next_follow_up_at&&new Date(lead.next_follow_up_at)<new Date()).slice(0,20)} onFollow={openFollow} onContact={openContact}/></CardContent></Card><Card><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Actividad reciente</h2><p className="text-xs text-muted-foreground">Evidencia real del trabajo comercial.</p></div><ActivityList activities={data.activities.slice(0,20)}/></CardContent></Card></TabsContent>
        <TabsContent value="crm" className="space-y-4"><div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="bg-card pl-9" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar prospecto, licencia o correo…"/></div><Tabs defaultValue="activos"><TabsList><TabsTrigger value="activos">Activos ({activeLeads.length})</TabsTrigger><TabsTrigger value="perdidos">Perdidos ({lostLeads.length})</TabsTrigger></TabsList><TabsContent value="activos"><Card><CardContent className="p-0"><LeadList leads={activeLeads} onFollow={openFollow} onContact={openContact}/></CardContent></Card></TabsContent><TabsContent value="perdidos"><Card><CardContent className="p-0"><LeadList leads={lostLeads} onFollow={openFollow} onContact={openContact}/></CardContent></Card></TabsContent></Tabs></TabsContent>
        <TabsContent value="empresas"><Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-3 py-3 text-left">Responsable</th><th className="px-3 py-3 text-left">Comisión</th><th className="px-3 py-3 text-right">Pagado por cliente</th><th className="px-4 py-3 text-left">Contacto</th></tr></thead><tbody>{data.companies.map(company=><tr key={company.empresa_id} className="border-t"><td className="px-4 py-3"><b>{company.nombre}</b><p className="text-[10px] text-muted-foreground">{company.licencia||'Sin licencia'}</p></td><td className="px-3 py-3">{company.managed_by_name||'—'}</td><td className="px-3 py-3">{company.has_partner?'Partner':company.commissioned_by_name||'Sin comisión'}</td><td className="px-3 py-3 text-right font-bold">{money(company.paid_total)}</td><td className="px-4 py-3">{company.telefono||company.email||'—'}</td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
        <TabsContent value="comisiones"><Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b p-4"><h2 className="font-black">Mis comisiones</h2><p className="text-xs text-muted-foreground">Factura, base cobrada, regla aplicada y estado. No puedes editar ni aprobar tus propios movimientos.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-muted/80"><tr><th className="px-4 py-3 text-left">Empresa/factura</th><th className="px-3 py-3 text-center">Pago</th><th className="px-3 py-3 text-right">Base</th><th className="px-3 py-3 text-left">Regla</th><th className="px-3 py-3 text-right">Comisión</th><th className="px-4 py-3 text-center">Estado</th></tr></thead><tbody>{data.commissions.map(entry=><tr key={entry.id} className="border-t"><td className="px-4 py-3"><b>{entry.empresa_nombre}</b><p className="text-[10px] text-muted-foreground">{entry.invoice_number||'Sin folio'} · {entry.period}</p></td><td className="px-3 py-3 text-center">#{entry.payment_number}</td><td className="px-3 py-3 text-right">{money(entry.base_amount)}</td><td className="px-3 py-3">{COMMISSION_MODE_LABELS[entry.commission_mode]}{entry.commission_pct>0&&<p className="text-[10px] text-muted-foreground">{entry.commission_pct}%</p>}</td><td className="px-3 py-3 text-right font-black text-emerald-600">{money(entry.commission_amount)}</td><td className="px-4 py-3 text-center"><Badge variant="outline">{entry.status}</Badge></td></tr>)}{!data.commissions.length&&<tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Todavía no hay movimientos de comisión.</td></tr>}</tbody></table></div></CardContent></Card></TabsContent>
        <TabsContent value="actividad"><Card><CardContent className="p-0"><ActivityList activities={data.activities}/></CardContent></Card></TabsContent>
      </Tabs>
    </main>
    <Dialog open={!!selectedLead} onOpenChange={open=>{if(!open)setSelectedLead(null);}}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Seguimiento · {selectedLead?.nombre}</DialogTitle><DialogDescription>Registra el resultado real. Si eliges No interesado saldrá del CRM activo y conservará el motivo.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>Etapa</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={follow.stage} onChange={event=>setFollow(current=>({...current,stage:event.target.value}))}><option value="por_contactar">Por contactar</option><option value="contactado">Contactado</option><option value="interesado">Interesado</option><option value="seguimiento">Seguimiento</option><option value="no_localizado">No localizado</option><option value="no_interesado">No interesado / Perdido</option></select></div><div><Label>Actividad</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={follow.activityType} onChange={event=>setFollow(current=>({...current,activityType:event.target.value}))}><option value="call">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="note">Nota</option></select></div><div><Label>Resultado</Label><Input value={follow.outcome} onChange={event=>setFollow(current=>({...current,outcome:event.target.value}))} placeholder="Ej. Contestó, desea demostración"/></div><div><Label>Próximo seguimiento</Label><Input type="datetime-local" disabled={follow.stage==='no_interesado'} value={follow.nextFollowUp} onChange={event=>setFollow(current=>({...current,nextFollowUp:event.target.value}))}/></div><div className="sm:col-span-2"><Label>{follow.stage==='no_interesado'?'Motivo de pérdida *':'Nota comercial'}</Label><Textarea rows={4} value={follow.note} onChange={event=>setFollow(current=>({...current,note:event.target.value}))}/></div></div><DialogFooter><Button variant="outline" onClick={()=>setSelectedLead(null)}>Cancelar</Button><Button onClick={saveFollow} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<CheckCircle2 className="mr-2 h-4 w-4"/>}Guardar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function LeadList({leads,onFollow,onContact}:{leads:PortalLead[];onFollow:(lead:PortalLead)=>void;onContact:(lead:PortalLead,channel:'call'|'whatsapp'|'email')=>void}) {
  return <div className="divide-y">{leads.map(lead=>{const phone=(lead.telefono||'').replace(/\D/g,'');return <div key={lead.empresa_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{lead.nombre}</b><Badge variant="outline">{stageLabels[lead.stage]||lead.stage}</Badge></div><p className="mt-1 text-[10px] text-muted-foreground">{lead.licencia||'Sin licencia'} · Responsable: {lead.assigned_name||'—'} · {lead.contact_attempts} intento(s)</p><p className={cn('mt-1 text-xs',lead.next_follow_up_at&&new Date(lead.next_follow_up_at)<new Date()?'font-bold text-red-600':'text-muted-foreground')}><Clock3 className="mr-1 inline h-3 w-3"/>Seguimiento: {dateLabel(lead.next_follow_up_at,'dd MMM HH:mm')}</p>{lead.lost_reason&&<p className="mt-1 text-xs text-red-600">{lead.lost_reason}</p>}</div><div className="flex flex-wrap gap-1">{lead.telefono&&<Button asChild size="icon" variant="outline"><a href={`tel:${lead.telefono}`} onClick={()=>onContact(lead,'call')}><Phone className="h-4 w-4"/></a></Button>}{phone&&<Button asChild size="icon" className="bg-emerald-600 hover:bg-emerald-700"><a target="_blank" rel="noreferrer" href={`https://wa.me/${phone}`} onClick={()=>onContact(lead,'whatsapp')}><MessageCircle className="h-4 w-4"/></a></Button>}{lead.email&&<Button asChild size="icon" variant="outline"><a href={`mailto:${lead.email}`} onClick={()=>onContact(lead,'email')}><Mail className="h-4 w-4"/></a></Button>}<Button size="sm" onClick={()=>onFollow(lead)}>Seguimiento</Button></div></div>;})}{!leads.length&&<p className="py-14 text-center text-sm text-muted-foreground">No hay prospectos en esta vista.</p>}</div>;
}
function ActivityList({activities}:{activities:PortalActivity[]}) {return <div className="divide-y">{activities.map(item=><div key={item.id} className="flex gap-3 p-4"><div className="mt-1 rounded-full bg-primary/10 p-2 text-primary"><Activity className="h-3.5 w-3.5"/></div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><b className="text-sm">{item.person_name||'Sistema'} · {item.empresa_nombre}</b><span className="text-[10px] text-muted-foreground">{dateLabel(item.created_at,'dd MMM HH:mm')}</span></div><p className="text-xs">{item.outcome||item.activity_type}</p>{item.note&&<p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}{!activities.length&&<p className="py-14 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>}</div>;}
