import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UnilineFooter } from '@/components/UnilineFooter';
import { useTheme } from '@/hooks/useTheme';
import {
  Package, Users, ShoppingCart, BarChart3,
  LogOut, ChevronDown, PanelLeftClose, PanelLeft, Warehouse,
  DollarSign, Settings, Smartphone, Moon, Sun
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
  {
    label: 'Ventas',
    icon: ShoppingCart,
    path: '/ventas',
    children: [
      { label: 'Todas las ventas', path: '/ventas' },
      { label: 'Entregas', path: '/ventas/entregas' },
      { label: 'Reporte entregas', path: '/ventas/reporte-entregas' },
      { label: 'Demanda', path: '/ventas/demanda' },
      { label: 'Cobranza', path: '/ventas/cobranza' },
      { label: 'Rutas', path: '/ventas/rutas' },
      { label: 'Mapa de clientes', path: '/ventas/mapa-clientes' },
      { label: 'Mapa de ventas', path: '/ventas/mapa-ventas' },
    ],
  },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  {
    label: 'Catálogo',
    icon: Package,
    path: '/productos',
    children: [
      { label: 'Productos', path: '/productos?tab=productos' },
      { label: 'Tarifas', path: '/tarifas' },
      { label: 'Clasificaciones', path: '/productos?tab=clasificaciones' },
      { label: 'Marcas', path: '/productos?tab=marcas' },
      { label: 'Proveedores', path: '/productos?tab=proveedores' },
      { label: 'Unidades', path: '/productos?tab=unidades' },
      { label: 'Listas de precios', path: '/productos?tab=listas' },
      { label: 'Tasas IVA', path: '/productos?tab=tasas_iva' },
      { label: 'Tasas IEPS', path: '/productos?tab=tasas_ieps' },
    ],
  },
  {
    label: 'Almacén',
    icon: Warehouse,
    path: '/almacen',
    children: [
      { label: 'Inventario', path: '/almacen/inventario' },
      { label: 'Compras', path: '/almacen/compras' },
      { label: 'Cargas', path: '/almacen/cargas' },
      { label: 'Descargas de ruta', path: '/almacen/descargas' },
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
    ],
  },
  { label: 'Reportes', icon: BarChart3, path: '/reportes' },
  {
    label: 'Configuración',
    icon: Settings,
    path: '/configuracion',
    children: [
      { label: 'General', path: '/configuracion' },
      { label: 'Usuarios y permisos', path: '/configuracion/usuarios' },
      { label: 'WhatsApp', path: '/configuracion/whatsapp' },
    ],
  },
];

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const basePath = item.path.split('?')[0];
  const isActive = location.pathname === basePath || location.pathname.startsWith(basePath + '/');
  const [open, setOpen] = useState(isActive);

  if (!item.children) {
    return (
      <Link
        to={item.path}
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
    productos: 'Productos', tarifas: 'Tarifas', clientes: 'Clientes',
    ventas: 'Ventas', almacen: 'Almacén', finanzas: 'Finanzas',
    reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
    demanda: 'Demanda', entregas: 'Entregas', 'reporte-entregas': 'Reporte entregas',
    inventario: 'Inventario', cobranza: 'Cobranza',
    rutas: 'Rutas', cargas: 'Cargas', compras: 'Compras', lotes: 'Lotes',
    almacenes: 'Almacenes', gastos: 'Gastos',
    'por-cobrar': 'Cuentas por cobrar', 'por-pagar': 'Cuentas por pagar',
    configuracion: 'Configuración', descargas: 'Descargas de ruta',
    usuarios: 'Usuarios y permisos', whatsapp: 'WhatsApp',
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { empresa, profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

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

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(item => (
            <SidebarItem key={item.path} item={item} collapsed={collapsed} />
          ))}
        </nav>

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
