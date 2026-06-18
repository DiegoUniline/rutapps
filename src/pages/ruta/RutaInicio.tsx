import { useNavigate } from 'react-router-dom';
import { Users, Package, BarChart3, ScanBarcode, Navigation, Receipt, PackageCheck, RefreshCw, UserCircle, ShoppingCart, HandCoins, Truck, Map } from 'lucide-react';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';

type Item = {
  label: string;
  icon: any;
  path: string;
  permiso: string | null;
  color: string;
};

const ITEMS: Item[] = [
  { label: 'Clientes', icon: Users, path: '/ruta', permiso: 'ruta.clientes', color: 'from-blue-500 to-blue-600' },
  { label: 'POS', icon: ScanBarcode, path: '/ruta/pos', permiso: 'ruta.vender', color: 'from-emerald-500 to-emerald-600' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ruta/ventas', permiso: 'ruta.ventas', color: 'from-indigo-500 to-indigo-600' },
  { label: 'Cobros', icon: HandCoins, path: '/ruta/cobros', permiso: 'ruta.cobros', color: 'from-amber-500 to-amber-600' },
  { label: 'Stock', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock', color: 'from-purple-500 to-purple-600' },
  { label: 'Mi carga', icon: Truck, path: '/ruta/carga', permiso: 'ruta.carga', color: 'from-cyan-500 to-cyan-600' },
  { label: 'Navegación', icon: Navigation, path: '/ruta/navegacion', permiso: 'ruta.mapa', color: 'from-orange-500 to-orange-600' },
  { label: 'Mapa', icon: Map, path: '/ruta/mapa', permiso: 'ruta.mapa', color: 'from-rose-500 to-rose-600' },
  { label: 'Gastos', icon: Receipt, path: '/ruta/gastos', permiso: 'ruta.gastos', color: 'from-pink-500 to-pink-600' },
  { label: 'Liquidar', icon: PackageCheck, path: '/ruta/descarga', permiso: 'ruta.descarga', color: 'from-red-500 to-red-600' },
  { label: 'Resumen', icon: BarChart3, path: '/ruta/dashboard', permiso: null, color: 'from-teal-500 to-teal-600' },
  { label: 'Sincronizar', icon: RefreshCw, path: '/ruta/sincronizar', permiso: null, color: 'from-sky-500 to-sky-600' },
  { label: 'Perfil', icon: UserCircle, path: '/ruta/perfil', permiso: null, color: 'from-slate-500 to-slate-600' },
];

export default function RutaInicio() {
  const navigate = useNavigate();
  const { hasPermisoMovil } = usePermisos();
  const items = ITEMS.filter(i => !i.permiso || hasPermisoMovil(i.permiso));

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">Inicio</h1>
      <div className="grid grid-cols-3 gap-3">
        {items.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-card border border-border shadow-sm active:scale-95 transition-transform hover:shadow-md"
          >
            <div className={cn('w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-md', item.color)}>
              <item.icon className="h-6 w-6" />
            </div>
            <span className="text-[11px] font-semibold text-foreground text-center leading-tight px-1">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
