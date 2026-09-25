import { useEffect, useState } from "react";
import { Home, ShoppingCart, Sparkles, User, Package, KeyRound, LogOut } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTienda } from "@/tienda/TiendaContext";
import { Button } from "@/components/ui/button";

export default function TiendaMobileNav() {
  const t = useTienda();
  const loc = useLocation();
  const nav = useNavigate();
  const base = `/tienda/${t.slug}`;
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => { setAccountOpen(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!accountOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen]);

  const hidden = loc.pathname.endsWith("/login") || loc.pathname.endsWith("/cambiar-password") || loc.pathname.endsWith("/carrito");
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
      {accountOpen && <div className="tx-mobile-account-backdrop" onClick={() => setAccountOpen(false)} aria-hidden="true" />}
      {accountOpen && t.isAuth && (
        <div className="tienda-account-popover tx-mobile-account-menu" id="tx-mobile-account-menu" role="menu" aria-label="Mi cuenta">
          <div className="tienda-account-email">{t.email}</div>
          <Link to={`${base}?vista=pedido-sugerido`} onClick={() => setAccountOpen(false)} role="menuitem">
            <Sparkles size={15} /> Pedido sugerido
          </Link>
          <Link to={`${base}/mis-pedidos`} onClick={() => setAccountOpen(false)} role="menuitem">
            <Package size={15} /> Mis pedidos
          </Link>
          <Link to={`${base}/cambiar-password`} onClick={() => setAccountOpen(false)} role="menuitem">
            <KeyRound size={15} /> Cambiar contraseña
          </Link>
          <Button variant="ghost" role="menuitem" onClick={() => { setAccountOpen(false); t.logout(); nav(base); }}>
            <LogOut size={15} /> Cerrar sesión
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        type="button"
        className={`tx-mobile-nav-item ${homeActive ? "active" : ""}`}
        onClick={() => { setAccountOpen(false); nav(base); }}
        aria-label="Ir al inicio"
      >
        <Home size={21} />
        <span>Inicio</span>
      </Button>

      <Button
        variant="ghost"
        type="button"
        className={`tx-mobile-nav-item ${cartActive ? "active" : ""}`}
        onClick={() => { setAccountOpen(false); openCart(); }}
        aria-label={`Abrir carrito, ${t.cartCount} productos`}
      >
        <span className="tx-mobile-nav-icon-wrap">
          <ShoppingCart size={21} />
          {t.cartCount > 0 && <strong className="tx-mobile-nav-badge">{t.cartCount}</strong>}
        </span>
        <span>Carrito</span>
      </Button>

      <Button
        variant="ghost"
        type="button"
        className="tx-mobile-nav-item tx-mobile-nav-seller"
        onClick={() => { setAccountOpen(false); openSeller(); }}
        aria-label="Abrir vendedor virtual"
      >
        <span className="tx-mobile-nav-seller-icon"><Sparkles size={20} /></span>
        <span>Vendedor virtual</span>
      </Button>

      <Button
        variant="ghost"
        type="button"
        className={`tx-mobile-nav-item ${accountOpen || loc.pathname.endsWith("/mis-pedidos") ? "active" : ""}`}
        onClick={() => t.isAuth ? setAccountOpen((open) => !open) : nav(`${base}/login`)}
        aria-label="Mi cuenta"
        aria-expanded={t.isAuth ? accountOpen : undefined}
        aria-controls={t.isAuth ? "tx-mobile-account-menu" : undefined}
      >
        <User size={21} />
        <span>Cuenta</span>
      </Button>
    </nav>
  );
}
