// Mirror of src/lib/priceResolver.ts — returns the customer-facing DISPLAY price
// (net + IVA/IEPS + redondeo). Matches what the app shows in "Lista de precios".
export interface Rule {
  aplica_a: string;
  producto_ids: string[];
  clasificacion_ids: string[];
  tipo_calculo: string;
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
  costo: number;
  clasificacion_id: string | null;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  usa_listas_precio: boolean;
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
  // Include rules with matching lista_precio_id OR null (applies to all lists)
  const filtered = listaId
    ? rules.filter((r) => r.lista_precio_id === listaId || !r.lista_precio_id)
    : rules.filter((r) => !r.lista_precio_id);

  return (
    filtered.find((r) => r.aplica_a === "producto" && (r.producto_ids ?? []).includes(prod.id)) ??
    (prod.clasificacion_id
      ? filtered.find((r) => r.aplica_a === "categoria" && (r.clasificacion_ids ?? []).includes(prod.clasificacion_id!))
      : null) ??
    filtered.find((r) => r.aplica_a === "todos") ??
    null
  );
}

function rawRulePrice(rule: Rule, prod: Prod): number | null {
  let precio = 0;
  if (rule.tipo_calculo === "precio_fijo") {
    precio = rule.precio ?? 0;
    if (precio <= 0 && (rule.precio_minimo ?? 0) <= 0) return null;
  } else if (rule.tipo_calculo === "margen_costo") {
    precio = (prod.costo ?? 0) * (1 + (rule.margen_pct ?? 0) / 100);
  } else if (rule.tipo_calculo === "descuento_precio") {
    precio = prod.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  }
  return Math.max(precio, rule.precio_minimo ?? 0);
}

/**
 * Returns the customer-facing DISPLAY price (gross, with taxes and redondeo).
 */
export function resolvePrice(rules: Rule[], prod: Prod, listaId: string | null): number {
  if (prod.usa_listas_precio === false) {
    return round2(prod.precio_principal * taxMultiplier(prod));
  }

  const rule = findRule(rules, prod, listaId);
  if (!rule) {
    return round2(prod.precio_principal * taxMultiplier(prod));
  }

  const raw = rawRulePrice(rule, prod);
  if (raw == null) {
    return round2(prod.precio_principal * taxMultiplier(prod));
  }

  // Convert to net first if rule is expressed con_impuestos
  let neto = raw;
  if (rule.base_precio === "con_impuestos") {
    const div = taxMultiplier(prod);
    neto = div > 0 ? raw / div : raw;
  }
  neto = round2(neto);

  // Apply taxes back, then redondeo on the gross
  const gross = round2(neto * taxMultiplier(prod));
  return round2(applyRedondeo(gross, rule.redondeo ?? "ninguno"));
}
