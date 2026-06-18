import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ContactRound,
  Package,
  BarChart3,
  Calculator,
  MapPinned,
  ReceiptText,
  PackageCheck,
  RefreshCw,
  UserCircle,
  ShoppingCart,
  Truck,
  Map,
  LayoutGrid,
  X,
  ChevronRight,
  ReceiptCent,
} from 'lucide-react';
import { usePermisos } from '@/hooks/usePermisos';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'orange' | 'green' | 'muted';

type Item = {
  label: string;
  sub: string;
  icon: any;
  path: string;
  permiso: string | null;
  tone: Tone;
};

type Section = { title: string; items: Item[] };

const TOP_ITEMS: Item[] = [
  { label: 'Clientes', sub: 'Cartera y datos', icon: ContactRound, path: '/ruta', permiso: 'ruta.clientes', tone: 'primary' },
  { label: 'Ventas', sub: 'Pedidos y preventa', icon: ShoppingCart, path: '/ruta/ventas', permiso: 'ruta.ventas', tone: 'primary' },
  { label: 'Cobros', sub: 'Pagos y saldos', icon: ReceiptText, path: '/ruta/cobros', permiso: 'ruta.cobros', tone: 'primary' },
  { label: 'Stock', sub: 'Inventario móvil', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock', tone: 'orange' },
  { label: 'Navegación', sub: 'Rutas y visitas', icon: MapPinned, path: '/ruta/navegacion', permiso: 'ruta.mapa', tone: 'primary' },
  { label: 'Gastos', sub: 'Registro operativo', icon: ReceiptCent, path: '/ruta/gastos', permiso: 'ruta.gastos', tone: 'green' },
  { label: 'POS', sub: 'Venta rápida', icon: Calculator, path: '/ruta/pos', permiso: 'ruta.vender', tone: 'primary' },
];

const ALL_SECTIONS: Section[] = [
  {
    title: 'Ventas',
    items: [
      { label: 'Clientes', sub: 'Cartera y datos', icon: ContactRound, path: '/ruta', permiso: 'ruta.clientes', tone: 'primary' },
      { label: 'POS', sub: 'Venta rápida', icon: Calculator, path: '/ruta/pos', permiso: 'ruta.vender', tone: 'primary' },
      { label: 'Ventas', sub: 'Pedidos y preventa', icon: ShoppingCart, path: '/ruta/ventas', permiso: 'ruta.ventas', tone: 'primary' },
      { label: 'Cobros', sub: 'Pagos y saldos', icon: ReceiptText, path: '/ruta/cobros', permiso: 'ruta.cobros', tone: 'primary' },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Stock', sub: 'Inventario móvil', icon: Package, path: '/ruta/stock', permiso: 'ruta.stock', tone: 'orange' },
      { label: 'Mi carga', sub: 'Producto a bordo', icon: Truck, path: '/ruta/carga', permiso: 'ruta.carga', tone: 'orange' },
      { label: 'Liquidar', sub: 'Cierre de ruta', icon: PackageCheck, path: '/ruta/descarga', permiso: 'ruta.descarga', tone: 'orange' },
    ],
  },
  {
    title: 'Logística',
    items: [
      { label: 'Navegación', sub: 'Rutas y visitas', icon: MapPinned, path: '/ruta/navegacion', permiso: 'ruta.mapa', tone: 'primary' },
      { label: 'Mapa', sub: 'Vista general', icon: Map, path: '/ruta/mapa', permiso: 'ruta.mapa', tone: 'primary' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Gastos', sub: 'Registro operativo', icon: ReceiptCent, path: '/ruta/gastos', permiso: 'ruta.gastos', tone: 'green' },
      { label: 'Resumen', sub: 'Indicadores', icon: BarChart3, path: '/ruta/dashboard', permiso: null, tone: 'green' },
      { label: 'Sincronizar', sub: 'Datos al día', icon: RefreshCw, path: '/ruta/sincronizar', permiso: null, tone: 'primary' },
      { label: 'Perfil', sub: 'Tu cuenta', icon: UserCircle, path: '/ruta/perfil', permiso: null, tone: 'muted' },
    ],
  },
];

const toneClasses: Record<Tone, { bg: string; fg: string; chev: string }> = {
  primary: { bg: 'bg-primary/10', fg: 'text-primary', chev: 'text-primary' },
  orange: { bg: 'bg-brand-orange/15', fg: 'text-brand-orange', chev: 'text-brand-orange' },
  green: { bg: 'bg-success/15', fg: 'text-success', chev: 'text-success' },
  muted: { bg: 'bg-muted', fg: 'text-muted-foreground', chev: 'text-muted-foreground' },
};

function Card({ item, onClick, compact = false }: { item: Item; onClick: () => void; compact?: boolean }) {
  const t = toneClasses[item.tone];
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-card border border-border shadow-sm active:scale-[0.97] transition-transform hover:shadow-md px-3 py-4"
    >
      <div className={cn('w-16 h-16 rounded-full flex items-center justify-center', t.bg)}>
        <item.icon className={cn('h-8 w-8', t.fg)} strokeWidth={2} />
      </div>
      <div className="flex flex-col items-center gap-0.5 mt-1">
        <span className={cn('font-bold text-foreground text-center leading-tight', compact ? 'text-[13px]' : 'text-[15px]')}>
          {item.label}
        </span>
        <span className={cn('text-muted-foreground text-center leading-tight', compact ? 'text-[10px]' : 'text-[11px]')}>
          {item.sub}
        </span>
      </div>
      <ChevronRight className={cn('absolute bottom-2 right-2 h-4 w-4', t.chev)} />
    </button>
  );
}

export default function RutaInicio() {
  const navigate = useNavigate();
  const { hasPermisoMovil } = usePermisos();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleTop = TOP_ITEMS.filter(i => !i.permiso || hasPermisoMovil(i.permiso));
  const topPaths = new Set(visibleTop.map(i => i.path));
  const visibleSections = ALL_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(i => (!i.permiso || hasPermisoMovil(i.permiso)) && !topPaths.has(i.path)),
  })).filter(section => section.items.length > 0);

  const moreItem: Item = {
    label: 'Más',
    sub: 'Herramientas',
    icon: LayoutGrid,
    path: '__more__',
    permiso: null,
    tone: 'muted',
  };

  const go = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <div className="p-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        {visibleTop.map(item => (
          <Card key={item.path} item={item} onClick={() => navigate(item.path)} />
        ))}
        <Card item={moreItem} onClick={() => setMoreOpen(true)} />
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto bg-card rounded-t-2xl border-t border-border shadow-2xl animate-in slide-in-from-bottom-8 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-card border-b border-border">
              <h2 className="text-base font-bold text-foreground">Más opciones</h2>
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
                  <div className="grid grid-cols-2 gap-3">
                    {section.items.map(item => (
                      <Card key={item.path} item={item} onClick={() => go(item.path)} compact />
                    ))}
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
