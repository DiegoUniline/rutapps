import { useState } from 'react';
import { Users, Truck, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaClientes from './RutaClientes';
import RutaEntregas from './RutaEntregas';
import RutaNavegacionPage from './RutaNavegacionPage';
import RutaSesionBanner from '@/components/ruta/RutaSesionBanner';
import { useAuth } from '@/contexts/AuthContext';

// Empresa de prueba — quitar este filtro para liberar a todos
const EMPRESA_PRUEBA_JORNADA = '6d849e12-6437-4b24-917d-a89cc9b2fa88';

export default function RutaClientesEntregas() {
  const [tab, setTab] = useState<'clientes' | 'entregas' | 'navegacion'>('clientes');
  const { empresa } = useAuth();
  const showJornadaBanner = empresa?.id === EMPRESA_PRUEBA_JORNADA;

  // When navegacion tab is active, render full-screen without tabs
  if (tab === 'navegacion') {
    return (
    <div className="fixed inset-0 z-[60] bg-background">
      <RutaNavegacionPage embedded onBack={() => setTab('clientes')} />
    </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
        <div className="sticky top-0 z-20 bg-card px-4 pt-2 pb-0.5">
        <div className="flex gap-0.5 bg-card border border-border rounded-lg p-0.5">
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
          <button
            onClick={() => setTab('navegacion')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              false ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Navigation className="h-3 w-3" />
            Navegación
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'clientes' && <RutaClientes />}
        {tab === 'entregas' && <RutaEntregas />}
      </div>
    </div>
  );
}
