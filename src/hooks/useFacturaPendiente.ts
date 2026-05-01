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
    queryKey: ['factura-pendiente', empresa?.id],
    queryFn: async (): Promise<Omit<FacturaPendienteState, 'loading'>> => {
      if (!empresa?.id) return EMPTY;
      const { data: facturas } = await supabase
        .from('facturas')
        .select('id, numero_factura, total, fecha_vencimiento, estado')
        .eq('empresa_id', empresa.id)
        .in('estado', ['pendiente', 'procesando', 'past_due'])
        .order('fecha_emision', { ascending: true })
        .limit(1);

      const f = facturas?.[0];
      if (!f) return EMPTY;

      const venc = f.fecha_vencimiento ? new Date(f.fecha_vencimiento) : null;
      const today = new Date();
      const diasRestantes = venc ? differenceInCalendarDays(venc, today) : null;
      // Bloquea cuando ya pasó la fecha de vencimiento (día siguiente al límite)
      const shouldBlock = diasRestantes !== null && diasRestantes < 0;

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
