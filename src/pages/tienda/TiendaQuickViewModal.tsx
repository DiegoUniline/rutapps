import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney, TiendaProducto, useTienda } from "@/tienda/TiendaContext";
import { useThumb } from "@/hooks/useThumb";

export default function TiendaQuickViewModal({
  product,
  moneda,
  onClose,
}: {
  product: TiendaProducto | null;
  moneda?: string;
  onClose: () => void;
}) {
  const t = useTienda();
  const thumb = useThumb();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    setQty(1);
    setAdded(false);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  if (!product) return null;

  const cur = moneda ?? t.empresa?.moneda ?? "MXN";
  const enStock = product.stock > 0 || product.vender_sin_stock;
  const tieneDescuento = product.precio_base && product.precio < product.precio_base;
  const realId = product.id.includes("::") ? product.id.split("::")[0] : product.id;
  const detalleHref = `/tienda/${t.slug}/producto/${realId}`;

  const add = () => {
    if (!enStock) return;
    t.addToCart({
      producto_id: realId,
      nombre: product.nombre,
      imagen_url: product.imagen_url,
      precio_unitario: product.precio,
      cantidad: qty,
      unidad: product.unidad_venta,
      presentacion_id: product._pres ? product._pres.id : null,
      factor_base: product._pres ? product._pres.factor_base : 1,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="tx-quick-layer" role="presentation">
      <button className="tx-quick-backdrop" aria-label="Cerrar vista rápida" onClick={onClose} />
      <section className="tx-quick-modal" role="dialog" aria-modal="true" aria-label={`Vista rápida de ${product.nombre}`}>
        <button type="button" className="tx-quick-close" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>

        <div className="tx-quick-image-wrap">
          {product.imagen_url ? (
            <img src={thumb(product.imagen_url, 700)} alt={product.nombre} className="tx-quick-image" />
          ) : (
            <div className="tx-quick-image-fallback">📦</div>
          )}
          {tieneDescuento && <span className="tx-quick-sale">Oferta</span>}
        </div>

        <div className="tx-quick-info">
          {product.marca && <div className="tx-quick-brand">{product.marca}</div>}
          <h2>{product.nombre}</h2>
          {product.descripcion && <p className="tx-quick-description">{product.descripcion}</p>}

          <div className="tx-quick-price-row">
            <strong>{formatMoney(product.precio, cur)}</strong>
            {tieneDescuento && <span>{formatMoney(product.precio_base, cur)}</span>}
          </div>

          <div className={`tx-quick-stock ${enStock ? "" : "out"}`}>
            {enStock
              ? product.stock > 0
                ? `${product.stock} disponibles`
                : "Disponible bajo pedido"
              : "Agotado"}
          </div>

          {product.unidad_venta && <div className="tx-quick-unit">Presentación: <strong>{product.unidad_venta}</strong></div>}

          <div className="tx-quick-buy-row">
            <div className="tx-quick-qty">
              <button type="button" onClick={() => setQty((v) => Math.max(1, v - 1))} aria-label="Restar uno">
                <Minus size={14} />
              </button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty((v) => v + 1)} aria-label="Sumar uno">
                <Plus size={14} />
              </button>
            </div>
            <button
              type="button"
              className={`tienda-btn ${added ? "tienda-btn-added" : "tienda-btn-primary"} tx-quick-add`}
              disabled={!enStock}
              onClick={add}
            >
              {added ? <><Check size={16} /> Agregado</> : <><ShoppingCart size={16} /> Agregar al carrito</>}
            </button>
          </div>

          <Link to={detalleHref} className="tx-quick-detail" onClick={onClose}>
            Ver información completa del producto
          </Link>
        </div>
      </section>
    </div>
  );
}
