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

/**
 * Suma cobros activos aplicados a la venta (necesita el embed
 * `cobro_aplicaciones(monto_aplicado, cobros!inner(status))`).
 */
export function sumCobrosActivos(v: any): number {
  const aps = (v?.cobro_aplicaciones ?? []) as Array<{ monto_aplicado: number; cobros?: { status?: string } | null }>;
  let s = 0;
  for (const a of aps) {
    const st = a?.cobros?.status;
    if (st && st !== 'activo') continue;
    s += Number(a.monto_aplicado ?? 0) || 0;
  }
  return s;
}

/**
 * Saldo "real" para mostrar en listas: Total efectivo − cobros activos.
 * Nunca negativo. Prefiere esto sobre `venta.saldo_pendiente` cuando la venta
 * viene con el embed `cobro_aplicaciones`.
 */
export function saldoRealVenta(v: any): number {
  // Una venta/pedido CANCELADO no debe nada: su saldo es 0 aunque el
  // saldo_pendiente guardado no se haya reseteado.
  if (v?.status === 'cancelado') return 0;
  const totalReal = totalEfectivoVenta(v);
  const cobrado = sumCobrosActivos(v);
  const saldo = totalReal - cobrado;
  return saldo > 0 ? saldo : 0;
}
