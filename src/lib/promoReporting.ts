/**
 * Descuento efectivo por línea para REPORTES.
 *
 * Contexto: el motor de promociones descuenta a nivel VENTA (`ventas.total` ya
 * viene neto), pero `venta_lineas.total` conserva el precio de lista. Por eso
 * los reportes que suman líneas inflaban las ventas.
 *
 * Dos fuentes, en este orden:
 *  1. `promocion_aplicada` (desglose real, guardado desde la venta).
 *  2. FALLBACK para ventas históricas sin desglose: la diferencia entre la suma
 *     de sus líneas y `ventas.total` se prorratea entre las líneas.
 *
 * IMPORTANTE: esto es SOLO de lectura. No modifica `venta_lineas`, `ventas`,
 * cobros ni saldos. Nunca descuenta dos veces: si la venta ya tiene filas en
 * `promocion_aplicada`, el fallback no se aplica a esa venta.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PromoReportingInput {
  /** Ventas del periodo: se usa `id` y `total`. */
  ventas: Array<{ id: string; total?: number | null }>;
  /** Líneas del periodo: se usa `id`, `venta_id` y `total`. */
  lineas: Array<{ id?: string | null; venta_id?: string | null; total?: number | null }>;
  /** Filas de `promocion_aplicada` con `venta_linea_id` y `descuento_aplicado`. */
  promoAplicadas: Array<{ venta_linea_id?: string | null; descuento_aplicado?: number | null }>;
}

export interface PromoReportingResult {
  /** Descuento efectivo por id de línea. */
  descByLinea: Record<string, number>;
  /** Total de la línea ya neto de promociones/descuentos de encabezado. */
  lineTotalEfectivo: (l: { id?: string | null; total?: number | null }) => number;
}

export function buildPromoReporting({ ventas, lineas, promoAplicadas }: PromoReportingInput): PromoReportingResult {
  const descByLinea: Record<string, number> = {};
  const ventasConDesglose = new Set<string>();

  const ventaIdByLinea: Record<string, string> = {};
  for (const l of lineas) {
    if (l.id && l.venta_id) ventaIdByLinea[l.id] = l.venta_id;
  }

  // Suma de líneas por venta (para detectar si la línea YA viene neta).
  const sumaLineasByVenta = new Map<string, number>();
  for (const l of lineas) {
    if (!l.venta_id) continue;
    sumaLineasByVenta.set(l.venta_id, r2((sumaLineasByVenta.get(l.venta_id) ?? 0) + Number(l.total ?? 0)));
  }
  const totalByVenta = new Map<string, number>();
  for (const v of ventas) totalByVenta.set(v.id, r2(Number(v.total ?? 0)));

  // Descuento persistido por venta.
  const promoSumByVenta = new Map<string, number>();
  for (const p of promoAplicadas) {
    const lid = p.venta_linea_id;
    const monto = Number(p.descuento_aplicado ?? 0);
    if (!lid || !(monto > 0)) continue;
    const vid = ventaIdByLinea[lid];
    if (!vid) continue;
    promoSumByVenta.set(vid, r2((promoSumByVenta.get(vid) ?? 0) + monto));
  }

  /**
   * ANTI-DOBLE-DESCUENTO: con la bandera `promo_descuento_linea` las líneas se
   * guardan YA NETAS. En ese caso la diferencia (líneas − total) es menor que el
   * descuento persistido, y restarlo otra vez descontaría dos veces.
   */
  const lineasYaNetas = (ventaId: string) => {
    const promoSum = promoSumByVenta.get(ventaId) ?? 0;
    if (promoSum <= 0) return false;
    const gap = r2((sumaLineasByVenta.get(ventaId) ?? 0) - (totalByVenta.get(ventaId) ?? 0));
    return gap < promoSum - 0.02;
  };

  for (const p of promoAplicadas) {
    const lid = p.venta_linea_id;
    if (!lid) continue;
    const monto = Number(p.descuento_aplicado ?? 0);
    if (!(monto > 0)) continue;
    const vid = ventaIdByLinea[lid];
    if (vid) ventasConDesglose.add(vid);
    if (vid && lineasYaNetas(vid)) continue; // la línea ya trae el descuento restado
    descByLinea[lid] = (descByLinea[lid] ?? 0) + monto;
  }

  // ---- Fallback prorrateado para ventas sin desglose ----
  const lineasByVenta = new Map<string, Array<{ id?: string | null; total?: number | null }>>();
  for (const l of lineas) {
    if (!l.venta_id) continue;
    const arr = lineasByVenta.get(l.venta_id) ?? [];
    arr.push(l);
    lineasByVenta.set(l.venta_id, arr);
  }

  for (const v of ventas) {
    if (ventasConDesglose.has(v.id)) continue;
    const arr = lineasByVenta.get(v.id);
    if (!arr?.length) continue;
    const sumaLineas = r2(arr.reduce((s, l) => s + Number(l.total ?? 0), 0));
    const totalVenta = r2(Number(v.total ?? 0));
    const gap = r2(sumaLineas - totalVenta);
    // Solo si la diferencia es real y razonable (no ventas parciales/cerradas raras).
    if (gap <= 0.01 || sumaLineas <= 0 || gap > sumaLineas) continue;
    let repartido = 0;
    arr.forEach((l, i) => {
      if (!l.id) return;
      const lineTotal = Number(l.total ?? 0);
      const isLast = i === arr.length - 1;
      let monto = isLast ? r2(gap - repartido) : r2((gap * lineTotal) / sumaLineas);
      monto = Math.min(Math.max(monto, 0), r2(lineTotal));
      repartido = r2(repartido + monto);
      if (monto > 0) descByLinea[l.id] = (descByLinea[l.id] ?? 0) + monto;
    });
  }

  const lineTotalEfectivo = (l: { id?: string | null; total?: number | null }) =>
    Math.max(0, Number(l.total ?? 0) - (l.id ? (descByLinea[l.id] ?? 0) : 0));

  return { descByLinea, lineTotalEfectivo };
}
