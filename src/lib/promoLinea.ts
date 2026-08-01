/**
 * Descuento de promoción aplicado A NIVEL DE LÍNEA (opt-in por licencia).
 *
 * Por defecto el motor de promociones descuenta solo en el encabezado
 * (`ventas.total` ya viene neto) y `venta_lineas` conserva el precio de lista.
 * Con la bandera `promo_descuento_linea` activa, al guardar la venta cada línea
 * se guarda YA NETA de su promoción.
 *
 * GARANTÍAS:
 *  - `ventas.total` NO cambia: es el mismo neto que ya se mostraba y con el que
 *    trabajan cobros y saldos (`trg_recalc_venta_saldo`). Cero impacto en dinero.
 *  - El prorrateo es proporcional, así que `total = subtotal + iva + ieps`.
 *  - Nunca descuenta dos veces: el descuento se resta una sola vez, en la línea.
 */
import { getFeatureFlagsCache, isFeatureEnabled } from '@/lib/featureFlags';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ¿Esta licencia guarda las líneas ya netas de promoción?
 *
 * IMPORTANTE (ruta móvil / offline): si las banderas todavía no se han
 * cargado desde el servidor, el caché viene vacío y antes esto devolvía
 * `false`, guardando las líneas EN BRUTO. Como el encabezado se recalcula en
 * la BD a partir de las líneas, la promoción se perdía y quedaba un saldo
 * fantasma exactamente igual al descuento. Con el caché vacío asumimos
 * habilitado (la bandera está en alcance "todos").
 */
export function promoLineaHabilitado(licencia?: string | null): boolean {
  const flags = getFeatureFlagsCache();
  const cargada = flags.some((f) => f.clave === 'promo_descuento_linea');
  if (!cargada) return true;
  return isFeatureEnabled('promo_descuento_linea', String(licencia ?? '').trim());
}


export interface LineaMontos {
  subtotal: number;
  iva: number;
  ieps: number;
  total: number;
}

type PromoProducto = {
  tipo?: string | null;
  producto_id?: string | null;
  descuento?: number | null;
  cantidad_gratis?: number | null;
};

/**
 * Separa el descuento normal (en la base del motor) del regalo, cuyo descuento
 * siempre debe valuarse al precio BRUTO unitario. Así una unidad gratis elimina
 * también su IVA/IEPS y nunca deja impuesto colgado en la venta.
 */
export function separarDescuentoPromo(
  promociones: PromoProducto[],
  productoId: string,
  brutoUnitario: number,
): { descuentoRegular: number; descuentoGratisBruto: number } {
  let descuentoRegular = 0;
  let cantidadGratis = 0;

  for (const promo of promociones) {
    if (promo.producto_id !== productoId) continue;
    if (promo.tipo === 'producto_gratis') {
      cantidadGratis += Math.max(0, Number(promo.cantidad_gratis) || 0);
    } else {
      descuentoRegular += Math.max(0, Number(promo.descuento) || 0);
    }
  }

  return {
    descuentoRegular: r2(descuentoRegular),
    descuentoGratisBruto: r2(cantidadGratis * Math.max(0, Number(brutoUnitario) || 0)),
  };
}

/**
 * Resta `descuento` (descuento efectivo de promoción de esa línea) repartiéndolo
 * proporcionalmente entre subtotal / IVA / IEPS.
 */
export function aplicarPromoALinea(montos: LineaMontos, descuento: number): LineaMontos {
  const total = Number(montos.total) || 0;
  const desc = Math.min(Math.max(Number(descuento) || 0, 0), total);
  if (desc <= 0 || total <= 0) return montos;

  const factor = (total - desc) / total;
  const subtotal = r2((Number(montos.subtotal) || 0) * factor);
  const iva = r2((Number(montos.iva) || 0) * factor);
  const ieps = r2((Number(montos.ieps) || 0) * factor);
  // El total manda: se ajusta el subtotal para que cuadre exactamente.
  const nuevoTotal = r2(total - desc);
  return { subtotal: r2(nuevoTotal - iva - ieps) || subtotal, iva, ieps, total: nuevoTotal };
}
