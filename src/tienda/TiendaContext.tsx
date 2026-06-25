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
}

export interface TiendaEmpresa {
  nombre: string;
  logo_url: string | null;
  telefono: string | null;
  moneda: string | null;
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
}

export interface CartItem {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  precio_unitario: number;
  cantidad: number;
  unidad: string | null;
}

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
  updateQty: (producto_id: string, cantidad: number) => void;
  removeFromCart: (producto_id: string) => void;
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
      const idx = prev.findIndex((x) => x.producto_id === item.producto_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + item.cantidad };
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const updateQty = useCallback((producto_id: string, cantidad: number) => {
    setCart((prev) => prev.map((x) => x.producto_id === producto_id ? { ...x, cantidad: Math.max(0, cantidad) } : x).filter((x) => x.cantidad > 0));
  }, []);

  const removeFromCart = useCallback((producto_id: string) => {
    setCart((prev) => prev.filter((x) => x.producto_id !== producto_id));
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
