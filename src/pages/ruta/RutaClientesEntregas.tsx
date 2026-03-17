import { useState } from 'react';
import { Users, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaClientes from './RutaClientes';
import RutaEntregas from './RutaEntregas';

export default function RutaClientesEntregas() {
  const [tab, setTab] = useState<'clientes' | 'entregas'>('clientes');

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-background px-4 pt-2 pb-0.5">
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab('clientes')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              tab === 'clientes' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Users className="h-3 w-3" />
            Clientes
          </button>
          <button
            onClick={() => setTab('entregas')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              tab === 'entregas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Truck className="h-3 w-3" />
            Entregas
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'clientes' ? <RutaClientes /> : <RutaEntregas />}
      </div>
    </div>
  );
}
