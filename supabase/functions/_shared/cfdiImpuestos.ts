// Motor de impuestos del CFDI de venta (Fase 1, D-014). Código puro: lo usa la función
// facturama y lo prueba vitest (src/test/cfdiImpuestos.test.ts).
//
// Reglas:
// - Precio unitario SIN impuestos y ANTES del descuento (igual que venta_lineas).
// - Descuento en dinero va en el nodo Discount; los impuestos se calculan sobre (importe - descuento).
// - IEPS por tasa: base = importe neto. IEPS por cuota: IsQuota, base = cantidad, importe = cuota × cantidad.
// - La base del IVA incluye el IEPS.
// - IVA: con IVA y tasa > 0 → tasa; con IVA y tasa 0 → tasa 0%. Producto SIN IVA → lo que diga el
//   producto (tasa0 | exento | no_objeto); si no lo dice, no se timbra (lo marca el preflight).
// - ObjetoImp "02" si lleva algún impuesto (aunque sea 0% o exento); "01" si no lleva ninguno.

export type IvaSinIva = "tasa0" | "exento" | "no_objeto";

export interface LineaCfdiInput {
  descripcion: string;
  product_code: string;
  unit_code: string;
  unit_name: string;
  cantidad: number;
  /** Precio unitario sin impuestos, antes del descuento. */
  precio_unitario: number;
  /** Descuento de la línea en dinero (sin impuestos). */
  descuento: number;
  tiene_iva: boolean;
  iva_pct: number;
  ieps_pct: number;
  ieps_tipo: "porcentaje" | "cuota";
  iva_sin_iva: IvaSinIva | null;
}

export interface FacturamaTax {
  Name: "IVA" | "IEPS" | "IVA Exento";
  Base: number;
  Rate: number;
  Total: number;
  IsRetention: boolean;
  IsQuota?: boolean;
}

export interface FacturamaItem {
  ProductCode: string;
  IdentificationNumber?: string;
  Description: string;
  Unit: string;
  UnitCode: string;
  UnitPrice: number;
  Quantity: number;
  Subtotal: number;
  Discount?: number;
  TaxObject: "01" | "02";
  Taxes?: FacturamaTax[];
  Total: number;
}

export interface TotalesCfdi {
  subtotal: number;
  descuento: number;
  iva: number;
  ieps: number;
  total: number;
}

export const r2 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
export const r6 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 1e6) / 1e6;

/** Errores de la línea que impiden timbrar (los usa el preflight). En la factura global
 *  la clave y unidad SAT son fijas (01010101 / ACT), así que no se revisan. */
export function erroresLinea(l: LineaCfdiInput, opts: { global?: boolean } = {}): string[] {
  const e: string[] = [];
  const code = (l.product_code || "").trim();
  if (!opts.global) {
    if (!/^\d{8}$/.test(code)) e.push("clave SAT inválida (debe tener 8 dígitos)");
    else if (code === "01010101") e.push("clave SAT genérica 01010101 no permitida");
    if (!l.unit_code || !l.unit_name) e.push("falta la unidad SAT");
  }
  if (!(Number(l.cantidad) > 0)) e.push("la cantidad debe ser mayor que cero");
  if (!(Number(l.precio_unitario) >= 0)) e.push("precio unitario inválido");
  const importe = r2(r6(l.precio_unitario) * r6(l.cantidad));
  if (Number(l.descuento) < 0 || r2(l.descuento) > importe) e.push("descuento inválido");
  if (!l.tiene_iva && !l.iva_sin_iva) {
    e.push("el producto no tiene IVA: indica en el producto si va a tasa 0%, exento o no objeto");
  }
  return e;
}

export function itemFacturama(l: LineaCfdiInput): FacturamaItem {
  const UnitPrice = r6(l.precio_unitario);
  const Quantity = r6(l.cantidad);
  const Subtotal = r2(UnitPrice * Quantity);
  const Discount = r2(Math.max(0, Number(l.descuento) || 0));
  const base = r2(Subtotal - Discount);
  const Taxes: FacturamaTax[] = [];

  let ieps = 0;
  if (Number(l.ieps_pct) > 0) {
    if (l.ieps_tipo === "cuota") {
      const cuota = r6(l.ieps_pct);
      ieps = r2(cuota * Quantity);
      Taxes.push({ Name: "IEPS", Base: Quantity, Rate: cuota, Total: ieps, IsRetention: false, IsQuota: true });
    } else {
      const rate = r6(l.ieps_pct / 100);
      ieps = r2(base * rate);
      Taxes.push({ Name: "IEPS", Base: base, Rate: rate, Total: ieps, IsRetention: false });
    }
  }

  const baseIva = r2(base + ieps);
  let iva = 0;
  const factor: IvaSinIva | "tasa" = l.tiene_iva
    ? (Number(l.iva_pct) > 0 ? "tasa" : "tasa0")
    : (l.iva_sin_iva ?? "no_objeto");
  if (factor === "tasa") {
    const rate = r6(l.iva_pct / 100);
    iva = r2(baseIva * rate);
    Taxes.push({ Name: "IVA", Base: baseIva, Rate: rate, Total: iva, IsRetention: false });
  } else if (factor === "tasa0") {
    Taxes.push({ Name: "IVA", Base: baseIva, Rate: 0, Total: 0, IsRetention: false });
  } else if (factor === "exento") {
    Taxes.push({ Name: "IVA Exento", Base: baseIva, Rate: 0, Total: 0, IsRetention: false });
  }

  const item: FacturamaItem = {
    ProductCode: (l.product_code || "").trim(),
    Description: l.descripcion || "Producto",
    Unit: l.unit_name,
    UnitCode: (l.unit_code || "").toUpperCase(),
    UnitPrice,
    Quantity,
    Subtotal,
    TaxObject: Taxes.length > 0 ? "02" : "01",
    Total: r2(base + ieps + iva),
  };
  if (Discount > 0) item.Discount = Discount;
  if (Taxes.length > 0) item.Taxes = Taxes;
  return item;
}

export function totalesCfdi(items: FacturamaItem[]): TotalesCfdi {
  const t = { subtotal: 0, descuento: 0, iva: 0, ieps: 0, total: 0 };
  for (const it of items) {
    t.subtotal += it.Subtotal;
    t.descuento += it.Discount ?? 0;
    t.total += it.Total;
    for (const x of it.Taxes ?? []) {
      if (x.Name === "IVA") t.iva += x.Total;
      else if (x.Name === "IEPS") t.ieps += x.Total;
    }
  }
  return { subtotal: r2(t.subtotal), descuento: r2(t.descuento), iva: r2(t.iva), ieps: r2(t.ieps), total: r2(t.total) };
}

/** Impuesto agrupado de un CFDI (se guarda en cfdis.impuestos_detalle). */
export interface ImpuestoAgrupado {
  Name: FacturamaTax["Name"];
  Rate: number;
  IsQuota?: boolean;
  Base: number;
  Total: number;
}

export function agruparImpuestos(items: FacturamaItem[]): ImpuestoAgrupado[] {
  const m = new Map<string, ImpuestoAgrupado>();
  for (const it of items) {
    for (const x of it.Taxes ?? []) {
      const k = `${x.Name}|${x.Rate}|${x.IsQuota ? 1 : 0}`;
      const g = m.get(k) ?? { Name: x.Name, Rate: x.Rate, ...(x.IsQuota ? { IsQuota: true } : {}), Base: 0, Total: 0 };
      g.Base = r2(g.Base + x.Base);
      g.Total = r2(g.Total + x.Total);
      m.set(k, g);
    }
  }
  return [...m.values()];
}

/** Impuestos del documento relacionado en el REP: los del CFDI en proporción a lo pagado. */
export function impuestosProporcionales(detalle: ImpuestoAgrupado[], pagado: number, totalCfdi: number): FacturamaTax[] {
  const ratio = totalCfdi > 0 ? pagado / totalCfdi : 0;
  return detalle.map((g) => ({
    Name: g.Name,
    Rate: g.Rate,
    Base: r2(g.Base * ratio),
    Total: r2(g.Total * ratio),
    IsRetention: false,
    ...(g.IsQuota ? { IsQuota: true } : {}),
  }));
}

/** Fecha límite del REP: día 5 del mes siguiente al pago (YYYY-MM-DD). */
export function fechaLimiteRep(fechaPago: string): string {
  const [y, m] = fechaPago.slice(0, 10).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-05`;
}

/** Forma de pago SAT según el método del cobro; null si hay que elegirla. */
export function formaPagoSat(metodo: string | null | undefined): string | null {
  const m = String(metodo || "").toLowerCase().trim();
  const mapa: Record<string, string> = { efectivo: "01", cheque: "02", transferencia: "03", deposito: "03", "depósito": "03", tarjeta: "04" };
  return mapa[m] ?? null;
}

/** Reparto de un cobro aplicado a una venta entre sus facturas PPD, en proporción a su importe en la venta. */
export function repartirAplicacion(montoAplicado: number, totalVenta: number, partes: { cfdi_id: string; importe: number }[]) {
  if (!(totalVenta > 0)) return partes.map((p) => ({ cfdi_id: p.cfdi_id, pagado: 0 }));
  return partes.map((p) => ({ cfdi_id: p.cfdi_id, pagado: r2(montoAplicado * Math.min(p.importe, totalVenta) / totalVenta) }));
}
