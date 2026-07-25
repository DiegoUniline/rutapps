import { useMemo } from 'react';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useAuth } from '@/contexts/AuthContext';
import { saldoFavorDisponible, SALDO_FAVOR_METODO } from '@/lib/saldoFavor';

/**
 * Saldo a favor (crédito por nota de crédito de devoluciones) disponible para
 * un cliente. Funciona offline: lee de IndexedDB (devoluciones, devolucion_lineas
 * y cobros) y calcula disponible = emitido − usado.
 *
 *   emitido = Σ devolucion_lineas.monto_credito con accion='nota_credito'
 *             de las devoluciones del cliente
 *   usado   = Σ cobros.monto del cliente con metodo_pago='saldo_favor'
 */
export function useSaldoFavor(clienteId?: string | null) {
  const { empresa } = useAuth();
  const eid = empresa?.id;
  const enabled = !!eid && !!clienteId;

  // Devoluciones del cliente (no de toda la empresa).
  const { data: devoluciones } = useOfflineQuery('devoluciones', { empresa_id: eid, cliente_id: clienteId }, { enabled });
  // Líneas SOLO de esas devoluciones (antes se bajaba la tabla completa). Se
  // consulta por los ids del cliente; si aún no hay devoluciones, no se consulta.
  const devIdsList = useMemo(() => (devoluciones ?? []).map((d: any) => d.id), [devoluciones]);
  const { data: devLineas } = useOfflineQuery(
    'devolucion_lineas',
    devIdsList.length ? { devolucion_id: devIdsList } : undefined,
    { enabled: enabled && devIdsList.length > 0 },
  );
  const { data: cobros } = useOfflineQuery('cobros', { empresa_id: eid, cliente_id: clienteId }, { enabled });

  return useMemo(() => {
    if (!clienteId) return { disponible: 0, emitido: 0, usado: 0 };

    const devIds = new Set(devIdsList);

    const emitido = (devLineas ?? [])
      .filter((l: any) => devIds.has(l.devolucion_id) && l.accion === 'nota_credito')
      .reduce((s: number, l: any) => s + (Number(l.monto_credito) || 0), 0);

    const usado = (cobros ?? [])
      .filter((c: any) => c.cliente_id === clienteId && c.metodo_pago === SALDO_FAVOR_METODO)
      .reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);

    return { disponible: saldoFavorDisponible(emitido, usado), emitido, usado };
  }, [clienteId, devIdsList, devLineas, cobros]);
}
