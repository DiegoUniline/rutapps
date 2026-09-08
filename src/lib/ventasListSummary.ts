import { saldoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';
import { computeResumenFromLineas } from '@/lib/ventaResumen';

export interface VentasListSummary {
  count: number;
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
  pagado: number;
  saldo: number;
}

export interface VentaListSummaryInput {
  total?: number | null;
  iva_total?: number | null;
  ieps_total?: number | null;
  descuento_total?: number | null;
  status?: string | null;
  total_efectivo?: number | null;
  cerrado_at?: string | null;
  cerrado_snapshot?: unknown;
  cobro_aplicaciones?: unknown[] | null;
  venta_lineas?: Parameters<typeof computeResumenFromLineas>[0];
  promocion_aplicada?: Array<{ descuento_aplicado?: number | null }> | null;
}

const emptySummary = (): VentasListSummary => ({
  count: 0,
  subtotal: 0,
  descuento: 0,
  impuestos: 0,
  total: 0,
  pagado: 0,
  saldo: 0,
});

/**
 * Fuente de verdad del resumen superior de Ventas.
 *
 * Se mantiene como función pura para poder demostrar que la RPC agregada
 * devuelve exactamente los mismos importes que el cálculo histórico del
 * navegador. No escribe ni corrige datos de ventas.
 */
export function computeVentasListSummary(rows: VentaListSummaryInput[] | null | undefined): VentasListSummary {
  const result = emptySummary();

  for (const venta of rows ?? []) {
    const iva = Number(venta.iva_total) || 0;
    const ieps = Number(venta.ieps_total) || 0;
    const impuestos = iva + ieps;
    const gravable = Math.max(0, (Number(venta.total) || 0) - impuestos);
    const descuentoLineas = computeResumenFromLineas(venta.venta_lineas ?? []).descuento;
    const descuentoPromociones = (venta.promocion_aplicada ?? []).reduce(
      (sum, promo) => sum + (Number(promo?.descuento_aplicado) || 0),
      0,
    );
    const descuento = Math.max(
      descuentoLineas,
      descuentoPromociones,
      Number(venta.descuento_total) || 0,
    );
    const total = totalEfectivoVenta(venta);
    const saldo = saldoRealVenta(venta);

    result.count += 1;
    result.subtotal += gravable + descuento;
    result.descuento += descuento;
    result.impuestos += impuestos;
    result.total += total;
    result.pagado += Math.max(0, total - saldo);
    result.saldo += saldo;
  }

  return result;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Normaliza los NUMERIC/BIGINT que PostgREST puede devolver como texto. */
export function normalizeVentasListSummary(value: unknown): VentasListSummary {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null | undefined;
  if (!row) return emptySummary();

  return {
    count: finiteNumber(row.ventas_count ?? row.count),
    subtotal: finiteNumber(row.subtotal_sin_impuestos ?? row.subtotal),
    descuento: finiteNumber(row.descuento),
    impuestos: finiteNumber(row.impuestos),
    total: finiteNumber(row.total_efectivo ?? row.total),
    pagado: finiteNumber(row.pagado),
    saldo: finiteNumber(row.saldo),
  };
}

export interface VentaLineasListSummary {
  count: number;
  cantidad: number;
  total: number;
}

export function normalizeVentaLineasListSummary(value: unknown): VentaLineasListSummary {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null | undefined;
  if (!row) return { count: 0, cantidad: 0, total: 0 };

  return {
    count: finiteNumber(row.lineas_count ?? row.count),
    cantidad: finiteNumber(row.cantidad),
    total: finiteNumber(row.total),
  };
}
