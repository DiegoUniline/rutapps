import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, Loader2, RefreshCw, AlertCircle, History, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Props = {
  buildSnapshot: () => Record<string, any>;
};

type RecoRow = {
  id: string;
  content: string;
  created_at: string;
};

const MONTHLY_LIMIT = 4;

// Parse markdown into ## sections → tabs
function parseSections(md: string): { title: string; icon: string; body: string }[] {
  const lines = md.split('\n');
  const sections: { title: string; icon: string; body: string }[] = [];
  let cur: { title: string; icon: string; body: string } | null = null;
  for (const ln of lines) {
    const m = ln.match(/^##\s+(.+)$/);
    if (m) {
      if (cur) sections.push(cur);
      const raw = m[1].trim();
      // Extract leading emoji as icon
      const emojiMatch = raw.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u);
      const icon = emojiMatch ? emojiMatch[1] : '•';
      const title = emojiMatch ? raw.slice(emojiMatch[0].length).trim() : raw;
      cur = { title, icon, body: '' };
    } else if (cur) {
      cur.body += ln + '\n';
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

function AdviceTabs({ content }: { content: string }) {
  const sections = parseSections(content);
  const [active, setActive] = useState(0);

  if (sections.length === 0) {
    // Fallback: raw markdown if no sections were parsed
    return (
      <article className="prose prose-sm max-w-none prose-p:text-xs prose-li:text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-3 bg-accent/40 p-1 rounded-lg">
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 whitespace-nowrap",
              active === i
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            )}
          >
            <span className="text-sm leading-none">{s.icon}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
      <article className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:font-bold prose-headings:text-foreground prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-[12px] prose-headings:uppercase prose-headings:tracking-wide",
        "prose-p:text-foreground prose-p:text-xs prose-p:my-1.5 prose-p:leading-relaxed",
        "prose-li:text-foreground prose-li:text-xs prose-li:my-0.5",
        "prose-strong:text-foreground prose-strong:font-bold",
        "prose-ul:my-1.5 prose-ol:my-1.5",
        "prose-table:text-xs prose-table:w-full prose-table:border prose-table:border-border prose-table:rounded",
        "prose-thead:bg-muted/60",
        "prose-th:font-bold prose-th:text-foreground prose-th:text-left prose-th:px-2 prose-th:py-1.5 prose-th:border prose-th:border-border",
        "prose-td:text-foreground prose-td:px-2 prose-td:py-1.5 prose-td:border prose-td:border-border prose-td:align-top"
      )}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sections[active].body.trim()}</ReactMarkdown>
      </article>
    </div>
  );
}


export default function DashboardAIAdvisor({ buildSnapshot }: Props) {
  const { empresa, profile } = useAuth();
  const empresaId = (empresa as any)?.id;
  const userId = (profile as any)?.user_id;

  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const [history, setHistory] = useState<RecoRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    if (!empresaId || !userId) return;
    let cancelled = false;
    // Reset state when company or user changes to avoid showing data from another tenant
    setAdvice(null);
    setGeneratedAt(null);
    setHistory([]);
    setError(null);
    setBootLoading(true);
    (async () => {
      try {
        const since = new Date();
        since.setDate(1);
        since.setHours(0, 0, 0, 0);

        const [{ data: last }, { count }, { data: hist }] = await Promise.all([
          supabase
            .from('dashboard_ai_recomendaciones')
            .select('id, content, created_at')
            .eq('empresa_id', empresaId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('dashboard_ai_recomendaciones')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
            .eq('user_id', userId)
            .gte('created_at', since.toISOString()),
          supabase
            .from('dashboard_ai_recomendaciones')
            .select('id, content, created_at')
            .eq('empresa_id', empresaId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30),
        ]);
        if (cancelled) return;
        if (last) {
          setAdvice(last.content);
          setGeneratedAt(new Date(last.created_at));
        } else {
          setAdvice(null);
          setGeneratedAt(null);
        }
        setUsedThisMonth(count ?? 0);
        setHistory((hist as RecoRow[]) ?? []);
      } catch (e) {
        // silent
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [empresaId, userId]);

  const refreshHistory = async () => {
    if (!empresaId || !userId) return;
    const { data } = await supabase
      .from('dashboard_ai_recomendaciones')
      .select('id, content, created_at')
      .eq('empresa_id', empresaId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setHistory((data as RecoRow[]) ?? []);
  };

  const remaining = Math.max(0, MONTHLY_LIMIT - usedThisMonth);
  const reachedLimit = remaining <= 0;

  const handleAnalyze = async () => {
    if (reachedLimit) {
      toast.error(`Alcanzaste el límite de ${MONTHLY_LIMIT} análisis por mes.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snapshot = buildSnapshot();
      const { data, error: fnErr } = await supabase.functions.invoke('dashboard-ai-advisor', {
        body: { snapshot, empresaNombre: (empresa as any)?.nombre, empresaId },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) {
        if (typeof (data as any).usedThisMonth === 'number') setUsedThisMonth((data as any).usedThisMonth);
        throw new Error((data as any).error);
      }
      const txt = (data as any)?.advice ?? '';
      if (!txt) throw new Error('Respuesta vacía del asesor IA');
      setAdvice(txt);
      setGeneratedAt(new Date((data as any)?.createdAt ?? Date.now()));
      if (typeof (data as any).usedThisMonth === 'number') setUsedThisMonth((data as any).usedThisMonth);
      toast.success('Nuevo análisis listo');
      refreshHistory();
    } catch (e: any) {
      const msg = e?.message ?? 'Error al consultar al asesor IA';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className={cn(
        "rounded-xl border mb-5 overflow-hidden",
        "bg-gradient-to-br from-primary/[0.07] via-card to-card border-primary/30"
      )}>
        <header className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b border-primary/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-foreground flex items-center gap-2">
                Asesor IA
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wider">Beta</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Análisis ejecutivo automático · {remaining}/{MONTHLY_LIMIT} usos restantes este mes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-all"
            >
              <History className="h-3.5 w-3.5" /> Historial ({history.length})
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading || reachedLimit || bootLoading}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
              title={reachedLimit ? 'Límite mensual alcanzado' : 'Generar nuevo análisis'}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analizando…</>
              ) : reachedLimit ? (
                <><Clock className="h-4 w-4" /> Sin usos este mes</>
              ) : advice ? (
                <><RefreshCw className="h-4 w-4" /> Actualizar análisis</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Analizar mi negocio</>
              )}
            </button>
          </div>
        </header>

        <div className="px-4 py-4">
          {bootLoading && (
            <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Cargando último análisis…</span>
            </div>
          )}

          {!bootLoading && !advice && !loading && !error && (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Obtén un diagnóstico ejecutivo: oportunidades, riesgos y acciones concretas para los próximos 7 días.
                Tienes {MONTHLY_LIMIT} análisis disponibles al mes.
              </p>
            </div>
          )}

          {loading && (
            <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Analizando tus números…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs mb-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {advice && !loading && (
            <>
              <AdviceTabs content={advice} />
              {generatedAt && (
                <p className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground italic">
                  Última actualización: {generatedAt.toLocaleString('es-MX')} · No reemplaza el juicio profesional.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {historyOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="bg-card border rounded-xl shadow-xl w-full max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-sm">Historial del Asesor IA</h3>
                <span className="text-[10px] text-muted-foreground">({history.length} análisis guardados)</span>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="overflow-y-auto p-4 space-y-3">
              {history.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6">
                  Aún no hay análisis guardados.
                </p>
              )}
              {history.map((row) => (
                <details key={row.id} className="border rounded-lg bg-background">
                  <summary className="px-3 py-2 cursor-pointer text-xs font-bold flex items-center justify-between hover:bg-muted/50 rounded-lg">
                    <span>{new Date(row.created_at).toLocaleString('es-MX')}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {row.content.length} caracteres
                    </span>
                  </summary>
                  <div className="px-4 py-3 border-t">
                    <AdviceTabs content={row.content} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
