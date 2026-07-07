import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fnGet, TiendaProducto, useTienda, formatMoney } from "@/tienda/TiendaContext";
import { ProductCard } from "./TiendaHomePage";
import TiendaShell from "./TiendaShell";
import TiendaPresentacionModal from "./TiendaPresentacionModal";
import { ShoppingCart, ChevronLeft, Minus, Plus, ShieldCheck, Truck, Tag } from "lucide-react";

function Inner() {
  const t = useTienda();
  const { productoId } = useParams<{ productoId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const base = `/tienda/${t.slug}`;
  const [qty, setQty] = useState(1);
  const [presOpen, setPresOpen] = useState(false);

  // Build placeholder from existing catalog cache (instant render if user came from home/list)
  const catalog: any = qc.getQueryData(["tienda-catalog", t.slug, t.token]);
  const placeholderProducto: TiendaProducto | undefined = catalog?.productos?.find?.((x: TiendaProducto) => x.id === productoId);
  const placeholder = placeholderProducto && {
    producto: placeholderProducto,
    relacionados: (catalog?.productos ?? []).filter((x: TiendaProducto) => x.id !== productoId && x.categoria && x.categoria === placeholderProducto.categoria).slice(0, 10),
    tambien_compraron: (catalog?.productos ?? []).filter((x: TiendaProducto) => x.id !== productoId).slice(0, 10),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["tienda-producto", t.slug, productoId, t.token],
    queryFn: () => fnGet("tienda-producto", { slug: t.slug, producto_id: productoId!, ...(t.token ? { token: t.token } : {}) }),
    enabled: !!productoId,
    placeholderData: placeholder,
    staleTime: 60_000,
  });

  const p: TiendaProducto | undefined = data?.producto;
  const moneda = t.empresa?.moneda ?? "MXN";
  const relacionados: TiendaProducto[] = data?.relacionados ?? [];
  const tambienCompraron: TiendaProducto[] = data?.tambien_compraron ?? [];

  if (!p && isLoading) return (
    <main className="tienda-container">
      <div className="tx-pdp">
        <div className="tx-pdp-gallery"><div className="tx-pdp-image tx-skeleton" /></div>
        <div className="tx-pdp-info">
          <div className="tx-skeleton" style={{ height: 14, width: 120, marginBottom: 12 }} />
          <div className="tx-skeleton" style={{ height: 28, width: "80%", marginBottom: 16 }} />
          <div className="tx-skeleton" style={{ height: 36, width: 160, marginBottom: 16 }} />
          <div className="tx-skeleton" style={{ height: 48, width: "100%" }} />
        </div>
      </div>
    </main>
  );
  if (!p) return (
    <main className="tienda-container">
      <div className="tienda-empty">Producto no encontrado.</div>
      <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary" style={{ marginTop: 16 }}>Volver al catálogo</Link>
    </main>
  );

  const enStock = p.stock > 0 || p.vender_sin_stock;
  const tienePresentaciones = (p.presentaciones?.length ?? 0) > 0;
  const tieneDescuento = p.precio_base && p.precio < p.precio_base;
  const pct = tieneDescuento ? Math.round(((p.precio_base - p.precio) / p.precio_base) * 100) : 0;

  return (
    <main className="tienda-container">
      <button onClick={() => nav(-1)} className="tx-back-btn"><ChevronLeft size={16}/> Regresar</button>

      <div className="tx-pdp">
        <div className="tx-pdp-gallery">
          <div className="tx-pdp-image" style={p.imagen_url ? { backgroundImage: `url(${p.imagen_url})` } : {}}>
            {!p.imagen_url && <div className="tienda-card-img-placeholder">📦</div>}
            {tieneDescuento && <div className="tx-badge tx-badge-sale" style={{ position: "absolute", top: 16, left: 16 }}>-{pct}%</div>}
          </div>
        </div>

        <div className="tx-pdp-info">
          {p.marca && <div className="tienda-card-brand">{p.marca}</div>}
          <h1 className="tx-pdp-title">{p.nombre}</h1>
          {p.sku && <div className="tx-pdp-sku">SKU: {p.sku}</div>}
          {p.categoria && (
            <Link to={`${base}/productos?cat=${encodeURIComponent(p.categoria)}`} className="tx-pdp-cat">
              <Tag size={12}/> {p.categoria}
            </Link>
          )}

          <div className="tx-pdp-price-block">
            <div className="tx-pdp-price">{formatMoney(p.precio, moneda)}{p.unidad_venta && <small> / {p.unidad_venta}</small>}</div>
            {tieneDescuento && <div className="tx-price-old" style={{ fontSize: 16 }}>{formatMoney(p.precio_base, moneda)}</div>}
          </div>

          <div className={`tienda-card-stock ${enStock ? "" : "out"}`} style={{ marginBottom: 16 }}>
            {enStock ? (p.stock > 0 ? `${p.stock} disponibles` : "Disponible bajo pedido") : "Agotado"}
          </div>

          {enStock && (
            tienePresentaciones ? (
              <button
                className="tienda-btn tienda-btn-primary"
                style={{ width: "100%" }}
                onClick={() => setPresOpen(true)}
              >
                <ShoppingCart size={16}/> Elegir presentación
              </button>
            ) : (
              <div className="tx-pdp-qty-row">
                <div className="tx-pdp-qty">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus size={14}/></button>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                  <button onClick={() => setQty((q) => q + 1)}><Plus size={14}/></button>
                </div>
                <button
                  className="tienda-btn tienda-btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    t.addToCart({
                      producto_id: p.id,
                      nombre: p.nombre,
                      imagen_url: p.imagen_url,
                      precio_unitario: p.precio,
                      cantidad: qty,
                      unidad: p.unidad_venta,
                    });
                  }}
                >
                  <ShoppingCart size={16}/> Agregar al carrito
                </button>
              </div>
            )
          )}

          <div className="tx-pdp-perks">
            <div><Truck size={16}/> Envío a domicilio</div>
            <div><ShieldCheck size={16}/> Compra protegida</div>
            <div><Tag size={16}/> Precios especiales para clientes registrados</div>
          </div>

          {p.descripcion && (
            <div className="tx-pdp-desc">
              <h3>Descripción</h3>
              <p>{p.descripcion}</p>
            </div>
          )}
        </div>
      </div>

      {relacionados.length > 0 && (
        <>
          <div className="tx-section-head"><h2>Productos relacionados</h2></div>
          <div className="tienda-products">
            {relacionados.map((r) => <ProductCard key={r.id} p={r} moneda={moneda} />)}
          </div>
        </>
      )}

      {tambienCompraron.length > 0 && (
        <>
          <div className="tx-section-head"><h2>Otros clientes también compraron</h2></div>
          <div className="tienda-products">
            {tambienCompraron.map((r) => <ProductCard key={r.id} p={r} moneda={moneda} />)}
          </div>
        </>
      )}

      {presOpen && <TiendaPresentacionModal producto={p} moneda={moneda} onClose={() => setPresOpen(false)} />}
    </main>
  );
}

export default function TiendaProductoPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
