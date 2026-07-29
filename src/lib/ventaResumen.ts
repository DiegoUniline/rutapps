// Reconstrucción VISUAL del resumen de una venta a partir de sus líneas.
// No cambia ningún dato guardado: solo recalcula, para mostrar, el desglose
//   Subtotal sin impuestos → Descuentos/promos → Subtotal gravable → IVA/IEPS → Total
// exactamente igual en la lista y en el detalle (una sola fuente de verdad).
//
// Reglas:
//  - base de línea = subtotal neto guardado; si la línea quedó en $0 (gratis
//    neteada) pero tiene precio, se reconstruye desde precio_unitario × cantidad.
//  - Subtotal sin impuestos = Σ base de línea (NETO, antes de descuentos).
//  - Descuentos/promociones = descuento de línea (subtotal × descuento_pct) y,
//    además, las líneas regaladas (precio > 0 pero total $0) que NO traen el
//    descuento en descuento_pct — así el "gratis" SIEMPRE aparece como descuento.
//  - Subtotal gravable = sin impuestos − descuentos.
//  - IVA / IEPS = Σ de cada monto POR SEPARADO, con su tasa real derivada de
//    la base que efectivamente los causa.
//  - Total (con impuestos) = gravable + IVA + IEPS.

export interface VentaLineaResumen {
  subtotal?: number | null;
  descuento_pct?: number | null;
  precio_unitario?: number | null;
  cantidad?: number | null;
  iva_monto?: number | null;
  ieps_monto?: number | null;
  total?: number | null;
}

export interface VentaResumen {
  sinImpuestos: number;
  descuento: number;
  gravable: number;
  iva: number;
  ieps: number;
  ivaRate: number | null;
  iepsRate: number | null;
  /** gravable + iva + ieps (cuadra con el total real cuando no hay descuento extra de encabezado) */
  conImpuestos: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeResumenFromLineas(lineas: VentaLineaResumen[] | null | undefined): VentaResumen {
  let sinImpuestos = 0;
  let descuento = 0;
  let iva = 0;
  let ieps = 0;
  let ivaBase = 0;
  let iepsBase = 0;

  for (const l of lineas ?? []) {
    const sub = Number(l.subtotal) || 0;
    const dpct = Number(l.descuento_pct) || 0;
    const pu = Number(l.precio_unitario) || 0;
    const cant = Number(l.cantidad) || 0;
    const tot = Number(l.total) || 0;
    const li = Number(l.iva_monto) || 0;
    const le = Number(l.ieps_monto) || 0;

    // Base neta de la línea antes de descuento. Si el subtotal guardado quedó en
    // $0 (línea gratis neteada), se reconstruye desde precio × cantidad para que
    // el valor regalado no desaparezca del subtotal.
    const base = sub > 0.005 ? sub : pu * cant;

    // Descuento de la línea: primero el porcentaje; si no hay pero la línea salió
    // en $0 con precio > 0, es un regalo → todo el valor de la base es descuento.
    let lineDesc = sub * (dpct / 100);
    if (lineDesc < 0.005 && tot < 0.005 && base > 0.005) {
      lineDesc = base;
    }

    const neto = base - lineDesc;

    sinImpuestos += base;
    descuento += lineDesc;
    iva += li;
    ieps += le;
    if (li > 0) ivaBase += neto;
    if (le > 0) iepsBase += neto;
  }

  const gravable = sinImpuestos - descuento;

  return {
    sinImpuestos: round2(sinImpuestos),
    descuento: round2(descuento),
    gravable: round2(gravable),
    iva: round2(iva),
    ieps: round2(ieps),
    ivaRate: ivaBase > 0 ? Math.round((iva / ivaBase) * 100) : null,
    iepsRate: iepsBase > 0 ? Math.round((ieps / iepsBase) * 100) : null,
    conImpuestos: round2(gravable + iva + ieps),
  };
}
