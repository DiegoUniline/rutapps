import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Truck, Banknote, Package, Monitor } from 'lucide-react';
import { UnilineFooter } from '@/components/UnilineFooter';
import SyncCloudButton from '@/components/ruta/SyncCloudButton';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Clientes', icon: Users, path: '/ruta' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas' },
  { label: 'Entregas', icon: Truck, path: '/ruta/entregas' },
  { label: 'Carga', icon: Package, path: '/ruta/carga' },
  { label: 'Cobros', icon: Banknote, path: '/ruta/cobros' },
];

export default function MobileLayout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar with sync cloud */}
      <header className="flex items-center justify-between px-3 py-2 bg-card border-b border-border">
        <span className="text-sm font-bold text-foreground">Ruta</span>
        <div className="flex items-center gap-1">
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
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
