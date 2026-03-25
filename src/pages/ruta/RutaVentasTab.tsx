import { useState } from 'react';
import { ShoppingCart, RotateCcw, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaVentas from './RutaVentas';
import RutaDevolucion from './RutaDevolucion';
import RutaCobros from './RutaCobros';

export default function RutaVentasTab() {
  const [tab, setTab] = useState<'ventas' | 'devoluciones' | 'cobros'>('ventas');

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-20 bg-background px-4 pt-2 pb-0.5">
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab('ventas')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              tab === 'ventas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <ShoppingCart className="h-3 w-3" />
            Ventas
          </button>
          <button
            onClick={() => setTab('devoluciones')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              tab === 'devoluciones' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <RotateCcw className="h-3 w-3" />
            Devoluciones
          </button>
          <button
            onClick={() => setTab('cobros')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              tab === 'cobros' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Banknote className="h-3 w-3" />
            Cobros
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'ventas' && <RutaVentas />}
        {tab === 'devoluciones' && <RutaDevolucion />}
        {tab === 'cobros' && <RutaCobros />}
      </div>
    </div>
  );
}
