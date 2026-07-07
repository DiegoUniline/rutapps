import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fnPost, formatMoney, useTienda, cartLineKey } from "@/tienda/TiendaContext";
import { Trash2, ChevronDown, ChevronUp, ShoppingBag, Package } from "lucide-react";
import TiendaShell from "./TiendaShell";

function Inner() {
  const t = useTienda();
  const nav = useNavigate();
  const [notas, setNotas] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okFolio, setOkFolio] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const base = `/tienda/${t.slug}`;

  const checkout = async () => {
    if (!t.isAuth) {
      nav(`${base}/login?next=carrito`);
      return;
    }
    setLoading(true); setErr(null);
    try {
      const res = await fnPost("tienda-checkout", {
        slug: t.slug,
        token: t.token,
        items: t.cart.map((c) => ({ producto_id: c.producto_id, cantidad: c.cantidad, precio_unitario: c.precio_unitario, presentacion_id: c.presentacion_id ?? null })),
        notas,
        fecha_entrega: fechaEntrega || null,
      });
      setOkFolio(res.folio);
      t.clearCart();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (okFolio) {
    return (
      <main className="tienda-container">
        <div className="tienda-auth-card" style={{ textAlign: "center" }}>
          <h2>¡Pedido enviado! 🎉</h2>
          <p className="sub">Tu pedido <strong>{okFolio}</strong> fue recibido. Te contactaremos para confirmar.</p>
          <Link to={`${base}/mis-pedidos`} className="tienda-btn tienda-btn-primary tienda-btn-block">Ver mis pedidos</Link>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-block" style={{ marginTop: 8 }}>Seguir comprando</Link>
        </div>
      </main>
    );
  }

  if (t.cart.length === 0) {
    return (
      <main className="tienda-container">
        <div className="tienda-empty">
          <ShoppingBag size={48} style={{ color: "#c9ccd1", margin: "0 auto 12px" }} />
          <h2>Tu carrito está vacío</h2>
          <p>Explora el catálogo y agrega productos.</p>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary">Ver catálogo</Link>
        </div>
      </main>
    );
  }

  const moneda = t.empresa?.moneda ?? "MXN";

  return (
    <main className="tienda-container tienda-cart-mobile-pad">
      {/* Encabezado claro con conteo */}
      <div className="tienda-cart-header">
        <div>
          <h2 className="tienda-section-title" style={{ margin: 0 }}>Mi carrito</h2>
          <p className="tienda-cart-subtitle">
            {t.cartCount} {t.cartCount === 1 ? "artículo" : "artículos"} · Desliza para ver, editar o eliminar
          </p>
        </div>
        <div className="tienda-cart-count-badge">
          <ShoppingBag size={16} />
          <span>{t.cartCount}</span>
        </div>
      </div>

      <div className="tienda-cart-page">
        <div className="tienda-cart-list">
          {t.cart.map((c) => {
            const lk = cartLineKey(c);
            return (
            <div className="tienda-cart-row" key={lk}>
              {c.imagen_url ? (
                <img src={c.imagen_url} alt={c.nombre} />
              ) : (
                <div className="tienda-cart-row-img-fallback"><Package size={24} /></div>
              )}
              <div>
                <div className="name">{c.nombre}</div>
                <div className="price">
                  {formatMoney(c.precio_unitario, moneda)} {c.unidad && `/ ${c.unidad}`}
                  {c.presentacion_id && c.factor_base ? <span style={{ color: "#888" }}> · {c.factor_base} pz c/u</span> : null}
                </div>
                <div className="tienda-cart-row-subtotal">
                  Subtotal: <strong>{formatMoney(c.precio_unitario * c.cantidad, moneda)}</strong>
                </div>
              </div>
              <div className="tienda-qty">
                <button onClick={() => t.updateQty(lk, c.cantidad - 1)} aria-label="Disminuir">−</button>
                <input value={c.cantidad} onChange={(e) => t.updateQty(lk, Number(e.target.value) || 0)} />
                <button onClick={() => t.updateQty(lk, c.cantidad + 1)} aria-label="Aumentar">+</button>
              </div>
              <div className="tienda-cart-row-actions">
                <div className="tienda-cart-row-total-desktop">{formatMoney(c.precio_unitario * c.cantidad, moneda)}</div>
                <button className="tienda-btn tienda-btn-ghost" onClick={() => t.removeFromCart(lk)} title="Quitar">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            );
          })}

          {/* Acción seguir comprando - visible en móvil al final del listado */}
          <div className="tienda-cart-keep-shopping">
            <Link to={`${base}/productos`} className="tienda-btn tienda-btn-outline tienda-btn-block">
              ← Seguir comprando
            </Link>
          </div>
        </div>

        {/* Resumen — desktop sticky / móvil bottom sheet */}
        <div className={`tienda-cart-summary ${summaryOpen ? "is-open" : ""}`}>
          {/* Handle visible solo en móvil */}
          <button
            type="button"
            className="tienda-cart-summary-handle"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-label={summaryOpen ? "Contraer resumen" : "Expandir resumen"}
          >
            <span className="tienda-cart-summary-grip" />
            <div className="tienda-cart-summary-handle-info">
              <span className="label">{t.cartCount} {t.cartCount === 1 ? "producto" : "productos"}</span>
              <strong>{formatMoney(t.cartTotal, moneda)}</strong>
            </div>
            {summaryOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>

          <div className="tienda-cart-summary-body">
            <h3 style={{ marginTop: 0 }}>Resumen</h3>
            <div className="line"><span>Productos</span><span>{t.cartCount}</span></div>
            <div className="line"><span>Subtotal</span><span>{formatMoney(t.cartTotal, moneda)}</span></div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>IVA e IEPS se calculan al confirmar el pedido.</div>
            <div className="line total"><span>Total estimado</span><span>{formatMoney(t.cartTotal, moneda)}</span></div>

            <div className="tienda-field" style={{ marginTop: 14 }}>
              <label>Fecha de entrega deseada (opcional)</label>
              <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </div>
            <div className="tienda-field">
              <label>Notas para el vendedor</label>
              <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Instrucciones, dirección, horarios…" />
            </div>

            {err && <div className="tienda-error">{err}</div>}
            {!t.isAuth && <div className="tienda-error">Inicia sesión para enviar tu pedido.</div>}
          </div>

          {/* CTA siempre visible */}
          <div className="tienda-cart-summary-cta">
            <button className="tienda-btn tienda-btn-secondary tienda-btn-block" onClick={checkout} disabled={loading}>
              {loading ? "Enviando…" : t.isAuth ? `Enviar pedido · ${formatMoney(t.cartTotal, moneda)}` : "Iniciar sesión para continuar"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function TiendaCarritoPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
