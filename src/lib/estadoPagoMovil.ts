import { totalEfectivoVenta } from '@/lib/ventaCerrada';

/** Etiqueta de condición de pago tal como se eligió al levantar la venta o el pedido. */
export function etiquetaCondicionPago(condicion?: string | null): string {
  if (condicion === 'credito') return 'Crédito';
  if (condicion === 'por_definir') return 'Por definir';
  return 'Contado';
}

export type EstadoPago =
  | { tipo: 'cancelada' }
  | { tipo: 'sin_estado' }
  | { tipo: 'saldo'; monto: number }
  | { tipo: 'pendiente'; monto: number }
  | { tipo: 'pagado' };

/**
 * Estado de pago para las listas de la app móvil.
 *
 * Un pedido aún no entregado guarda saldo_pendiente en 0 (se cobra lo entregado), así que
 * «saldo 0» NO significa pagado: antes salía «Pagado» un pedido «Por definir» sin ningún cobro.
 * - saldo > 0 → «Saldo $X».
 * - Pedido sin entregar → pagado solo si los cobros aplicados cubren el total; si no, «Pendiente de pago».
 * - Venta directa o pedido entregado con saldo 0 → pagado (el saldo ya refleja lo cobrado).
 *
 * @param pagado suma de cobros activos aplicados a la venta (null si no se conoce).
 */
export function estadoPagoMovil(v: any, pagado: number | null): EstadoPago {
  if (!v) return { tipo: 'sin_estado' };
  if (v.status === 'cancelado' || v.status === 'cancelada') return { tipo: 'cancelada' };
  if (v.status === 'borrador') return { tipo: 'sin_estado' };
  const saldo = Number(v.saldo_pendiente ?? 0) || 0;
  if (saldo > 0.005) return { tipo: 'saldo', monto: saldo };
  const pedidoSinEntregar = v.tipo === 'pedido' && !['entregado', 'facturado'].includes(v.status);
  if (!pedidoSinEntregar) return { tipo: 'pagado' };
  const total = totalEfectivoVenta(v);
  const cobrado = Math.max(0, pagado ?? 0);
  if (total > 0.005 && cobrado + 0.005 < total) return { tipo: 'pendiente', monto: Math.round((total - cobrado) * 100) / 100 };
  return { tipo: 'pagado' };
}
