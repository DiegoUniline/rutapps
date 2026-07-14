/**
 * Helpers para pedidos con "Cerrado parcial".
 *
 * Un pedido cerrado tiene `cerrado_at !== null` y guarda en `cerrado_snapshot`
 * un JSON con el estado congelado al momento del cierre:
 *   {
 *     pedido_total: number,   // total original del pedido
 *     total_efectivo: number, // total efectivamente entregado
 *     saldo: number,
 *     lineas: [{ producto_id, pedido, entregado }]
 *   }
 *
 * La columna `total_efectivo` también queda persistida en `ventas` para
 * queries/agregados fáciles. Cuando el pedido no está cerrado, usar `total`
 * normal.
 */

export interface CerradoSnapshot {
  pedido_total?: number;
  total_efectivo?: number;
  saldo?: number;
  lineas?: Array<{ producto_id: string; pedido: number; entregado: number }>;
}

export interface VentaCerradaFields {
  total?: number | null;
  total_efectivo?: number | null;
  cerrado_at?: string | null;
  cerrado_snapshot?: CerradoSnapshot | null | unknown;
}

/** ¿La venta/pedido está cerrado parcialmente? */
export function isCerradaParcial(v: VentaCerradaFields | null | undefined): boolean {
  return !!v?.cerrado_at;
}

/**
 * Total "real" a considerar para saldos, reportes y agregados.
 * Si está cerrada, usa `total_efectivo` (lo realmente entregado); si no, el `total` del pedido.
 */
export function totalEfectivoVenta(v: VentaCerradaFields | null | undefined): number {
  if (!v) return 0;
  if (isCerradaParcial(v)) {
    if (v.total_efectivo != null) return Number(v.total_efectivo) || 0;
    const snap = v.cerrado_snapshot as CerradoSnapshot | null;
    if (snap?.total_efectivo != null) return Number(snap.total_efectivo) || 0;
  }
  return Number(v.total ?? 0) || 0;
}

/** Etiqueta corta del estado "cerrado" para badges. */
export function ventaCerradaBadgeLabel(v: VentaCerradaFields | null | undefined): string | null {
  if (!isCerradaParcial(v)) return null;
  const snap = (v?.cerrado_snapshot as CerradoSnapshot | null) ?? null;
  const original = Number(snap?.pedido_total ?? v?.total ?? 0) || 0;
  const efectivo = totalEfectivoVenta(v);
  // Si se cerró surtiendo todo, es "cerrado" a secas; si quedó faltante, "cerrado parcial".
  const esParcial = efectivo + 0.0001 < original;
  return esParcial ? 'Cerrado parcial' : 'Cerrado';
}
