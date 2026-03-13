import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Package, Tag, Users, MapPin, ShoppingCart, FileText, BarChart3,
  Menu, X, LogOut, Bell, ChevronDown, ChevronRight
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

function NavDropdown({ item, isActive, onNavigate }: { item: NavItem; isActive: boolean; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!item.children) {
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
          isActive ? "bg-primary text-primary-foreground" : "text-navbar-foreground hover:bg-navbar-hover"
        )}
      >
        <item.icon className="h-3.5 w-3.5" />
        {item.label}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
          isActive ? "bg-primary text-primary-foreground" : "text-navbar-foreground hover:bg-navbar-hover"
        )}
      >
        <item.icon className="h-3.5 w-3.5" />
        {item.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-lg py-1 min-w-[180px] z-50">
          {item.children.map(child => (
            <Link
              key={child.path}
              to={child.path}
              onClick={() => { setOpen(false); onNavigate(); }}
              className="block px-4 py-1.5 text-sm text-foreground hover:bg-navbar-hover transition-colors"
            >
              {child.label}
            </Link>
          ))}
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
    ventas: 'Ventas', rutas: 'Rutas', facturacion: 'Facturación',
    reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
  };

  if (segments.length <= 1) return null;

  return (
    <div className="h-8 flex items-center px-4 bg-card border-b border-navbar-border text-xs text-muted-foreground gap-1.5">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const label = labels[seg] || seg;
        const path = '/' + segments.slice(0, i + 1).join('/');
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { empresa, profile, signOut } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path.split('?')[0]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navbar */}
      <header className="h-12 bg-navbar border-b border-navbar-border flex items-center px-4 shrink-0 z-40">
        {/* Logo */}
        <Link to="/" className="text-lg font-bold text-primary mr-6 tracking-tight">
          Rutapp
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 flex-1">
          {navItems.map(item => (
            <NavDropdown
              key={item.path}
              item={item}
              isActive={isActive(item.path)}
              onNavigate={() => {}}
            />
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button className="lg:hidden mr-auto" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground hidden sm:block">
            {empresa?.nombre ?? 'Mi Empresa'}
          </span>
          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground">
            {(profile?.nombre?.[0] ?? 'U').toUpperCase()}
          </div>
          <button
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-card border-b border-navbar-border px-4 py-2 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
                isActive(item.path) ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-navbar-hover"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Content - full width */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
