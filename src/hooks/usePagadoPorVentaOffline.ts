import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOfflineQuery } from '@/hooks/useOfflineData';

/** Cobros activos aplicados por venta, con lo que hay en el celular (funciona sin conexión). */
export function usePagadoPorVentaOffline(empresaId?: string | null) {
  const { data: cobros } = useOfflineQuery('cobros', { empresa_id: empresaId }, { enabled: !!empresaId, localOnly: true });
  const { data: aplicaciones } = useOfflineQuery('cobro_aplicaciones', {}, { enabled: !!empresaId, localOnly: true });
  return useMemo(() => {
    const activos = new Set(((cobros ?? []) as any[]).filter(c => !c.status || c.status === 'activo').map(c => c.id));
    const m = new Map<string, number>();
    for (const a of (aplicaciones ?? []) as any[]) {
      if (!a?.venta_id || !activos.has(a.cobro_id)) continue;
      m.set(a.venta_id, (m.get(a.venta_id) ?? 0) + (Number(a.monto_aplicado) || 0));
    }
    return m;
  }, [cobros, aplicaciones]);
}

/**
 * Lo pagado por venta según el SERVIDOR, para las ventas indicadas (con conexión).
 * El celular solo descarga los cobros que registró su usuario; un cobro hecho en oficina o un
 * ajuste de liquidación no estaría en el celular y el pedido saldría «Pendiente de pago».
 * Solo se consulta para los pedidos sin entregar con saldo 0 (los únicos que lo necesitan).
 */
export function usePagadoServidor(ventaIds: string[]) {
  const ids = useMemo(() => [...new Set(ventaIds)].sort(), [ventaIds]);
  const { data } = useQuery({
    queryKey: ['pagado-servidor', ids.join(',')],
    enabled: ids.length > 0 && (typeof navigator === 'undefined' || navigator.onLine !== false),
    staleTime: 60_000,
    queryFn: async () => {
      const m = new Map<string, number>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data: rows, error } = await supabase
          .from('cobro_aplicaciones')
          .select('venta_id, monto_aplicado, cobros!inner(status)')
          .in('venta_id', ids.slice(i, i + 150));
        if (error) throw error;
        for (const r of (rows ?? []) as any[]) {
          const st = r.cobros?.status;
          if (st && st !== 'activo') continue;
          m.set(r.venta_id, (m.get(r.venta_id) ?? 0) + (Number(r.monto_aplicado) || 0));
        }
        for (const id of ids.slice(i, i + 150)) if (!m.has(id)) m.set(id, 0);
      }
      return m;
    },
  });
  return data ?? null;
}

/** Ids de pedidos sin entregar con saldo 0 (los que necesitan saber lo pagado para no salir «Pagado»/«Pendiente» por error). */
export function idsPedidosSinEntregarSaldoCero(ventas: any[]): string[] {
  return ventas
    .filter(v => v?.tipo === 'pedido' && !['entregado', 'facturado', 'cancelado', 'borrador'].includes(v.status)
      && !(Number(v.saldo_pendiente ?? 0) > 0.005))
    .map(v => v.id);
}
