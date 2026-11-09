import { useMemo } from 'react';
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
