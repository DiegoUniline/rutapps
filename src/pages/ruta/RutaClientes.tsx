import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Phone, MapPin, ChevronRight, ChevronUp, ChevronDown, Calendar, Filter, GripVertical, Navigation } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIA_HOY = DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

export default function RutaClientes() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [diaFiltro, setDiaFiltro] = useState<string>(DIA_HOY);
  const [showAllDays, setShowAllDays] = useState(false);
  const [modo, setModo] = useState<'visitas' | 'todos'>('visitas');

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['ruta-clientes-full', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, telefono, direccion, colonia, status, dia_visita, orden, gps_lat, gps_lng, zona_id, zonas(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true });
      return data ?? [];
    },
  });

  // Filter by mode and day
  const filtered = (clientes ?? []).filter(c => {
    if (search) {
      const s = search.toLowerCase();
      if (!c.nombre.toLowerCase().includes(s) && !c.codigo?.toLowerCase().includes(s) && !c.direccion?.toLowerCase().includes(s))
        return false;
    }
    if (modo === 'visitas') {
      if (!c.dia_visita || !Array.isArray(c.dia_visita)) return false;
      return c.dia_visita.includes(diaFiltro);
    }
    return true;
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async ({ id, newOrden }: { id: string; newOrden: number }) => {
      const { error } = await supabase.from('clientes').update({ orden: newOrden }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruta-clientes-full'] });
    },
  });

  const moveItem = useCallback((idx: number, direction: 'up' | 'down') => {
    if (!filtered) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= filtered.length) return;

    const currentItem = filtered[idx];
    const targetItem = filtered[targetIdx];

    // Swap orders
    const currentOrden = currentItem.orden ?? idx;
    const targetOrden = targetItem.orden ?? targetIdx;

    reorderMutation.mutate({ id: currentItem.id, newOrden: targetOrden });
    reorderMutation.mutate({ id: targetItem.id, newOrden: currentOrden });
  }, [filtered, reorderMutation]);

  const openMaps = (lat: number, lng: number, nombre: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(nombre)}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-foreground">Clientes</h1>
          <Badge variant="secondary" className="text-[11px]">{filtered.length} clientes</Badge>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          <button
            onClick={() => setModo('visitas')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors",
              modo === 'visitas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5 inline mr-1.5" />
            Visitas del día
          </button>
          <button
            onClick={() => setModo('todos')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors",
              modo === 'todos' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Todos
          </button>
        </div>

        {/* Day pills - only in visitas mode */}
        {modo === 'visitas' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {DIAS.map(d => {
              const count = (clientes ?? []).filter(c => c.dia_visita?.includes(d)).length;
              return (
                <button
                  key={d}
                  onClick={() => setDiaFiltro(d)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors capitalize",
                    diaFiltro === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {d.slice(0, 3)}
                  {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, código o dirección..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 space-y-2 pb-4 pt-2">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}

        {filtered.map((c, idx) => (
          <div
            key={c.id}
            className="bg-card border border-border rounded-2xl p-3.5 active:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Order number + reorder */}
              <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                <button
                  onClick={() => moveItem(idx, 'up')}
                  disabled={idx === 0}
                  className={cn("p-0.5 rounded transition-colors", idx === 0 ? "opacity-20" : "text-muted-foreground active:text-primary")}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold text-[12px]">{idx + 1}</span>
                </div>
                <button
                  onClick={() => moveItem(idx, 'down')}
                  disabled={idx === filtered.length - 1}
                  className={cn("p-0.5 rounded transition-colors", idx === filtered.length - 1 ? "opacity-20" : "text-muted-foreground active:text-primary")}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate">{c.nombre}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.codigo && <span className="text-[10px] text-muted-foreground font-mono">{c.codigo}</span>}
                  {(c as any).zonas?.nombre && (
                    <span className="text-[10px] bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded">{(c as any).zonas.nombre}</span>
                  )}
                </div>
                {c.direccion && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1.5 truncate">
                    <MapPin className="h-3 w-3 shrink-0" /> {c.direccion}{c.colonia ? `, ${c.colonia}` : ''}
                  </p>
                )}
                {modo === 'todos' && c.dia_visita && c.dia_visita.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {c.dia_visita.map((d: string) => (
                      <span key={d} className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                        d === DIA_HOY ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {d.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                {c.gps_lat && c.gps_lng && (
                  <button
                    onClick={() => openMaps(c.gps_lat!, c.gps_lng!, c.nombre)}
                    className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform"
                  >
                    <Navigation className="h-4 w-4" />
                  </button>
                )}
                {c.telefono && (
                  <a
                    href={`tel:${c.telefono}`}
                    className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 active:scale-90 transition-transform"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => navigate(`/ruta/ventas/nueva?clienteId=${c.id}`)}
                  className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-transform"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {modo === 'visitas'
                ? `No hay visitas programadas para el ${diaFiltro}`
                : 'No se encontraron clientes'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
