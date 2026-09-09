import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, Copy, PhoneCall, Plus, Save, Sparkles, Target, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_CRM_CALL_PITCH, newPitchId, type CrmCallPitchConfig, type CrmPitchAction, type CrmPitchStep } from '@/lib/crmCallPitch';

type PitchEntry = { id: string; name: string; description: string; config: CrmCallPitchConfig };
type PitchCatalog = { version: 2; active_pitch_id: string; pitches: PitchEntry[] };
type RpcResult = { data: unknown; error: { message?: string } | null };
const rpcClient = supabase as unknown as { rpc: (name: string, params?: Record<string, unknown>) => Promise<RpcResult> };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const rid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const step = (title: string, subtitle: string, pitch: string, responses: Array<[string,string,CrmPitchAction,string?,string?,boolean?]>, tips: string[] = []): CrmPitchStep => ({
  id: rid('step'), title, subtitle, pitch, tips,
  responses: responses.map(([label, reply, action, finalTitle, finalNote, success]) => ({ id: rid('response'), label, reply, action, finalTitle, finalNote, success })),
});

const DEMO_PITCH: CrmCallPitchConfig = {
  title: 'Pitch · Demo comercial RutApp',
  goal: 'Conseguir una demo con un problema de negocio claramente identificado',
  steps: [
    step('Permiso breve','Gana atención sin sonar a discurso.','Hola, ¿[Nombre]? Soy Frida de RutApp. Te llamo porque ayudamos a empresas que venden en ruta a tener pedidos, clientes, inventario y cobranza bajo control. No quiero quitarte tiempo: ¿te puedo hacer dos preguntas rápidas para ver si tiene sentido hablar?',[
      ['Sí, dime','Gracias. Voy directo: quiero entender cómo controlan hoy a sus vendedores en calle.','next'],
      ['¿Qué venden?','RutApp organiza la operación de venta en ruta: pedidos, clientes, precios, inventario, cobranza y seguimiento. Antes de explicarte más, quiero saber si hoy eso te genera trabajo o falta de control.','next'],
      ['No tengo tiempo','Claro. Prefiero no darte un discurso. ¿Te marco hoy más tarde o mañana?','end','Reagendar','Registrar día y hora concretos.'],
    ],['Habla de resultado, no de módulos.','No intentes cerrar la venta en el primer minuto.']),
    step('Diagnóstico','Encuentra costo, fricción o falta de visibilidad.','Hoy, cuando un vendedor sale a ruta, ¿cómo sabes qué visitó, qué vendió, qué cobró y qué tiene pendiente?',[
      ['Todo es manual','Ahí normalmente se pierde tiempo y visibilidad. ¿Qué parte les pesa más: pedidos, cobranza, inventario o seguimiento del vendedor?','next'],
      ['Usamos Excel/WhatsApp','Entiendo. ¿El problema es capturar doble, consolidar al final del día o saber en tiempo real qué está pasando?','next'],
      ['Ya tenemos sistema','Perfecto. No tendría sentido cambiar por cambiar. ¿Qué es lo que todavía no te resuelve bien el sistema actual?','next'],
      ['No tenemos problema','Perfecto. Entonces no quiero forzarte una solución. Si hoy pudieras mejorar una sola cosa de la operación en ruta, ¿cuál sería?','stay'],
    ],['Haz una pregunta a la vez.','Usa literalmente el problema que diga el prospecto en el siguiente paso.']),
    step('Conectar valor','Devuelve su problema convertido en resultado.','Entonces el punto no es poner otro sistema; es que puedas ver y controlar [problema] sin esperar al cierre del día ni depender de mensajes. Eso es justo lo que podemos enseñarte con tu operación real.',[
      ['Le interesa','Perfecto. Lo mejor es verlo con un caso parecido al tuyo y en 15 minutos definimos si realmente te sirve.','next'],
      ['Pregunta precio','Te doy precios sin problema. Antes quiero asegurarme de cotizarte lo que realmente necesitas y no venderte de más. En la demo lo definimos en minutos.','next'],
      ['Lo va a pensar','Claro. Para que tengas algo concreto que pensar, veamos primero si resuelve el problema que me acabas de mencionar. Son 15 minutos y después decides con información.','next'],
    ]),
    step('Cierre de demo','Cierra con dos opciones, no con “avísame”.','Tengo espacio para una demo corta. ¿Te queda mejor mañana por la mañana o por la tarde?',[
      ['Elige horario','Perfecto. Te confirmo por WhatsApp y la enfocamos directamente en tu operación.','end','Demo agendada','Enviar confirmación y registrar cita.',true],
      ['Ninguno','Sin problema. ¿Qué día de esta semana te acomoda mejor?','stay'],
      ['Solo WhatsApp','Te mando un mensaje con dos horarios y una explicación muy breve para que elijas.','end','Seguimiento WhatsApp','Enviar mensaje con dos opciones concretas.'],
    ]),
  ],
  quickAnswers: [
    { id: rid('q'), question: '¿Cuánto cuesta?', answer: 'Depende del tamaño de la operación y lo que realmente vayan a usar. Prefiero no darte una cifra al aire: en la demo lo aterrizamos y te doy el precio correcto.' },
    { id: rid('q'), question: 'Mándame información', answer: 'Claro. Para no mandarte un folleto genérico, dime solo esto: ¿qué te interesa más controlar, vendedores, pedidos, inventario o cobranza?' },
    { id: rid('q'), question: 'Ya tengo sistema', answer: 'Perfecto. No buscamos reemplazar algo que funciona. Solo tendría sentido si hay una parte que todavía les genera trabajo, errores o falta de visibilidad.' },
  ],
};

const RENEWAL_PITCH: CrmCallPitchConfig = {
  title: 'Pitch · Renovación y retención',
  goal: 'Entender valor percibido, resolver fricción y cerrar continuidad',
  steps: [
    step('Abrir con contexto','No empieces cobrando.','Hola, ¿[Nombre]? Soy Frida de RutApp. Te contacto porque estamos revisando tu continuidad y antes de hablar de renovación quiero saber algo más importante: ¿cómo te ha funcionado RutApp en la operación real?',[
      ['Bien','Qué bueno. ¿Qué parte es la que más valor te está dando hoy?','next'],
      ['Regular','Gracias por decírmelo. ¿Qué es lo que tendría que mejorar para que realmente te resultara útil?','next'],
      ['Mal','Entiendo. Antes de hablar de renovación quiero entender exactamente qué falló o qué no cumplió tu expectativa.','next'],
    ]),
    step('Aislar la objeción','Define si es producto, uso, soporte o precio.','Si tuvieras que señalar una sola razón que hoy te haría dudar en continuar, ¿cuál sería?',[
      ['Precio','Entiendo. Antes de tocar precio quiero validar si el sistema sí te genera valor y el tema es únicamente el costo. ¿Es así?','next'],
      ['No lo usamos','Entonces el problema no es renovar todavía; es que no logramos integrarlo a tu operación. Podemos corregir eso antes de decidir.','next'],
      ['Falta una función','Perfecto, eso ya es concreto. Revisemos si existe otra forma de resolverlo hoy o si está dentro de lo que podemos implementar.','next'],
      ['Soporte/servicio','Gracias. Si corregimos esa parte, ¿sí tendría sentido continuar?','next'],
    ]),
    step('Cierre de continuidad','Pide una decisión concreta.','Con lo que me acabas de decir, propongo resolver primero ese punto y dejar tu continuidad lista para que no se interrumpa la operación. ¿Lo hacemos así?',[
      ['Sí','Perfecto. Dejo registrada la renovación y el compromiso acordado.','end','Renovación confirmada','Registrar renovación y compromiso.',true],
      ['Necesita pensarlo','Claro. ¿Qué información te falta para tomar la decisión? Prefiero resolver esa duda ahora y no dejarla abierta.','stay'],
      ['No continuará','Entiendo. Para cerrar correctamente, ¿la razón principal es precio, uso, producto o servicio?','end','No renueva','Registrar motivo real y oportunidad de recuperación.'],
    ]),
  ],
  quickAnswers: [
    { id: rid('q'), question: 'Está caro', answer: 'Entiendo. Quiero separar dos cosas: si no te genera valor, no tendría sentido aunque fuera barato; si sí te lo genera, revisemos cómo ajustar la continuidad sin perder lo que ya tienes funcionando.' },
    { id: rid('q'), question: 'Casi no lo usamos', answer: 'Entonces antes de pedirte renovar tenemos que corregir adopción. Revisemos qué impidió que tu equipo lo incorporara y hagamos un plan corto.' },
  ],
};

const COLLECTION_PITCH: CrmCallPitchConfig = {
  title: 'Pitch · Cobranza cordial',
  goal: 'Conseguir fecha y compromiso de pago sin deteriorar la relación',
  steps: [
    step('Confirmar contexto','Cobra con precisión, no con confrontación.','Hola, ¿[Nombre]? Soy Frida de RutApp. Te contacto por el saldo pendiente de tu cuenta. Quiero confirmar contigo que tengas ubicada la factura y que no exista algún inconveniente administrativo para procesarla.',[
      ['Sí la tiene','Perfecto. ¿Tienen ya una fecha programada de pago?','next'],
      ['No encuentra factura','Sin problema. Te la reenvío ahora mismo y confirmamos que llegue correctamente.','next'],
      ['Hay un problema','Gracias por decirme. ¿Es un tema de factura, datos fiscales, servicio o autorización interna?','next'],
    ]),
    step('Obtener compromiso','No aceptes “luego” como fecha.','Para dejarlo correctamente registrado, ¿qué fecha específica podemos tomar como compromiso de pago?',[
      ['Da fecha','Perfecto, registro esa fecha y te mando confirmación por WhatsApp/correo.','end','Compromiso de pago','Registrar fecha exacta y dar seguimiento.',true],
      ['No sabe','Entiendo. ¿Quién puede confirmarnos la fecha y cuándo sería buen momento para volver a hablar?','stay'],
      ['No puede pagar','Gracias por decirlo directamente. Revisemos qué alternativa real podemos manejar para no dejar el saldo sin plan.','next'],
      ['Disputa el cobro','No quiero pedirte pagar algo que consideras incorrecto. Voy a registrar la aclaración y primero validamos el cargo.','end','Aclaración de cobro','Enviar a auditoría antes de insistir en pago.'],
    ]),
    step('Acuerdo alternativo','Convierte imposibilidad en plan.','Podemos revisar una fecha distinta o un esquema que sí puedas cumplir. Lo importante es dejar un compromiso real. ¿Qué opción sí podrías sostener?',[
      ['Propone alternativa','Perfecto. La dejo registrada y te confirmo por escrito.','end','Acuerdo de pago','Registrar condiciones y fecha.',true],
      ['No acepta nada','Entiendo. Dejo registrado que hoy no pudimos establecer compromiso y lo revisamos internamente.','end','Sin compromiso','Escalar internamente antes del siguiente contacto.'],
    ]),
  ],
  quickAnswers: [
    { id: rid('q'), question: 'Ya pagué', answer: 'Perfecto. ¿Me compartes el comprobante o la fecha y referencia? Lo reviso para evitar cualquier seguimiento innecesario.' },
    { id: rid('q'), question: 'La factura está mal', answer: 'Entonces detenemos el seguimiento de cobro y primero corregimos la factura. Dime exactamente qué dato debemos validar.' },
    { id: rid('q'), question: 'Págame después', answer: 'Claro. Solo necesito dejar una fecha concreta para no estarte molestando antes. ¿Qué día te funciona como compromiso real?' },
  ],
};

const STARTER_PITCHES: PitchEntry[] = [
  { id: 'trial-recovery', name: 'Recuperación de prueba', description: 'Usuarios registrados que todavía no hicieron su primera venta.', config: clone(DEFAULT_CRM_CALL_PITCH) },
  { id: 'commercial-demo', name: 'Demo / venta consultiva', description: 'Prospectos nuevos: diagnosticar problema y agendar demo.', config: DEMO_PITCH },
  { id: 'renewal', name: 'Renovación y retención', description: 'Clientes próximos a renovar o con riesgo de cancelación.', config: RENEWAL_PITCH },
  { id: 'collection', name: 'Cobranza cordial', description: 'Facturas pendientes: obtener fecha o acuerdo sin desgastar la relación.', config: COLLECTION_PITCH },
];

function starterCatalog(): PitchCatalog { return { version: 2, active_pitch_id: 'trial-recovery', pitches: clone(STARTER_PITCHES) }; }
function normalizeCatalog(value: unknown): PitchCatalog {
  if (value && typeof value === 'object') {
    const c = value as Partial<PitchCatalog>;
    if (Array.isArray(c.pitches) && c.pitches.length) return { version: 2, active_pitch_id: typeof c.active_pitch_id === 'string' ? c.active_pitch_id : c.pitches[0].id, pitches: c.pitches as PitchEntry[] };
  }
  return starterCatalog();
}

function StepEditor({ step, onChange }: { step: CrmPitchStep; onChange: (s: CrmPitchStep) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-xl border bg-card">
    <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(v => !v)}>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{step.title.slice(0,1)}</div>
      <div className="min-w-0 flex-1"><div className="font-bold">{step.title}</div><div className="truncate text-xs text-muted-foreground">{step.subtitle}</div></div>
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
    {open && <div className="space-y-3 border-t p-4">
      <div className="grid gap-3 md:grid-cols-2"><div><Label>Paso</Label><Input value={step.title} onChange={e => onChange({...step,title:e.target.value})}/></div><div><Label>Instrucción</Label><Input value={step.subtitle} onChange={e => onChange({...step,subtitle:e.target.value})}/></div></div>
      <div><Label>Qué debe decir</Label><Textarea rows={3} value={step.pitch} onChange={e => onChange({...step,pitch:e.target.value})}/></div>
      <div><Label>Consejos · uno por línea</Label><Textarea rows={2} value={step.tips.join('\n')} onChange={e => onChange({...step,tips:e.target.value.split('\n').filter(Boolean)})}/></div>
      <div className="space-y-2"><Label>Tipos de respuesta</Label>{step.responses.map((r,i)=><div key={r.id} className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[220px_150px_1fr_auto]">
        <Input value={r.label} onChange={e=>onChange({...step,responses:step.responses.map((x,j)=>j===i?{...x,label:e.target.value}:x)})}/>
        <Select value={r.action} onValueChange={(v:CrmPitchAction)=>onChange({...step,responses:step.responses.map((x,j)=>j===i?{...x,action:v}:x)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="next">Avanza</SelectItem><SelectItem value="stay">Permanece</SelectItem><SelectItem value="end">Finaliza</SelectItem></SelectContent></Select>
        <Textarea rows={2} value={r.reply} onChange={e=>onChange({...step,responses:step.responses.map((x,j)=>j===i?{...x,reply:e.target.value}:x)})}/>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={()=>onChange({...step,responses:step.responses.filter((_,j)=>j!==i)})}><Trash2 className="h-4 w-4"/></Button>
      </div>)}
      <Button size="sm" variant="outline" onClick={()=>onChange({...step,responses:[...step.responses,{id:newPitchId('response'),label:'Nueva respuesta',reply:'',action:'stay'}]})}><Plus className="mr-1 h-4 w-4"/>Respuesta</Button></div>
    </div>}
  </div>;
}

export default function AdminCallPitchLibrary() {
  const [pathname,setPathname]=useState(()=>window.location.pathname);
  const [open,setOpen]=useState(false);
  const [catalog,setCatalog]=useState<PitchCatalog>(starterCatalog());
  const [selectedId,setSelectedId]=useState('trial-recovery');
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState('');
  useEffect(()=>{const sync=()=>setPathname(window.location.pathname); window.addEventListener('popstate',sync); window.addEventListener('rutapp:navigation',sync); return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('rutapp:navigation',sync)}},[]);
  const selected=useMemo(()=>catalog.pitches.find(p=>p.id===selectedId)||catalog.pitches[0],[catalog,selectedId]);
  const load=async()=>{setStatus(''); const {data,error}=await rpcClient.rpc('fn_admin_crm_call_pitch_catalog_get'); if(error){setCatalog(starterCatalog());setStatus('Ejecuta la nueva migración SQL para guardar la biblioteca.')} else {const c=normalizeCatalog(data);setCatalog(c);setSelectedId(c.active_pitch_id||c.pitches[0].id)}};
  useEffect(()=>{if(open) void load()},[open]);
  const saveCatalog=async(next:PitchCatalog,message='Cambios guardados')=>{setSaving(true);setStatus('');const {error}=await rpcClient.rpc('fn_admin_crm_call_pitch_catalog_save',{p_catalog:next});setSaving(false);if(error){setStatus(error.message||'No se pudo guardar');return false}setCatalog(next);setStatus(message);return true};
  const updateSelected=(next:PitchEntry)=>setCatalog(c=>({...c,pitches:c.pitches.map(p=>p.id===next.id?next:p)}));
  const makeActive=async(id:string)=>{const next={...catalog,active_pitch_id:id}; if(await saveCatalog(next,'Pitch activo actualizado. Equipo ya verá este guion.')) setSelectedId(id)};
  const duplicate=()=>{if(!selected)return;const copy={...clone(selected),id:newPitchId('pitch'),name:`${selected.name} · copia`};setCatalog(c=>({...c,pitches:[...c.pitches,copy]}));setSelectedId(copy.id)};
  const add=()=>{const p:PitchEntry={id:newPitchId('pitch'),name:'Nuevo pitch',description:'',config:{title:'Nuevo pitch',goal:'Define el objetivo de esta llamada',steps:[step('Inicio','Primer contacto','Hola, ¿[Nombre]? Te llamo brevemente porque quería revisar algo contigo.',[['Sí, dime','Perfecto, te cuento.','next'],['Ahora no puedo','Sin problema. ¿Qué horario te funciona mejor?','end','Reagendar','Registrar horario.']])],quickAnswers:[]}};setCatalog(c=>({...c,pitches:[...c.pitches,p]}));setSelectedId(p.id)};
  const remove=()=>{if(!selected||catalog.pitches.length<=1)return;const pitches=catalog.pitches.filter(p=>p.id!==selected.id);const active=catalog.active_pitch_id===selected.id?pitches[0].id:catalog.active_pitch_id;setCatalog({...catalog,pitches,active_pitch_id:active});setSelectedId(pitches[0].id)};
  if(!pathname.startsWith('/super-admin')) return null;
  return <>
    <Button className="fixed bottom-20 right-5 z-[71] h-11 rounded-full px-4 shadow-xl print:hidden" onClick={()=>setOpen(true)}><BookOpen className="mr-2 h-4 w-4"/>Pitch de llamadas</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex h-[94dvh] w-[calc(100vw-24px)] max-w-7xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-48px)]">
      <div className="border-b bg-card px-6 py-4"><DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-xl font-black"><PhoneCall className="h-5 w-5 text-primary"/>Pitch de llamadas</DialogTitle><DialogDescription>Biblioteca comercial del equipo. Crea, edita y define qué guion aparece en el CRM.</DialogDescription></DialogHeader></div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r bg-muted/20 p-3"><div className="mb-3 flex gap-2"><Button className="flex-1" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4"/>Nuevo pitch</Button></div><div className="space-y-2">{catalog.pitches.map(p=><button key={p.id} onClick={()=>setSelectedId(p.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId===p.id?'border-primary bg-primary/5 ring-1 ring-primary':'bg-card hover:border-primary/40'}`}><div className="flex items-center gap-2"><b className="flex-1 text-sm">{p.name}</b>{catalog.active_pitch_id===p.id&&<Badge className="text-[9px]"><Check className="mr-1 h-3 w-3"/>Activo</Badge>}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p><div className="mt-2 text-[10px] font-bold text-muted-foreground">{p.config.steps.length} pasos · {p.config.quickAnswers.length} objeciones</div></button>)}</div></aside>
        {selected&&<main className="min-h-0 overflow-y-auto bg-background p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-5">
          <section className="rounded-2xl border bg-card p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h2 className="text-xl font-black">{selected.name}</h2><p className="text-sm text-muted-foreground">{selected.description}</p></div>{catalog.active_pitch_id!==selected.id?<Button onClick={()=>void makeActive(selected.id)}><Sparkles className="mr-2 h-4 w-4"/>Usar en CRM</Button>:<Badge className="px-3 py-2">Pitch activo</Badge>}</div><div className="grid gap-3 md:grid-cols-2"><div><Label>Nombre interno</Label><Input value={selected.name} onChange={e=>updateSelected({...selected,name:e.target.value})}/></div><div><Label>Objetivo</Label><Input value={selected.config.goal} onChange={e=>updateSelected({...selected,config:{...selected.config,goal:e.target.value}})}/></div></div><div className="mt-3"><Label>Descripción</Label><Input value={selected.description} onChange={e=>updateSelected({...selected,description:e.target.value})}/></div><div className="mt-3"><Label>Título que verá el vendedor</Label><Input value={selected.config.title} onChange={e=>updateSelected({...selected,config:{...selected.config,title:e.target.value}})}/></div></section>
          <section><div className="mb-2"><h3 className="font-black">Pasos y respuestas</h3><p className="text-xs text-muted-foreground">Cada respuesta define si avanza, permanece o termina la llamada.</p></div><div className="space-y-2">{selected.config.steps.map((s,i)=><StepEditor key={s.id} step={s} onChange={next=>updateSelected({...selected,config:{...selected.config,steps:selected.config.steps.map((x,j)=>j===i?next:x)}})}/>)}</div><Button className="mt-2 w-full border-dashed" variant="outline" onClick={()=>updateSelected({...selected,config:{...selected.config,steps:[...selected.config.steps,step('Nuevo paso','', '', [['Nueva respuesta','','stay']])]}})}><Plus className="mr-2 h-4 w-4"/>Agregar paso</Button></section>
          <section className="rounded-2xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-black">Objeciones rápidas</h3><p className="text-xs text-muted-foreground">Disponibles en cualquier momento de la llamada.</p></div><Button size="sm" variant="outline" onClick={()=>updateSelected({...selected,config:{...selected.config,quickAnswers:[...selected.config.quickAnswers,{id:newPitchId('q'),question:'Nueva objeción',answer:''}]}})}><Plus className="mr-1 h-4 w-4"/>Agregar</Button></div><div className="space-y-2">{selected.config.quickAnswers.map((q,i)=><div key={q.id} className="grid gap-2 md:grid-cols-[240px_1fr_auto]"><Input value={q.question} onChange={e=>updateSelected({...selected,config:{...selected.config,quickAnswers:selected.config.quickAnswers.map((x,j)=>j===i?{...x,question:e.target.value}:x)}})}/><Textarea rows={2} value={q.answer} onChange={e=>updateSelected({...selected,config:{...selected.config,quickAnswers:selected.config.quickAnswers.map((x,j)=>j===i?{...x,answer:e.target.value}:x)}})}/><Button variant="ghost" size="icon" className="text-destructive" onClick={()=>updateSelected({...selected,config:{...selected.config,quickAnswers:selected.config.quickAnswers.filter((_,j)=>j!==i)}})}><Trash2 className="h-4 w-4"/></Button></div>)}</div></section>
        </div></main>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3 sm:px-6">{status?<p className="mr-auto text-xs font-medium text-muted-foreground">{status}</p>:<span className="mr-auto"/>}<Button variant="outline" onClick={duplicate} disabled={!selected}><Copy className="mr-2 h-4 w-4"/>Duplicar</Button><Button variant="outline" className="text-destructive" onClick={remove} disabled={catalog.pitches.length<=1}><Trash2 className="mr-2 h-4 w-4"/>Eliminar</Button><Button onClick={()=>void saveCatalog(catalog)} disabled={saving}><Save className="mr-2 h-4 w-4"/>{saving?'Guardando…':'Guardar biblioteca'}</Button></div>
    </DialogContent></Dialog>
  </>;
}
