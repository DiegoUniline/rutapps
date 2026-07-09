import { useQuery } from "@tanstack/react-query";
import { fnGet, TiendaProducto, useTienda, formatMoney, expandProductosConPresentaciones } from "@/tienda/TiendaContext";
import { Link } from "react-router-dom";
import { ShoppingCart, ArrowRight, Truck, ShieldCheck, Headphones, Tag, Sparkles, Flame, Star, Award, Clock, CreditCard, Gift, Package, Phone, Check } from "lucide-react";
import TiendaShell from "./TiendaShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { useThumb } from "@/hooks/useThumb";

const CATEGORY_TILES: { match: RegExp; label: string; img: string; tint: string }[] = [
  { match: /botana|snack|fritura|papas/i, label: "Botanas y Snacks", img: "/tienda/cat-botanas.webp", tint: "#ff7a00" },
  { match: /bebida|refresco|agua|jugo|cerveza/i, label: "Bebidas", img: "/tienda/cat-bebidas.webp", tint: "#0d6efd" },
  { match: /dulce|chocolate|caramelo/i, label: "Dulces", img: "/tienda/cat-dulces.webp", tint: "#e83e8c" },
  { match: /abarrote|despensa|grocer|enlatado/i, label: "Abarrotes", img: "/tienda/cat-abarrotes.webp", tint: "#d97706" },
];

function pickTile(catName: string) {
  return CATEGORY_TILES.find((t) => t.match.test(catName));
}

function HomeInner() {
  const t = useTienda();
  const base = `/tienda/${t.slug}`;
  const { data, isLoading } = useQuery({
    queryKey: ["tienda-catalog", t.slug, t.token],
    queryFn: () => fnGet("tienda-catalog", { slug: t.slug, ...(t.token ? { token: t.token } : {}) }),
    staleTime: 60_000,
  });

  const productos: TiendaProducto[] = useMemo(
    () => expandProductosConPresentaciones(data?.productos ?? []),
    [data?.productos],
  );
  // categorias puede venir como string[] (versión vieja del backend) o como
  // { nombre, imagen_url }[] (nueva). Normalizamos a objetos para usar la imagen.
  const categorias: { nombre: string; imagen_url: string | null }[] = (data?.categorias ?? []).map((c: any) =>
    typeof c === 'string' ? { nombre: c, imagen_url: null } : { nombre: c.nombre, imagen_url: c.imagen_url ?? null },
  );

  const destacados = useMemo(() => productos.slice(0, 10), [productos]);
  const masVendidos = useMemo(
    () => [...productos].sort((a, b) => (b.stock || 0) - (a.stock || 0)).slice(0, 10),
    [productos],
  );
  const nuevos = useMemo(() => [...productos].slice(-10).reverse(), [productos]);
  const ofertas = useMemo(
    () => productos.filter((p) => p.precio_base && p.precio < p.precio_base).slice(0, 8),
    [productos],
  );

  const moneda = t.empresa?.moneda ?? "MXN";
  const banner = t.config?.banner_url || "/tienda/tienda-banner.webp";

  return (
    <main className="tienda-container">
      {/* HERO */}
      <section className="tx-hero" style={{ backgroundImage: `url(${banner})` }}>
        <div className="tx-hero-shade" />
        <div className="tx-hero-content">
          <span className="tx-hero-eyebrow">
            <Sparkles size={14} /> Tienda en línea
          </span>
          <h1>{t.config?.mensaje_bienvenida || `Bienvenido a ${t.config?.nombre_tienda}`}</h1>
          <p>
            {t.isAuth
              ? `Tu lista de precios: ${data?.lista_nombre ?? "Estándar"} • Envíos a domicilio`
              : "Catálogo completo, precios especiales para clientes registrados y entrega a tu puerta."}
          </p>
          <div className="tx-hero-cta">
            <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary">
              Comprar ahora <ArrowRight size={16} />
            </Link>
            {!t.isAuth && (
              <Link to={`${base}/login`} className="tienda-btn tienda-btn-outline" style={{ background: "rgba(255,255,255,.9)" }}>
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* BENEFITS STRIP */}
      {(() => {
        const ICONS: Record<string, any> = { truck: Truck, tag: Tag, shield: ShieldCheck, headphones: Headphones, award: Award, clock: Clock, card: CreditCard, gift: Gift, package: Package, phone: Phone };
        const benes = (t.config?.beneficios ?? []).filter((b) => b.enabled);
        if (benes.length === 0) return null;
        return (
          <section className="tx-benefits">
            {benes.map((b, i) => {
              const Ic = ICONS[b.icon] ?? Sparkles;
              return (
                <div key={i} className="tx-benefit"><Ic size={20} /><div><strong>{b.title}</strong><span>{b.subtitle}</span></div></div>
              );
            })}
          </section>
        );
      })()}

      {/* CATEGORIES */}
      {categorias.length > 0 && (
        <>
          <div className="tx-section-head">
            <h2>Compra por categoría</h2>
            <Link to={`${base}/productos`} className="tx-link">Ver todas <ArrowRight size={14} /></Link>
          </div>
          <div className="tx-categories">
            {categorias.slice(0, 8).map((c) => {
              const img = c.imagen_url || pickTile(c.nombre)?.img;
              return (
                <Link
                  key={c.nombre}
                  to={`${base}/productos?cat=${encodeURIComponent(c.nombre)}`}
                  className="tx-cat-tile"
                  style={img ? { backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(0,0,0,.7)), url(${img})` } : { background: `linear-gradient(135deg, var(--tienda-primary), var(--tienda-secondary))` }}
                >
                  <span>{c.nombre}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* OFERTAS */}
      {ofertas.length > 0 && (
        <>
          <div className="tx-section-head">
            <h2><Flame size={20} style={{ color: "#ff3b30", marginRight: 6, verticalAlign: "-3px" }} />Ofertas relámpago</h2>
            <Link to={`${base}/productos`} className="tx-link">Ver más <ArrowRight size={14} /></Link>
          </div>
          <div className="tienda-products">
            {ofertas.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} highlight="oferta" />)}
          </div>
        </>
      )}

      {/* DESTACADOS */}
      <div className="tx-section-head">
        <h2><Star size={20} style={{ color: "#f7b500", marginRight: 6, verticalAlign: "-3px" }} />Destacados</h2>
        <Link to={`${base}/productos`} className="tx-link">Ver catálogo <ArrowRight size={14} /></Link>
      </div>
      {isLoading ? (
        <div className="tienda-loading">Cargando productos…</div>
      ) : destacados.length === 0 ? (
        <div className="tienda-empty">Aún no hay productos en esta tienda.</div>
      ) : (
        <div className="tienda-products">
          {destacados.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} />)}
        </div>
      )}

      {/* PROMO BANNER */}
      <section className="tx-promo-banner">
        <div>
          <h3>¿Eres negocio o revendedor?</h3>
          <p>Regístrate y desbloquea precios de mayoreo, crédito y entregas programadas.</p>
        </div>
        <Link to={`${base}/login`} className="tienda-btn tienda-btn-secondary">Crear cuenta</Link>
      </section>

      {/* MÁS VENDIDOS */}
      {masVendidos.length > 0 && (
        <>
          <div className="tx-section-head">
            <h2>Más vendidos</h2>
            <Link to={`${base}/productos`} className="tx-link">Ver más <ArrowRight size={14} /></Link>
          </div>
          <div className="tienda-products">
            {masVendidos.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} />)}
          </div>
        </>
      )}

      {/* NOVEDADES */}
      {nuevos.length > 0 && (
        <>
          <div className="tx-section-head">
            <h2>Novedades</h2>
            <Link to={`${base}/productos`} className="tx-link">Ver más <ArrowRight size={14} /></Link>
          </div>
          <div className="tienda-products">
            {nuevos.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} highlight="nuevo" />)}
          </div>
        </>
      )}
    </main>
  );
}

export function ProductCard({ p, moneda, highlight }: { p: TiendaProducto; moneda?: string; highlight?: "oferta" | "nuevo" }) {
  const thumb = useThumb();
  const t = useTienda();
  const [added, setAdded] = useState(false);
  const [flyBurst, setFlyBurst] = useState(0);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const enStock = p.stock > 0 || p.vender_sin_stock;
  const cur = moneda ?? t.empresa?.moneda ?? "MXN";
  const tieneDescuento = p.precio_base && p.precio < p.precio_base;
  const pct = tieneDescuento ? Math.round(((p.precio_base - p.precio) / p.precio_base) * 100) : 0;
  // Si es una tarjeta "expandida" de presentación, el id lleva "::presId".
  const realId = p.id.includes("::") ? p.id.split("::")[0] : p.id;
  const detalleHref = `/tienda/${t.slug}/producto/${realId}`;

  const handleAdd = () => {
    if (!enStock) return;
    t.addToCart({
      producto_id: realId,
      nombre: p.nombre,
      imagen_url: p.imagen_url,
      precio_unitario: p.precio,
      cantidad: 1,
      unidad: p.unidad_venta,
      presentacion_id: p._pres ? p._pres.id : null,
      factor_base: p._pres ? p._pres.factor_base : 1,
    });
    setAdded(true);
    setFlyBurst((n) => n + 1);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className={`tienda-card ${added ? "tx-card-added" : ""}`}>
      {(highlight || tieneDescuento) && (
        <div className={`tx-badge ${highlight === "nuevo" ? "tx-badge-new" : "tx-badge-sale"}`}>
          {highlight === "nuevo" ? "Nuevo" : tieneDescuento ? `-${pct}%` : "Oferta"}
        </div>
      )}
      <Link
        to={detalleHref}
        className="tienda-card-img"
        style={p.imagen_url ? { backgroundImage: `url(${thumb(p.imagen_url, 400)})` } : {}}
      >
        {!p.imagen_url && <div className="tienda-card-img-placeholder">📦</div>}
        {flyBurst > 0 && <span key={flyBurst} className="tx-fly-burst" aria-hidden>+1</span>}
      </Link>
      <div className="tienda-card-body">
        {p.marca && <div className="tienda-card-brand">{p.marca}</div>}
        <Link to={detalleHref} className="tienda-card-name" style={{ color: "inherit", textDecoration: "none" }}>{p.nombre}</Link>
        <div className="tienda-card-price">
          {formatMoney(p.precio, cur)}
          {p.unidad_venta && <small> / {p.unidad_venta}</small>}
        </div>
        {tieneDescuento && (
          <div className="tx-price-old">{formatMoney(p.precio_base, cur)}</div>
        )}
        <div className={`tienda-card-stock ${enStock ? "" : "out"}`}>
          {enStock ? (p.stock > 0 ? `${p.stock} disponibles` : "Disponible bajo pedido") : "Agotado"}
        </div>
        <div className="tienda-card-actions">
          <button
            className={`tienda-btn ${added ? "tienda-btn-added" : "tienda-btn-primary"}`}
            disabled={!enStock}
            onClick={handleAdd}
          >
            {added ? (<><Check size={14} /> Agregado</>) : (<><ShoppingCart size={14} /> Agregar</>)}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function TiendaHomePage() {
  return <TiendaShell><HomeInner /></TiendaShell>;
}
