// Mirror of priceResolver for tienda edge functions
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

function applyRedondeo(p: number, r: string): number {
  if (!r || r === "ninguno") return p;
  if (r === "arriba") return Math.ceil(p);
  if (r === "abajo") return Math.floor(p);
  return Math.round(p);
}

export function resolvePrice(rules: Rule[], prod: Prod, listaId: string | null): number {
  if (prod.usa_listas_precio === false || !listaId) return prod.precio_principal;
  const filtered = rules.filter((r) => r.lista_precio_id === listaId);
  let rule =
    filtered.find((r) => r.aplica_a === "producto" && (r.producto_ids ?? []).includes(prod.id)) ??
    (prod.clasificacion_id
      ? filtered.find((r) => r.aplica_a === "categoria" && (r.clasificacion_ids ?? []).includes(prod.clasificacion_id!))
      : null) ??
    filtered.find((r) => r.aplica_a === "todos") ??
    null;
  if (!rule) return prod.precio_principal;
  let precio = 0;
  if (rule.tipo_calculo === "precio_fijo") precio = rule.precio ?? 0;
  else if (rule.tipo_calculo === "margen_costo") precio = (prod.costo ?? 0) * (1 + (rule.margen_pct ?? 0) / 100);
  else if (rule.tipo_calculo === "descuento_precio") precio = prod.precio_principal * (1 - (rule.descuento_pct ?? 0) / 100);
  precio = Math.max(precio, rule.precio_minimo ?? 0);
  precio = applyRedondeo(precio, rule.redondeo ?? "ninguno");
  if (rule.base_precio === "con_impuestos") {
    const ieps = prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0;
    const iva = prod.tiene_iva ? (prod.iva_pct ?? 0) : 0;
    const div = (1 + ieps / 100) * (1 + iva / 100);
    if (div > 0) precio = precio / div;
  }
  return Math.round(precio * 100) / 100;
}
