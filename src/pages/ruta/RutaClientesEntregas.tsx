import { useState, useMemo, useEffect } from 'react';
import { Users, Truck, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import RutaClientes from './RutaClientes';
import RutaEntregas from './RutaEntregas';
import RutaNavegacionPage from './RutaNavegacionPage';
import RutaSesionBanner from '@/components/ruta/RutaSesionBanner';
import { useEmpresaJornadaConfig } from '@/hooks/useEmpresaJornadaConfig';
import { usePermisos } from '@/hooks/usePermisos';

type Tab = 'clientes' | 'entregas' | 'navegacion';

export default function RutaClientesEntregas() {
  const { hasPermisoMovil } = usePermisos();
  const { requireJornada } = useEmpresaJornadaConfig();
  const showJornadaBanner = requireJornada;

  const canClientes = hasPermisoMovil('ruta.clientes');
  const canEntregas = hasPermisoMovil('ruta.entregas');
  const canMapa = hasPermisoMovil('ruta.mapa');

  const visibleTabs = useMemo(() => {
    const arr: { key: Tab; label: string; icon: typeof Users }[] = [];
    if (canClientes) arr.push({ key: 'clientes', label: 'Clientes', icon: Users });
    if (canEntregas) arr.push({ key: 'entregas', label: 'Entregas', icon: Truck });
    if (canMapa) arr.push({ key: 'navegacion', label: 'Navegación', icon: Navigation });
    return arr;
  }, [canClientes, canEntregas, canMapa]);

  const [tab, setTab] = useState<Tab>(canClientes ? 'clientes' : (canEntregas ? 'entregas' : 'navegacion'));

  // If permissions change and the current tab gets removed, jump to the first visible one.
  useEffect(() => {
    if (!visibleTabs.find(t => t.key === tab) && visibleTabs[0]) {
      setTab(visibleTabs[0].key);
    }
  }, [visibleTabs, tab]);

  // Navegación full-screen
  if (tab === 'navegacion' && canMapa) {
    return (
      <div className="fixed inset-0 z-[60] bg-background">
        <RutaNavegacionPage embedded onBack={() => setTab(canClientes ? 'clientes' : (canEntregas ? 'entregas' : 'navegacion'))} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showJornadaBanner && (
        <div className="px-4 pt-3">
          <RutaSesionBanner />
        </div>
      )}
      {visibleTabs.length > 1 && (
        <div className="sticky top-0 z-20 bg-card px-4 pt-2 pb-0.5">
          <div className="flex gap-0.5 bg-card border border-border rounded-lg p-0.5">
            {visibleTabs.map(t => (
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
        {tab === 'clientes' && canClientes && <RutaClientes />}
        {tab === 'entregas' && canEntregas && <RutaEntregas />}
      </div>
    </div>
  );
}
