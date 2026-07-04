import { ReactNode, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingCart, Search, User, LogOut, Package, KeyRound } from "lucide-react";
import { useTienda } from "@/tienda/TiendaContext";
import "@/tienda/tienda.css";

function useTiendaPWA(t: ReturnType<typeof useTienda>) {
  useEffect(() => {
    if (!t.config || !t.slug) return;
    const icon = t.config.logo_url || t.empresa?.logo_url || "/favicon.ico";
    const color = t.config.color_primario || "#0061e8";
    const manifest = {
      name: t.config.nombre_tienda,
      short_name: t.config.nombre_tienda.slice(0, 12),
      description: `Tienda en línea de ${t.config.nombre_tienda}`,
      start_url: `/tienda/${t.slug}`,
      scope: `/tienda/${t.slug}`,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: color,
      icons: [
        { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    const prev = document.querySelector('link[rel="manifest"]')?.cloneNode(true) as HTMLLinkElement | null;
    document.querySelectorAll('link[rel="manifest"]').forEach((n) => n.remove());
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = url;
    link.setAttribute("data-tienda", "1");
    document.head.appendChild(link);

    const theme = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    theme.setAttribute("name", "theme-color");
    theme.setAttribute("content", color);
    if (!theme.parentNode) document.head.appendChild(theme);

    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.href = icon;
    apple.setAttribute("data-tienda", "1");
    document.head.appendChild(apple);

    document.title = t.config.nombre_tienda;

    return () => {
      URL.revokeObjectURL(url);
      document.querySelectorAll('link[data-tienda="1"]').forEach((n) => n.remove());
      if (prev) document.head.appendChild(prev);
    };
  }, [t.config, t.slug, t.empresa?.logo_url]);
}

export default function TiendaLayout({ children }: { children: ReactNode }) {
  const t = useTienda();
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/tienda/${t.slug}`;
  useTiendaPWA(t);


  if (t.loadingConfig) return <div className="tienda-root"><div className="tienda-loading">Cargando tienda…</div></div>;
  if (t.configError || !t.config) return (
    <div className="tienda-root">
      <div className="tienda-container">
        <div className="tienda-empty">
          <h2>Tienda no disponible</h2>
          <p>{t.configError ?? "No encontramos esta tienda."}</p>
        </div>
      </div>
    </div>
  );

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString() ?? "";
    nav(`${base}/productos?q=${encodeURIComponent(q)}`);
  };

  const isActive = (path: string) => loc.pathname === path;

  return (
    <div className="tienda-root" data-plantilla={t.config.plantilla || "clasica"}>
      <header className="tienda-header">
        <div className="tienda-header-top">
          <span>📦 Envíos a domicilio · Pedidos al mayoreo</span>
          <span>
            {t.isAuth ? <>Hola, <strong>{t.email}</strong></> : <Link to={`${base}/login`}>Iniciar sesión</Link>}
          </span>
        </div>
        <div className="tienda-header-main">
          <Link to={base} className="tienda-logo">
            {t.config.logo_url ? (
              <img src={t.config.logo_url} alt={t.config.nombre_tienda} />
            ) : t.empresa?.logo_url ? (
              <img src={t.empresa.logo_url} alt={t.config.nombre_tienda} />
            ) : null}
            <span className="tienda-logo-text">{t.config.nombre_tienda}</span>
          </Link>
          <form className="tienda-search" onSubmit={onSearch}>
            <Search size={16} className="tienda-search-icon" />
            <input name="q" placeholder="¿Qué estás buscando hoy?" />
          </form>
          <div className="tienda-header-actions">
            {t.isAuth ? (
              <>
                <Link to={`${base}/mis-pedidos`} className="tienda-btn tienda-btn-ghost">
                  <Package size={16} /> Mis pedidos
                </Link>
                <Link to={`${base}/cambiar-password`} className="tienda-btn tienda-btn-ghost" title="Cambiar contraseña">
                  <KeyRound size={16} />
                </Link>
                <button onClick={() => { t.logout(); nav(base); }} className="tienda-btn tienda-btn-ghost" title="Cerrar sesión">
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <Link to={`${base}/login`} className="tienda-btn tienda-btn-outline">
                <User size={16} /> Mi cuenta
              </Link>
            )}
            <Link to={`${base}/carrito`} className="tienda-btn tienda-btn-primary">
              <ShoppingCart size={16} /> Carrito
              {t.cartCount > 0 && <span className="tienda-cart-badge">{t.cartCount}</span>}
            </Link>
          </div>
        </div>
        <nav className="tienda-nav">
          <Link to={base} className={`tienda-nav-chip ${isActive(base) ? "active" : ""}`}>Inicio</Link>
          <Link to={`${base}/productos`} className={`tienda-nav-chip ${loc.pathname.includes("/productos") ? "active" : ""}`}>
            Catálogo
          </Link>
          {t.isAuth && <Link to={`${base}/mis-pedidos`} className={`tienda-nav-chip ${isActive(`${base}/mis-pedidos`) ? "active" : ""}`}>Mis pedidos</Link>}
          {t.config.whatsapp_pedidos && (
            <a className="tienda-nav-chip" href={`https://wa.me/${t.config.whatsapp_pedidos.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
              💬 WhatsApp
            </a>
          )}
        </nav>
      </header>

      {children}

      <footer className="tienda-footer">
        <p>© {new Date().getFullYear()} {t.empresa?.nombre ?? t.config.nombre_tienda} · Tienda en línea</p>
        {t.empresa?.telefono && <p>Tel. <a href={`tel:${t.empresa.telefono}`}>{t.empresa.telefono}</a></p>}
        <p style={{ marginTop: 8, opacity: 0.6 }}>Powered by Rutapp</p>
      </footer>
    </div>
  );
}
