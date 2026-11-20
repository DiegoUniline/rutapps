// Qué lista de precios y qué reglas aplican a quien ve la tienda en línea.
// Un solo lugar para catálogo, ficha de producto, carrito/checkout y asistente,
// con la misma resolución que la app (venta de escritorio y de ruta):
//   tarifa = clientes.tarifa_id  →  tarifa de su lista  →  tarifa "general"
//   lista  = clientes.lista_precio_id
// Visitante sin sesión (o tienda con «usar lista del cliente» apagado): la lista
// predeterminada de la tienda; sin ella, precio_principal del producto.
import type { Rule } from "./tiendaPricing.ts";

/** Columnas de productos que necesita el motor de precios (src/lib/priceResolver.ts). */
export const PRODUCTO_COLS_PRECIO =
  "costo, precio_principal, clasificacion_id, lista_id, grupo_precio, tiene_iva, iva_pct, tiene_ieps, ieps_pct, usa_listas_precio, costo_incluye_impuestos";

const REGLA_COLS =
  "aplica_a, producto_ids, clasificacion_ids, grupos, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id";

export interface TiendaCfgPrecios {
  empresa_id: string;
  lista_precios_default_id: string | null;
  usar_lista_cliente?: boolean | null;
}

export interface ClientePrecios {
  lista_precio_id: string | null;
  tarifa_id: string | null;
}

export interface ContextoPrecios {
  listaPrecioId: string | null;
  tarifaId: string | null;
  /** Nombre para mostrar ("Estás viendo tu lista de precios X"). */
  listaNombre: string | null;
  rules: Rule[];
}

// deno-lint-ignore no-explicit-any
type Sb = any;

export async function contextoPreciosTienda(
  supabase: Sb,
  cfg: TiendaCfgPrecios,
  cliente: ClientePrecios | null,
): Promise<ContextoPrecios> {
  const empresaId = cfg.empresa_id;
  const usaCliente = !!cliente && cfg.usar_lista_cliente !== false;

  let listaPrecioId: string | null = usaCliente ? (cliente!.lista_precio_id ?? null) : null;
  let tarifaId: string | null = usaCliente ? (cliente!.tarifa_id ?? null) : null;
  // Cliente sin condiciones propias o visitante: lista predeterminada de la tienda.
  if (!listaPrecioId && !tarifaId) listaPrecioId = cfg.lista_precios_default_id ?? null;

  let listaNombre: string | null = null;
  if (listaPrecioId) {
    const { data: lp, error } = await supabase
      .from("lista_precios").select("id, nombre, tarifa_id")
      .eq("id", listaPrecioId).eq("empresa_id", empresaId).maybeSingle();
    if (error) throw error;
    if (lp) {
      listaNombre = lp.nombre ?? null;
      tarifaId = tarifaId ?? lp.tarifa_id ?? null;
    } else {
      listaPrecioId = null; // lista borrada o de otra empresa
    }
  }

  // Cliente con sesión y sin tarifa: la tarifa general de la empresa (igual que la app).
  if (!tarifaId && usaCliente) {
    const { data: gen, error } = await supabase
      .from("tarifas").select("id, nombre")
      .eq("empresa_id", empresaId).eq("tipo", "general").eq("activa", true)
      .order("created_at").limit(1);
    if (error) throw error;
    if (gen?.[0]) {
      tarifaId = gen[0].id;
      listaNombre = listaNombre ?? gen[0].nombre ?? null;
    }
  } else if (tarifaId && !listaNombre) {
    const { data: t, error } = await supabase
      .from("tarifas").select("nombre").eq("id", tarifaId).eq("empresa_id", empresaId).maybeSingle();
    if (error) throw error;
    if (!t) tarifaId = null; // tarifa de otra empresa: no se usa
    else listaNombre = t.nombre ?? null;
  }

  const rules: Rule[] = [];
  if (tarifaId) {
    for (let page = 0; page < 20; page++) {
      let q = supabase.from("tarifa_lineas").select(REGLA_COLS).eq("tarifa_id", tarifaId);
      q = listaPrecioId
        ? q.or(`lista_precio_id.eq.${listaPrecioId},lista_precio_id.is.null`)
        : q.is("lista_precio_id", null);
      const { data, error } = await q.order("created_at").order("id").range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      rules.push(...((data ?? []) as Rule[]));
      if ((data ?? []).length < 1000) break;
    }
  }

  return { listaPrecioId, tarifaId, listaNombre, rules };
}
