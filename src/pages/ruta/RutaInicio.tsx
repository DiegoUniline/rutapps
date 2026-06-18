import { useNavigate } from 'react-router-dom';
import { Users, Package, BarChart3, ScanBarcode, Navigation, Receipt, PackageCheck, RefreshCw, UserCircle, ShoppingCart, HandCoins, Truck, Map } from 'lucide-react';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';

type Item = {
  label: string;
  icon: any;
  path: string;
  permiso: string | null;
  color: 'primary' | 'brand-orange' | 'secondary' | 'success' | 'warning' | 'teal' | 'violet' | 'pink';
};

type Section = {
  title: string;
  items: Item[];
};

const SECTIONS: Section[] = [
  {
    title: 'Ventas',
    items: [
      { label: 'Clientes', icon: Users, path: '/ruta', permiso: 'ruta.clientes', color: 'primary' },
      { label: 'POS', icon: ScanBarcode, path: '/ruta/pos', permiso: 'ruta.vender', color: 'primary' },
      { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas', permiso: 'ruta.ventas', color: 'primary' },
      { label: 'Cobros', icon: HandCoins, path: '/ruta/cobros', permiso: 'ruta.cobros', color: 'primary' },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Stock', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock', color: 'brand-orange' },
      { label: 'Mi carga', icon: Truck, path: '/ruta/carga', permiso: 'ruta.carga', color: 'brand-orange' },
      { label: 'Liquidar', icon: PackageCheck, path: '/ruta/descarga', permiso: 'ruta.descarga', color: 'brand-orange' },
    ],
  },
  {
    title: 'Logística',
    items: [
      { label: 'Navegación', icon: Navigation, path: '/ruta/navegacion', permiso: 'ruta.mapa', color: 'secondary' },
      { label: 'Mapa', icon: Map, path: '/ruta/mapa', permiso: 'ruta.mapa', color: 'secondary' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Gastos', icon: Receipt, path: '/ruta/gastos', permiso: 'ruta.gastos', color: 'success' },
      { label: 'Resumen', icon: BarChart3, path: '/ruta/dashboard', permiso: null, color: 'success' },
      { label: 'Sincronizar', icon: RefreshCw, path: '/ruta/sincronizar', permiso: null, color: 'success' },
      { label: 'Perfil', icon: UserCircle, path: '/ruta/perfil', permiso: null, color: 'success' },
    ],
  },
];

const colorClasses: Record<Item['color'], { bg: string; fg: string }> = {
  primary: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  'brand-orange': { bg: 'bg-brand-orange', fg: 'text-brand-orange-foreground' },
  secondary: { bg: 'bg-secondary', fg: 'text-secondary-foreground' },
  success: { bg: 'bg-success', fg: 'text-success-foreground' },
  warning: { bg: 'bg-warning', fg: 'text-warning-foreground' },
  teal: { bg: 'bg-teal', fg: 'text-teal-foreground' },
  violet: { bg: 'bg-violet', fg: 'text-violet-foreground' },
  pink: { bg: 'bg-pink', fg: 'text-pink-foreground' },
};

export default function RutaInicio() {
  const navigate = useNavigate();
  const { hasPermisoMovil } = usePermisos();

  const visibleSections = SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(i => !i.permiso || hasPermisoMovil(i.permiso)),
  })).filter(section => section.items.length > 0);

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold text-foreground">Inicio</h1>
      {visibleSections.map(section => (
        <div key={section.title}>
          <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3">
            {section.title}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {section.items.map(item => {
              const { bg, fg } = colorClasses[item.color];
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-card border border-border shadow-sm active:scale-95 transition-transform hover:shadow-md"
                >
                  <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shadow-md', bg, fg)}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground text-center leading-tight px-1">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
