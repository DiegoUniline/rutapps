import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Phone, MapPin, ChevronUp, ChevronDown, Calendar, Navigation, ShoppingCart, MapPinned, Crosshair, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import AlertasVendedor from '@/components/ruta/AlertasVendedor';
import ClienteHistorial from '@/components/ruta/ClienteHistorial';
import { toast } from 'sonner';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

export default function RutaClientes() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');
  const [diaFiltro, setDiaFiltro] = useState<string>(DIA_HOY);
  const [modo, setModo] = useState<'visitas' | 'todos'>('visitas');
  const [historialCliente, setHistorialCliente] = useState<{ id: string; nombre: string } | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();

  const { data: clientes, isLoading, refetch } = useOfflineQuery('clientes', {
    empresa_id: empresa?.id,
    status: 'activo',
  }, {
    enabled: !!empresa?.id,
    orderBy: 'orden',
  });

  const filtered = (clientes ?? []).filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      if (!c.nombre.toLowerCase().includes(s) && !c.codigo?.toLowerCase().includes(s) && !c.direccion?.toLowerCase().includes(s))
        return false;
    }
    if (modo === 'visitas') {
      if (!c.dia_visita || !Array.isArray(c.dia_visita)) return false;
      return c.dia_visita.some((d: string) => d.toLowerCase() === diaFiltro.toLowerCase());
    }
    return true;
  });

  const moveItem = useCallback(async (idx: number, direction: 'up' | 'down') => {
    if (!filtered) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= filtered.length) return;

    const currentItem = filtered[idx] as any;
    const targetItem = filtered[targetIdx] as any;
    const currentOrden = currentItem.orden ?? idx;
    const targetOrden = targetItem.orden ?? targetIdx;

    await offlineMutate('clientes', 'update', { ...currentItem, orden: targetOrden });
    await offlineMutate('clientes', 'update', { ...targetItem, orden: currentOrden });
    refetch();
  }, [filtered, offlineMutate, refetch]);

  const openMaps = (lat: number, lng: number, nombre: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(nombre)}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Clientes</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/ruta/mapa')}
              className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform"
            >
              <MapPinned className="h-5 w-5" />
            </button>
            <Badge variant="secondary" className="text-sm">{filtered.length}</Badge>
          </div>
        </div>

        <div className="flex gap-1 bg-muted rounded-xl p-1">
          <button
            onClick={() => setModo('visitas')}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors",
              modo === 'visitas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Calendar className="h-4 w-4 inline mr-1.5" />
            Visitas del día
          </button>
          <button
            onClick={() => setModo('todos')}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors",
              modo === 'todos' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Todos
          </button>
        </div>

        {modo === 'visitas' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {DIAS.map(d => {
              const count = (clientes ?? []).filter((c: any) => c.dia_visita?.some((dv: string) => dv.toLowerCase() === d.toLowerCase())).length;
              return (
                <button
                  key={d}
                  onClick={() => setDiaFiltro(d)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-full text-xs font-semibold transition-colors capitalize",
                    diaFiltro === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {d.slice(0, 3)}
                  {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, código o dirección..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <AlertasVendedor />

      <div className="flex-1 overflow-auto px-4 space-y-2 pb-4 pt-2">
        {isLoading && <p className="text-center text-muted-foreground text-sm py-8">Cargando...</p>}

        {filtered.map((c: any, idx: number) => (
          <div key={c.id} className="bg-card border border-border rounded-2xl p-4 active:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0}
                  className={cn("p-1 rounded transition-colors", idx === 0 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                  <ChevronUp className="h-4 w-4" />
                </button>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">{idx + 1}</span>
                </div>
                <button onClick={() => moveItem(idx, 'down')} disabled={idx === filtered.length - 1}
                  className={cn("p-1 rounded transition-colors", idx === filtered.length - 1 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <button onClick={() => setHistorialCliente({ id: c.id, nombre: c.nombre })} className="text-base font-semibold text-foreground truncate text-left underline-offset-2 active:underline">{c.nombre}</button>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.codigo && <span className="text-xs text-muted-foreground font-mono">{c.codigo}</span>}
                </div>
                {c.direccion && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
                  </p>
                )}
                {modo === 'todos' && c.dia_visita && c.dia_visita.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {c.dia_visita.map((d: string) => (
                      <span key={d} className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full font-medium capitalize",
                        d === DIA_HOY ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {d.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-1.5 shrink-0">
                {c.gps_lat && c.gps_lng && (
                  <button onClick={() => openMaps(c.gps_lat!, c.gps_lng!, c.nombre)}
                    className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
                    <Navigation className="h-5 w-5" />
                  </button>
                )}
                {c.telefono && (
                  <a href={`tel:${c.telefono}`}
                    className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 active:scale-90 transition-transform">
                    <Phone className="h-5 w-5" />
                  </a>
                )}
                <button onClick={() => navigate(`/ruta/ventas/nueva?clienteId=${c.id}`)}
                  className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
                  <ShoppingCart className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-base">
              {modo === 'visitas' ? `No hay visitas programadas para el ${diaFiltro}` : 'No se encontraron clientes'}
            </p>
          </div>
        )}
      </div>

      {historialCliente && (
        <ClienteHistorial clienteId={historialCliente.id} clienteNombre={historialCliente.nombre} onClose={() => setHistorialCliente(null)} />
      )}
    </div>
  );
}
