import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ChevronUp, RotateCcw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type CancellationRow = {
  id?: string | null;
  reason?: string | null;
  reason_detail?: string | null;
  offered_discount?: boolean | null;
  discount_accepted?: boolean | null;
  cancelled?: boolean | null;
  created_at?: string | null;
};

type CancellationInsight = {
  empresa_id?: string;
  total_requests?: number;
  has_cancelled?: boolean;
  latest?: CancellationRow | null;
  latest_cancelled?: CancellationRow | null;
};

type RpcResult = { data: unknown; error: { message?: string } | null };
const rpcClient = supabase as unknown as {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<RpcResult>;
};

const REASON_LABELS: Record<string, string> = {
  costo: 'Muy caro',
  funciones: 'Faltan funciones',
  soporte: 'Soporte deficiente',
  otro_sistema: 'Cambió de sistema',
};

const REASON_MESSAGES: Record<string, string> = {
  costo: 'El precio no se ajusta a su presupuesto.',
  funciones: 'No encontró las funciones que necesita para su negocio.',
  soporte: 'No recibió la ayuda o el soporte que necesitaba.',
  otro_sistema: 'Encontró otra solución que se adapta mejor a su operación.',
};

function formatDate(value?: string | null) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function useCrmRoute() {
  const getRoute = () => {
    const match = window.location.pathname.match(/^\/(super-admin|equipo)\/crm\/([^/]+)/);
    return match ? { scope: match[1] as 'super-admin' | 'equipo', empresaId: decodeURIComponent(match[2]) } : null;
  };
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const sync = () => setRoute(getRoute());
    window.addEventListener('popstate', sync);
    window.addEventListener('rutapp:navigation', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('rutapp:navigation', sync);
    };
  }, []);

  return route;
}

export default function GlobalCrmCancellationInsight() {
  const route = useCrmRoute();
  const [data, setData] = useState<CancellationInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let active = true;
    if (!route?.empresaId) {
      setData(null);
      return () => { active = false; };
    }

    setLoading(true);
    void rpcClient.rpc('fn_crm_cancellation_insight', { p_empresa_id: route.empresaId })
      .then(({ data: result, error }) => {
        if (!active) return;
        if (error) {
          console.warn('No se pudo cargar cancelación CRM:', error.message);
          setData(null);
          return;
        }
        setData((result ?? null) as CancellationInsight | null);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [route?.empresaId]);

  const event = useMemo(() => {
    if (!data) return null;
    if (data.has_cancelled && data.latest_cancelled) {
      return { row: data.latest_cancelled, cancelled: true };
    }
    if (data.latest) return { row: data.latest, cancelled: !!data.latest.cancelled };
    return null;
  }, [data]);

  if (!route || loading || !event) return null;

  const row = event.row;
  const reason = row.reason ? (REASON_LABELS[row.reason] ?? row.reason) : 'Motivo no disponible';
  const reasonMessage = row.reason ? (REASON_MESSAGES[row.reason] ?? 'Motivo registrado por el cliente durante la cancelación.') : 'No hay una descripción adicional disponible para este motivo.';
  const retained = !event.cancelled && row.discount_accepted === true;

  return (
    <aside className="fixed bottom-5 right-5 z-[55] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left',
          event.cancelled ? 'bg-destructive/8' : 'bg-amber-500/8',
        )}
      >
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          event.cancelled ? 'bg-destructive/12 text-destructive' : 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        )}>
          {event.cancelled ? <XCircle className="h-5 w-5" /> : retained ? <BadgeCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Suscripción</p>
          <p className="truncate text-sm font-bold text-foreground">
            {event.cancelled ? 'Canceló su suscripción' : retained ? 'Intentó cancelar · Retenido' : 'Intentó cancelar'}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Motivo</p>
            <p className="mt-1 text-[15px] font-bold text-foreground">{reason}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{reasonMessage}</p>
          </div>

          <div className="rounded-xl border border-border bg-muted/35 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Comentario del cliente</p>
            <p className={cn(
              'mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed',
              row.reason_detail ? 'text-foreground' : 'italic text-muted-foreground',
            )}>
              {row.reason_detail || 'No dejó un comentario adicional; solo seleccionó el motivo de cancelación.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="text-muted-foreground">Fecha</p>
              <p className="mt-0.5 font-semibold text-foreground">{formatDate(row.created_at)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="text-muted-foreground">Retención</p>
              <p className="mt-0.5 font-semibold text-foreground">
                {row.offered_discount
                  ? row.discount_accepted ? 'Aceptó descuento' : 'Rechazó descuento'
                  : 'Sin oferta registrada'}
              </p>
            </div>
          </div>

          {(data.total_requests ?? 0) > 1 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              {data.total_requests} intentos de cancelación registrados para esta empresa.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
