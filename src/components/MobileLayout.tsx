import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Truck, Banknote, Package, Monitor, UserCircle, Moon, Sun, Menu, X, MapPinned, RotateCcw, FileText, PackageCheck, Navigation } from 'lucide-react';
import { UnilineFooter } from '@/components/UnilineFooter';
import SyncCloudButton from '@/components/ruta/SyncCloudButton';
import OfflineBanner from '@/components/ruta/OfflineBanner';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Clientes', icon: Users, path: '/ruta' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas' },
  { label: 'Entregas', icon: Truck, path: '/ruta/entregas' },
  { label: 'Stock', icon: Package, path: '/ruta/stock' },
  { label: 'Cobros', icon: Banknote, path: '/ruta/cobros' },
];

const menuItems = [
  { label: 'Perfil', icon: UserCircle, path: '/ruta/perfil' },
  { label: 'Gastos', icon: FileText, path: '/ruta/gastos' },
  { label: 'Devoluciones', icon: RotateCcw, path: '/ruta/devolucion' },
  { label: 'Descarga', icon: PackageCheck, path: '/ruta/descarga' },
  { label: 'Mapa de ruta', icon: MapPinned, path: '/ruta/mapa' },
];

export default function MobileLayout() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full text-foreground hover:bg-accent transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">Ruta</span>
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
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Hamburger drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-card shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{profile?.nombre ?? 'Vendedor'}</p>
                  <p className="text-[11px] text-muted-foreground">Ruta móvil</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 py-2">
              {menuItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMenuOpen(false); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => { navigate('/'); setMenuOpen(false); }}
                className="flex items-center gap-3 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Monitor className="h-5 w-5" />
                Ir a escritorio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
