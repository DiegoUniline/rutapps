import { useQuery } from "@tanstack/react-query";
import { fnGet, TiendaProducto, useTienda, formatMoney, expandProductosConPresentaciones } from "@/tienda/TiendaContext";
import { Link } from "react-router-dom";
import {
  ShoppingCart,
  ArrowRight,
  Truck,
  ShieldCheck,
  Headphones,
  Tag,
  Sparkles,
  Flame,
  Award,
  Clock,
  CreditCard,
  Gift,
  Package,
  Phone,
  Check,
  Eye,
} from "lucide-react";
import TiendaShell from "./TiendaShell";
import TiendaQuickViewModal from "./TiendaQuickViewModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { useThumb } from "@/hooks/useThumb";

const CATEGORY_TILES: { match: RegExp; img: string }[] = [
  { match: /botana|snack|fritura|papas/i, img: "/tienda/cat-botanas.webp" },
  { match: /bebida|refresco|agua|jugo|cerveza/i, img: "/tienda/cat-bebidas.webp" },
  { match: /dulce|chocolate|caramelo/i, img: "/tienda/cat-dulces.webp" },
  { match: /abarrote|despensa|grocer|enlatado/i, img: "/tienda/cat-abarrotes.webp" },
];

const BENEFIT_ICONS: Record<string, any> = {
  truck: Truck,
  tag: Tag,
  shield: ShieldCheck,
  headphones: Headphones,
  award: Award,
  clock: Clock,
  card: CreditCard,
  gift: Gift,
  package: Package,
  phone: Phone,
};

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

  const categorias: { nombre: string; imagen_url: string | null }[] = (data?.categorias ?? []).map((c: any) =>
    typeof c === "string" ? { nombre: c, imagen_url: null } : { nombre: c.nombre, imagen_url: c.imagen_url ?? null },
  );

  const seleccionPrincipal = useMemo(() => productos.slice(0, 10), [productos]);
  const seleccionSecundaria = useMemo(() => productos.slice(10, 20), [productos]);
  const ofertas = useMemo(
    () => productos.filter((p) => p.precio_base && p.precio < p.precio_base).slice(0, 10),
    [productos],
  );

  const beneficios = (t.config?.beneficios ?? []).filter((b) => b.enabled).slice(0, 4);
  const moneda = t.empresa?.moneda ?? "MXN";
  const banner = t.config?.banner_url || "/tienda/tienda-banner.webp";

  return (
    <main className="tienda-container tx-home">
      <section className="tx-commerce-hero">
        <div className="tx-hero" style={{ backgroundImage: `url(${banner})` }}>
          <div className="tx-hero-shade" />
          <div className="tx-hero-content">
            <span className="tx-hero-eyebrow">
              <Sparkles size={14} /> Compra en línea
            </span>
            <h1>{t.config?.mensaje_bienvenida || `Todo lo que necesitas de ${t.config?.nombre_tienda}`}</h1>
            <p>
              {t.isAuth
                ? `Estás viendo tu lista de precios ${data?.lista_nombre ?? "asignada"}. Agrega productos y arma tu pedido en minutos.`
                : "Explora el catálogo, agrega lo que necesitas y arma tu pedido sin llamadas ni capturas manuales."}
            </p>
            <div className="tx-hero-cta">
              <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary">
                Ver productos <ArrowRight size={16} />
              </Link>
              {!t.isAuth && (
                <Link to={`${base}/login`} className="tienda-btn tienda-btn-outline" style={{ background: "rgba(255,255,255,.94)" }}>
                  Ver precios de cliente
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="tx-commerce-side">
          {t.isAuth ? (
            <Link to={`${base}?vista=pedido-sugerido`} className="tx-side-card tx-side-card-accent">
              <span className="tx-side-kicker">Compra inteligente</span>
              <strong>Tu pedido sugerido listo para revisar</strong>
              <span className="tx-side-link">Abrir sugerido <ArrowRight size={13} /></span>
            </Link>
          ) : (
            <Link to={`${base}/login`} className="tx-side-card tx-side-card-accent">
              <span className="tx-side-kicker">Clientes registrados</span>
              <strong>Accede a tu lista de precios y condiciones</strong>
              <span className="tx-side-link">Iniciar sesión <ArrowRight size={13} /></span>
            </Link>
          )}

          <Link to={`${base}/productos`} className="tx-side-card">
            <span className="tx-side-kicker">Catálogo completo</span>
            <strong>{productos.length > 0 ? `${productos.length} opciones para tu siguiente pedido` : "Encuentra productos por categoría"}</strong>
            <span className="tx-side-link">Explorar catálogo <ArrowRight size={13} /></span>
          </Link>
        </div>
      </section>

      {beneficios.length > 0 && (
        <section className="tx-benefits" aria-label="Beneficios de compra">
          {beneficios.map((b, i) => {
            const Ic = BENEFIT_ICONS[b.icon] ?? Sparkles;
            return (
              <div key={`${b.title}-${i}`} className="tx-benefit">
                <Ic size={18} />
                <div>
                  <strong>{b.title}</strong>
                  <span>{b.subtitle}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {categorias.length > 0 && (
        <section>
          <div className="tx-section-head">
            <div className="tx-section-head-copy">
              <h2>Compra por categoría</h2>
            </div>
            <Link to={`${base}/productos`} className="tx-link">Ver todas <ArrowRight size={14} /></Link>
          </div>
          <div className="tx-categories-rail">
            {categorias.slice(0, 10).map((c) => {
              const img = c.imagen_url || pickTile(c.nombre)?.img;
              return (
                <Link
                  key={c.nombre}
                  to={`${base}/productos?cat=${encodeURIComponent(c.nombre)}`}
                  className="tx-category-pill"
                  title={c.nombre}
                >
                  {img ? (
                    <img src={img} alt="" className="tx-category-image" loading="lazy" />
                  ) : (
                    <span className="tx-category-fallback"><Package size={20} /></span>
                  )}
                  <span>{c.nombre}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="tx-section-head">
          <div className="tx-section-head-copy">
            <h2>Explora productos</h2>
          </div>
          <Link to={`${base}/productos`} className="tx-link">Ver catálogo <ArrowRight size={14} /></Link>
        </div>

        {isLoading ? (
          <div className="tienda-loading">Cargando productos…</div>
        ) : seleccionPrincipal.length === 0 ? (
          <div className="tienda-empty">Aún no hay productos en esta tienda.</div>
        ) : (
          <div className="tienda-products">
            {seleccionPrincipal.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} />)}
          </div>
        )}
      </section>

      {ofertas.length > 0 && (
        <section className="tx-offer-zone">
          <div className="tx-section-head">
            <div className="tx-section-head-copy">
              <Flame size={19} />
              <h2>Precios especiales</h2>
            </div>
            <Link to={`${base}/productos`} className="tx-link">Ver más <ArrowRight size={14} /></Link>
          </div>
          <div className="tx-products-horizontal">
            {ofertas.map((p) => (
              <ProductCard key={p.id} p={p} moneda={moneda} highlight="oferta" variant="offer" />
            ))}
          </div>
        </section>
      )}

      <section className="tx-business-callout">
        <div>
          <h3>{t.isAuth ? "Haz tu siguiente pedido más rápido" : "¿Compras para tu negocio?"}</h3>
          <p>
            {t.isAuth
              ? "Revisa tu pedido sugerido y vuelve a surtirte sin recorrer todo el catálogo desde cero."
              : "Inicia sesión para consultar tu lista de precios, condiciones comerciales y herramientas de compra para clientes."}
          </p>
        </div>
        <Link to={t.isAuth ? `${base}?vista=pedido-sugerido` : `${base}/login`} className="tienda-btn">
          {t.isAuth ? "Ver pedido sugerido" : "Acceder como cliente"} <ArrowRight size={15} />
        </Link>
      </section>

      {seleccionSecundaria.length > 0 && (
        <section>
          <div className="tx-section-head">
            <div className="tx-section-head-copy">
              <h2>Más para agregar a tu pedido</h2>
            </div>
            <Link to={`${base}/productos`} className="tx-link">Explorar todo <ArrowRight size={14} /></Link>
          </div>
          <div className="tx-products-horizontal">
            {seleccionSecundaria.map((p) => <ProductCard key={p.id} p={p} moneda={moneda} variant="new" />)}
          </div>
        </section>
      )}
    </main>
  );
}

type ProductCardProps = {
  p: TiendaProducto;
  moneda?: string;
  highlight?: "oferta" | "nuevo";
  variant?: "standard" | "offer" | "new";
};

export function ProductCard({ p, moneda, highlight, variant = "standard" }: ProductCardProps) {
  const thumb = useThumb();
  const t = useTienda();
  const [added, setAdded] = useState(false);
  const [flyBurst, setFlyBurst] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const enStock = p.stock > 0 || p.vender_sin_stock;
  const cur = moneda ?? t.empresa?.moneda ?? "MXN";
  const tieneDescuento = p.precio_base && p.precio < p.precio_base;
  const pct = tieneDescuento ? Math.round(((p.precio_base - p.precio) / p.precio_base) * 100) : 0;
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
    <>
      <article className={`tienda-card tienda-card--${variant} ${added ? "tx-card-added" : ""}`}>
        {(highlight || tieneDescuento) && (
          <div className={`tx-badge ${highlight === "nuevo" ? "tx-badge-new" : "tx-badge-sale"}`}>
            {highlight === "nuevo" ? "Nuevo" : tieneDescuento ? `-${pct}%` : "Oferta"}
          </div>
        )}
        <Link
          to={detalleHref}
          className="tienda-card-img"
          style={p.imagen_url ? { backgroundImage: `url(${thumb(p.imagen_url, 400)})` } : {}}
          aria-label={`Ver ${p.nombre}`}
        >
          {!p.imagen_url && <div className="tienda-card-img-placeholder">📦</div>}
          {flyBurst > 0 && <span key={flyBurst} className="tx-fly-burst" aria-hidden>+1</span>}
        </Link>
        <button
          type="button"
          className="tx-quick-view-trigger"
          onClick={() => setQuickOpen(true)}
          aria-label={`Vista rápida de ${p.nombre}`}
          title="Vista rápida"
        >
          <Eye size={16} />
        </button>
        <div className="tienda-card-body">
          {p.marca ? <div className="tienda-card-brand">{p.marca}</div> : <div className="tienda-card-brand" aria-hidden>&nbsp;</div>}
          <Link to={detalleHref} className="tienda-card-name" style={{ color: "inherit", textDecoration: "none" }}>
            {p.nombre}
          </Link>
          <div className="tienda-card-price">
            {formatMoney(p.precio, cur)}
            {p.unidad_venta && <small> / {p.unidad_venta}</small>}
          </div>
          {tieneDescuento && <div className="tx-price-old">{formatMoney(p.precio_base, cur)}</div>}
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
      </article>
      {quickOpen && <TiendaQuickViewModal product={p} moneda={cur} onClose={() => setQuickOpen(false)} />}
    </>
  );
}

export default function TiendaHomePage() {
  return <TiendaShell><HomeInner /></TiendaShell>;
}
