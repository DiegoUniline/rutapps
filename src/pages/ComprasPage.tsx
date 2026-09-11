import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Lightbulb, PackageCheck, ReceiptText, Truck } from 'lucide-react';
import OrdenesCompraLegacy from './compras/OrdenesCompraLegacy';
import SolicitudesCompraPage from './compras/SolicitudesCompraPage';
import { cn } from '@/lib/utils';

const tabs = [
  { key: 'ordenes', label: 'Órdenes de compra', icon: ReceiptText, to: '/almacen/compras?vista=ordenes' },
  { key: 'solicitudes', label: 'Solicitudes de compra', icon: ClipboardList, to: '/almacen/compras?vista=solicitudes' },
  { key: 'sugeridas', label: 'Compras sugeridas', icon: Lightbulb, to: '/almacen/compras/sugeridas' },
  { key: 'proveedores', label: 'Proveedores', icon: Truck, to: '/proveedores' },
  { key: 'cxp', label: 'CxP / Saldos', icon: PackageCheck, to: '/finanzas/por-pagar' },
];

export default function ComprasPage() {
  const [sp] = useSearchParams();
  const vista = sp.get('vista') === 'solicitudes' ? 'solicitudes' : 'ordenes';

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="px-3 sm:px-4 py-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max">
            {tabs.map(tab => {
              const active = tab.key === vista;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {vista === 'solicitudes' ? <SolicitudesCompraPage /> : <OrdenesCompraLegacy />}
    </div>
  );
}
