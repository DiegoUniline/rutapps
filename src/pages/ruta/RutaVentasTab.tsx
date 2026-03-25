import { useState } from 'react';
import { ShoppingCart, RotateCcw, Banknote, PackageSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaVentas from './RutaVentas';
import RutaDevolucion from './RutaDevolucion';
import RutaCobros from './RutaCobros';
import RutaProductosVendidos from './RutaProductosVendidos';

export default function RutaVentasTab() {
  const [tab, setTab] = useState<'ventas' | 'devoluciones' | 'cobros' | 'productos'>('ventas');

  const tabs = [
    { key: 'ventas' as const, label: 'Ventas', icon: ShoppingCart },
    { key: 'devoluciones' as const, label: 'Devol.', icon: RotateCcw },
    { key: 'cobros' as const, label: 'Cobros', icon: Banknote },
    { key: 'productos' as const, label: 'Productos', icon: PackageSearch },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-20 bg-background px-4 pt-2 pb-0.5">
        <div className="flex gap-0.5 bg-card rounded-lg p-0.5 border border-border">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'ventas' && <RutaVentas />}
        {tab === 'devoluciones' && <RutaDevolucion />}
        {tab === 'cobros' && <RutaCobros />}
        {tab === 'productos' && <RutaProductosVendidos />}
      </div>
    </div>
  );
}
