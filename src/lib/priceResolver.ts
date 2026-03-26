/**
 * Resolves the sale price of a product based on the tarifa rules and lista de precios.
 * 
 * Hierarchy: 1) Product-specific rule, 2) Category rule, 3) Global ('todos') rule
 * Falls back to producto.precio_principal if no tarifa rule matches.
 */

export interface TarifaLineaRule {
  aplica_a: string; // 'todos' | 'producto' | 'categoria'
  producto_ids: string[];
  clasificacion_ids: string[];
  tipo_calculo: string; // 'precio_fijo' | 'margen_costo' | 'descuento_precio'
  precio: number;
  precio_minimo: number | null;
  margen_pct: number | null;
  descuento_pct: number | null;
  redondeo: string;
  base_precio: string;
  lista_precio_id: string | null;
}

export interface ProductForPricing {
  id: string;
  precio_principal: number;
  costo?: number;
  clasificacion_id?: string | null;
  tiene_iva?: boolean;
  iva_pct?: number;
  tiene_ieps?: boolean;
  ieps_pct?: number;
  ieps_tipo?: string;
}

function applyRedondeo(precio: number, redondeo: string): number {
  if (!redondeo || redondeo === 'ninguno') return precio;
  if (redondeo === 'arriba') return Math.ceil(precio);
  if (redondeo === 'abajo') return Math.floor(precio);
  return Math.round(precio); // cercano
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
  // Filter rules by lista_precio_id: if provided match that list, otherwise only rules without a list
  const filtered = listaPrecioId
    ? rules.filter(r => r.lista_precio_id === listaPrecioId || !r.lista_precio_id)
    : rules.filter(r => !r.lista_precio_id);

  // 1) Product-specific
  const prodRule = filtered.find(
    r => r.aplica_a === 'producto' && (r.producto_ids ?? []).includes(producto.id)
  );
  if (prodRule) return prodRule;

  // 2) Category-specific
  if (producto.clasificacion_id) {
    const catRule = filtered.find(
      r => r.aplica_a === 'categoria' && (r.clasificacion_ids ?? []).includes(producto.clasificacion_id!)
    );
    if (catRule) return catRule;
  }

  // 3) Global
  const globalRule = filtered.find(r => r.aplica_a === 'todos');
  return globalRule ?? null;
}

/**
 * Calculate price from a tarifa rule and product data.
 * Returns the price BEFORE taxes (unit price for the sale line).
 */
export function calculatePrice(rule: TarifaLineaRule, producto: ProductForPricing): number | null {
  let precio = 0;

  if (rule.tipo_calculo === 'precio_fijo') {
    precio = rule.precio ?? 0;
    // A precio_fijo of 0 is a placeholder rule (e.g. category template);
    // return null so the resolver falls back to the next rule or precio_principal
    if (precio <= 0 && (rule.precio_minimo ?? 0) <= 0) return null;
  } else if (rule.tipo_calculo === 'margen_costo') {
    precio = (producto.costo ?? 0) * (1 + (rule.margen_pct ?? 0) / 100);
  } else if (rule.tipo_calculo === 'descuento_precio') {
    precio = producto.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  }

  // Apply minimum price
  precio = Math.max(precio, rule.precio_minimo ?? 0);

  // Apply rounding
  precio = applyRedondeo(precio, rule.redondeo ?? 'ninguno');

  // If base_precio is 'con_impuestos', the calculated price includes taxes;
  // we need to extract the pre-tax price for the sale line
  if (rule.base_precio === 'con_impuestos') {
    const iepsPct = producto.tiene_ieps ? (producto.ieps_pct ?? 0) : 0;
    const ivaPct = producto.tiene_iva ? (producto.iva_pct ?? 0) : 0;
    // precio = base + ieps + iva = base * (1 + ieps%) * (1 + iva%)
    const divisor = (1 + iepsPct / 100) * (1 + ivaPct / 100);
    precio = divisor > 0 ? precio / divisor : precio;
  }

  return Math.round(precio * 100) / 100;
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
  const rule = findMatchingRule(rules, producto, listaPrecioId);
  if (!rule) return producto.precio_principal;
  return calculatePrice(rule, producto);
}
