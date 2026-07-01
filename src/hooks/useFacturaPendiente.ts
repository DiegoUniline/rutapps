import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInCalendarDays } from 'date-fns';


export interface FacturaPendienteState {
  loading: boolean;
  hasPendiente: boolean;
  facturaId: string | null;
  numeroFactura: string | null;
  total: number;
  fechaVencimiento: string | null;
  /** Días restantes hasta fecha_vencimiento. Positivo = aún en gracia. 0 o negativo = vencida. */
  diasRestantes: number | null;
  /** True cuando ya pasó fecha_vencimiento → debe bloquear acceso al sistema. */
  shouldBlock: boolean;
}

const EMPTY: FacturaPendienteState = {
  loading: false,
  hasPendiente: false,
  facturaId: null,
  numeroFactura: null,
  total: 0,
  fechaVencimiento: null,
  diasRestantes: null,
  shouldBlock: false,
};

export function useFacturaPendiente(): FacturaPendienteState {
  const { user, empresa } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['factura-pendiente', empresa?.id, user?.email],
    queryFn: async (): Promise<Omit<FacturaPendienteState, 'loading'>> => {
      if (!empresa?.id) return EMPTY;
      let sub: any = null;
      let facturas: any[] | null = null;
      try {
        const [subRes, facRes] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('status, current_period_end, fecha_vencimiento, es_manual, acceso_bloqueado')
            .eq('empresa_id', empresa.id)
            .maybeSingle(),
          supabase
            .from('facturas')
            .select('id, numero_factura, total, fecha_vencimiento, fecha_emision, estado, periodo_fin')
            .eq('empresa_id', empresa.id)
            .in('estado', ['pendiente', 'procesando', 'past_due'])
            .order('fecha_emision', { ascending: true })
            .limit(10),
        ]);
        // Si alguna query falló, NO bloquear (red inestable, p.ej. datos móviles).
        if (subRes.error || facRes.error) return EMPTY;
        sub = subRes.data;
        facturas = facRes.data;
      } catch {
        return EMPTY;
      }


      // Una factura pendiente / procesando / past_due SIEMPRE debe mostrar el
      // banner — aunque el admin haya extendido la cobertura manual de la
      // suscripción, la factura sigue sin pagarse y el dueño (y el super admin
      // impersonando la empresa) tienen que verla.
      void sub;
      const f = facturas?.[0];
      if (!f) return EMPTY;

      // Si no hay fecha_vencimiento explícita, derivarla: fecha_emision + 3 días de gracia.
      // Esto cubre facturas creadas por integraciones (Stripe webhook, etc.) que no la setean.
      let vencISO = f.fecha_vencimiento;
      if (!vencISO) {
        const emi = (f as any).fecha_emision ? new Date((f as any).fecha_emision) : new Date();
        vencISO = new Date(emi.getTime() + 3 * 86400000).toISOString();
      }
      const venc = new Date(vencISO);
      const today = new Date();
      const diasRestantes = differenceInCalendarDays(venc, today);
      // Bloquea cuando ya pasó la fecha de vencimiento (día siguiente al límite)
      const shouldBlock = diasRestantes < 0;

      return {
        hasPendiente: true,
        facturaId: f.id,
        numeroFactura: f.numero_factura,
        total: Number(f.total) || 0,
        fechaVencimiento: f.fecha_vencimiento,
        diasRestantes,
        shouldBlock,
      };
    },
    enabled: !!user?.id && !!empresa?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return { loading: isLoading, ...(data ?? EMPTY) };
}
