import { useState, useEffect, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import rutappLogo from '@/assets/rutapp-logo.jpeg.asset.json';
import { BRAND } from '@/lib/marketing-content';

export function MarketingShell({ children }: { children: ReactNode }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const NAV: { to: string; label: string; isNew?: boolean }[] = [
    { to: '/', label: 'Inicio' },
    { to: '/modulos', label: 'Módulos' },
    { to: '/precios', label: 'Precios' },
    { to: '/giros', label: 'Giros' },
    { to: '/modulos#ia', label: 'IA', isNew: true },
    { to: '/partners', label: 'Partners' },
  ];

  return (
    <div className="min-h-[100dvh] bg-white overflow-x-hidden antialiased"
      style={{ color: BRAND.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <nav
        className={`fixed top-0 inset-x-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${scrolled ? 'bg-white/75 shadow-[0_8px_30px_-15px_rgba(10,21,48,0.18)]' : 'bg-white/60'}`}
        style={{ borderColor: scrolled ? 'rgba(238,240,245,0.9)' : 'transparent', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className={`max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-5 transition-all duration-300 ${scrolled ? 'h-12' : 'h-14'}`}>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src={rutappLogo.url} alt="Rutapp" className={`w-auto rounded-md ${scrolled ? 'h-7' : 'h-8'}`} />
            <span className="text-[15px] font-bold tracking-tight max-[340px]:hidden">Rutapp</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-[13px]" style={{ color: BRAND.ink2 }}>
            {NAV.map(n => (
              <Link key={n.to} to={n.to} className="transition-colors hover:text-[#0060e8]">{n.label}</Link>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className="px-3 py-1.5 text-[13px] font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
            <Link to="/signup" className="px-3.5 py-1.5 text-[13px] font-semibold text-white rounded-lg inline-flex items-center gap-1 hover:scale-[1.04] transition-all"
              style={{ background: BRAND.ink }}>
              Empezar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex md:hidden shrink-0 items-center gap-1">
            <Link to="/signup" className="px-2 py-1 text-xs font-semibold text-white rounded" style={{ background: BRAND.ink }}>Probar</Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-1.5" aria-label="Menú">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-5 py-3 space-y-2.5 text-sm" style={{ borderColor: BRAND.line }}>
            {NAV.map(n => (
              <Link key={n.to} to={n.to} onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>{n.label}</Link>
            ))}
            <Link to="/login" onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      <main className="pt-16">{children}</main>

      <footer className="px-4 sm:px-6 lg:px-8 pt-10 pb-6 border-t mt-10" style={{ borderColor: BRAND.line }}>
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md grid place-items-center text-white font-black text-[10px]" style={{ background: BRAND.primary }}>R</div>
            <span className="text-[14px] font-bold">Rutapp</span>
            <span className="text-[12px] ml-3" style={{ color: BRAND.muted }}>© {new Date().getFullYear()} · Hecho en México</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[13px]" style={{ color: BRAND.ink2 }}>
            <Link to="/modulos">Módulos</Link>
            <Link to="/precios">Precios</Link>
            <Link to="/giros">Giros</Link>
            <Link to="/partners">Partners</Link>
            <Link to="/tutoriales">Tutoriales</Link>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/terminos">Términos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
