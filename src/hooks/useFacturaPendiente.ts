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
  diasParaPagar: number | null;     // días hasta fecha_vencimiento (positivo = aún no vence)
  diasGraciaRestantes: number | null; // tras vencer: 3, 2, 1, 0
  isExpired: boolean;                // ya pasó fecha_vencimiento
  shouldBlock: boolean;              // pasaron 3 días de gracia
}

const EMPTY: FacturaPendienteState = {
  loading: false,
  hasPendiente: false,
  facturaId: null,
  numeroFactura: null,
  total: 0,
  fechaVencimiento: null,
  diasParaPagar: null,
  diasGraciaRestantes: null,
  isExpired: false,
  shouldBlock: false,
};

const GRACIA_DIAS = 3;

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
      const diasParaPagar = venc ? differenceInCalendarDays(venc, today) : null;
      const isExpired = diasParaPagar !== null && diasParaPagar < 0;
      const diasGraciaRestantes = isExpired
        ? Math.max(0, GRACIA_DIAS + diasParaPagar) // diasParaPagar es negativo
        : null;
      const shouldBlock = isExpired && diasGraciaRestantes === 0;

      return {
        hasPendiente: true,
        facturaId: f.id,
        numeroFactura: f.numero_factura,
        total: Number(f.total) || 0,
        fechaVencimiento: f.fecha_vencimiento,
        diasParaPagar,
        diasGraciaRestantes,
        isExpired,
        shouldBlock,
      };
    },
    enabled: !!user?.id && !!empresa?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return { loading: isLoading, ...(data ?? EMPTY) };
}
