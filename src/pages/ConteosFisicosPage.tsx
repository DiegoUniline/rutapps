import { useState, useMemo } from 'react';
import { mesActualLocal } from '@/hooks/useListPreferences';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Plus, Search, Eye, Smartphone, Warehouse } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import CrearConteoDialog from '@/components/conteos/CrearConteoDialog';
import ConteoDetailModal from '@/components/conteos/ConteoDetailModal';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useIsMobile } from '@/hooks/use-mobile';
import { ListaTarjetaMovil, ListaTarjetasMovil, EncabezadoListaMovil, estadoPildora, useCargarMasMovil } from '@/components/layout/ListaTarjetaMovil';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { ordenarPorRelevancia } from '@/lib/busquedaRelevancia';


const STATUS_MAP: Record<string, { label: string; color: string }> = {
  abierto: { label: 'Abierto', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  en_progreso: { label: 'En Progreso', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  cerrado: { label: 'Cerrado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function ConteosFisicosPage() {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState(() => mesActualLocal().from);
  const [fechaHasta, setFechaHasta] = useState(() => mesActualLocal().to);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useRealtimeInvalidate({
    table: 'conteos_fisicos',
    empresaId: empresa?.id,
    queryKeys: [['conteos-fisicos']],
  });

  const { data: conteos, isLoading } = useQuery({
    // Abre en el mes actual y filtra fechas en la BD.
    queryKey: ['conteos-fisicos', empresa?.id, fechaDesde, fechaHasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Todas las páginas (antes se cortaba en 1 000 renglones).
      return fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('conteos_fisicos')
          .select('*, almacenes(nombre), clasificaciones(nombre)')
          .eq('empresa_id', empresa!.id);
        if (fechaDesde) q = q.gte('created_at', fechaDesde);
        if (fechaHasta) q = q.lt('created_at', `${fechaHasta}T23:59:59.999`);
        return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
      });
    },
  });

  const filtered = useMemo(() => {
    let list = conteos ?? [];
    if (statusFilter !== 'todos') list = list.filter((c: any) => c.status === statusFilter);
    if (fechaDesde) list = list.filter((c: any) => (c.fecha_apertura ?? c.created_at ?? '').slice(0, 10) >= fechaDesde);
    if (fechaHasta) list = list.filter((c: any) => (c.fecha_apertura ?? c.created_at ?? '').slice(0, 10) <= fechaHasta);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) =>
        c.folio.toLowerCase().includes(s) ||
        (c.almacenes as any)?.nombre?.toLowerCase().includes(s)
      );
    }
    // D-046: con búsqueda, folio exacto primero, luego «empieza con», luego el resto (orden normal dentro de cada grupo).
    return ordenarPorRelevancia(list, search, (c: any) => [c.folio], (c: any) => [(c.almacenes as any)?.nombre]);
  }, [conteos, statusFilter, search, fechaDesde, fechaHasta]);


  const activos = (conteos ?? []).filter((c: any) => c.status === 'abierto' || c.status === 'en_progreso').length;
  const total = (conteos ?? []).length;
  const difTotal = (conteos ?? []).filter((c: any) => c.status === 'cerrado').reduce((s: number, c: any) => s + (c.diferencia_total_valor ?? 0), 0);

  const filters = [
    { key: 'todos', label: 'Todos' },
    { key: 'abierto', label: 'Abierto' },
    { key: 'en_progreso', label: 'En Progreso' },
    { key: 'cerrado', label: 'Cerrado' },
    { key: 'cancelado', label: 'Cancelado' },
  ];
  const movil = useCargarMasMovil(filtered, `${search}|${statusFilter}|${fechaDesde}|${fechaHasta}`);

  return (
    <div className="p-2 md:p-4 min-h-full">
    {/* D-037: una sola hoja blanca */}
    <div className="bg-card border border-border rounded-xl shadow-sm px-3 md:px-4 py-3 space-y-3">
      {isMobile && (
        <EncabezadoListaMovil
          titulo="Conteos físicos"
          estado={statusFilter !== 'todos' ? filters.find(f => f.key === statusFilter)?.label : undefined}
          onNuevo={() => setShowCreate(true)}
          nuevoLabel="Nuevo conteo"
        >
          <OdooFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Buscar conteos"
            filterOptions={[{ key: 'status', label: 'Estado', options: filters.filter(f => f.key !== 'todos').map(f => ({ value: f.key, label: f.label })) }]}
            activeFilters={statusFilter !== 'todos' ? { status: [statusFilter] } : {}}
            onToggleFilter={(_k, val) => setStatusFilter(prev => prev === val ? 'todos' : val)}
            onSetFilter={(_k, vals) => setStatusFilter(vals[vals.length - 1] ?? 'todos')}
            onClearFilters={() => setStatusFilter('todos')}
            dateFrom={fechaDesde}
            dateTo={fechaHasta}
            onDateRangeChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }}
            onDateFromChange={setFechaDesde}
            onDateToChange={setFechaHasta}
          />
        </EncabezadoListaMovil>
      )}
      <div className="flex items-center justify-between max-md:hidden">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Conteos Físicos
        </h1>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 divide-x divide-border border-y border-border -mx-3 md:-mx-4 max-md:hidden">
        <div className="px-3 md:px-4 py-2.5 min-w-0">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Activos</p>
          <p className="text-base sm:text-2xl font-bold truncate">{activos}</p>
        </div>
        <div className="px-3 md:px-4 py-2.5 min-w-0">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total</p>
          <p className="text-base sm:text-2xl font-bold truncate">{total}</p>
        </div>
        <div className="px-3 md:px-4 py-2.5 min-w-0">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Diferencia</p>
          <p className={cn("text-base sm:text-2xl font-bold truncate", difTotal >= 0 ? "text-green-600" : "text-red-600")}>
            {fmt(difTotal)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap max-md:hidden">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              statusFilter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
        <DateRangePicker from={fechaDesde} to={fechaHasta} onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }} />
        <div className="relative w-full sm:w-auto sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9 h-9 sm:h-8 w-full sm:w-48" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>


      {/* Table */}
      {isMobile ? (
        isLoading ? <div className="text-center py-12 text-muted-foreground text-sm">Cargando...</div> : (
        <ListaTarjetasMovil aLoAncho vacia={movil.total === 0} mensajeVacio="Sin conteos" {...movil}>
          {movil.visibles.map((c: any) => {
            const st = STATUS_MAP[c.status] ?? STATUS_MAP.abierto;
            const abierto = c.status === 'abierto' || c.status === 'en_progreso';
            return (
              <ListaTarjetaMovil
                key={c.id}
                titulo={(c.almacenes as any)?.nombre ?? '—'}
                linea2={<>{format(new Date(c.abierto_en), 'dd/MM/yy HH:mm', { locale: es })} · {c.productos_contados ?? 0}/{c.total_productos ?? 0} contados<span className="text-xs"> · {c.folio}</span></>}
                {...(c.status === 'cerrado'
                  ? { pildora: fmt(c.diferencia_total_valor ?? 0), tono: (c.diferencia_total_valor ?? 0) >= 0 ? 'exito' as const : 'peligro' as const }
                  : estadoPildora(c.status, st.label))}
                onClick={() => setSelectedId(c.id)}
                acciones={abierto ? [
                  { key: 'ver', label: 'Ver detalle', icon: Eye, onClick: () => setSelectedId(c.id) },
                  { key: 'contar', label: 'Ir a contar', icon: Smartphone, onClick: () => navigate(`/conteo/${c.id}`) },
                ] : undefined}
              />
            );
          })}
        </ListaTarjetasMovil>
        )
      ) : (
      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Almacén</TableHead>
              <TableHead className="text-[11px]">Progreso</TableHead>
              <TableHead className="text-[11px]">Estado</TableHead>
              <TableHead className="text-[11px]">Apertura</TableHead>
              <TableHead className="text-[11px] text-right">Diferencia</TableHead>
              <TableHead className="text-[11px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin conteos</TableCell></TableRow>
            )}
            {filtered.map((c: any) => {
              const st = STATUS_MAP[c.status] ?? STATUS_MAP.abierto;
              const pct = c.total_productos > 0 ? Math.round((c.productos_contados / c.total_productos) * 100) : 0;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.folio}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <Warehouse className="h-3 w-3 text-muted-foreground" />
                      {(c.almacenes as any)?.nombre ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{c.productos_contados}/{c.total_productos}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", st.color)}>{st.label}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(c.abierto_en), 'dd/MM/yy HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {c.status === 'cerrado' ? (
                      <span className={c.diferencia_total_valor >= 0 ? "text-green-600" : "text-red-600"}>
                        {fmt(c.diferencia_total_valor ?? 0)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedId(c.id)} title="Ver detalle">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {(c.status === 'abierto' || c.status === 'en_progreso') && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/conteo/${c.id}`)} title="Ir a contar">
                          <Smartphone className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      {showCreate && (
        <CrearConteoDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['conteos-fisicos'] });
          }}
        />
      )}

      {selectedId && (
        <ConteoDetailModal
          conteoId={selectedId}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
    </div>
  );
}
