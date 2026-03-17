import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Phone, MapPin, ChevronUp, ChevronDown, Calendar, Navigation, ShoppingCart, MapPinned, Crosshair, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import AlertasVendedor from '@/components/ruta/AlertasVendedor';
import ClienteHistorial from '@/components/ruta/ClienteHistorial';
import { toast } from 'sonner';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

// Persist visited clients per day in localStorage
const VISITED_KEY = () => `rutapp_visited_${new Date().toISOString().slice(0, 10)}`;

function getVisitedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY());
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveVisitedSet(set: Set<string>) {
  localStorage.setItem(VISITED_KEY(), JSON.stringify([...set]));
}

export default function RutaClientes() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');
  const [diaFiltro, setDiaFiltro] = useState<string>(DIA_HOY);
  const [modo, setModo] = useState<'visitas' | 'visitados' | 'todos'>('visitas');
  const [historialCliente, setHistorialCliente] = useState<{ id: string; nombre: string } | null>(null);
  const [capturingGpsId, setCapturingGpsId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(getVisitedSet);
  const { mutate: offlineMutate } = useOfflineMutation();

  // Sync visited set from localStorage on mount AND when navigating back
  useEffect(() => {
    setVisited(getVisitedSet());
    const onFocus = () => setVisited(getVisitedSet());
    window.addEventListener('focus', onFocus);
    // Also listen for visibility change (covers mobile tab switches & navigation)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setVisited(getVisitedSet());
    };
    document.addEventListener('visibilitychange', onVisible);
    // Also listen for popstate (back/forward navigation)
    window.addEventListener('popstate', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('popstate', onFocus);
    };
  }, []);

  const markVisited = useCallback((clienteId: string) => {
    setVisited(prev => {
      const next = new Set(prev);
      next.add(clienteId);
      saveVisitedSet(next);
      return next;
    });
  }, []);

  const unmarkVisited = useCallback((clienteId: string) => {
    setVisited(prev => {
      const next = new Set(prev);
      next.delete(clienteId);
      saveVisitedSet(next);
      return next;
    });
  }, []);

  const captureGps = useCallback(async (cliente: any) => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta GPS');
      return;
    }
    setCapturingGpsId(cliente.id);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await offlineMutate('clientes', 'update', {
          ...cliente,
          gps_lat: latitude,
          gps_lng: longitude,
        });
        refetch();
        setCapturingGpsId(null);
        toast.success(`GPS guardado para ${cliente.nombre}`);
      },
      (err) => {
        setCapturingGpsId(null);
        toast.error(err.code === 1 ? 'Permiso de GPS denegado' : 'No se pudo obtener ubicación');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [offlineMutate]);

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
      if (visited.has(c.id)) return false; // Hide already visited
      if (!c.dia_visita || !Array.isArray(c.dia_visita)) return false;
      return c.dia_visita.some((d: string) => d.toLowerCase() === diaFiltro.toLowerCase());
    }
    if (modo === 'visitados') {
      return visited.has(c.id);
    }
    return true;
  });

  const visitadosCount = (clientes ?? []).filter((c: any) => visited.has(c.id)).length;
  const pendientesCount = (clientes ?? []).filter((c: any) => {
    if (visited.has(c.id)) return false;
    if (!c.dia_visita || !Array.isArray(c.dia_visita)) return false;
    return c.dia_visita.some((d: string) => d.toLowerCase() === diaFiltro.toLowerCase());
  }).length;

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
              "flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors relative",
              modo === 'visitas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5 inline mr-1" />
            Pendientes
            {pendientesCount > 0 && (
              <span className={cn(
                "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                modo === 'visitas' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
              )}>{pendientesCount}</span>
            )}
          </button>
          <button
            onClick={() => setModo('visitados')}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors relative",
              modo === 'visitados' ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
            Visitados
            {visitadosCount > 0 && (
              <span className={cn(
                "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                modo === 'visitados' ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-600"
              )}>{visitadosCount}</span>
            )}
          </button>
          <button
            onClick={() => setModo('todos')}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors",
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

        {filtered.map((c: any, idx: number) => {
          const isVisited = visited.has(c.id);
          return (
            <div key={c.id} className={cn(
              "bg-card border rounded-2xl p-3 active:bg-muted/30 transition-colors",
              isVisited ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
            )}>
              <div className="flex items-start gap-2.5">
                <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                  {modo !== 'visitados' && (
                    <>
                      <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0}
                        className={cn("p-0.5 rounded transition-colors", idx === 0 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => isVisited ? unmarkVisited(c.id) : markVisited(c.id)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90",
                      isVisited
                        ? "bg-emerald-500 text-white"
                        : "bg-primary/10 text-primary"
                    )}
                    title={isVisited ? 'Desmarcar visitado' : 'Marcar como visitado'}
                  >
                    {isVisited
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <span className="font-bold text-xs">{idx + 1}</span>
                    }
                  </button>
                  {modo !== 'visitados' && (
                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === filtered.length - 1}
                      className={cn("p-0.5 rounded transition-colors", idx === filtered.length - 1 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <button onClick={() => setHistorialCliente({ id: c.id, nombre: c.nombre })} className={cn(
                    "text-sm font-semibold truncate text-left underline-offset-2 active:underline",
                    isVisited ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
                  )}>{c.nombre}</button>
                  {c.codigo && <span className="text-[11px] text-muted-foreground font-mono ml-1.5">{c.codigo}</span>}
                  {isVisited && <span className="text-[10px] ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">✓ Visitado</span>}
                  {c.direccion && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" /> {c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
                    </p>
                  )}
                  {modo === 'todos' && c.dia_visita && c.dia_visita.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.dia_visita.map((d: string) => (
                        <span key={d} className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                          d === DIA_HOY ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {d.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => captureGps(c)}
                      disabled={capturingGpsId === c.id}
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center active:scale-90 transition-transform",
                        c.gps_lat && c.gps_lng
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      )}
                      title={c.gps_lat ? 'Actualizar GPS' : 'Capturar GPS'}
                    >
                      {capturingGpsId === c.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Crosshair className="h-4 w-4" />}
                    </button>
                    {c.gps_lat && c.gps_lng && (
                      <button onClick={() => openMaps(c.gps_lat!, c.gps_lng!, c.nombre)}
                        className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
                        <Navigation className="h-4 w-4" />
                      </button>
                    )}
                    {c.telefono && (
                      <a href={`tel:${c.telefono}`}
                        className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 active:scale-90 transition-transform">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                    <button onClick={() => {
                      markVisited(c.id);
                      navigate(`/ruta/ventas/nueva?clienteId=${c.id}`);
                    }}
                      className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform ml-auto">
                      <ShoppingCart className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            {modo === 'visitados' ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-base">Aún no has visitado clientes hoy</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Toca el número del cliente para marcarlo como visitado</p>
              </>
            ) : (
              <>
                <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-base">
                  {modo === 'visitas'
                    ? pendientesCount === 0 && visitadosCount > 0
                      ? '🎉 ¡Visitaste a todos los clientes del día!'
                      : `No hay visitas programadas para el ${diaFiltro}`
                    : 'No se encontraron clientes'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {historialCliente && (
        <ClienteHistorial clienteId={historialCliente.id} clienteNombre={historialCliente.nombre} onClose={() => setHistorialCliente(null)} />
      )}
    </div>
  );
}
