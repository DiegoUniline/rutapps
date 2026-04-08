import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Calendar, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { cn, todayLocal } from '@/lib/utils';
import ClienteHistorial from '@/components/ruta/ClienteHistorial';
import { ClienteArrivalCard } from '@/components/ruta/ClienteArrivalCard';
import { toast } from 'sonner';
import { locationService } from '@/lib/locationService';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

// localStorage as offline fallback
const VISITED_KEY = () => `rutapp_visited_${todayLocal()}`;

function getLocalVisitedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY());
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveLocalVisitedSet(set: Set<string>) {
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
  const [localVisited, setLocalVisited] = useState<Set<string>>(getLocalVisitedSet);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { mutate: offlineMutate } = useOfflineMutation();

  // Fetch today's visits from the database (works across devices)
  const todayStr = todayLocal();
  const { data: dbVisitas } = useQuery({
    queryKey: ['ruta-visitas-hoy', empresa?.id, todayStr],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { data } = await supabase
        .from('visitas')
        .select('cliente_id')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', startOfDay)
        .lte('fecha', endOfDay);
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Merge DB visits + local (offline) visits
  const visited = useMemo(() => {
    const merged = new Set(localVisited);
    dbVisitas?.forEach((v: any) => { if (v.cliente_id) merged.add(v.cliente_id); });
    return merged;
  }, [localVisited, dbVisitas]);

  // Sync localStorage on mount, navigation back, and focus
  useEffect(() => {
    setLocalVisited(getLocalVisitedSet());
  }, [location.key]);

  useEffect(() => {
    const onFocus = () => setLocalVisited(getLocalVisitedSet());
    window.addEventListener('focus', onFocus);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setLocalVisited(getLocalVisitedSet());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const markVisited = useCallback((clienteId: string) => {
    setLocalVisited(prev => {
      const next = new Set(prev);
      next.add(clienteId);
      saveLocalVisitedSet(next);
      return next;
    });
  }, []);

  const unmarkVisited = useCallback((clienteId: string) => {
    setLocalVisited(prev => {
      const next = new Set(prev);
      next.delete(clienteId);
      saveLocalVisitedSet(next);
      return next;
    });
  }, []);

  const captureGps = useCallback(async (cliente: any) => {
    const loc = locationService.getLastKnownLocation();
    if (!loc) {
      toast.error('Aún no se tiene ubicación GPS. Espera unos segundos e intenta de nuevo.');
      return;
    }
    setCapturingGpsId(cliente.id);
    await offlineMutate('clientes', 'update', {
      ...cliente,
      gps_lat: loc.lat,
      gps_lng: loc.lng,
    });
    refetch();
    setCapturingGpsId(null);
    toast.success(`GPS guardado para ${cliente.nombre}`);
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

  const handleVender = useCallback((c: any) => {
    markVisited(c.id);
    setExpandedId(null);
    navigate(`/ruta/ventas/nueva?clienteId=${c.id}`);
  }, [markVisited, navigate]);

  const handleNoCompro = useCallback(async (clienteId: string, motivo: string, notas?: string) => {
    markVisited(clienteId);
    setExpandedId(null);
    if (empresa?.id && profile?.user_id) {
      const loc = locationService.getLastKnownLocation();
      await supabase.from('visitas').insert({
        empresa_id: empresa.id,
        cliente_id: clienteId,
        user_id: profile.user_id,
        tipo: 'sin_compra',
        motivo_sin_compra: motivo,
        notas: notas || null,
        fecha: new Date().toISOString(),
        gps_lat: loc?.lat ?? null,
        gps_lng: loc?.lng ?? null,
      });
    }
    toast.success('Visita registrada');
  }, [markVisited, empresa, profile]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

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

        {filtered.map((c: any, idx: number) => (
          <ClienteArrivalCard
            key={c.id}
            cliente={c}
            idx={idx}
            totalItems={filtered.length}
            isVisited={visited.has(c.id)}
            isExpanded={expandedId === c.id}
            modo={modo}
            diaHoy={DIA_HOY}
            capturingGpsId={capturingGpsId}
            onToggleExpand={toggleExpand}
            onMarkVisited={markVisited}
            onUnmarkVisited={unmarkVisited}
            onVender={handleVender}
            onNoCompro={handleNoCompro}
            onMoveItem={moveItem}
            onCaptureGps={captureGps}
            onOpenMaps={openMaps}
            onHistorial={setHistorialCliente}
          />
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            {modo === 'visitados' ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-base">Aún no has visitado clientes hoy</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Toca el número del cliente para abrir las opciones</p>
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
