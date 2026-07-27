/**
 * Persistencia de promociones aplicadas (`promocion_aplicada`).
 *
 * Los reportes (ventas por producto / producto por cliente) restan el descuento
 * de promoción usando esta tabla. Si no se guarda, los productos regalados se
 * reportan a precio completo.
 *
 * GARANTÍA ANTI-DOBLE-DESCUENTO:
 *  - Los totales de la venta (`ventas.total`, `venta_lineas.total`) NO cambian:
 *    aquí solo se registra el desglose informativo del descuento ya aplicado.
 *  - Al guardar se BORRAN primero las filas previas de la venta y se reinsertan,
 *    por lo que re-guardar una venta nunca acumula descuentos.
 *  - La suma de `descuento_aplicado` por línea se limita al total de la línea.
 */
import { supabase } from '@/lib/supabase';
import type { PromoResult } from '@/hooks/usePromociones';

/** Licencias con la persistencia activa. Vacío + `PROMO_PERSIST_ALL` = todas. */
const LICENCIAS_HABILITADAS = new Set<string>(['12324489']);
const PROMO_PERSIST_ALL = false;

export function promoPersistHabilitado(licencia?: string | null): boolean {
  if (PROMO_PERSIST_ALL) return true;
  return !!licencia && LICENCIAS_HABILITADAS.has(String(licencia).trim());
}

export type PromoAplicadaRow = {
  id: string;
  venta_id: string;
  venta_linea_id: string | null;
  promocion_id: string;
  descripcion: string | null;
  descuento_aplicado: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export type BuildPromoRowsArgs = {
  ventaId: string;
  promoResults: PromoResult[];
  /** Descuento REAL aplicado por producto (ya con redondeo/impuestos resueltos). */
  effectiveByProduct: Map<string, number>;
  /** id de la línea de venta guardada por producto. */
  lineIdByProduct: Map<string, string>;
  /** Total de la línea por producto, usado como tope de seguridad. */
  lineTotalByProduct?: Map<string, number>;
};

/**
 * Convierte los resultados del motor de promociones en filas persistibles,
 * prorrateando el descuento EFECTIVO entre las promociones del mismo producto.
 */
export function buildPromoAplicadaRows({
  ventaId,
  promoResults,
  effectiveByProduct,
  lineIdByProduct,
  lineTotalByProduct,
}: BuildPromoRowsArgs): PromoAplicadaRow[] {
  const byProduct = new Map<string, PromoResult[]>();
  for (const r of promoResults) {
    if (!r.producto_id || !r.promocion_id) continue;
    if (!(Number(r.descuento) > 0)) continue;
    const arr = byProduct.get(r.producto_id) ?? [];
    arr.push(r);
    byProduct.set(r.producto_id, arr);
  }

  const rows: PromoAplicadaRow[] = [];
  byProduct.forEach((results, productoId) => {
    const rawSum = results.reduce((s, r) => s + Number(r.descuento || 0), 0);
    if (rawSum <= 0) return;

    let effective = r2(effectiveByProduct.get(productoId) ?? 0);
    if (effective <= 0) return;

    // Tope de seguridad: nunca más que el total de la línea.
    const lineTotal = lineTotalByProduct?.get(productoId);
    if (typeof lineTotal === 'number' && lineTotal >= 0) {
      effective = Math.min(effective, r2(lineTotal));
    }
    if (effective <= 0) return;

    const lineaId = lineIdByProduct.get(productoId) ?? null;
    let repartido = 0;
    results.forEach((r, i) => {
      const isLast = i === results.length - 1;
      const monto = isLast
        ? r2(effective - repartido)
        : r2((effective * Number(r.descuento || 0)) / rawSum);
      repartido = r2(repartido + monto);
      if (monto <= 0) return;
      rows.push({
        id: crypto.randomUUID(),
        venta_id: ventaId,
        venta_linea_id: lineaId,
        promocion_id: r.promocion_id,
        descripcion: (r as any).descripcion ?? (r as any).nombre ?? null,
        descuento_aplicado: monto,
      });
    });
  });

  return rows;
}

/**
 * Reemplaza (borra + inserta) las promociones aplicadas de una venta.
 * Idempotente: re-guardar la misma venta no duplica descuentos.
 */
export async function replacePromocionesAplicadas(ventaId: string, rows: PromoAplicadaRow[]) {
  const { error: delError } = await supabase.from('promocion_aplicada').delete().eq('venta_id', ventaId);
  if (delError) throw delError;
  if (rows.length === 0) return;
  const { error } = await supabase.from('promocion_aplicada').insert(rows as any);
  if (error) throw error;
}
