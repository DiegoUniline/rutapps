import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Users, Package, Monitor, UserCircle, Moon, Sun, FileText, PackageCheck, RefreshCw, MoreHorizontal, Download } from 'lucide-react';
import { UnilineFooter } from '@/components/UnilineFooter';
import SyncCloudButton from '@/components/ruta/SyncCloudButton';
import OfflineBanner from '@/components/ruta/OfflineBanner';
import UpdateBanner from '@/components/ruta/UpdateBanner';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';

const tabs = [
  { label: 'Clientes', icon: Users, path: '/ruta' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas' },
  { label: 'Stock', icon: Package, path: '/ruta/stock' },
];

const moreItems = [
  { label: 'Descarga', icon: PackageCheck, path: '/ruta/descarga' },
  { label: 'Gastos', icon: FileText, path: '/ruta/gastos' },
  { label: 'Sincronizar', icon: RefreshCw, path: '/ruta/sincronizar' },
  { label: 'Perfil', icon: UserCircle, path: '/ruta/perfil' },
];

const morePaths = moreItems.map(i => i.path);

export default function MobileLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = morePaths.some(p => location.pathname.startsWith(p));

  const forceUpdate = () => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground pl-2">Ruta</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            title="Ir a escritorio"
          >
            <Monitor className="h-5 w-5" />
          </button>
          <SyncCloudButton />
        </div>
      </header>

      <UpdateBanner />
      <OfflineBanner />

      {/* Content area */}
      <main className="flex-1 overflow-auto pb-16">
        <Outlet />
        <UnilineFooter />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {tabs.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/ruta'}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              onClick={() => setMoreOpen(false)}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          ))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
              isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* More popup */}
      {moreOpen && (
        <div className="fixed inset-0 z-[55]" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-16 right-2 w-52 bg-card border border-border rounded-xl shadow-lg py-1 animate-in fade-in slide-in-from-bottom-2 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {moreItems.map(item => (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setMoreOpen(false); }}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors",
                  location.pathname.startsWith(item.path) ? "text-primary bg-primary/5" : "text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
            {/* Separator + version info */}
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => { forceUpdate(); setMoreOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-primary hover:bg-accent transition-colors"
              >
                <Download className="h-4 w-4" />
                Actualizar app
              </button>
              <div className="px-4 py-2 text-[10px] text-muted-foreground">
                v{APP_VERSION} · {APP_BUILD_DATE}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
