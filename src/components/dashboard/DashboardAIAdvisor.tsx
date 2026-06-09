import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Props = {
  buildSnapshot: () => Record<string, any>;
};

export default function DashboardAIAdvisor({ buildSnapshot }: Props) {
  const { empresa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = buildSnapshot();
      const { data, error: fnErr } = await supabase.functions.invoke('dashboard-ai-advisor', {
        body: { snapshot, empresaNombre: (empresa as any)?.nombre },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      const txt = (data as any)?.advice ?? '';
      if (!txt) throw new Error('Respuesta vacía del asesor IA');
      setAdvice(txt);
      setGeneratedAt(new Date());
    } catch (e: any) {
      const msg = e?.message ?? 'Error al consultar al asesor IA';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
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
            <p className="text-[11px] text-muted-foreground">Análisis ejecutivo automático de tus KPIs</p>
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analizando…</>
          ) : advice ? (
            <><RefreshCw className="h-4 w-4" /> Volver a analizar</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Analizar mi negocio</>
          )}
        </button>
      </header>

      <div className="px-4 py-4">
        {!advice && !loading && !error && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Obtén un diagnóstico ejecutivo: oportunidades, riesgos y acciones concretas para los próximos 7 días.
              La IA usa tus datos del periodo seleccionado.
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
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {advice && !loading && (
          <>
            <article className={cn(
              "prose prose-sm max-w-none",
              "prose-headings:font-bold prose-headings:text-foreground prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-[13px] prose-headings:uppercase prose-headings:tracking-wide",
              "prose-h2:flex prose-h2:items-center prose-h2:gap-2 prose-h2:pb-1 prose-h2:border-b prose-h2:border-border",
              "prose-p:text-foreground prose-p:text-xs prose-p:my-1.5 prose-p:leading-relaxed",
              "prose-li:text-foreground prose-li:text-xs prose-li:my-0.5",
              "prose-strong:text-foreground prose-strong:font-bold",
              "prose-ul:my-1.5 prose-ol:my-1.5"
            )}>
              <ReactMarkdown>{advice}</ReactMarkdown>
            </article>
            {generatedAt && (
              <p className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground italic">
                Generado el {generatedAt.toLocaleString('es-MX')} · No reemplaza el juicio profesional.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
