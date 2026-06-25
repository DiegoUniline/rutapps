import { useQuery } from "@tanstack/react-query";
import { fnGet, TiendaProducto, useTienda, formatMoney } from "@/tienda/TiendaContext";
import { Link } from "react-router-dom";
import { ShoppingCart, ArrowRight } from "lucide-react";
import TiendaShell from "./TiendaShell";

function HomeInner() {
  const t = useTienda();
  const base = `/tienda/${t.slug}`;
  const { data, isLoading } = useQuery({
    queryKey: ["tienda-catalog", t.slug, t.token],
    queryFn: () => fnGet("tienda-catalog", { slug: t.slug, ...(t.token ? { token: t.token } : {}) }),
    staleTime: 60_000,
  });

  const productos: TiendaProducto[] = data?.productos ?? [];
  const destacados = productos.slice(0, 8);
  const categorias: string[] = data?.categorias ?? [];

  const heroStyle = t.config?.banner_url ? { backgroundImage: `url(${t.config.banner_url})` } : {};

  return (
    <main className="tienda-container">
      <div className={`tienda-hero ${t.config?.banner_url ? "has-banner" : ""}`} style={heroStyle}>
        {t.config?.banner_url && <div className="tienda-hero-overlay" />}
        <div className="tienda-hero-content">
          <h1>{t.config?.mensaje_bienvenida || `Bienvenido a ${t.config?.nombre_tienda}`}</h1>
          <p>{t.isAuth ? `Tu lista de precios: ${data?.lista_nombre ?? "Estándar"}` : "Inicia sesión para ver tus precios personalizados."}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to={`${base}/productos`} className="tienda-btn tienda-btn-secondary">
              Ver catálogo <ArrowRight size={16} />
            </Link>
            {!t.isAuth && (
              <Link to={`${base}/login`} className="tienda-btn">Iniciar sesión</Link>
            )}
          </div>
        </div>
      </div>

      {categorias.length > 0 && (
        <>
          <h2 className="tienda-section-title">Categorías</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
            {categorias.slice(0, 12).map((c) => (
              <Link key={c} to={`${base}/productos?cat=${encodeURIComponent(c)}`} className="tienda-nav-chip">
                {c}
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="tienda-section-title">Productos destacados</h2>
      {isLoading ? (
        <div className="tienda-loading">Cargando productos…</div>
      ) : destacados.length === 0 ? (
        <div className="tienda-empty">Aún no hay productos en esta tienda.</div>
      ) : (
        <div className="tienda-products">
          {destacados.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </main>
  );
}

export function ProductCard({ p }: { p: TiendaProducto }) {
  const t = useTienda();
  const enStock = p.stock > 0 || p.vender_sin_stock;
  return (
    <div className="tienda-card">
      <div
        className="tienda-card-img"
        style={p.imagen_url ? { backgroundImage: `url(${p.imagen_url})` } : {}}
      >
        {!p.imagen_url && <div className="tienda-card-img-placeholder">📦</div>}
      </div>
      <div className="tienda-card-body">
        {p.marca && <div className="tienda-card-brand">{p.marca}</div>}
        <div className="tienda-card-name">{p.nombre}</div>
        <div className="tienda-card-price">
          {formatMoney(p.precio, t.empresa?.moneda ?? "MXN")}
          {p.unidad_venta && <small> / {p.unidad_venta}</small>}
        </div>
        <div className={`tienda-card-stock ${enStock ? "" : "out"}`}>
          {enStock ? (p.stock > 0 ? `${p.stock} disponibles` : "Disponible bajo pedido") : "Agotado"}
        </div>
        <div className="tienda-card-actions">
          <button
            className="tienda-btn tienda-btn-primary"
            disabled={!enStock}
            onClick={() => t.addToCart({
              producto_id: p.id,
              nombre: p.nombre,
              imagen_url: p.imagen_url,
              precio_unitario: p.precio,
              cantidad: 1,
              unidad: p.unidad_venta,
            })}
          >
            <ShoppingCart size={14} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TiendaHomePage() {
  return <TiendaShell><HomeInner /></TiendaShell>;
}
