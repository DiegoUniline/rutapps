import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CajaTurno {
  id: string;
  empresa_id: string;
  cajero_id: string;
  caja_nombre: string;
  status: string;
  fondo_inicial: number;
  abierto_at: string;
  cerrado_at: string | null;
  notas_apertura: string | null;
  notas_cierre: string | null;
  total_efectivo_esperado: number | null;
  total_efectivo_contado: number | null;
  total_tarjeta_esperado: number | null;
  total_tarjeta_contado: number | null;
  total_transferencia_esperado: number | null;
  total_transferencia_contado: number | null;
  total_otros_esperado: number | null;
  total_otros_contado: number | null;
  diferencia: number | null;
}

export interface CajaMovimiento {
  id: string;
  turno_id: string;
  empresa_id: string;
  user_id: string;
  tipo: 'retiro' | 'deposito' | 'gasto' | string;
  monto: number;
  motivo: string | null;
  created_at: string;
}

/** Hook to manage the active POS shift for the current cashier. */
export function useCajaTurno() {
  const { user, empresa } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.id && !!empresa?.id && !!(empresa as any)?.pos_turnos_habilitado;

  const turnoQuery = useQuery({
    queryKey: ['caja-turno-activo', user?.id, empresa?.id],
    queryFn: async (): Promise<CajaTurno | null> => {
      const { data, error } = await supabase
        .from('caja_turnos')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .eq('cajero_id', user!.id)
        .eq('status', 'abierto')
        .order('abierto_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as CajaTurno) ?? null;
    },
    enabled,
    staleTime: 30_000,
  });

  const movimientosQuery = useQuery({
    queryKey: ['caja-movimientos', turnoQuery.data?.id],
    queryFn: async (): Promise<CajaMovimiento[]> => {
      const { data, error } = await supabase
        .from('caja_movimientos')
        .select('*')
        .eq('turno_id', turnoQuery.data!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CajaMovimiento[];
    },
    enabled: !!turnoQuery.data?.id,
    staleTime: 15_000,
  });

  const abrirTurno = useMutation({
    mutationFn: async (input: { caja_nombre: string; fondo_inicial: number; notas?: string }) => {
      const { data, error } = await supabase
        .from('caja_turnos')
        .insert({
          empresa_id: empresa!.id,
          cajero_id: user!.id,
          caja_nombre: input.caja_nombre || 'Caja Principal',
          fondo_inicial: input.fondo_inicial,
          notas_apertura: input.notas ?? null,
          status: 'abierto',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CajaTurno;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja-turno-activo'] }),
  });

  const registrarMovimiento = useMutation({
    mutationFn: async (input: { tipo: 'retiro' | 'deposito' | 'gasto'; monto: number; motivo?: string }) => {
      const t = turnoQuery.data;
      if (!t) throw new Error('No hay turno abierto');
      const { data, error } = await supabase
        .from('caja_movimientos')
        .insert({
          turno_id: t.id,
          empresa_id: empresa!.id,
          user_id: user!.id,
          tipo: input.tipo,
          monto: input.monto,
          motivo: input.motivo ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CajaMovimiento;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja-movimientos'] }),
  });

  /** Compute expected totals from sales + cash movements during the shift. */
  async function computeArqueo(): Promise<{
    efectivo_esperado: number;
    tarjeta_esperado: number;
    transferencia_esperado: number;
    otros_esperado: number;
  }> {
    const t = turnoQuery.data;
    if (!t) return { efectivo_esperado: 0, tarjeta_esperado: 0, transferencia_esperado: 0, otros_esperado: 0 };

    // Cobros del turno (ventas POS pagadas durante el turno por este cajero)
    const { data: cobros } = await supabase
      .from('cobros')
      .select('monto, metodo_pago')
      .eq('empresa_id', empresa!.id)
      .eq('user_id', user!.id)
      .gte('created_at', t.abierto_at);

    let efectivo = Number(t.fondo_inicial) || 0;
    let tarjeta = 0;
    let transferencia = 0;
    let otros = 0;
    (cobros ?? []).forEach((c: any) => {
      const m = Number(c.monto) || 0;
      const mp = String(c.metodo_pago || '').toLowerCase();
      if (mp.includes('efectivo')) efectivo += m;
      else if (mp.includes('tarjeta')) tarjeta += m;
      else if (mp.includes('transfer')) transferencia += m;
      else otros += m;
    });

    // Movimientos de caja (depósitos suman, retiros y gastos restan al efectivo)
    const { data: movs } = await supabase
      .from('caja_movimientos')
      .select('tipo, monto')
      .eq('turno_id', t.id);
    (movs ?? []).forEach((m: any) => {
      const v = Number(m.monto) || 0;
      if (m.tipo === 'deposito') efectivo += v;
      else if (m.tipo === 'retiro' || m.tipo === 'gasto') efectivo -= v;
    });

    return {
      efectivo_esperado: Math.max(0, efectivo),
      tarjeta_esperado: tarjeta,
      transferencia_esperado: transferencia,
      otros_esperado: otros,
    };
  }

  const cerrarTurno = useMutation({
    mutationFn: async (input: {
      efectivo_contado: number;
      tarjeta_contado: number;
      transferencia_contado: number;
      otros_contado: number;
      notas?: string;
      denominaciones?: Record<string, number>;
    }) => {
      const t = turnoQuery.data;
      if (!t) throw new Error('No hay turno abierto');
      const esperado = await computeArqueo();
      const totalContado =
        input.efectivo_contado + input.tarjeta_contado + input.transferencia_contado + input.otros_contado;
      const totalEsperado =
        esperado.efectivo_esperado + esperado.tarjeta_esperado + esperado.transferencia_esperado + esperado.otros_esperado;
      const { data, error } = await supabase
        .from('caja_turnos')
        .update({
          status: 'cerrado',
          cerrado_at: new Date().toISOString(),
          cerrado_por: user!.id,
          total_efectivo_esperado: esperado.efectivo_esperado,
          total_efectivo_contado: input.efectivo_contado,
          total_tarjeta_esperado: esperado.tarjeta_esperado,
          total_tarjeta_contado: input.tarjeta_contado,
          total_transferencia_esperado: esperado.transferencia_esperado,
          total_transferencia_contado: input.transferencia_contado,
          total_otros_esperado: esperado.otros_esperado,
          total_otros_contado: input.otros_contado,
          diferencia: totalContado - totalEsperado,
          notas_cierre: input.notas ?? null,
          arqueo_denominaciones: input.denominaciones ?? null,
        })
        .eq('id', t.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as CajaTurno;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja-turno-activo'] }),
  });

  return {
    enabled,
    turno: turnoQuery.data ?? null,
    loading: turnoQuery.isLoading,
    movimientos: movimientosQuery.data ?? [],
    abrirTurno,
    cerrarTurno,
    registrarMovimiento,
    computeArqueo,
    reload: () => qc.invalidateQueries({ queryKey: ['caja-turno-activo'] }),
  };
}
