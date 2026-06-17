import { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, RotateCcw, Banknote, PackageSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaVentas from './RutaVentas';
import RutaDevolucion from './RutaDevolucion';
import RutaCobros from './RutaCobros';
import RutaProductosVendidos from './RutaProductosVendidos';
import { usePermisos } from '@/hooks/usePermisos';

type Tab = 'ventas' | 'devoluciones' | 'cobros' | 'productos';

export default function RutaVentasTab() {
  const { hasPermisoMovil } = usePermisos();

  const canVentas = hasPermisoMovil('ruta.ventas_hist');
  const canDevoluciones = hasPermisoMovil('ruta.devoluciones');
  const canCobros = hasPermisoMovil('ruta.cobros_hist');

  const tabs = useMemo(() => {
    const arr: { key: Tab; label: string; icon: typeof ShoppingCart }[] = [];
    if (canVentas) arr.push({ key: 'ventas', label: 'Ventas', icon: ShoppingCart });
    if (canDevoluciones) arr.push({ key: 'devoluciones', label: 'Devol.', icon: RotateCcw });
    if (canCobros) arr.push({ key: 'cobros', label: 'Cobros', icon: Banknote });
    if (canVentas) arr.push({ key: 'productos', label: 'Productos', icon: PackageSearch });
    return arr;
  }, [canVentas, canDevoluciones, canCobros]);

  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'ventas');

  useEffect(() => {
    if (!tabs.find(t => t.key === tab) && tabs[0]) {
      setTab(tabs[0].key);
    }
  }, [tabs, tab]);

  return (
    <div className="flex flex-col h-full">
      {tabs.length > 1 && (
        <div className="sticky top-0 z-20 bg-background px-4 pt-2 pb-0.5">
          <div className="flex gap-0.5 bg-accent rounded-lg p-[4px] border-0">
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
      )}

      <div className="flex-1 overflow-auto">
        {tab === 'ventas' && canVentas && <RutaVentas />}
        {tab === 'devoluciones' && canDevoluciones && <RutaDevolucion />}
        {tab === 'cobros' && canCobros && <RutaCobros />}
        {tab === 'productos' && canVentas && <RutaProductosVendidos />}
      </div>
    </div>
  );
}
