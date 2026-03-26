import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Phone, MapPin, ChevronUp, ChevronDown, Calendar, Navigation, ShoppingCart, Crosshair, Loader2, CheckCircle2, MoreVertical, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useDataVisibility } from '@/hooks/useDataVisibility';
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
  const location = useLocation();
  const { empresa, profile } = useAuth();
  const { clientesVisibilidad } = useDataVisibility('clientes');
  const [search, setSearch] = useState('');
  const [diaFiltro, setDiaFiltro] = useState<string>(DIA_HOY);
  const [modo, setModo] = useState<'visitas' | 'visitados' | 'todos'>('visitas');
  const [historialCliente, setHistorialCliente] = useState<{ id: string; nombre: string } | null>(null);
  const [capturingGpsId, setCapturingGpsId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(getVisitedSet);
  const { mutate: offlineMutate } = useOfflineMutation();

  // Sync visited set from localStorage on mount, navigation back, and focus
  useEffect(() => {
    setVisited(getVisitedSet());
  }, [location.key]);

  useEffect(() => {
    const onFocus = () => setVisited(getVisitedSet());
    window.addEventListener('focus', onFocus);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setVisited(getVisitedSet());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
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

  // Filter by vendedor assignment when visibility is 'propios'
  const myClientes = (clientes ?? []).filter((c: any) => {
    if (clientesVisibilidad === 'propios' && profile?.id) {
      return c.vendedor_id === profile.id;
    }
    return true;
  });

  const filtered = myClientes.filter((c: any) => {
    if (search) {
      const s = search.toLowerCase();
      if (!c.nombre.toLowerCase().includes(s) && !c.codigo?.toLowerCase().includes(s) && !c.direccion?.toLowerCase().includes(s))
        return false;
    }
    if (modo === 'visitas') {
      if (visited.has(c.id)) return false;
      if (!c.dia_visita || !Array.isArray(c.dia_visita)) return false;
      return c.dia_visita.some((d: string) => d.toLowerCase() === diaFiltro.toLowerCase());
    }
    if (modo === 'visitados') {
      return visited.has(c.id);
    }
    return true;
  });

  const visitadosCount = myClientes.filter((c: any) => visited.has(c.id)).length;
  const pendientesCount = myClientes.filter((c: any) => {
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
      <div className="sticky top-0 z-10 bg-card px-4 pt-2 pb-1 space-y-2">

        <div className="flex gap-0.5 bg-card border border-border rounded-lg p-0.5">
          <button
            onClick={() => setModo('visitas')}
            className={cn(
              "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors relative",
              modo === 'visitas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Pendientes
            {pendientesCount > 0 && (
              <span className={cn(
                "ml-0.5 text-[9px] px-1 py-px rounded-full font-bold",
                modo === 'visitas' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
              )}>{pendientesCount}</span>
            )}
          </button>
          <button
            onClick={() => setModo('visitados')}
            className={cn(
              "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors relative",
              modo === 'visitados' ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground"
            )}
          >
            Visitados
            {visitadosCount > 0 && (
              <span className={cn(
                "ml-0.5 text-[9px] px-1 py-px rounded-full font-bold",
                modo === 'visitados' ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-600"
              )}>{visitadosCount}</span>
            )}
          </button>
          <button
            onClick={() => setModo('todos')}
            className={cn(
              "flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
              modo === 'todos' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Todos
          </button>
        </div>

        {modo === 'visitas' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {DIAS.map(d => {
              const count = myClientes.filter((c: any) => c.dia_visita?.some((dv: string) => dv.toLowerCase() === d.toLowerCase())).length;
              return (
                <button
                  key={d}
                  onClick={() => setDiaFiltro(d)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-full text-xs font-semibold transition-colors capitalize",
                    diaFiltro === d ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
                  )}
                >
                  {d.slice(0, 3)}
                  {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre, código o dirección..."
              className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => navigate(`/ruta/clientes/nuevo?vendedorId=${profile?.vendedor_id ?? ''}`)}
            className="shrink-0 h-[44px] w-[44px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform"
            title="Nuevo cliente"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      

      <div className="flex-1 overflow-auto px-4 space-y-2 pb-4 pt-2">
        {isLoading && <p className="text-center text-muted-foreground text-sm py-8">Cargando...</p>}

        {filtered.map((c: any, idx: number) => {
          const isVisited = visited.has(c.id);
          return (
            <div key={c.id} className={cn(
              "bg-card border rounded-xl px-2.5 py-2 active:bg-muted/30 transition-colors",
              isVisited ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
            )}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => isVisited ? unmarkVisited(c.id) : markVisited(c.id)}
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-90 shrink-0",
                    isVisited
                      ? "bg-emerald-500 text-white"
                      : "bg-primary/10 text-primary"
                  )}
                  title={isVisited ? 'Desmarcar visitado' : 'Marcar como visitado'}
                >
                  {isVisited
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <span className="font-bold text-[11px]">{idx + 1}</span>
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setHistorialCliente({ id: c.id, nombre: c.nombre })} className={cn(
                      "text-[13px] font-semibold truncate text-left flex-1 min-w-0",
                      isVisited ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
                    )}>{c.nombre}</button>
                    {c.codigo && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{c.codigo}</span>}
                  </div>
                  {c.direccion && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate leading-tight">
                      <MapPin className="h-2.5 w-2.5 shrink-0" />{c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
                    </p>
                  )}
                  {modo === 'todos' && c.dia_visita && c.dia_visita.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap">
                      {c.dia_visita.map((d: string) => (
                        <span key={d} className={cn(
                          "text-[9px] px-1 py-px rounded-full font-medium capitalize",
                          d === DIA_HOY ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {d.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {modo !== 'visitados' && (
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0}
                      className={cn("p-0.5", idx === 0 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === filtered.length - 1}
                      className={cn("p-0.5", idx === filtered.length - 1 ? "opacity-20" : "text-muted-foreground active:text-primary")}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <button onClick={() => {
                  markVisited(c.id);
                  navigate(`/ruta/ventas/nueva?clienteId=${c.id}`);
                }}
                  className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform shrink-0">
                  <ShoppingCart className="h-3.5 w-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground active:bg-muted shrink-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    <DropdownMenuItem onClick={() => captureGps(c)} disabled={capturingGpsId === c.id}>
                      {capturingGpsId === c.id
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <Crosshair className="h-4 w-4 mr-2" />}
                      {c.gps_lat ? 'Actualizar GPS' : 'Capturar GPS'}
                    </DropdownMenuItem>
                    {c.gps_lat && c.gps_lng && (
                      <DropdownMenuItem onClick={() => openMaps(c.gps_lat!, c.gps_lng!, c.nombre)}>
                        <Navigation className="h-4 w-4 mr-2" />
                        Navegar
                      </DropdownMenuItem>
                    )}
                    {c.telefono && (
                      <DropdownMenuItem onClick={() => window.open(`tel:${c.telefono}`)}>
                        <Phone className="h-4 w-4 mr-2" />
                        Llamar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
