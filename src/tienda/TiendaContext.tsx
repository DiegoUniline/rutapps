import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

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
      const precio = precioPresentacion(p, pr);
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

/** Precio de una presentación (caja/paquete): su precio especial o precio × factor. */
export function precioPresentacion(p: Pick<TiendaProducto, "precio">, pr: Pick<TiendaPresentacion, "precio_especial" | "factor_base">): number {
  return pr.precio_especial != null ? Number(pr.precio_especial) : p.precio * Number(pr.factor_base);
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

/**
 * Pone en el carrito los precios vigentes del catálogo que el servidor calculó
 * para quien está viendo la tienda. Así, si agregó productos como visitante y
 * luego inició sesión (o le cambiaron su lista), el carrito muestra SUS precios.
 * Devuelve el mismo arreglo si no cambió nada.
 */
export function repreciarCarrito(cart: CartItem[], productos: TiendaProducto[]): CartItem[] {
  if (!cart.length || !productos?.length) return cart;
  const porId = new Map(productos.map((p) => [p.id, p]));
  let cambio = false;
  const next = cart.map((c) => {
    const p = porId.get(c.producto_id);
    if (!p) return c;
    let precio = p.precio;
    if (c.presentacion_id) {
      const pr = (p.presentaciones ?? []).find((x) => x.id === c.presentacion_id);
      if (!pr) return c;
      precio = precioPresentacion(p, pr);
    }
    if (!Number.isFinite(precio) || precio === c.precio_unitario) return c;
    cambio = true;
    return { ...c, precio_unitario: precio };
  });
  return cambio ? next : cart;
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
  /** La sesión anterior venció y se cerró sola (para avisar en la pantalla de entrar). */
  sesionExpirada: boolean;
  login: (token: string, email: string) => void;
  logout: () => void;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQty: (lineKey: string, cantidad: number) => void;
  removeFromCart: (lineKey: string) => void;
  clearCart: () => void;
  /** Actualiza los precios del carrito con los del catálogo vigente. */
  sincronizarPreciosCarrito: (productos: TiendaProducto[]) => void;
  cartCount: number;
  cartTotal: number;
}

const Ctx = createContext<TiendaCtx | null>(null);

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const EVENTO_SESION_EXPIRADA = "tienda-sesion-expirada";
/** Renovación de rutina mientras el cliente usa la tienda. */
const RENOVAR_CADA_MS = 12 * 60 * 60 * 1000;
/** Si al token le queda menos que esto, se renueva al abrir aunque no toque. */
const RENOVAR_SI_VENCE_EN_MS = 7 * 24 * 60 * 60 * 1000;

// localStorage puede fallar (navegación privada, navegadores dentro de apps):
// la sesión sigue en memoria aunque no se pueda guardar.
function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch (e) { console.warn("[tienda] no se pudo guardar en el navegador:", (e as Error).message); }
}
function lsRemove(k: string) {
  try { localStorage.removeItem(k); } catch (e) { console.warn("[tienda] no se pudo borrar del navegador:", (e as Error).message); }
}

/** Vencimiento del token (ms) leído de su payload; null si no se puede leer. */
export function tokenExpiraEn(token: string | null): number | null {
  try {
    const p = token?.split(".")[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (p.length % 4)) % 4);
    const exp = Number(JSON.parse(atob(b64))?.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null; // token ilegible: se trata como sin vencimiento conocido y decide el servidor
  }
}

/** ¿El servidor dijo que la sesión ya no sirve? (no una contraseña actual incorrecta). */
export function esSesionVencida(status: number, data: any): boolean {
  if (status !== 401) return false;
  const msg = String(data?.error ?? "");
  return data?.code === "sesion_expirada" || /^Sesión (expirada|de tienda inválida)/.test(msg);
}

interface Respuesta { status: number; ok: boolean; data: any }

/** fetch que nunca truena por una respuesta que no es JSON (504 del proxy, HTML…). */
async function pedir(url: string, init?: RequestInit): Promise<Respuesta> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error("Sin conexión. Revisa tu internet e intenta de nuevo.");
  }
  let data: any = null;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, ok: r.ok, data };
}

function errorDe(res: Respuesta): Error {
  return new Error(res.data?.error ?? (res.status >= 500 || res.status === 0
    ? "El servidor no respondió. Intenta de nuevo en un momento."
    : "Error de red"));
}

/** Renueva la sesión y devuelve el token nuevo (null si no se pudo). Lo registra el TiendaProvider. */
let renovadorSesion: ((tokenViejo: string) => Promise<string | null>) | null = null;

/**
 * Hace la llamada y, si el servidor dice que la sesión venció, la renueva y
 * reintenta UNA vez con el token nuevo. Solo se cierra sesión si la renovación
 * también es rechazada (cliente bloqueado, tienda desactivada, token alterado).
 */
async function conSesion(token: unknown, llamar: (token: unknown) => Promise<Respuesta>) {
  let res = await llamar(token);
  if (!res.ok && esSesionVencida(res.status, res.data) && typeof token === "string" && token) {
    if (renovadorSesion) {
      const nuevo = await renovadorSesion(token);
      if (nuevo) res = await llamar(nuevo);
    } else {
      window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
    }
  }
  if (!res.ok) throw errorDe(res);
  return res.data;
}

export async function fnGet(path: string, params: Record<string, string> = {}) {
  return conSesion(params.token, (token) => {
    const qs = new URLSearchParams(token ? { ...params, token: String(token) } : params).toString();
    return pedir(`${FN_URL}/${path}?${qs}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  });
}

export async function fnPost(path: string, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return conSesion(b.token, (token) => pedir(`${FN_URL}/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(token ? { ...b, token } : body),
  }));
}

export function TiendaProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [empresa, setEmpresa] = useState<TiendaEmpresa | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const tokenKey = `tienda_token_${slug}`;
  const cartKey = `tienda_cart_${slug}`;

  const [token, setToken] = useState<string | null>(() => lsGet(tokenKey));
  const [email, setEmail] = useState<string | null>(() => lsGet(`${tokenKey}_email`));
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(lsGet(cartKey) ?? "[]"); } catch { return []; }
  });
  // Token vigente para callbacks asíncronos (evita cerrar/actualizar una sesión que ya cambió).
  const tokenRef = useRef(token);
  tokenRef.current = token;

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
    lsSet(cartKey, JSON.stringify(cart));
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

  // La sesión se cerró sola (bloqueo / tienda desactivada): aviso en "Iniciar sesión".
  const [sesionExpirada, setSesionExpirada] = useState(() => lsGet(`${tokenKey}_expirada`) === "1");

  const guardarToken = useCallback((t: string) => {
    tokenRef.current = t;
    lsSet(tokenKey, t);
    setToken(t);
  }, [tokenKey]);

  const login = useCallback((t: string, e: string) => {
    lsSet(`${tokenKey}_email`, e);
    lsSet(`${tokenKey}_renovado`, String(Date.now()));
    lsRemove(`${tokenKey}_expirada`);
    setSesionExpirada(false);
    guardarToken(t);
    setEmail(e);
  }, [tokenKey, guardarToken]);

  /** Cierre de sesión: SOLO cuando el cliente lo pide o el servidor rechaza la renovación. */
  const logout = useCallback(() => {
    tokenRef.current = null;
    lsRemove(tokenKey);
    lsRemove(`${tokenKey}_email`);
    lsRemove(`${tokenKey}_renovado`);
    setToken(null);
    setEmail(null);
  }, [tokenKey]);

  const expirar = useCallback(() => {
    if (!tokenRef.current) return;
    logout();
    lsSet(`${tokenKey}_expirada`, "1");
    setSesionExpirada(true);
  }, [logout, tokenKey]);

  // ── Sesión persistente: no vence por tiempo; se renueva sola ──
  // tienda-refresh renueva incluso un token ya vencido (firma válida). Solo un
  // rechazo explícito del servidor cierra la sesión; sin red o con error del
  // servidor la sesión se conserva y se reintenta después.
  const renovando = useRef<Promise<string | null> | null>(null);
  const renovarSesion = useCallback((tokenViejo: string): Promise<string | null> => {
    if (renovando.current) return renovando.current;
    const p = (async () => {
      let res: Respuesta;
      try {
        res = await pedir(`${FN_URL}/tienda-refresh`, {
          method: "POST",
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
          body: JSON.stringify({ slug, token: tokenViejo }),
        });
      } catch (e) {
        console.warn("[tienda] sin conexión para renovar la sesión:", (e as Error).message);
        return null;
      }
      // Mientras tanto el cliente cerró sesión o entró con otra cuenta: no tocar.
      if (tokenRef.current !== tokenViejo) return tokenRef.current;
      if (res.ok && typeof res.data?.token === "string") {
        lsSet(`${tokenKey}_renovado`, String(Date.now()));
        guardarToken(res.data.token);
        return res.data.token as string;
      }
      if (esSesionVencida(res.status, res.data)) { expirar(); return null; }
      console.warn("[tienda] no se pudo renovar la sesión:", res.status, res.data?.error ?? "");
      return null;
    })().finally(() => { renovando.current = null; });
    renovando.current = p;
    return p;
  }, [slug, tokenKey, guardarToken, expirar]);

  // Las llamadas a la tienda (fnGet/fnPost) usan este renovador ante un 401 de sesión.
  useEffect(() => {
    const fn = (t: string) => renovarSesion(t);
    renovadorSesion = fn;
    return () => { if (renovadorSesion === fn) renovadorSesion = null; };
  }, [renovarSesion]);

  // Compatibilidad: un aviso de sesión vencida sin renovador intenta renovar.
  useEffect(() => {
    const onVencida = () => { if (tokenRef.current) void renovarSesion(tokenRef.current); };
    window.addEventListener(EVENTO_SESION_EXPIRADA, onVencida);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, onVencida);
  }, [renovarSesion]);

  // Renovación al abrir y al volver a la tienda: cada 12 h, o antes si el token
  // vence pronto o ya venció (no depende de que el reloj del celular esté bien).
  useEffect(() => {
    if (!token) return;
    const revisar = () => {
      if (document.visibilityState === "hidden") return;
      const ultimo = Number(lsGet(`${tokenKey}_renovado`) ?? 0);
      if (Date.now() - ultimo < 60_000) return; // como máximo una vez por minuto
      const exp = tokenExpiraEn(token);
      const vencePronto = exp != null && exp - Date.now() < RENOVAR_SI_VENCE_EN_MS;
      if (!vencePronto && Date.now() - ultimo < RENOVAR_CADA_MS) return;
      void renovarSesion(token);
    };
    revisar();
    document.addEventListener("visibilitychange", revisar);
    return () => document.removeEventListener("visibilitychange", revisar);
  }, [token, tokenKey, renovarSesion]);

  // Otra pestaña de la misma tienda inició/cerró sesión o renovó el token.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== tokenKey) return;
      tokenRef.current = e.newValue;
      setToken(e.newValue);
      if (!e.newValue) setEmail(null);
      else setEmail(lsGet(`${tokenKey}_email`));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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

  const sincronizarPreciosCarrito = useCallback((productos: TiendaProducto[]) => {
    setCart((prev) => repreciarCarrito(prev, productos));
  }, []);

  const cartCount = useMemo(() => cart.reduce((s, x) => s + x.cantidad, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, x) => s + x.cantidad * x.precio_unitario, 0), [cart]);

  const value: TiendaCtx = {
    slug, config, empresa, loadingConfig, configError,
    token, email, isAuth: !!token, sesionExpirada, login, logout,
    cart, addToCart, updateQty, removeFromCart, clearCart, sincronizarPreciosCarrito, cartCount, cartTotal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Mantiene el carrito con los precios del catálogo vigente (mismo query que las
 * páginas, así no se descarga dos veces). Se monta una vez dentro del TiendaProvider.
 */
export function SincronizarPreciosCarrito() {
  const t = useTienda();
  const conCarrito = t.cart.length > 0;
  const { data } = useQuery({
    queryKey: ["tienda-catalog", t.slug, t.token],
    queryFn: () => fnGet("tienda-catalog", { slug: t.slug, ...(t.token ? { token: t.token } : {}) }),
    staleTime: 60_000,
    enabled: conCarrito,
  });
  const { sincronizarPreciosCarrito } = t;
  useEffect(() => {
    if (conCarrito && Array.isArray(data?.productos)) sincronizarPreciosCarrito(data.productos);
  }, [data, conCarrito, sincronizarPreciosCarrito]);
  return null;
}

export function useTienda() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTienda must be used within TiendaProvider");
  return v;
}

export const formatMoney = (n: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda || "MXN" }).format(n || 0);
