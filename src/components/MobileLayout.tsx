import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Users, Package, Monitor, UserCircle, Moon, Sun, FileText, PackageCheck, RefreshCw, MoreHorizontal, Download, Loader2, ScanBarcode, AlertTriangle, Play, BarChart3, Navigation, Receipt, Home } from 'lucide-react';
import { UnilineFooter } from '@/components/UnilineFooter';
import SyncCloudButton from '@/components/ruta/SyncCloudButton';
import { Switch } from '@/components/ui/switch';
import OfflineBanner from '@/components/ruta/OfflineBanner';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';
import { locationService } from '@/lib/locationService';
import { useLocationBroadcaster } from '@/hooks/useLocationBroadcaster';
import { useRutaSesionActiva } from '@/hooks/useRutaSesion';
import { useEmpresaJornadaConfig } from '@/hooks/useEmpresaJornadaConfig';
import SuperAdminMobileBar from '@/components/SuperAdminMobileBar';
import { useRutaStore } from '@/stores/rutaStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useUnloadGuard } from '@/hooks/useUnloadGuard';
import { requestPersistentStorage } from '@/lib/syncDiagnostics';

// Rutas que REQUIEREN jornada activa (acciones que mueven dinero/inventario).
// Todo lo demás (clientes, ventas list, stock, mapa, perfil...) se puede ver sin jornada.
const RUTAS_REQUIEREN_JORNADA = [
  '/ruta/pos',
  '/ruta/ventas/nueva',
  '/ruta/cobros/nuevo',
  '/ruta/devolucion',
  '/ruta/descarga',
  '/ruta/entregas/', // confirmar/editar entregas
];

const TAB_INICIO = { label: 'Inicio', icon: Home, path: '/ruta/inicio', permiso: null as string | null };

const ALL_TABS_CLASSIC = [
  { label: 'Clientes', icon: Users, path: '/ruta', permiso: 'ruta.clientes' },
  { label: 'Stock', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock' },
  { label: 'Gastos', icon: Receipt, path: '/ruta/gastos', permiso: 'ruta.gastos' },
  { label: 'Resumen', icon: BarChart3, path: '/ruta/dashboard', permiso: null as string | null },
];

const ALL_MORE_ITEMS = [
  { label: 'POS', icon: ScanBarcode, path: '/ruta/pos', permiso: 'ruta.vender' },
  { label: 'Navegación', icon: Navigation, path: '/ruta/navegacion', permiso: 'ruta.mapa' },
  { label: 'Liquidar', icon: PackageCheck, path: '/ruta/descarga', permiso: 'ruta.descarga' },
  { label: 'Sincronizar', icon: RefreshCw, path: '/ruta/sincronizar', permiso: null as string | null },
  { label: 'Perfil', icon: UserCircle, path: '/ruta/perfil', permiso: null as string | null },
];

export default function MobileLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { profile } = useAuth();
  const { hasPermiso, hasPermisoMovil } = usePermisos();
  const { requireJornada } = useEmpresaJornadaConfig();
  const userId = profile?.id || 'anon';
  const inicioModeKey = `ruta:inicioMode:${userId}`;
  const [inicioMode, setInicioMode] = useState<boolean>(() => {
    try { return localStorage.getItem(inicioModeKey) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try {
      const v = localStorage.getItem(inicioModeKey);
      setInicioMode(v === '1');
    } catch {}
  }, [inicioModeKey]);
  const toggleInicioMode = (on: boolean) => {
    setInicioMode(on);
    try { localStorage.setItem(inicioModeKey, on ? '1' : '0'); } catch {}
    if (on) navigate('/ruta/inicio');
    else navigate('/ruta');
  };
  const tabs = inicioMode
    ? [TAB_INICIO]
    : ALL_TABS_CLASSIC.filter(t => !t.permiso || hasPermisoMovil(t.permiso));
  const moreItems = ALL_MORE_ITEMS.filter(t => !t.permiso || hasPermisoMovil(t.permiso));
  const morePaths = moreItems.map(i => i.path);
  const isSoloMovil = hasPermiso('solo_movil', 'ver');
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isOnline = !useRutaStore(state => state.isOffline);
  const { pendingCount } = useNetworkStatus();

  // Aviso al cerrar/recargar si hay cambios sin sincronizar
  useUnloadGuard(pendingCount);

  // Pedir storage persistente una sola vez al montar la app móvil
  useEffect(() => { requestPersistentStorage().catch(() => {}); }, []);

  // Bloqueo por jornada (configurable por empresa) — solo en rutas de acción
  const { data: sesionActiva, isLoading: sesionLoading } = useRutaSesionActiva();
  const requiereJornadaRuta = RUTAS_REQUIEREN_JORNADA.some(p => location.pathname.startsWith(p));
  const bloqueado = requireJornada && !sesionLoading && !sesionActiva && requiereJornadaRuta;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

  const isMoreActive = morePaths.some(p => location.pathname.startsWith(p));
  const isPosRoute = location.pathname === '/ruta/pos';

  // Start GPS watching once on mount, stop on unmount
  useEffect(() => {
    locationService.startWatching();
    return () => locationService.stopWatching();
  }, []);

  // Broadcast my position to vendedor_ubicaciones (throttled, battery-friendly)
  useLocationBroadcaster(true);

  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  const forceUpdate = async () => {
    if (!isOnline) return;
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

  // POS has its own full-screen layout — render only the outlet
  if (isPosRoute) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        {isUpdating && (
          <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-fade-in">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-base font-bold text-foreground">Actualizando versión…</p>
              <p className="text-sm text-muted-foreground mt-1">Limpiando caché y recargando</p>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
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
          <label
            className="flex items-center gap-1.5 pl-2 cursor-pointer select-none"
            title={inicioMode ? 'Modo Inicio activo' : 'Activar modo Inicio'}
          >
            <Home className={cn("h-3.5 w-3.5", inicioMode ? "text-primary" : "text-muted-foreground")} />
            <Switch
              checked={inicioMode}
              onCheckedChange={toggleInicioMode}
              className="scale-75 origin-left"
            />
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={forceUpdate}
            disabled={!isOnline}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
              !isOnline
                ? "text-muted-foreground/40 cursor-not-allowed"
                : swUpdateAvailable
                  ? "text-primary animate-pulse hover:text-primary/80"
                  : "text-muted-foreground hover:text-foreground"
            )}
            title={isOnline ? "Actualizar app" : "Sin conexión"}
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

      <SuperAdminMobileBar />

      <OfflineBanner />

      {/* Content area */}
      <main className="flex-1 overflow-auto pb-16 relative">
        <Outlet />
        <UnilineFooter />

        {/* Bloqueo total: requiere iniciar jornada */}
        {bloqueado && (
          <div className="fixed inset-0 top-0 z-[80] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in">
            <div
              className="w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center"
              style={{ background: 'linear-gradient(135deg, hsl(38 95% 55%), hsl(20 95% 55%))', color: 'hsl(0 0% 100%)' }}
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                <AlertTriangle className="h-9 w-9" />
              </div>
              <h2 className="text-[20px] font-extrabold mb-1">Inicia tu jornada</h2>
              <p className="text-[13px] opacity-95 mb-5">
                Para registrar ventas, entregas, cobros o cualquier movimiento, primero debes iniciar tu jornada con vehículo, KM y foto del odómetro.
              </p>
              <button
                onClick={() => navigate('/ruta/iniciar')}
                className="w-full bg-white text-foreground rounded-xl py-3.5 font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-md"
                style={{ color: 'hsl(20 95% 35%)' }}
              >
                <Play className="h-5 w-5 fill-current" />
                Iniciar jornada ahora
              </button>
            </div>
            <button
              onClick={() => navigate('/ruta/perfil')}
              className="mt-4 text-[12px] text-muted-foreground underline"
            >
              Ir a mi perfil
            </button>
          </div>
        )}
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
                disabled={!isOnline}
                className={cn(
                  "flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors",
                  isOnline ? "text-primary hover:bg-accent" : "text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                <Download className="h-4 w-4" />
                {isOnline ? 'Actualizar app' : 'Sin conexión'}
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
