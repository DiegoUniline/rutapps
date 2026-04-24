import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useSetupComplete } from '@/pages/ConfiguracionInicialPage';
import { usePermisos, PATH_MODULE_MAP } from '@/hooks/usePermisos';
import { UnilineFooter } from '@/components/UnilineFooter';
import { useTheme } from '@/hooks/useTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Package, Users, ShoppingCart, BarChart3,
  LogOut, ChevronDown, PanelLeftClose, PanelLeft, Warehouse,
  DollarSign, Settings, Smartphone, Moon, Sun, MapPin, Shield, Sparkles, FileText, Menu, RefreshCw, Download, ShieldAlert, PlayCircle,
  Tag, ClipboardList, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationRuntime from '@/components/notifications/NotificationRuntime';
import PendingInvoiceModal from '@/components/PendingInvoiceModal';
import { useProductosRealtime } from '@/hooks/useData';
import SuperAdminEmpresaSelector from '@/components/SuperAdminEmpresaSelector';
import CommandPalette, { CommandPaletteButton } from '@/components/CommandPalette';
import { useFavorites } from '@/hooks/useFavorites';
import { Search } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';

interface NavChild { label: string; path: string }
interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: NavChild[];
  accent?: boolean; // highlight key items with accent color
  highlight?: 'amber' | 'green' | 'cyan' | 'violet' | 'teal' | 'pink'; // alternate accent color (distinct from primary)
}

const navItems: NavItem[] = [
  // ── Operación diaria ──
  { label: 'Dashboard', icon: BarChart3, path: '/dashboard', accent: true },
  { label: 'Supervisor', icon: ShieldAlert, path: '/supervisor', highlight: 'amber' },
  { label: 'Punto de venta', icon: ShoppingCart, path: '/pos', highlight: 'green' },
  { label: 'App Móvil', icon: Smartphone, path: '/ruta', highlight: 'cyan' },
  // ── Datos clave ──
  { label: 'Clientes', icon: Users, path: '/clientes', highlight: 'violet' },
  { label: 'Productos', icon: Package, path: '/productos', highlight: 'teal' },
  { label: 'Listas de Precios', icon: Tag, path: '/listas-precio' },
  // ── Ventas ──
  {
    label: 'Ventas',
    icon: ShoppingCart,
    path: '/ventas',
    children: [
      { label: 'Todas las ventas', path: '/ventas' },
      { label: 'Cobranza', path: '/ventas/cobranza' },
      { label: 'Promociones', path: '/ventas/promociones' },
      { label: 'Reporte diario', path: '/ventas/reporte-diario' },
      { label: 'Devoluciones', path: '/ventas/devoluciones' },
      { label: 'Liquidar Ruta', path: '/almacen/descargas' },
    ],
  },
  // ── Logística ──
  {
    label: 'Logística',
    icon: MapPin,
    path: '/logistica',
    children: [
      { label: 'Dashboard', path: '/logistica/dashboard' },
      { label: 'Pedidos pendientes', path: '/logistica/pedidos' },
      { label: 'Entregas', path: '/logistica/entregas' },
      { label: 'Jornadas de ruta', path: '/logistica/jornadas' },
      { label: 'Mapa de clientes', path: '/ventas/mapa-clientes' },
      { label: 'Mapa de entregas', path: '/ventas/mapa-ventas' },
    ],
  },
  // ── Almacén ──
  {
    label: 'Almacén',
    icon: Warehouse,
    path: '/almacen',
    children: [
      { label: 'Inventario', path: '/almacen/inventario' },
      { label: 'Traspasos', path: '/almacen/traspasos' },
      { label: 'Ajustes', path: '/almacen/ajustes' },
      { label: 'Auditorías', path: '/almacen/auditorias' },
      { label: 'Conteos físicos', path: '/almacen/conteos' },
      { label: 'Compras', path: '/almacen/compras' },
      { label: 'Almacenes', path: '/almacen/almacenes' },
    ],
  },
  // ── Catálogo ──
  {
    label: 'Catálogo',
    icon: ClipboardList,
    path: '/catalogos',
    children: [
      { label: 'Categorías', path: '/catalogos/clasificaciones' },
      { label: 'Marcas', path: '/catalogos/marcas' },
      { label: 'Proveedores', path: '/proveedores' },
      { label: 'Unidades', path: '/catalogos/unidades' },
      { label: 'Zonas', path: '/catalogos/zonas' },
    ],
  },
  // ── Finanzas ──
  {
    label: 'Finanzas',
    icon: DollarSign,
    path: '/finanzas',
    children: [
      { label: 'Cuentas por cobrar', path: '/finanzas/por-cobrar' },
      { label: 'Aplicar pagos clientes', path: '/finanzas/aplicar-pagos' },
      { label: 'Cuentas por pagar', path: '/finanzas/por-pagar' },
      { label: 'Pagos proveedores', path: '/finanzas/pagos-proveedores' },
      { label: 'Saldos por cliente', path: '/finanzas/saldos-cliente' },
      { label: 'Saldos por proveedor', path: '/finanzas/saldos-proveedor' },
      { label: 'Gastos', path: '/finanzas/gastos' },
      { label: 'Comisiones', path: '/finanzas/comisiones' },
    ],
  },
  // ── Reportes & Facturación ──
  {
    label: 'Reportes',
    icon: BarChart3,
    path: '/reportes',
    children: [
      { label: 'Reportes generales', path: '/reportes' },
      { label: 'Reporte entregas', path: '/reportes/entregas' },
    ],
  },
  {
    label: 'Facturación',
    icon: FileText,
    path: '/facturacion-cfdi',
    children: [
      { label: 'Facturas CFDI', path: '/facturacion-cfdi' },
      { label: 'Catálogos SAT', path: '/facturacion-cfdi/catalogos' },
    ],
  },
  // ── Admin & Config ──
  { label: 'Control', icon: ShieldAlert, path: '/control' },
  { label: 'Usuarios y permisos', icon: Users, path: '/configuracion/usuarios' },
  { label: 'Tutoriales', icon: PlayCircle, path: '/tutoriales' },
  {
    label: 'Configuración',
    icon: Settings,
    path: '/configuracion',
    children: [
      { label: 'General', path: '/configuracion' },
      { label: 'Usuarios y permisos', path: '/configuracion/usuarios' },
      { label: 'Vehículos', path: '/configuracion/vehiculos' },
      { label: 'Saldos iniciales', path: '/configuracion/saldos-iniciales' },
      { label: 'WhatsApp', path: '/configuracion/whatsapp' },
      { label: 'Mi suscripción', path: '/mi-suscripcion' },
    ],
  },
];

const mobileBottomTabs = [
  { label: 'Inicio', icon: BarChart3, path: '/dashboard' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ventas' },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  { label: 'Almacén', icon: Warehouse, path: '/almacen/inventario' },
  { label: 'Ajustes', icon: Settings, path: '/configuracion' },
];

/** Filter nav items based on granular sub-module permissions */
function useFilteredNav(isSuperAdmin: boolean, hasModulo: (m: string) => boolean) {
  if (isSuperAdmin) return navItems;

  return navItems.reduce<NavItem[]>((acc, item) => {
    if (!item.children) {
      const modulo = PATH_MODULE_MAP[item.path] ?? '';
      if (hasModulo(modulo)) acc.push(item);
    } else {
      const visibleChildren = item.children.filter(child => {
        const modulo = PATH_MODULE_MAP[child.path] ?? '';
        return hasModulo(modulo);
      });
      if (visibleChildren.length > 0) {
        acc.push({ ...item, children: visibleChildren });
      }
    }
    return acc;
  }, []);
}

function FavStar({ path, label }: { path: string; label: string }) {
  const { isFavorite, add, remove } = useFavorites();
  const fav = isFavorite(path);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (fav) remove(path); else add({ path, label });
      }}
      className={cn(
        "p-1 rounded transition-all shrink-0",
        fav
          ? "text-warning opacity-100"
          : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-warning"
      )}
      title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <Star className="h-3 w-3" fill={fav ? 'currentColor' : 'none'} />
    </button>
  );
}

function SidebarItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const basePath = item.path.split('?')[0];
  const isActive = location.pathname === basePath || location.pathname.startsWith(basePath + '/');
  const [open, setOpen] = useState(isActive);

  if (!item.children) {
    const HL_STYLES: Record<string, { active: string; idle: string; icon: string }> = {
      amber:  { active: 'text-warning font-semibold',  idle: 'text-warning hover:bg-sidebar-hover',  icon: 'text-warning' },
      green:  { active: 'text-success font-semibold',  idle: 'text-success hover:bg-sidebar-hover',  icon: 'text-success' },
      cyan:   { active: 'text-info font-semibold',     idle: 'text-info hover:bg-sidebar-hover',     icon: 'text-info' },
      violet: { active: 'text-violet font-semibold',   idle: 'text-violet hover:bg-sidebar-hover',   icon: 'text-violet' },
      teal:   { active: 'text-teal font-semibold',     idle: 'text-teal hover:bg-sidebar-hover',     icon: 'text-teal' },
      pink:   { active: 'text-pink font-semibold',     idle: 'text-pink hover:bg-sidebar-hover',     icon: 'text-pink' },
    };
    const hl = item.highlight ? HL_STYLES[item.highlight] : null;
    return (
      <div className="group relative flex items-center">
        <Link
          to={item.path}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all flex-1 min-w-0",
            collapsed ? "justify-center px-2" : "",
            isActive
              ? hl
                ? hl.active
                : "bg-primary/10 text-primary font-semibold"
              : hl
                ? hl.idle
                : item.accent
                  ? "text-primary/80 hover:bg-primary/5 hover:text-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
          )}
          title={collapsed ? item.label : undefined}
        >
          <item.icon className={cn(
            "h-4 w-4 shrink-0",
            item.accent && !isActive && "text-primary/70",
            hl && !isActive && hl.icon
          )} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {!collapsed && item.path !== '/favoritos' && (
          <div className="absolute right-2">
            <FavStar path={item.path} label={item.label} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2" : "",
          isActive
            ? "text-primary font-semibold"
            : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform opacity-50", open ? "" : "-rotate-90")} />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-4 pl-3 border-l border-sidebar-border/50 space-y-0.5 mt-0.5">
          {item.children!.map(child => {
            const childPath = child.path.split('?')[0];
            const childActive = location.pathname === childPath ||
              (location.pathname + location.search === child.path) ||
              (child.path.includes('?tab=') && location.pathname === basePath && child.path.includes('tab=productos') && !location.search);
            return (
              <div key={child.path} className="group relative flex items-center">
                <Link
                  to={child.path}
                  onClick={onNavigate}
                  className={cn(
                    "block px-2.5 py-1.5 rounded-md text-[12px] transition-all flex-1 min-w-0 truncate pr-7",
                    childActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  {child.label}
                </Link>
                <div className="absolute right-1">
                  <FavStar path={child.path} label={child.label} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BREADCRUMB_LABELS: Record<string, string> = {
  productos: 'Productos', tarifas: 'Listas de Precios', 'listas-precio': 'Listas de Precios',
  clientes: 'Clientes', dashboard: 'Dashboard', ventas: 'Ventas', almacen: 'Almacén',
  finanzas: 'Finanzas', reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
  demanda: 'Demanda', entregas: 'Entregas', 'reporte-entregas': 'Reporte entregas',
  inventario: 'Inventario', cobranza: 'Cobranza', rutas: 'Rutas', cargas: 'Cargas',
  compras: 'Compras', lotes: 'Lotes', almacenes: 'Almacenes', gastos: 'Gastos',
  'por-cobrar': 'Cuentas por cobrar', 'por-pagar': 'Cuentas por pagar',
  'aplicar-pagos': 'Aplicar pagos', 'aplicar-pagos-proveedor': 'Aplicar pagos proveedor',
  'pagos-proveedores': 'Pagos proveedores',
  'saldos-cliente': 'Saldos por cliente', 'saldos-proveedor': 'Saldos por proveedor',
  configuracion: 'Configuración', 'configuracion-inicial': 'Config. inicial',
  descargas: 'Liquidar Ruta', usuarios: 'Usuarios y permisos', whatsapp: 'WhatsApp',
  'mapa-clientes': 'Mapa de clientes', 'mapa-ventas': 'Mapa de entregas',
  logistica: 'Logística', 'pedidos-pendientes': 'Pedidos pendientes',
  asignacion: 'Asignación', quiebres: 'Quiebres', 'orden-carga': 'Orden de carga',
  'facturacion-cfdi': 'Facturación', devoluciones: 'Devoluciones',
  comisiones: 'Comisiones', control: 'Control', proveedores: 'Proveedores',
  catalogos: 'Catálogos', clasificaciones: 'Clasificaciones', zonas: 'Zonas',
  cobradores: 'Cobradores', 'reporte-diario': 'Reporte diario',
  promociones: 'Promociones', pos: 'Punto de venta',
  conteos: 'Conteos físicos', auditorias: 'Auditorías', traspasos: 'Traspasos',
  'ajustes-inventario': 'Ajustes de inventario', supervisor: 'Supervisor',
  'mi-suscripcion': 'Mi suscripción', 'monitor-rutas': 'Monitor de rutas',
  'estado-cuenta': 'Estado de cuenta', 'catalogo-publico': 'Catálogo público',
  'conteo-fisico': 'Conteo físico',
};

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div className="h-9 flex items-center px-5 bg-card border-b border-border text-xs text-muted-foreground overflow-x-auto">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const isUuid = UUID_RE.test(seg);
          const label = isUuid ? 'Detalle' : (BREADCRUMB_LABELS[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
          const path = '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              {isLast ? (
                <span className="text-foreground font-semibold">{label}</span>
              ) : (
                <Link to={path} className="hover:text-foreground transition-colors">{label}</Link>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate, visibleNavItems, isSuperAdmin, setupComplete }: {
  collapsed: boolean;
  onNavigate?: () => void;
  visibleNavItems: NavItem[];
  isSuperAdmin: boolean;
  setupComplete: boolean | undefined;
}) {
  const location = useLocation();
  const setupActive = location.pathname === '/configuracion-inicial';

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-0.5">
      {setupComplete === false && (
        <Link
          to="/configuracion-inicial"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all mb-1",
            collapsed ? "justify-center px-2" : "",
            setupActive
              ? "bg-primary/10 text-primary font-semibold"
              : "text-primary/80 hover:bg-primary/5 hover:text-primary"
          )}
          title={collapsed ? 'Configuración inicial' : undefined}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Configuración inicial</span>}
        </Link>
      )}
      {visibleNavItems.map(item => (
        <SidebarItem key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      {isSuperAdmin && (
        <Link
          to="/super-admin"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all mt-2 border-t border-sidebar-border/30 pt-3",
            collapsed ? "justify-center px-2" : "",
            "text-amber-500 hover:bg-sidebar-hover"
          )}
          title={collapsed ? 'Panel Master' : undefined}
        >
          <Shield className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Panel Master</span>}
        </Link>
      )}
    </nav>
  );
}

const DemoWelcomeDialog = lazy(() => import('@/components/DemoWelcomeDialog'));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { empresa, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin } = useSubscription();
  const { data: setupComplete } = useSetupComplete();
  const { hasModulo, loading: permisosLoading } = usePermisos();
  const isMobile = useIsMobile();
  const location = useLocation();
  useProductosRealtime();

  useEffect(() => {
    if (sessionStorage.getItem('demo_welcome') === '1') {
      sessionStorage.removeItem('demo_welcome');
      setShowDemoWelcome(true);
    }
  }, []);

  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  const applySwUpdate = async () => {
    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.unregister();
        }
      }
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      setSwUpdateAvailable(false);
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const baseVisibleNavItems = useFilteredNav(isSuperAdmin, hasModulo);
  const { favorites } = useFavorites();

  // Inject Favoritos as a dynamic module right after Dashboard with user favorites as children
  const visibleNavItems = useMemo(() => {
    const favItem: NavItem = {
      label: 'Favoritos',
      icon: Star,
      path: '/favoritos',
      highlight: 'amber',
      children: favorites.length > 0
        ? favorites.map(f => ({ label: f.label, path: f.path }))
        : [{ label: 'Sin favoritos aún', path: '/favoritos' }],
    };
    const dashIdx = baseVisibleNavItems.findIndex(i => i.path === '/dashboard');
    const insertAt = dashIdx >= 0 ? dashIdx + 1 : 0;
    return [
      ...baseVisibleNavItems.slice(0, insertAt),
      favItem,
      ...baseVisibleNavItems.slice(insertAt),
    ];
  }, [baseVisibleNavItems, favorites]);

  const closeMobile = () => setMobileOpen(false);

  // Mobile layout with hamburger
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <NotificationRuntime bannersOnly />
        {/* Mobile top bar */}
        <header className="h-14 flex items-center justify-between px-3 bg-card border-b border-border shrink-0 safe-area-top">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-md text-foreground hover:bg-accent transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border flex flex-col h-full gap-0">
                <div className="h-14 flex items-center px-4 border-b border-sidebar-border/30 shrink-0">
                  <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-7 w-7 rounded object-contain" />
                  <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <SidebarNav
                    collapsed={false}
                    onNavigate={closeMobile}
                    visibleNavItems={visibleNavItems}
                    isSuperAdmin={isSuperAdmin}
                    setupComplete={setupComplete}
                  />
                </div>
                <div className="border-t border-sidebar-border/30 p-2.5 shrink-0 safe-area-bottom">
                  <div className="px-2 py-2 mb-1">
                    <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
                    <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
                    <div className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5">v{APP_VERSION} · {APP_BUILD_DATE}</div>
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                    >
                      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    <Link
                      to="/ruta"
                      onClick={closeMobile}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title="Vista vendedor (móvil)"
                    >
                      <Smartphone className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={signOut}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title="Cerrar sesión"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-6 w-6 rounded object-contain" />
            <span className="text-[16px] font-black text-primary tracking-tight">Rutapp</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaletteOpen(true)}
              className="p-2 rounded-md text-foreground/70 hover:text-foreground transition-colors"
              title="Buscar (⌘K)"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={applySwUpdate}
              className={cn(
                "p-2 rounded-md transition-colors",
                swUpdateAvailable
                  ? "text-primary animate-pulse hover:text-primary/80"
                  : "text-foreground/70 hover:text-foreground"
              )}
              title="Actualizar app"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-foreground/70 hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </header>

        <SuperAdminEmpresaSelector />
        <Breadcrumb />
        <main className="flex-1 overflow-auto pb-16">
          {children}
        </main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

        {/* Bottom navigation – app style */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="flex items-center justify-around h-14">
            {mobileBottomTabs.map(tab => {
              const active = location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <NotificationRuntime overlaysOnly />
        <PendingInvoiceModal />
        <Suspense fallback={null}>
          <DemoWelcomeDialog open={showDemoWelcome} onClose={() => setShowDemoWelcome(false)} />
        </Suspense>
      </div>
    );
  }

  // Desktop layout with sidebar
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background">
      <NotificationRuntime bannersOnly />
      <div className="flex-1 flex min-h-0">
      <aside
        className={cn(
          "h-full shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 overflow-hidden",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        <div className={cn(
          "h-14 flex items-center shrink-0 border-b border-sidebar-border/30",
          collapsed ? "justify-center px-2" : "px-4"
        )}>
          {collapsed ? (
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="R" className="h-7 w-7 rounded object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-7 w-7 rounded object-contain" />
              <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
            </div>
          )}
        </div>

        <SidebarNav
          collapsed={collapsed}
          visibleNavItems={visibleNavItems}
          isSuperAdmin={isSuperAdmin}
          setupComplete={setupComplete}
        />

        <div className="border-t border-sidebar-border/30 p-2.5">
          {!collapsed && (
            <div className="px-2 py-2 mb-1">
              <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
              <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
              <div className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5">v{APP_VERSION} · {APP_BUILD_DATE}</div>
            </div>
          )}
          <div className={cn("flex gap-0.5", collapsed ? "flex-col items-center" : "")}>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/ruta"
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Vista vendedor (móvil)"
            >
              <Smartphone className="h-4 w-4" />
            </Link>
            <button
              onClick={applySwUpdate}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Actualizar app"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title={collapsed ? 'Expandir' : 'Colapsar'}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
        <SuperAdminEmpresaSelector />
        <div className="h-10 flex items-center justify-end px-4 border-b border-border bg-card shrink-0">
          <CommandPaletteButton onClick={() => setPaletteOpen(true)} />
        </div>
        <Breadcrumb />
        <main className="flex-1">
          {children}
        </main>
        <UnilineFooter />
      </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NotificationRuntime overlaysOnly />
      <PendingInvoiceModal />
      <Suspense fallback={null}>
        <DemoWelcomeDialog open={showDemoWelcome} onClose={() => setShowDemoWelcome(false)} />
      </Suspense>
    </div>
  );
}
