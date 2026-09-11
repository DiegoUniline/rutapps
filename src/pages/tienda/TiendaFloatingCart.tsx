import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { cartLineKey, formatMoney, useTienda } from "@/tienda/TiendaContext";
import { useThumb } from "@/hooks/useThumb";

export default function TiendaFloatingCart() {
  const t = useTienda();
  const loc = useLocation();
  const thumb = useThumb();
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const prevCount = useRef(t.cartCount);
  const moneda = t.empresa?.moneda ?? "MXN";
  const base = `/tienda/${t.slug}`;

  useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  useEffect(() => {
    if (t.cartCount === prevCount.current) return;
    prevCount.current = t.cartCount;
    setBump(true);
    const id = window.setTimeout(() => setBump(false), 420);
    return () => window.clearTimeout(id);
  }, [t.cartCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hideOnAuthScreen = loc.pathname.endsWith("/login") || loc.pathname.endsWith("/cambiar-password");
  if (hideOnAuthScreen) return null;

  return (
    <>
      <button
        type="button"
        className={`tx-floating-cart ${t.cartCount > 0 ? "has-items" : ""} ${bump ? "is-bumping" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={`Abrir carrito. ${t.cartCount} productos`}
      >
        <span className="tx-floating-cart-icon">
          <ShoppingCart size={21} />
          <span className="tx-floating-cart-count">{t.cartCount}</span>
        </span>
        <span className="tx-floating-cart-copy">
          <small>Mi carrito</small>
          <strong>
            {t.cartCount > 0
              ? `${t.cartCount} ${t.cartCount === 1 ? "producto" : "productos"} · ${formatMoney(t.cartTotal, moneda)}`
              : "Aún está vacío"}
          </strong>
        </span>
        <ChevronLeft size={16} className="tx-floating-cart-arrow" />
      </button>

      {open && (
        <div className="tx-cart-layer" role="presentation">
          <button className="tx-cart-backdrop" aria-label="Cerrar carrito" onClick={() => setOpen(false)} />
          <aside className="tx-cart-drawer" role="dialog" aria-modal="true" aria-label="Mi carrito">
            <div className="tx-cart-drawer-head">
              <div>
                <span className="tx-cart-drawer-kicker">Tu pedido</span>
                <h2>Mi carrito</h2>
              </div>
              <button type="button" className="tx-cart-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            {t.cart.length === 0 ? (
              <div className="tx-cart-empty">
                <span className="tx-cart-empty-icon"><ShoppingCart size={28} /></span>
                <h3>Tu carrito está vacío</h3>
                <p>Agrega productos y podrás revisarlos aquí sin perder tu lugar en la tienda.</p>
                <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary" onClick={() => setOpen(false)}>
                  Explorar productos
                </Link>
              </div>
            ) : (
              <>
                <div className="tx-cart-items">
                  {t.cart.map((item) => {
                    const key = cartLineKey(item);
                    return (
                      <div className="tx-cart-item" key={key}>
                        <div
                          className="tx-cart-item-image"
                          style={item.imagen_url ? { backgroundImage: `url(${thumb(item.imagen_url, 180)})` } : undefined}
                        >
                          {!item.imagen_url && <ShoppingCart size={18} />}
                        </div>
                        <div className="tx-cart-item-main">
                          <div className="tx-cart-item-name">{item.nombre}</div>
                          {item.unidad && <div className="tx-cart-item-unit">{item.unidad}</div>}
                          <div className="tx-cart-item-price">{formatMoney(item.precio_unitario, moneda)}</div>
                          <div className="tx-cart-item-bottom">
                            <div className="tx-cart-qty">
                              <button type="button" onClick={() => t.updateQty(key, item.cantidad - 1)} aria-label="Restar uno">
                                <Minus size={13} />
                              </button>
                              <span>{item.cantidad}</span>
                              <button type="button" onClick={() => t.updateQty(key, item.cantidad + 1)} aria-label="Sumar uno">
                                <Plus size={13} />
                              </button>
                            </div>
                            <button type="button" className="tx-cart-remove" onClick={() => t.removeFromCart(key)} aria-label={`Eliminar ${item.nombre}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <strong className="tx-cart-item-total">{formatMoney(item.precio_unitario * item.cantidad, moneda)}</strong>
                      </div>
                    );
                  })}
                </div>

                <div className="tx-cart-drawer-foot">
                  <div className="tx-cart-summary-line">
                    <span>{t.cartCount} {t.cartCount === 1 ? "producto" : "productos"}</span>
                    <strong>{formatMoney(t.cartTotal, moneda)}</strong>
                  </div>
                  <Link to={`${base}/carrito`} className="tienda-btn tienda-btn-primary tx-cart-checkout" onClick={() => setOpen(false)}>
                    Ver carrito y continuar
                  </Link>
                  <button type="button" className="tx-cart-continue" onClick={() => setOpen(false)}>
                    Seguir comprando
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
