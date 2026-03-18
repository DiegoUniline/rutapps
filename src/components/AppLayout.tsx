import { useState } from 'react';
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
  DollarSign, Settings, Smartphone, Moon, Sun, MapPin, Shield, Sparkles, FileText, Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavChild { label: string; path: string }
interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
  { label: 'Supervisor', icon: BarChart3, path: '/supervisor' },
  {
    label: 'Ventas',
    icon: ShoppingCart,
    path: '/ventas',
    children: [
      { label: 'Todas las ventas', path: '/ventas' },
      { label: 'Cobranza', path: '/ventas/cobranza' },
      { label: 'Promociones', path: '/ventas/promociones' },
      { label: 'Punto de venta', path: '/pos' },
    ],
  },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  {
    label: 'Logística',
    icon: MapPin,
    path: '/logistica',
    children: [
      { label: 'Dashboard', path: '/logistica/dashboard' },
      { label: 'Pedidos pendientes', path: '/logistica/pedidos' },
      { label: 'Entregas', path: '/logistica/entregas' },
      { label: 'Descargas de ruta', path: '/almacen/descargas' },
      { label: 'Monitor de rutas', path: '/monitor-rutas' },
      { label: 'Rutas', path: '/ventas/rutas' },
      { label: 'Mapa de clientes', path: '/ventas/mapa-clientes' },
      { label: 'Mapa de ventas', path: '/ventas/mapa-ventas' },
    ],
  },
  {
    label: 'Catálogo',
    icon: Package,
    path: '/productos',
    children: [
      { label: 'Productos', path: '/productos' },
      { label: 'Tarifas', path: '/tarifas' },
      { label: 'Listas de Precios', path: '/listas-precio' },
      { label: 'Categorías', path: '/catalogo/clasificaciones' },
      { label: 'Marcas', path: '/catalogo/marcas' },
      { label: 'Proveedores', path: '/proveedores' },
      { label: 'Unidades', path: '/catalogo/unidades' },
    ],
  },
  {
    label: 'Almacén',
    icon: Warehouse,
    path: '/almacen',
    children: [
      { label: 'Inventario', path: '/almacen/inventario' },
      { label: 'Traspasos', path: '/almacen/traspasos' },
      { label: 'Ajustes', path: '/almacen/ajustes' },
      { label: 'Auditorías', path: '/almacen/auditorias' },
      { label: 'Compras', path: '/almacen/compras' },
      { label: 'Lotes', path: '/almacen/lotes' },
      { label: 'Almacenes', path: '/almacen/almacenes' },
    ],
  },
  {
    label: 'Finanzas',
    icon: DollarSign,
    path: '/finanzas',
    children: [
      { label: 'Cuentas por cobrar', path: '/finanzas/por-cobrar' },
      { label: 'Cuentas por pagar', path: '/finanzas/por-pagar' },
      { label: 'Gastos', path: '/finanzas/gastos' },
      { label: 'Comisiones', path: '/finanzas/comisiones' },
    ],
  },
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
  {
    label: 'Configuración',
    icon: Settings,
    path: '/configuracion',
    children: [
      { label: 'General', path: '/configuracion' },
      { label: 'Usuarios y permisos', path: '/configuracion/usuarios' },
      { label: 'WhatsApp', path: '/configuracion/whatsapp' },
      { label: 'Mi suscripción', path: '/mi-suscripcion' },
    ],
  },
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

function SidebarItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const basePath = item.path.split('?')[0];
  const isActive = location.pathname === basePath || location.pathname.startsWith(basePath + '/');
  const [open, setOpen] = useState(isActive);

  if (!item.children) {
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2" : "",
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
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
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={cn(
                  "block px-2.5 py-1.5 rounded-md text-[12px] transition-all",
                  childActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const labels: Record<string, string> = {
    productos: 'Productos', tarifas: 'Tarifas', clientes: 'Clientes', dashboard: 'Dashboard',
    ventas: 'Ventas', almacen: 'Almacén', finanzas: 'Finanzas',
    reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
    demanda: 'Demanda', entregas: 'Entregas', 'reporte-entregas': 'Reporte entregas',
    inventario: 'Inventario', cobranza: 'Cobranza',
    rutas: 'Rutas', cargas: 'Cargas', compras: 'Compras', lotes: 'Lotes',
    almacenes: 'Almacenes', gastos: 'Gastos',
    'por-cobrar': 'Cuentas por cobrar', 'por-pagar': 'Cuentas por pagar',
    configuracion: 'Configuración', 'configuracion-inicial': 'Configuración inicial', descargas: 'Descargas de ruta',
    usuarios: 'Usuarios y permisos', whatsapp: 'WhatsApp',
    'mapa-clientes': 'Mapa de clientes', 'mapa-ventas': 'Mapa de ventas',
    logistica: 'Logística', 'pedidos-pendientes': 'Pedidos pendientes',
    asignacion: 'Asignación', quiebres: 'Quiebres', 'orden-carga': 'Orden de carga',
    'facturacion-cfdi': 'Facturación',
  };

  if (segments.length <= 1) return null;

  return (
    <div className="h-9 flex items-center px-5 bg-card border-b border-border text-xs text-muted-foreground gap-1.5">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const label = labels[seg] || seg;
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
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { empresa, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin } = useSubscription();
  const { data: setupComplete } = useSetupComplete();
  const { hasModulo, loading: permisosLoading } = usePermisos();
  const isMobile = useIsMobile();

  const visibleNavItems = useFilteredNav(isSuperAdmin, hasModulo);

  const closeMobile = () => setMobileOpen(false);

  // Mobile layout with hamburger
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Mobile top bar */}
        <header className="h-14 flex items-center justify-between px-3 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-md text-foreground hover:bg-accent transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
                <div className="h-14 flex items-center px-4 border-b border-sidebar-border/30">
                  <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
                </div>
                <SidebarNav
                  collapsed={false}
                  onNavigate={closeMobile}
                  visibleNavItems={visibleNavItems}
                  isSuperAdmin={isSuperAdmin}
                  setupComplete={setupComplete}
                />
                <div className="border-t border-sidebar-border/30 p-2.5">
                  <div className="px-2 py-2 mb-1">
                    <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
                    <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
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
            <span className="text-[16px] font-black text-primary tracking-tight">Rutapp</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <Breadcrumb />
        <main className="flex-1 overflow-auto pb-16">
          {children}
        </main>

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
      </div>
    );
  }

  // Desktop layout with sidebar
  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        <div className={cn(
          "h-14 flex items-center shrink-0 border-b border-sidebar-border/30",
          collapsed ? "justify-center px-2" : "px-4"
        )}>
          {collapsed ? (
            <span className="text-[18px] font-black text-primary">R</span>
          ) : (
            <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
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

      <div className="flex-1 flex flex-col min-w-0">
        <Breadcrumb />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <UnilineFooter />
      </div>
    </div>
  );
}
