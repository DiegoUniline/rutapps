import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Package, Tag, Users, ShoppingCart, FileText, BarChart3, Truck,
  LogOut, ChevronDown, PanelLeftClose, PanelLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: { label: string; path: string }[];
}

const navItems: NavItem[] = [
  {
    label: 'Productos',
    icon: Package,
    path: '/productos',
    children: [
      { label: 'Productos', path: '/productos?tab=productos' },
      { label: 'Marcas', path: '/productos?tab=marcas' },
      { label: 'Clasificaciones', path: '/productos?tab=clasificaciones' },
      { label: 'Proveedores', path: '/productos?tab=proveedores' },
      { label: 'Unidades', path: '/productos?tab=unidades' },
      { label: 'Listas', path: '/productos?tab=listas' },
      { label: 'Almacenes', path: '/productos?tab=almacenes' },
      { label: 'Tasas IVA', path: '/productos?tab=tasas_iva' },
      { label: 'Tasas IEPS', path: '/productos?tab=tasas_ieps' },
    ],
  },
  { label: 'Tarifas', icon: Tag, path: '/tarifas' },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ventas' },
  { label: 'Facturación', icon: FileText, path: '/facturacion' },
  { label: 'Reportes', icon: BarChart3, path: '/reportes' },
];

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(item.path.split('?')[0]);
  const [open, setOpen] = useState(isActive);

  if (!item.children) {
    return (
      <Link
        to={item.path}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2" : "",
          isActive
            ? "bg-sidebar-accent text-primary-foreground"
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
            ? "text-primary-foreground/90"
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
          {item.children.map(child => {
            const childActive = location.pathname + location.search === child.path ||
              (location.pathname === '/productos' && child.path.includes('tab=productos') && !location.search);
            return (
              <Link
                key={child.path}
                to={child.path}
                className={cn(
                  "block px-2.5 py-1.5 rounded-md text-[12px] transition-all",
                  childActive
                    ? "bg-sidebar-accent/20 text-primary-foreground font-semibold"
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
    ventas: 'Ventas', facturacion: 'Facturación',
    reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
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

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar — dark */}
      <aside
        className={cn(
          "h-screen sticky top-0 flex flex-col bg-sidebar transition-all duration-200 shrink-0",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "h-14 flex items-center shrink-0 border-b border-sidebar-border/30",
          collapsed ? "justify-center px-2" : "px-4"
        )}>
          {collapsed ? (
            <span className="text-[18px] font-black text-primary-foreground">R</span>
          ) : (
            <span className="text-[18px] font-black text-primary-foreground tracking-tight">Rutapp</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(item => (
            <SidebarItem key={item.path} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border/30 p-2.5">
          {!collapsed && (
            <div className="px-2 py-2 mb-1">
              <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
              <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
            </div>
          )}
          <div className={cn("flex gap-0.5", collapsed ? "flex-col items-center" : "")}>
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <Breadcrumb />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
