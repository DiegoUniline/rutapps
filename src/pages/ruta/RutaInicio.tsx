import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Package, BarChart3, ScanBarcode, Navigation, Receipt, PackageCheck, RefreshCw, UserCircle, ShoppingCart, HandCoins, Truck, Map, MoreHorizontal, X } from 'lucide-react';
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

const TOP_ITEMS: Item[] = [
  { label: 'Clientes', icon: Users, path: '/ruta', permiso: 'ruta.clientes', color: 'primary' },
  { label: 'POS', icon: ScanBarcode, path: '/ruta/pos', permiso: 'ruta.vender', color: 'primary' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas', permiso: 'ruta.ventas', color: 'primary' },
  { label: 'Cobros', icon: HandCoins, path: '/ruta/cobros', permiso: 'ruta.cobros', color: 'primary' },
  { label: 'Stock', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock', color: 'brand-orange' },
  { label: 'Navegación', icon: Navigation, path: '/ruta/navegacion', permiso: 'ruta.mapa', color: 'secondary' },
  { label: 'Gastos', icon: Receipt, path: '/ruta/gastos', permiso: 'ruta.gastos', color: 'success' },
];

const ALL_SECTIONS: Section[] = [
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
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleTop = TOP_ITEMS.filter(i => !i.permiso || hasPermisoMovil(i.permiso));
  const visibleSections = ALL_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(i => !i.permiso || hasPermisoMovil(i.permiso)),
  })).filter(section => section.items.length > 0);

  const go = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">Inicio</h1>
      <div className="grid grid-cols-4 gap-3">
        {visibleTop.map(item => {
          const { bg, fg } = colorClasses[item.color];
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-1.5 aspect-square rounded-2xl bg-card border border-border shadow-sm active:scale-95 transition-transform hover:shadow-md"
            >
              <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm', bg, fg)}>
                <item.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-semibold text-foreground text-center leading-tight px-1">
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 aspect-square rounded-2xl bg-card border border-border shadow-sm active:scale-95 transition-transform hover:shadow-md"
        >
          <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground shadow-sm">
            <MoreHorizontal className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-semibold text-foreground text-center leading-tight px-1">Más</span>
        </button>
      </div>

      {/* More bottom sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto bg-card rounded-t-2xl border-t border-border shadow-2xl animate-in slide-in-from-bottom-8 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-card border-b border-border">
              <h2 className="text-base font-bold text-foreground">Todas las opciones</h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-5">
              {visibleSections.map(section => (
                <div key={section.title}>
                  <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3">
                    {section.title}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {section.items.map(item => {
                      const { bg, fg } = colorClasses[item.color];
                      return (
                        <button
                          key={item.path}
                          onClick={() => go(item.path)}
                          className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-background border border-border shadow-sm active:scale-95 transition-transform hover:shadow-md"
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
          </div>
        </div>
      )}
    </div>
  );
}
