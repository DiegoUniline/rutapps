import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Users, Package, Monitor, UserCircle, Moon, Sun, FileText, PackageCheck, RefreshCw, MoreHorizontal, Download, Loader2 } from 'lucide-react';
import { UnilineFooter } from '@/components/UnilineFooter';
import SyncCloudButton from '@/components/ruta/SyncCloudButton';
import OfflineBanner from '@/components/ruta/OfflineBanner';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';
import { locationService } from '@/lib/locationService';

const tabs = [
  { label: 'Clientes', icon: Users, path: '/ruta' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas' },
  { label: 'Stock', icon: Package, path: '/ruta/stock' },
];

const moreItems = [
  { label: 'Liquidar', icon: PackageCheck, path: '/ruta/descarga' },
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
  const { hasPermiso } = usePermisos();
  const isSoloMovil = hasPermiso('solo_movil', 'ver');
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

  const isMoreActive = morePaths.some(p => location.pathname.startsWith(p));

  // Start GPS watching once on mount, stop on unmount
  useEffect(() => {
    locationService.startWatching();
    return () => locationService.stopWatching();
  }, []);

  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  const forceUpdate = async () => {
    if (!navigator.onLine) return;
    setIsUpdating(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      setSwUpdateAvailable(false);
      await new Promise(r => setTimeout(r, 1200));
      window.location.reload();
    } catch {
      await new Promise(r => setTimeout(r, 800));
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Updating overlay */}
      {isUpdating && (
        <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-fade-in">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-base font-bold text-foreground">Actualizando versión…</p>
            <p className="text-sm text-muted-foreground mt-1">Limpiando caché y recargando</p>
          </div>
        </div>
      )}
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground pl-2">Ruta</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={forceUpdate}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
              swUpdateAvailable
                ? "text-primary animate-pulse hover:text-primary/80"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Actualizar app"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {!isSoloMovil && (
            <button
              onClick={() => {
                if (isStandalone) {
                  // Force navigation out of mobile layout within standalone PWA
                  window.location.href = '/dashboard';
                } else {
                  navigate('/dashboard');
                }
              }}
              className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              title="Ir a escritorio"
            >
              <Monitor className="h-5 w-5" />
            </button>
          )}
          <SyncCloudButton />
        </div>
      </header>

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
