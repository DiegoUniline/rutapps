import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, ChevronDown,
  CircleStop, Eye, MessageCircleQuestion, PencilLine, PhoneCall, Plus, RotateCcw,
  Save, Settings2, Sparkles, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CRM_CALL_PITCH, newPitchId, normalizeCrmCallPitch, personalizePitch,
  type CrmCallPitchConfig, type CrmPitchAction, type CrmPitchQuickAnswer,
  type CrmPitchResponse, type CrmPitchStep,
} from '@/lib/crmCallPitch';

type RpcResult = { data: unknown; error: { message?: string } | null };
const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<RpcResult>;
};

const actionLabel: Record<CrmPitchAction, string> = {
  next: 'Avanza', stay: 'Permanece', end: 'Finaliza',
};
const actionTone: Record<CrmPitchAction, string> = {
  next: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  stay: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  end: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
};

function useLocationPath() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      originalPush.apply(this, args);
      window.dispatchEvent(new Event('rutapp:navigation'));
    };
    window.history.replaceState = function (...args) {
      originalReplace.apply(this, args);
      window.dispatchEvent(new Event('rutapp:navigation'));
    };
    window.addEventListener('rutapp:navigation', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('rutapp:navigation', sync);
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
    };
  }, []);
  return pathname;
}

async function loadPitchConfig() {
  const { data, error } = await rpcClient.rpc('fn_crm_call_pitch_get');
  if (error) throw new Error(error.message || 'No se pudo cargar el pitch');
  return normalizeCrmCallPitch(data);
}

function extractLeadName(snapshot: unknown, empresaId: string) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const leads = (snapshot as { leads?: unknown }).leads;
  if (!Array.isArray(leads)) return null;
  const lead = leads.find(item => item && typeof item === 'object' && (item as { empresa_id?: unknown }).empresa_id === empresaId);
  return lead && typeof (lead as { nombre?: unknown }).nombre === 'string' ? (lead as { nombre: string }).nombre : null;
}

function Progress({ steps, index }: { steps: CrmPitchStep[]; index: number }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {steps.map((step, stepIndex) => (
        <div key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className={cn(
            'h-1.5 min-w-8 flex-1 rounded-full transition-colors',
            stepIndex < index ? 'bg-primary/45' : stepIndex === index ? 'bg-primary' : 'bg-muted'
          )} />
          <span className={cn('hidden whitespace-nowrap text-[10px] font-bold lg:inline', stepIndex === index ? 'text-foreground' : 'text-muted-foreground')}>
            {stepIndex + 1}. {step.title}
          </span>
        </div>
      ))}
    </div>
  );
}

function CallPitchDialog({ open, onOpenChange, empresaId, scope, previewConfig }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  empresaId?: string | null;
  scope: 'admin' | 'team';
  previewConfig?: CrmCallPitchConfig | null;
}) {
  const [config, setConfig] = useState<CrmCallPitchConfig>(previewConfig || DEFAULT_CRM_CALL_PITCH);
  const [leadName, setLeadName] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<CrmPitchResponse | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState<CrmPitchQuickAnswer | null>(null);
  const [finalResult, setFinalResult] = useState<CrmPitchResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setSelected(null);
    setQuick(null);
    setFinalResult(null);
    setError('');
    if (previewConfig) {
      setConfig(previewConfig);
      return;
    }
    void loadPitchConfig().then(setConfig).catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar el pitch'));
  }, [open, previewConfig]);

  useEffect(() => {
    if (!open || !empresaId || previewConfig) return;
    const rpc = scope === 'team' ? 'fn_team_crm_snapshot' : 'fn_admin_trial_crm_snapshot';
    void rpcClient.rpc(rpc).then(({ data }) => setLeadName(extractLeadName(data, empresaId))).catch(() => setLeadName(null));
  }, [open, empresaId, scope, previewConfig]);

  const step = config.steps[stepIndex];
  const resetStep = (index: number) => {
    setStepIndex(Math.max(0, Math.min(config.steps.length - 1, index)));
    setSelected(null);
    setQuick(null);
  };
  const execute = () => {
    if (!selected) return;
    if (selected.action === 'next') resetStep(stepIndex + 1);
    if (selected.action === 'stay') setSelected(null);
    if (selected.action === 'end') setFinalResult(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw-24px)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-48px)]">
        <div className="shrink-0 border-b bg-card px-5 py-4 sm:px-7">
          <DialogHeader className="space-y-1 text-left">
            <div className="flex items-start gap-3 pr-8">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PhoneCall className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-black sm:text-xl">{config.title}</DialogTitle>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                  <span>{config.goal}</span>
                  {leadName && <><span>·</span><b className="text-foreground">{leadName}</b></>}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {!finalResult && config.steps.length > 0 && <div className="mt-4"><Progress steps={config.steps} index={stepIndex} /></div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25">
          {error && <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}. Se muestra la versión base.</div>}
          {finalResult ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
              <div className={cn('mb-5 flex h-16 w-16 items-center justify-center rounded-2xl', finalResult.success ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary/10 text-primary')}>
                {finalResult.success ? <CheckCircle2 className="h-8 w-8" /> : <CircleStop className="h-8 w-8" />}
              </div>
              <Badge variant="outline" className="mb-3">{finalResult.success ? 'Objetivo logrado' : 'Llamada cerrada'}</Badge>
              <h2 className="text-2xl font-black sm:text-3xl">{finalResult.finalTitle || 'Llamada finalizada'}</h2>
              <p className="mt-3 max-w-xl text-base text-muted-foreground">{finalResult.finalNote || 'Registra el resultado y continúa con el siguiente seguimiento.'}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => { setFinalResult(null); resetStep(0); }}><RotateCcw className="mr-2 h-4 w-4" /> Reiniciar pitch</Button>
                <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
              </div>
            </div>
          ) : step ? (
            <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-7 sm:py-7">
              <section>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">{stepIndex + 1}</div>
                  <div>
                    <h2 className="text-xl font-black leading-tight sm:text-2xl">{step.title}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{step.subtitle}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:p-7">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">Di esto</div>
                  <p className="text-[20px] font-semibold leading-[1.48] tracking-[-0.015em] text-foreground sm:text-[25px]">
                    {personalizePitch(step.pitch, leadName)}
                  </p>
                </div>
                {step.tips.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{step.tips.map((tip, i) => <div key={`${step.id}-tip-${i}`} className="rounded-xl border bg-card/70 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"><Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />{tip}</div>)}</div>}
              </section>

              <section className="rounded-2xl border bg-card p-4 sm:p-5">
                <div className="mb-3">
                  <p className="text-sm font-black">¿Qué respondió?</p>
                  <p className="text-xs text-muted-foreground">Elige lo más parecido. La contestación aparece justo debajo.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {step.responses.map(response => (
                    <button key={response.id} onClick={() => { setSelected(response); setQuick(null); }} className={cn(
                      'flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors',
                      selected?.id === response.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-background hover:border-primary/50 hover:bg-muted/40'
                    )}>
                      <span>{response.label}</span>
                      <Badge variant="outline" className={cn('shrink-0 text-[9px]', actionTone[response.action])}>{actionLabel[response.action]}</Badge>
                    </button>
                  ))}
                </div>

                {selected && <div className="mt-4 overflow-hidden rounded-2xl border-2 border-primary/20 bg-primary/[0.035]">
                  <div className="border-b border-primary/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">Ahora contesta</div>
                  <div className="p-4 sm:p-5">
                    <p className="text-lg font-semibold leading-relaxed sm:text-xl">{personalizePitch(selected.reply, leadName)}</p>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Cambiar respuesta</Button>
                      <Button onClick={execute} className={cn(selected.action === 'end' && 'bg-rose-600 hover:bg-rose-700')}>
                        {selected.action === 'next' && <>Avanzar <ArrowRight className="ml-2 h-4 w-4" /></>}
                        {selected.action === 'stay' && <>Seguir en este paso</>}
                        {selected.action === 'end' && <>Finalizar llamada <CircleStop className="ml-2 h-4 w-4" /></>}
                      </Button>
                    </div>
                  </div>
                </div>}
              </section>

              <section className="rounded-2xl border bg-card">
                <button onClick={() => setQuickOpen(v => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
                  <span className="flex items-center gap-2 text-sm font-black"><MessageCircleQuestion className="h-4 w-4 text-primary" /> Respuestas rápidas a objeciones</span>
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', quickOpen && 'rotate-180')} />
                </button>
                {quickOpen && <div className="border-t p-4">
                  <div className="flex flex-wrap gap-2">{config.quickAnswers.map(item => <Button key={item.id} size="sm" variant={quick?.id === item.id ? 'default' : 'outline'} onClick={() => setQuick(item)}>{item.question}</Button>)}</div>
                  {quick && <div className="mt-3 rounded-xl bg-muted/55 p-4"><div className="mb-1 text-[10px] font-black uppercase text-muted-foreground">Contesta</div><p className="text-base font-semibold leading-relaxed">{personalizePitch(quick.answer, leadName)}</p></div>}
                </div>}
              </section>
            </div>
          ) : null}
        </div>

        {!finalResult && step && <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-7">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
            <Button variant="outline" disabled={stepIndex === 0} onClick={() => resetStep(stepIndex - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Anterior</Button>
            <span className="text-xs font-bold text-muted-foreground">Paso {stepIndex + 1} de {config.steps.length}</span>
            <Button variant="outline" disabled={stepIndex >= config.steps.length - 1} onClick={() => resetStep(stepIndex + 1)}>Siguiente <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function EditorResponse({ response, onChange, onDelete }: { response: CrmPitchResponse; onChange: (next: CrmPitchResponse) => void; onDelete: () => void }) {
  return <div className="rounded-xl border bg-muted/20 p-3">
    <div className="grid gap-3 lg:grid-cols-[1fr_160px_auto]">
      <div><Label className="text-[10px] uppercase text-muted-foreground">Lo que dice el prospecto</Label><Input value={response.label} onChange={e => onChange({ ...response, label: e.target.value })} /></div>
      <div><Label className="text-[10px] uppercase text-muted-foreground">Qué sucede</Label><Select value={response.action} onValueChange={(value: CrmPitchAction) => onChange({ ...response, action: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="next">Avanza</SelectItem><SelectItem value="stay">Permanece</SelectItem><SelectItem value="end">Finaliza</SelectItem></SelectContent></Select></div>
      <Button variant="ghost" size="icon" className="mt-5 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
    <div className="mt-3"><Label className="text-[10px] uppercase text-muted-foreground">Qué debe contestar el vendedor</Label><Textarea rows={2} value={response.reply} onChange={e => onChange({ ...response, reply: e.target.value })} /></div>
    {response.action === 'end' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label className="text-[10px] uppercase text-muted-foreground">Resultado final</Label><Input value={response.finalTitle || ''} onChange={e => onChange({ ...response, finalTitle: e.target.value })} placeholder="Ej. No interesado" /></div><div><Label className="text-[10px] uppercase text-muted-foreground">Qué debe hacer después</Label><Input value={response.finalNote || ''} onChange={e => onChange({ ...response, finalNote: e.target.value })} placeholder="Ej. Registrar motivo" /></div></div>}
  </div>;
}

function PitchEditorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [config, setConfig] = useState<CrmCallPitchConfig>(DEFAULT_CRM_CALL_PITCH);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setStatus('');
    try { setConfig(await loadPitchConfig()); }
    catch (error) { setConfig(DEFAULT_CRM_CALL_PITCH); setStatus(error instanceof Error ? error.message : 'No se pudo cargar la configuración'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async () => {
    setSaving(true); setStatus('');
    try {
      const { error } = await rpcClient.rpc('fn_admin_crm_call_pitch_save', { p_config: config });
      if (error) throw new Error(error.message || 'No se pudo guardar');
      setStatus('Cambios guardados. Equipo ya verá esta versión.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const updateStep = (index: number, next: CrmPitchStep) => setConfig(current => ({ ...current, steps: current.steps.map((step, i) => i === index ? next : step) }));
  const deleteStep = (index: number) => setConfig(current => ({ ...current, steps: current.steps.filter((_, i) => i !== index) }));
  const addStep = () => setConfig(current => ({ ...current, steps: [...current.steps, { id: newPitchId('step'), title: 'Nuevo paso', subtitle: '', pitch: '', tips: [], responses: [] }] }));

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] w-[calc(100vw-24px)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-48px)]">
        <div className="shrink-0 border-b bg-card px-5 py-4 sm:px-7">
          <DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2 text-xl font-black"><Settings2 className="h-5 w-5 text-primary" /> Configurar pitch de llamada</DialogTitle><DialogDescription>Una sola configuración para Super Admin y Equipo. Define exactamente qué se dice y qué hace cada respuesta.</DialogDescription></DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-5 sm:px-7">
          <div className="mx-auto max-w-5xl space-y-5">
            <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
              <div><Label>Título</Label><Input value={config.title} onChange={e => setConfig({ ...config, title: e.target.value })} /></div>
              <div><Label>Meta de la llamada</Label><Input value={config.goal} onChange={e => setConfig({ ...config, goal: e.target.value })} /></div>
            </section>

            <div className="space-y-4">{config.steps.map((step, stepIndex) => <section key={step.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center gap-2 border-b bg-muted/25 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">{stepIndex + 1}</div>
                <b className="min-w-0 flex-1 truncate">{step.title || 'Paso sin título'}</b>
                <Button variant="ghost" size="icon" disabled={stepIndex === 0} onClick={() => setConfig(current => ({ ...current, steps: moveItem(current.steps, stepIndex, -1) }))}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" disabled={stepIndex === config.steps.length - 1} onClick={() => setConfig(current => ({ ...current, steps: moveItem(current.steps, stepIndex, 1) }))}><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" disabled={config.steps.length <= 1} onClick={() => deleteStep(stepIndex)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2"><div><Label>Nombre del paso</Label><Input value={step.title} onChange={e => updateStep(stepIndex, { ...step, title: e.target.value })} /></div><div><Label>Instrucción corta</Label><Input value={step.subtitle} onChange={e => updateStep(stepIndex, { ...step, subtitle: e.target.value })} /></div></div>
                <div><Label>Pitch principal · lo que debe decir</Label><Textarea rows={3} className="text-base" value={step.pitch} onChange={e => updateStep(stepIndex, { ...step, pitch: e.target.value })} /></div>
                <div><Label>Consejos rápidos <span className="font-normal text-muted-foreground">(uno por línea)</span></Label><Textarea rows={2} value={step.tips.join('\n')} onChange={e => updateStep(stepIndex, { ...step, tips: e.target.value.split('\n').filter(Boolean) })} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2"><div><Label>Tipos de respuesta</Label><p className="text-[10px] text-muted-foreground">Cada respuesta decide si la llamada avanza, permanece o finaliza.</p></div><Button size="sm" variant="outline" onClick={() => updateStep(stepIndex, { ...step, responses: [...step.responses, { id: newPitchId('response'), label: 'Nueva respuesta', reply: '', action: 'stay' }] })}><Plus className="mr-1 h-3.5 w-3.5" /> Respuesta</Button></div>
                  {step.responses.map((response, responseIndex) => <EditorResponse key={response.id} response={response} onChange={next => updateStep(stepIndex, { ...step, responses: step.responses.map((item, i) => i === responseIndex ? next : item) })} onDelete={() => updateStep(stepIndex, { ...step, responses: step.responses.filter((_, i) => i !== responseIndex) })} />)}
                </div>
              </div>
            </section>)}</div>

            <Button variant="outline" className="w-full border-dashed" onClick={addStep}><Plus className="mr-2 h-4 w-4" /> Agregar paso</Button>

            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="font-black">Respuestas rápidas</h3><p className="text-xs text-muted-foreground">Objeciones que el vendedor puede consultar desde cualquier paso.</p></div><Button size="sm" variant="outline" onClick={() => setConfig(current => ({ ...current, quickAnswers: [...current.quickAnswers, { id: newPitchId('quick'), question: 'Nueva objeción', answer: '' }] }))}><Plus className="mr-1 h-3.5 w-3.5" /> Agregar</Button></div>
              <div className="space-y-2">{config.quickAnswers.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border bg-muted/20 p-3 lg:grid-cols-[260px_1fr_auto]"><Input value={item.question} onChange={e => setConfig(current => ({ ...current, quickAnswers: current.quickAnswers.map((q, i) => i === index ? { ...q, question: e.target.value } : q) }))} /><Textarea rows={2} value={item.answer} onChange={e => setConfig(current => ({ ...current, quickAnswers: current.quickAnswers.map((q, i) => i === index ? { ...q, answer: e.target.value } : q) }))} /><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setConfig(current => ({ ...current, quickAnswers: current.quickAnswers.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            </section>
          </div>
        </div>
        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-7">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {status && <p className="mr-auto text-xs font-medium text-muted-foreground">{status}</p>}
            {!status && <span className="mr-auto" />}
            <Button variant="outline" onClick={() => setConfig(DEFAULT_CRM_CALL_PITCH)}><RotateCcw className="mr-2 h-4 w-4" /> Restaurar base</Button>
            <Button variant="outline" onClick={() => setPreview(true)}><Eye className="mr-2 h-4 w-4" /> Vista previa</Button>
            <Button onClick={save} disabled={saving || loading}><Save className="mr-2 h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <CallPitchDialog open={preview} onOpenChange={setPreview} scope="admin" previewConfig={config} />
  </>;
}

export default function GlobalCrmPitchLauncher() {
  const pathname = useLocationPath();
  const detail = useMemo(() => pathname.match(/^\/(super-admin|equipo)\/crm\/([^/]+)/), [pathname]);
  const isAdmin = pathname.startsWith('/super-admin');
  const scope: 'admin' | 'team' = detail?.[1] === 'equipo' ? 'team' : 'admin';
  const empresaId = detail?.[2] || null;
  const [pitchOpen, setPitchOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  if (!isAdmin && !detail) return null;

  return <>
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2 print:hidden">
      {detail && <Button size="lg" className="h-12 rounded-full px-5 shadow-xl shadow-primary/20" onClick={() => setPitchOpen(true)}><PhoneCall className="mr-2 h-4 w-4" /> Ver pitch de llamada</Button>}
      {isAdmin && <Button variant="outline" className="h-10 rounded-full bg-background/95 px-4 shadow-lg backdrop-blur" onClick={() => setEditorOpen(true)}><PencilLine className="mr-2 h-4 w-4" /> Configurar pitch</Button>}
    </div>
    <CallPitchDialog open={pitchOpen} onOpenChange={setPitchOpen} empresaId={empresaId} scope={scope} />
    {isAdmin && <PitchEditorDialog open={editorOpen} onOpenChange={setEditorOpen} />}
  </>;
}
