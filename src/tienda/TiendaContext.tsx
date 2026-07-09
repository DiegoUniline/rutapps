import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TiendaConfig {
  id: string;
  empresa_id: string;
  slug: string;
  activa: boolean;
  nombre_tienda: string;
  banner_url: string | null;
  logo_url: string | null;
  color_primario: string | null;
  color_secundario: string | null;
  whatsapp_pedidos: string | null;
  lista_precios_default_id: string | null;
  permitir_invitados: boolean;
  mensaje_bienvenida: string | null;
  beneficios?: Beneficio[] | null;
  usar_lista_cliente?: boolean;
  plantilla?: string | null;
}

export interface Beneficio {
  icon: string;
  title: string;
  subtitle: string;
  enabled: boolean;
}

export interface TiendaEmpresa {
  nombre: string;
  logo_url: string | null;
  telefono: string | null;
  moneda: string | null;
}

export interface TiendaPresentacion {
  id: string;
  nombre: string;
  factor_base: number;
  precio_especial: number | null;
}

export interface TiendaProducto {
  id: string;
  nombre: string;
  sku: string | null;
  descripcion: string | null;
  categoria: string | null;
  marca: string | null;
  imagen_url: string | null;
  unidad_venta: string | null;
  precio: number;
  precio_base: number;
  stock: number;
  vender_sin_stock: boolean;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  presentaciones?: TiendaPresentacion[];
  /** Presentación embebida en una "tarjeta virtual" (para expandir en la tienda). */
  _pres?: { id: string; nombre: string; factor_base: number } | null;
}

/**
 * Expande cada producto con presentaciones en varias "tarjetas" independientes:
 * una para la unidad base y una por cada presentación activa.
 * Usado sólo en la tienda en línea. En móvil/POS se sigue usando el modal.
 */
export function expandProductosConPresentaciones(productos: TiendaProducto[]): TiendaProducto[] {
  const out: TiendaProducto[] = [];
  for (const p of productos) {
    const pres = (p.presentaciones ?? []).filter((x) => Number(x.factor_base) > 0);
    if (pres.length === 0) { out.push(p); continue; }
    const unidadBase = p.unidad_venta ?? "pz";
    // Tarjeta unidad base
    out.push({
      ...p,
      presentaciones: [],
      _pres: null,
      nombre: `${p.nombre} — 1 ${unidadBase}`,
    });
    // Una tarjeta por presentación
    for (const pr of pres) {
      const factor = Number(pr.factor_base);
      const precio = pr.precio_especial ?? p.precio * factor;
      const precio_base = p.precio_base ? p.precio_base * factor : precio;
      out.push({
        ...p,
        id: `${p.id}::${pr.id}`,
        nombre: `${p.nombre} — ${pr.nombre}`,
        precio,
        precio_base,
        stock: Math.floor((p.stock || 0) / factor),
        unidad_venta: pr.nombre,
        presentaciones: [],
        _pres: { id: pr.id, nombre: pr.nombre, factor_base: factor },
      });
    }
  }
  return out;
}

export interface CartItem {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  precio_unitario: number;
  cantidad: number;
  unidad: string | null;
  /** Presentación elegida (caja/paquete). null = unidad base. */
  presentacion_id?: string | null;
  /** Piezas por presentación (para convertir a unidad base en el checkout). */
  factor_base?: number;
}

/** Identidad de la línea del carrito: producto + presentación.
 *  Para unidad base (sin presentación) la llave es solo el producto_id, así
 *  los carritos guardados antes de presentaciones siguen funcionando. */
export function cartKeyOf(producto_id: string, presentacion_id?: string | null) {
  return presentacion_id ? `${producto_id}::${presentacion_id}` : producto_id;
}
export const cartLineKey = (c: CartItem) => cartKeyOf(c.producto_id, c.presentacion_id);

interface TiendaCtx {
  slug: string;
  config: TiendaConfig | null;
  empresa: TiendaEmpresa | null;
  loadingConfig: boolean;
  configError: string | null;
  token: string | null;
  email: string | null;
  isAuth: boolean;
  login: (token: string, email: string) => void;
  logout: () => void;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQty: (lineKey: string, cantidad: number) => void;
  removeFromCart: (lineKey: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
}

const Ctx = createContext<TiendaCtx | null>(null);

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function fnGet(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${FN_URL}/${path}?${qs}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error de red");
  return data;
}

export async function fnPost(path: string, body: unknown) {
  const r = await fetch(`${FN_URL}/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error de red");
  return data;
}

export function TiendaProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [empresa, setEmpresa] = useState<TiendaEmpresa | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const tokenKey = `tienda_token_${slug}`;
  const cartKey = `tienda_cart_${slug}`;

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenKey));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(`${tokenKey}_email`));
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(cartKey) ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    let cancel = false;
    setLoadingConfig(true);
    setConfigError(null);
    fnGet("tienda-resolve", { slug })
      .then((r) => {
        if (cancel) return;
        setConfig(r.config);
        setEmpresa(r.empresa);
      })
      .catch((e) => { if (!cancel) setConfigError(e.message); })
      .finally(() => { if (!cancel) setLoadingConfig(false); });
    return () => { cancel = true; };
  }, [slug]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);

  // Inject brand colors via CSS variables scoped to the tienda root
  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    root.style.setProperty("--tienda-primary", config.color_primario ?? "#0061e8");
    root.style.setProperty("--tienda-secondary", config.color_secundario ?? "#ff7a00");
    return () => {
      root.style.removeProperty("--tienda-primary");
      root.style.removeProperty("--tienda-secondary");
    };
  }, [config]);

  const login = useCallback((t: string, e: string) => {
    localStorage.setItem(tokenKey, t);
    localStorage.setItem(`${tokenKey}_email`, e);
    setToken(t);
    setEmail(e);
  }, [tokenKey]);

  const logout = useCallback(() => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(`${tokenKey}_email`);
    setToken(null);
    setEmail(null);
  }, [tokenKey]);

  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      const key = cartLineKey(item);
      const idx = prev.findIndex((x) => cartLineKey(x) === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + item.cantidad };
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const updateQty = useCallback((lineKey: string, cantidad: number) => {
    setCart((prev) => prev.map((x) => cartLineKey(x) === lineKey ? { ...x, cantidad: Math.max(0, cantidad) } : x).filter((x) => x.cantidad > 0));
  }, []);

  const removeFromCart = useCallback((lineKey: string) => {
    setCart((prev) => prev.filter((x) => cartLineKey(x) !== lineKey));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = useMemo(() => cart.reduce((s, x) => s + x.cantidad, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, x) => s + x.cantidad * x.precio_unitario, 0), [cart]);

  const value: TiendaCtx = {
    slug, config, empresa, loadingConfig, configError,
    token, email, isAuth: !!token, login, logout,
    cart, addToCart, updateQty, removeFromCart, clearCart, cartCount, cartTotal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTienda() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTienda must be used within TiendaProvider");
  return v;
}

export const formatMoney = (n: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda || "MXN" }).format(n || 0);
