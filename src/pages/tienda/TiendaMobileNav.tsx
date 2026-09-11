import { Home, ShoppingCart, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTienda } from "@/tienda/TiendaContext";

export default function TiendaMobileNav() {
  const t = useTienda();
  const loc = useLocation();
  const nav = useNavigate();
  const base = `/tienda/${t.slug}`;

  const hidden = loc.pathname.endsWith("/login") || loc.pathname.endsWith("/cambiar-password");
  if (hidden) return null;

  const openCart = () => {
    const trigger = document.querySelector<HTMLButtonElement>(".tx-floating-cart");
    if (trigger) trigger.click();
    else nav(`${base}/carrito`);
  };

  const openSeller = () => {
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Hablar con "]');
    trigger?.click();
  };

  const homeActive = loc.pathname === base && !new URLSearchParams(loc.search).get("vista");
  const cartActive = loc.pathname.endsWith("/carrito");

  return (
    <nav className="tx-mobile-nav" aria-label="Navegación móvil de la tienda">
      <button
        type="button"
        className={`tx-mobile-nav-item ${homeActive ? "active" : ""}`}
        onClick={() => nav(base)}
        aria-label="Ir al inicio"
      >
        <Home size={21} />
        <span>Inicio</span>
      </button>

      <button
        type="button"
        className={`tx-mobile-nav-item ${cartActive ? "active" : ""}`}
        onClick={openCart}
        aria-label={`Abrir carrito, ${t.cartCount} productos`}
      >
        <span className="tx-mobile-nav-icon-wrap">
          <ShoppingCart size={21} />
          {t.cartCount > 0 && <strong className="tx-mobile-nav-badge">{t.cartCount}</strong>}
        </span>
        <span>Carrito</span>
      </button>

      <button
        type="button"
        className="tx-mobile-nav-item tx-mobile-nav-seller"
        onClick={openSeller}
        aria-label="Abrir vendedor virtual"
      >
        <span className="tx-mobile-nav-seller-icon"><Sparkles size={20} /></span>
        <span>Vendedor virtual</span>
      </button>
    </nav>
  );
}
