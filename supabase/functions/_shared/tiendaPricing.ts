// Copia FIEL del motor de precios de la app (src/lib/priceResolver.ts) para las
// edge functions de la tienda en línea. Deno no puede importar src/, así que la
// lógica se replica aquí y la prueba src/test/tiendaPricingParidad.test.ts
// verifica que dé EXACTAMENTE lo mismo que la app. Si cambias priceResolver.ts,
// cambia este archivo igual (la prueba falla si se desalinean).
//
// Reglas (iguales a la app):
// - Prioridad de regla: producto > categoría > grupo/lista del producto > todos.
// - Sin regla (o producto con precio directo): precio_principal ES el precio
//   final con impuestos; el neto se obtiene quitándole los impuestos.
// - margen_costo respeta costo_incluye_impuestos.
// - El redondeo se aplica sobre el precio final (con impuestos).

export interface Rule {
  aplica_a: string; // 'todos' | 'producto' | 'categoria' | 'grupo'
  producto_ids: string[];
  clasificacion_ids: string[];
  grupos?: string[] | null;
  tipo_calculo: string; // 'precio_fijo' | 'margen_costo' | 'descuento_precio'
  precio: number;
  precio_minimo: number | null;
  margen_pct: number | null;
  descuento_pct: number | null;
  redondeo: string;
  base_precio: string;
  lista_precio_id: string | null;
}

export interface Prod {
  id: string;
  precio_principal: number;
  costo?: number;
  clasificacion_id?: string | null;
  grupo_precio?: string | null;
  /** Lista del producto (productos.lista_id) usada por reglas `aplica_a = 'grupo'`. */
  lista_id?: string | null;
  tiene_iva?: boolean;
  iva_pct?: number;
  tiene_ieps?: boolean;
  ieps_pct?: number;
  usa_listas_precio?: boolean;
  costo_incluye_impuestos?: boolean;
}

export interface PrecioResuelto {
  /** Precio unitario NETO (sin impuestos) que se guarda en venta_lineas. */
  unitPrice: number;
  /** Precio FINAL que ve el cliente (con impuestos y redondeo). */
  displayPrice: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyRedondeo(p: number, r: string): number {
  if (!r || r === "ninguno") return p;
  if (r === "arriba") return Math.ceil(p);
  if (r === "abajo") return Math.floor(p);
  return Math.round(p);
}

function taxMultiplier(p: Prod): number {
  const ieps = p.tiene_ieps ? (p.ieps_pct ?? 0) : 0;
  const iva = p.tiene_iva ? (p.iva_pct ?? 0) : 0;
  return (1 + ieps / 100) * (1 + iva / 100);
}

function findRule(rules: Rule[], prod: Prod, listaId: string | null): Rule | null {
  const filtered = listaId
    ? rules.filter((r) => r.lista_precio_id === listaId || !r.lista_precio_id)
    : rules.filter((r) => !r.lista_precio_id);

  const prodRule = filtered.find((r) => r.aplica_a === "producto" && (r.producto_ids ?? []).includes(prod.id));
  if (prodRule) return prodRule;

  if (prod.clasificacion_id) {
    const catRule = filtered.find((r) => r.aplica_a === "categoria" && (r.clasificacion_ids ?? []).includes(prod.clasificacion_id!));
    if (catRule) return catRule;
  }

  const grupoKeys = [prod.lista_id, prod.grupo_precio].filter(Boolean) as string[];
  if (grupoKeys.length) {
    const grupoRule = filtered.find((r) => r.aplica_a === "grupo" && (r.grupos ?? []).some((g) => grupoKeys.includes(g)));
    if (grupoRule) return grupoRule;
  }

  return filtered.find((r) => r.aplica_a === "todos") ?? null;
}

function rawRulePrice(rule: Rule, prod: Prod): number | null {
  let precio = 0;
  if (rule.tipo_calculo === "precio_fijo") {
    precio = rule.precio ?? 0;
    if (precio <= 0 && (rule.precio_minimo ?? 0) <= 0) return null;
  } else if (rule.tipo_calculo === "margen_costo") {
    let baseCosto = prod.costo ?? 0;
    if (prod.costo_incluye_impuestos) {
      const divisor = taxMultiplier(prod);
      if (divisor > 0) baseCosto = baseCosto / divisor;
    }
    precio = baseCosto * (1 + (rule.margen_pct ?? 0) / 100);
  } else if (rule.tipo_calculo === "descuento_precio") {
    precio = prod.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  }
  return Math.max(precio, rule.precio_minimo ?? 0);
}

/** Sin regla: precio_principal es el precio FINAL; el neto se deriva. */
function precioPrincipalFallback(prod: Prod): PrecioResuelto {
  const divisor = taxMultiplier(prod);
  const finalGross = round2(prod.precio_principal ?? 0);
  const net = divisor > 0 ? round2(finalGross / divisor) : finalGross;
  return { unitPrice: net, displayPrice: finalGross };
}

/** Igual a resolveProductPricing() de la app (unitPrice y displayPrice). */
export function resolverPrecio(rules: Rule[], prod: Prod, listaId: string | null): PrecioResuelto {
  if (prod.usa_listas_precio === false) return precioPrincipalFallback(prod);

  const rule = findRule(rules, prod, listaId);
  if (!rule) return precioPrincipalFallback(prod);

  const raw = rawRulePrice(rule, prod);
  if (raw == null) return precioPrincipalFallback(prod);

  const mult = taxMultiplier(prod);
  const rawUnitPrice = rule.base_precio === "con_impuestos" ? (mult > 0 ? raw / mult : raw) : raw;
  const unitPrice = round2(rawUnitPrice);
  // Precio final desde el neto de alta precisión (sin doble redondeo).
  const displayPrice = round2(applyRedondeo(round2(rawUnitPrice * mult), rule.redondeo ?? "ninguno"));
  return { unitPrice, displayPrice };
}

/** Precio FINAL que ve el cliente (con impuestos y redondeo). */
export function resolvePrice(rules: Rule[], prod: Prod, listaId: string | null): number {
  return resolverPrecio(rules, prod, listaId).displayPrice;
}

/** Precio unitario NETO (sin impuestos) para guardar en venta_lineas: igual que
 *  la app (getStoredNetUnitPriceFromGross), sale del precio FINAL mostrado. */
export function resolveNetPrice(rules: Rule[], prod: Prod, listaId: string | null): number {
  const mult = taxMultiplier(prod);
  const final = resolverPrecio(rules, prod, listaId).displayPrice;
  return mult > 0 ? final / mult : final;
}

export interface MontosLinea {
  precio_unitario: number;
  subtotal: number;
  ieps_monto: number;
  iva_monto: number;
  total: number;
}

/**
 * Montos de una línea a partir del precio FINAL por unidad base que vio el
 * cliente. Mismo cálculo que calculateSaleLineAmounts() de la app (neto ×
 * cantidad, IEPS, IVA sobre base + IEPS) y el total se cuadra a
 * precio final × cantidad, ajustando el centavo en el impuesto, para que el
 * pedido sume exactamente lo que el cliente vio en la tienda.
 */
export function montosLinea(precioFinalUnitario: number, cantidad: number, prod: Prod): MontosLinea {
  const ivaPct = prod.tiene_iva ? Number(prod.iva_pct) || 0 : 0;
  const iepsPct = prod.tiene_ieps ? Number(prod.ieps_pct) || 0 : 0;
  const mult = (1 + iepsPct / 100) * (1 + ivaPct / 100);
  const neto = mult > 0 ? precioFinalUnitario / mult : precioFinalUnitario;
  const subtotal = round2(neto * cantidad);
  let ieps = iepsPct > 0 ? round2(subtotal * (iepsPct / 100)) : 0;
  let iva = ivaPct > 0 ? round2((subtotal + ieps) * (ivaPct / 100)) : 0;
  const objetivo = round2(precioFinalUnitario * cantidad);
  const diff = round2(objetivo - round2(subtotal + ieps + iva));
  if (diff !== 0) {
    if (ivaPct > 0 && iva + diff >= 0) iva = round2(iva + diff);
    else if (iepsPct > 0 && ieps + diff >= 0) ieps = round2(ieps + diff);
  }
  return { precio_unitario: neto, subtotal, ieps_monto: ieps, iva_monto: iva, total: round2(subtotal + ieps + iva) };
}
