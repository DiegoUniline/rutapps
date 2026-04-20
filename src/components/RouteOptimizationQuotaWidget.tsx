import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, ShoppingCart, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface QuotaData {
  usuarios_activos: number;
  cuota_base: number;
  recargas_disponibles: number;
  cuota_total: number;
  usadas_mes_actual: number;
  disponibles: number;
}

export default function RouteOptimizationQuotaWidget() {
  const { empresa } = useAuth();
  const [buying, setBuying] = useState(false);

  const { data, isLoading, refetch } = useQuery<QuotaData | null>({
    queryKey: ['route-optimization-quota', empresa?.id],
    enabled: !!empresa?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_optimization_quota', {
        _empresa_id: empresa!.id,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as QuotaData;
    },
  });

  // Detectar regreso desde Stripe (efecto, no durante render)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const recarga = params.get('recarga');
    if (recarga === 'ok' && sessionId) {
      window.history.replaceState({}, '', window.location.pathname);
      supabase.functions
        .invoke('verify-route-credits', { body: { session_id: sessionId } })
        .then(({ data, error }) => {
          if (!error && data?.status === 'paid') {
            toast.success('¡Recarga aplicada! +100 optimizaciones disponibles');
            refetch();
          } else {
            toast.info('Procesando tu recarga...');
            setTimeout(() => refetch(), 3000);
          }
        });
    } else if (recarga === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
      toast.info('Recarga cancelada');
    }
  }, [refetch]);

  const handleBuy = async () => {
    setBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-route-credits');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No se obtuvo URL de pago');
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo iniciar el pago');
      setBuying(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Cargando cuota...</span>
      </div>
    );
  }

  const pct = data.cuota_total > 0 ? Math.min(100, (data.usadas_mes_actual / data.cuota_total) * 100) : 0;
  const lowQuota = data.disponibles <= 5;
  const noQuota = data.disponibles === 0;

  return (
    <div className={cn(
      "bg-card/95 backdrop-blur-sm border rounded-xl px-3 py-2 shadow-sm",
      noQuota ? "border-destructive/40" : lowQuota ? "border-warning/40" : "border-border"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
          noQuota ? "bg-destructive/10 text-destructive" :
          lowQuota ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
        )}>
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground leading-tight">
            Optimizaciones este mes
          </div>
          <div className="text-[13px] font-bold text-foreground leading-tight">
            {data.usadas_mes_actual} <span className="text-muted-foreground font-medium">/ {data.cuota_total}</span>
            <span className={cn(
              "ml-2 text-[11px] font-semibold",
              noQuota ? "text-destructive" : lowQuota ? "text-warning" : "text-primary"
            )}>
              {data.disponibles} disponibles
            </span>
          </div>
          <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                noQuota ? "bg-destructive" : lowQuota ? "bg-warning" : "bg-primary"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            {data.usuarios_activos} usuarios × 30 + {data.recargas_disponibles} recargas
          </div>
        </div>
        <button
          onClick={handleBuy}
          disabled={buying}
          className={cn(
            "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
            "bg-primary text-primary-foreground hover:opacity-90 active:scale-95",
            "disabled:opacity-60"
          )}
          title="Comprar pack de 100 optimizaciones por $149 MXN"
        >
          {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />}
          +100
        </button>
      </div>
    </div>
  );
}
