import { NavLink, Outlet, Navigate, Link } from 'react-router-dom';
import { LayoutDashboard, Tag, Wallet, Building2, User, LogOut, Loader2, PlayCircle } from 'lucide-react';
import { usePartner } from '@/hooks/usePartner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/partner', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/partner/empresas', icon: Building2, label: 'Mis Empresas' },
  { to: '/partner/cupones', icon: Tag, label: 'Cupones' },
  { to: '/partner/comisiones', icon: Wallet, label: 'Comisiones' },
  { to: '/partner/perfil', icon: User, label: 'Mi Perfil' },
];

export default function PartnerLayout() {
  const { data: partner, isLoading } = usePartner();
  const { signOut } = useAuth();

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!partner) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      <aside className="md:w-64 md:min-h-[100dvh] border-b md:border-b-0 md:border-r border-border bg-card flex md:flex-col">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="" className="h-9 w-9 rounded-lg" />
          <div>
            <div className="font-bold">Partner Portal</div>
            <div className="text-xs text-muted-foreground">{partner.nombre}</div>
          </div>
        </div>
        <nav className="flex md:flex-col flex-1 p-2 gap-1 overflow-x-auto">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition',
                isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}>
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <Link
            to="/tutoriales"
            className="relative mt-1 md:mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-white whitespace-nowrap shadow-lg shadow-rose-500/30 hover:scale-[1.02] transition-transform overflow-hidden shrink-0"
            style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            <PlayCircle className="h-4 w-4 relative" />
            <span className="relative">Mira cómo funciona</span>
          </Link>
        </nav>
        <div className="p-2 border-t border-border hidden md:block">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 w-full min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
