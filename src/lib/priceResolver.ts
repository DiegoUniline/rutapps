/**
 * Resolves the sale price of a product based on the tarifa rules and lista de precios.
 *
 * Hierarchy: 1) Product-specific rule, 2) Category rule, 3) Global ('todos') rule
 * Falls back to producto.precio_principal if no tarifa rule matches.
 */

export interface TarifaLineaRule {
  aplica_a: string; // 'todos' | 'producto' | 'categoria' | 'grupo'
  producto_ids: string[];
  clasificacion_ids: string[];
  /** Grupos de precio (A, B, C, D…) a los que aplica la regla. */
  grupos?: string[];
  tipo_calculo: string; // 'precio_fijo' | 'margen_costo' | 'descuento_precio'
  precio: number;
  precio_minimo: number | null;
  margen_pct: number | null;
  descuento_pct: number | null;
  redondeo: string;
  comision_pct?: number;
  base_precio: string;
  lista_precio_id: string | null;
}

export interface ProductForPricing {
  id: string;
  precio_principal: number;
  costo?: number;
  clasificacion_id?: string | null;
  grupo_precio?: string | null;
  tiene_iva?: boolean;
  iva_pct?: number;
  tiene_ieps?: boolean;
  ieps_pct?: number;
  ieps_tipo?: string;
  usa_listas_precio?: boolean;
  costo_incluye_impuestos?: boolean;
}

export interface ResolvedProductPricing {
  unitPrice: number;
  displayPrice: number;
  rawUnitPrice: number;
  rawDisplayPrice: number;
  basePrecio: string;
  appliedRule: TarifaLineaRule | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function applyRedondeo(precio: number, redondeo: string): number {
  if (!redondeo || redondeo === 'ninguno') return precio;
  if (redondeo === 'arriba') return Math.ceil(precio);
  if (redondeo === 'abajo') return Math.floor(precio);
  return Math.round(precio); // cercano
}

function getTaxMultiplier(producto: ProductForPricing): number {
  const iepsPct = producto.tiene_ieps ? (producto.ieps_pct ?? 0) : 0;
  const ivaPct = producto.tiene_iva ? (producto.iva_pct ?? 0) : 0;
  return (1 + iepsPct / 100) * (1 + ivaPct / 100);
}

/**
 * Find the best matching tarifa rule for a product.
 * Priority: producto > categoria > todos
 */
function findMatchingRule(
  rules: TarifaLineaRule[],
  producto: ProductForPricing,
  listaPrecioId?: string | null
): TarifaLineaRule | null {
  const filtered = listaPrecioId
    ? rules.filter(r => r.lista_precio_id === listaPrecioId || !r.lista_precio_id)
    : rules.filter(r => !r.lista_precio_id);

  const prodRule = filtered.find(
    r => r.aplica_a === 'producto' && (r.producto_ids ?? []).includes(producto.id)
  );
  if (prodRule) return prodRule;

  if (producto.clasificacion_id) {
    const catRule = filtered.find(
      r => r.aplica_a === 'categoria' && (r.clasificacion_ids ?? []).includes(producto.clasificacion_id!)
    );
    if (catRule) return catRule;
  }

  // Grupo de precio del producto (A, B, C, D…): más específico que la regla global.
  if (producto.grupo_precio) {
    const grupoRule = filtered.find(
      r => r.aplica_a === 'grupo' && (r.grupos ?? []).includes(producto.grupo_precio!)
    );
    if (grupoRule) return grupoRule;
  }

  const globalRule = filtered.find(r => r.aplica_a === 'todos');
  return globalRule ?? null;
}

/**
 * Get the raw rule price BEFORE rounding or tax adjustment.
 * Returns null for placeholder rules (precio_fijo = 0 with no minimum).
 */
export function calculateRawPrice(rule: TarifaLineaRule, producto: ProductForPricing): number | null {
  let precio = 0;

  if (rule.tipo_calculo === 'precio_fijo') {
    precio = rule.precio ?? 0;
    if (precio <= 0 && (rule.precio_minimo ?? 0) <= 0) return null;
  } else if (rule.tipo_calculo === 'margen_costo') {
    // If the captured cost already includes taxes, strip them BEFORE applying the margin.
    // This is the single source of truth for the pricing base when costo_incluye_impuestos = true.
    let baseCosto = producto.costo ?? 0;
    if (producto.costo_incluye_impuestos) {
      const divisor = getTaxMultiplier(producto);
      if (divisor > 0) baseCosto = baseCosto / divisor;
    }
    precio = baseCosto * (1 + (rule.margen_pct ?? 0) / 100);
  } else if (rule.tipo_calculo === 'descuento_precio') {
    precio = producto.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  }

  return Math.max(precio, rule.precio_minimo ?? 0);
}

/**
 * Calculate the NET (before-tax) unit price from a tarifa rule.
 * Flow: Raw rule price → extract net (if con_impuestos) → round2
 * Rounding (redondeo) is NOT applied here — it applies on the final gross price.
 */
export function calculatePrice(rule: TarifaLineaRule, producto: ProductForPricing): number | null {
  const raw = calculateRawPrice(rule, producto);
  if (raw == null) return null;

  let neto = raw;
  if (rule.base_precio === 'con_impuestos') {
    const divisor = getTaxMultiplier(producto);
    neto = divisor > 0 ? raw / divisor : raw;
  }

  return round2(neto);
}

/**
 * Calculate the customer-facing display price (gross = net + taxes + redondeo).
 * This is the "Precio Final" the customer pays.
 */
export function toDisplayPrice(
  unitPrice: number,
  producto: ProductForPricing,
  redondeo?: string,
): number {
  const gross = round2(unitPrice * getTaxMultiplier(producto));
  return round2(applyRedondeo(gross, redondeo ?? 'ninguno'));
}

/**
 * Resolve both the persisted unit price and the customer-facing display price.
 *
 * Flow: Cost → Tarifa Rule (net or gross) → Net extraction → +Taxes → Redondeo → Precio Final
 */
/**
 * Fallback cuando NO hay regla de precio: el `precio_principal` ES el precio
 * FINAL (con impuestos incluidos). El neto se deriva quitándole los impuestos.
 * Así el "Precio Final" mostrado y cobrado = precio_principal, tal cual.
 */
function precioPrincipalFallback(producto: ProductForPricing): ResolvedProductPricing {
  const divisor = getTaxMultiplier(producto);
  const finalGross = round2(producto.precio_principal ?? 0);
  const net = divisor > 0 ? round2(finalGross / divisor) : finalGross;
  return {
    unitPrice: net,
    displayPrice: finalGross,
    rawUnitPrice: net,
    rawDisplayPrice: finalGross,
    basePrecio: 'con_impuestos',
    appliedRule: null,
  };
}

export function resolveProductPricing(
  rules: TarifaLineaRule[],
  producto: ProductForPricing,
  listaPrecioId?: string | null
): ResolvedProductPricing {
  // Short-circuit: if product uses precio_directo, skip all tarifa rules
  if (producto.usa_listas_precio === false) {
    return precioPrincipalFallback(producto);
  }

  const rule = findMatchingRule(rules, producto, listaPrecioId);

  if (!rule) {
    return precioPrincipalFallback(producto);
  }

  const unitPrice = calculatePrice(rule, producto);
  if (unitPrice == null) {
    return precioPrincipalFallback(producto);
  }

  const rawBase = calculateRawPrice(rule, producto) ?? producto.precio_principal;
  let rawUnitPrice: number;
  if (rule.base_precio === 'con_impuestos') {
    const divisor = getTaxMultiplier(producto);
    rawUnitPrice = divisor > 0 ? rawBase / divisor : rawBase;
  } else {
    rawUnitPrice = rawBase;
  }
  const rawDisplayPrice = rawUnitPrice * getTaxMultiplier(producto);

  // Compute display price from the high-precision net to avoid double-rounding drift.
  const grossHi = rawUnitPrice * getTaxMultiplier(producto);
  const displayPrice = round2(applyRedondeo(round2(grossHi), rule.redondeo ?? 'ninguno'));

  return {
    unitPrice,
    displayPrice,
    rawUnitPrice,
    rawDisplayPrice,
    basePrecio: rule.base_precio ?? 'sin_impuestos',
    appliedRule: rule,
  };
}

/**
 * Resolve the sale price for a product given tarifa rules.
 * Returns precio_principal as fallback.
 */
export function resolveProductPrice(
  rules: TarifaLineaRule[],
  producto: ProductForPricing,
  listaPrecioId?: string | null
): number {
  return resolveProductPricing(rules, producto, listaPrecioId).unitPrice;
}
