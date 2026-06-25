import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fnPost, formatMoney, useTienda } from "@/tienda/TiendaContext";
import { Trash2 } from "lucide-react";
import TiendaShell from "./TiendaShell";

function Inner() {
  const t = useTienda();
  const nav = useNavigate();
  const [notas, setNotas] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okFolio, setOkFolio] = useState<string | null>(null);
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
        items: t.cart.map((c) => ({ producto_id: c.producto_id, cantidad: c.cantidad, precio_unitario: c.precio_unitario })),
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
          <h2>Tu carrito está vacío</h2>
          <p>Explora el catálogo y agrega productos.</p>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary">Ver catálogo</Link>
        </div>
      </main>
    );
  }

  const moneda = t.empresa?.moneda ?? "MXN";

  return (
    <main className="tienda-container">
      <h2 className="tienda-section-title" style={{ marginTop: 0 }}>Mi carrito</h2>
      <div className="tienda-cart-page">
        <div className="tienda-cart-list">
          {t.cart.map((c) => (
            <div className="tienda-cart-row" key={c.producto_id}>
              {c.imagen_url ? <img src={c.imagen_url} alt={c.nombre} /> : <div style={{ width: 80, height: 80, background: "#f5f6fa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>📦</div>}
              <div>
                <div className="name">{c.nombre}</div>
                <div className="price">{formatMoney(c.precio_unitario, moneda)} {c.unidad && `/ ${c.unidad}`}</div>
              </div>
              <div className="tienda-qty">
                <button onClick={() => t.updateQty(c.producto_id, c.cantidad - 1)}>−</button>
                <input value={c.cantidad} onChange={(e) => t.updateQty(c.producto_id, Number(e.target.value) || 0)} />
                <button onClick={() => t.updateQty(c.producto_id, c.cantidad + 1)}>+</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>{formatMoney(c.precio_unitario * c.cantidad, moneda)}</div>
                <button className="tienda-btn tienda-btn-ghost" onClick={() => t.removeFromCart(c.producto_id)} title="Quitar"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="tienda-cart-summary">
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

          <button className="tienda-btn tienda-btn-secondary tienda-btn-block" onClick={checkout} disabled={loading}>
            {loading ? "Enviando…" : t.isAuth ? "Enviar pedido" : "Iniciar sesión para continuar"}
          </button>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-block" style={{ marginTop: 8 }}>Seguir comprando</Link>
        </div>
      </div>
    </main>
  );
}

export default function TiendaCarritoPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
