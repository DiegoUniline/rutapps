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
      <div className="sticky top-0 z-20 bg-background px-4 pt-3 pb-1">
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          <button
            onClick={() => setTab('clientes')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors",
              tab === 'clientes' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Clientes
          </button>
          <button
            onClick={() => setTab('entregas')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors",
              tab === 'entregas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Truck className="h-3.5 w-3.5" />
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
