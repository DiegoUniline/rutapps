import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { mesActualLocal } from '@/hooks/useListPreferences';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { SingleDatePicker } from '@/components/shared/SingleDatePicker';
import { useState, useMemo, useEffect } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, Plus, Trash2, Save, Pencil, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { fmtDate, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { confirmDialog } from '@/lib/confirm';
import { usePinAuth } from '@/hooks/usePinAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { ListaTarjetaMovil, ListaTarjetasMovil, EncabezadoListaMovil, useCargarMasMovil } from '@/components/layout/ListaTarjetaMovil';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { ordenarPorRelevancia } from '@/lib/busquedaRelevancia';
import { useSortableTable, SortableTableHead } from '@/hooks/useSortableTable';

function useGastos(desde: string, hasta: string) {
  const { empresa } = useAuth();
  return useQuery({
    // Abre en el mes actual y filtra fechas en la BD.
    queryKey: ['gastos-desktop', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Todas las páginas (antes se cortaba en 1 000 renglones).
      return fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('gastos')
          .select('*, vendedores:profiles!vendedor_id(id,nombre)').is('cancelado_at', null)
          .eq('empresa_id', empresa!.id);
        if (desde) q = q.gte('fecha', desde);
        if (hasta) q = q.lte('fecha', hasta);
        return q.order('fecha', { ascending: false }).order('id', { ascending: true }).range(from, to);
      });
    },
  });
}

function useVendedores() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['profiles-vendedores', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,nombre')
        .eq('empresa_id', empresa!.id)
        .eq('estado', 'activo')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function GastosDesktopPage() {
  const { fmt } = useCurrency();
  const { empresa, user, profile } = useAuth();
  const qc = useQueryClient();
  const { requestPin, PinDialog } = usePinAuth();
  const isMobile = useIsMobile();

  // Filters
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState<string>('all');
  const [desde, setDesde] = useState(() => mesActualLocal().from);
  const [hasta, setHasta] = useState(() => mesActualLocal().to);

  const { data: gastos, isLoading } = useGastos(desde, hasta);
  const { data: vendedores } = useVendedores();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayInTimezone(empresa?.zona_horaria));
  const [notas, setNotas] = useState('');
  const [vendedorIdForm, setVendedorIdForm] = useState<string>('me');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightId]);

  const resetForm = () => {
    setEditId(null); setConcepto(''); setMonto(''); setNotas('');
    setFecha(todayInTimezone(empresa?.zona_horaria));
    setVendedorIdForm('me');
  };

  const startEdit = (g: any) => {
    setEditId(g.id);
    setConcepto(g.concepto ?? '');
    setMonto(String(g.monto ?? ''));
    setFecha(g.fecha);
    setNotas(g.notas ?? '');
    setVendedorIdForm(g.vendedor_id ?? 'none');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveGasto = useMutation({
    mutationFn: async () => {
      if (!concepto || !monto) throw new Error('Completa concepto y monto');
      const vId = vendedorIdForm === 'me' ? (profile?.id ?? null)
        : vendedorIdForm === 'none' ? null
        : vendedorIdForm;
      const payload = {
        concepto,
        monto: parseFloat(monto),
        fecha,
        notas: notas || null,
        vendedor_id: vId,
      };
      if (editId) {
        const { data, error } = await supabase.from('gastos').update(payload).eq('id', editId).select('id').single();
        if (error) throw error;
        return data?.id as string;
      } else {
        const { data, error } = await supabase.from('gastos').insert({
          ...payload,
          empresa_id: empresa!.id,
          user_id: user!.id,
        }).select('id').single();
        if (error) throw error;
        return data?.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success(editId ? 'Gasto actualizado' : 'Gasto registrado');
      qc.invalidateQueries({ queryKey: ['gastos-desktop'] });
      setShowForm(false);
      resetForm();
      if (id) setHighlightId(id);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteGasto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gasto eliminado');
      qc.invalidateQueries({ queryKey: ['gastos-desktop'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (g: any) => {
    if (!(await confirmDialog(`¿Eliminar gasto "${g.concepto}" por ${fmt(g.monto)}?`))) return;
    requestPin(
      'Eliminar gasto',
      'Ingresa el PIN de administrador para confirmar la eliminación.',
      () => deleteGasto.mutate(g.id),
    );
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const lista = (gastos ?? []).filter((g: any) => {
      if (s && !((g.concepto ?? '').toLowerCase().includes(s) || (g.notas ?? '').toLowerCase().includes(s))) return false;
      if (vendedorFilter === 'none' && g.vendedor_id) return false;
      if (vendedorFilter !== 'all' && vendedorFilter !== 'none' && g.vendedor_id !== vendedorFilter) return false;
      if (desde && g.fecha < desde) return false;
      if (hasta && g.fecha > hasta) return false;
      return true;
    });
    // D-047: con búsqueda, folio exacto primero, luego «empieza con», luego el resto (orden normal dentro de cada grupo).
    return ordenarPorRelevancia(lista, search, () => [], (g: any) => [g.concepto, g.notas]);
  }, [gastos, search, vendedorFilter, desde, hasta]);

  // Orden por columna (todos los gastos del periodo ya están en memoria).
  const ordenGastos = useSortableTable(filtered, (g: any, k) => {
    if (k === 'vendedor') return g.vendedores?.nombre ?? '';
    if (k === 'monto') return Number(g.monto ?? 0);
    return g?.[k];
  }, undefined, 'gastos');

  const totalGastos = filtered.reduce((s, g: any) => s + Number(g.monto ?? 0), 0);
  const hasFilters = !!search || vendedorFilter !== 'all' || !!desde || !!hasta;

  const movil = useCargarMasMovil(filtered, `${search}|${vendedorFilter}|${desde}|${hasta}`);
  return (
    <div className="p-2 md:p-4 min-h-full">
    {/* D-037: una sola hoja blanca */}
    <div className="bg-card border border-border rounded-xl shadow-sm px-3 md:px-4 py-3 space-y-3">
      {isMobile && (
        <EncabezadoListaMovil titulo="Gastos" onNuevo={() => { if (showForm) { setShowForm(false); resetForm(); } else { setShowForm(true); } }} nuevoLabel="Nuevo gasto">
          <OdooFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Buscar gastos"
            filterOptions={[{ key: 'vendedor', label: 'Vendedor', options: [{ value: 'none', label: 'Sin vendedor' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))] }]}
            activeFilters={vendedorFilter !== 'all' ? { vendedor: [vendedorFilter] } : {}}
            onToggleFilter={(_k, val) => setVendedorFilter(prev => prev === val ? 'all' : val)}
            onSetFilter={(_k, vals) => setVendedorFilter(vals[vals.length - 1] ?? 'all')}
            onClearFilters={() => { setSearch(''); setVendedorFilter('all'); setDesde(''); setHasta(''); }}
            dateFrom={desde}
            dateTo={hasta}
            onDateRangeChange={(f, t) => { setDesde(f); setHasta(t); }}
            onDateFromChange={setDesde}
            onDateToChange={setHasta}
          />
        </EncabezadoListaMovil>
      )}
      <div className="max-md:hidden space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5" /> Gastos
          <HelpButton title={HELP.gastos.title} sections={HELP.gastos.sections} />
        </h1>
        <Button size="sm" onClick={() => { if (showForm) { setShowForm(false); resetForm(); } else { setShowForm(true); } }}>
          {showForm ? <><X className="h-3.5 w-3.5 mr-1" /> Cerrar</> : <><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo gasto</>}
        </Button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border border-y border-border -mx-3 md:-mx-4">
        <div className="px-3 md:px-4 py-2.5 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Total gastos {hasFilters && '(filtrado)'}</p>
          <p className="text-lg sm:text-2xl font-bold text-destructive truncate">{fmt(totalGastos)}</p>
        </div>
        <div className="px-3 md:px-4 py-2.5 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Registros</p>
          <p className="text-lg sm:text-2xl font-bold text-foreground">{filtered.length}</p>
        </div>
      </div>
      </div>

      {showForm && (
        <div className="border-y border-border -mx-3 md:-mx-4 px-3 md:px-4 py-3 space-y-3 bg-accent/40">
          <h3 className="text-sm font-semibold">{editId ? 'Editar gasto' : 'Nuevo gasto'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Input placeholder="Concepto *" value={concepto} onChange={e => setConcepto(e.target.value)} />
            <Input type="number" placeholder="Monto *" value={monto} onChange={e => setMonto(e.target.value)} />
            <SingleDatePicker value={fecha} onChange={iso => setFecha(iso)} />
            <Select value={vendedorIdForm} onValueChange={setVendedorIdForm}>
              <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Yo ({profile?.nombre ?? 'mi usuario'})</SelectItem>
                <SelectItem value="none">Sin vendedor</SelectItem>
                {vendedores?.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Notas" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="cancelar" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>Descartar</Button>
            <Button size="sm" onClick={() => saveGasto.mutate()} disabled={saveGasto.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" /> {editId ? 'Guardar' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="space-y-2 max-md:hidden">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-semibold uppercase">
          <Filter className="h-3 w-3" /> Filtros
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar concepto/notas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
            <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vendedores</SelectItem>
              <SelectItem value="none">Sin vendedor</SelectItem>
              {vendedores?.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} className="col-span-2 md:col-span-1" />
        </div>
        {hasFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setVendedorFilter('all'); setDesde(''); setHasta(''); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      {isMobile ? (
        isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div> : (
        <ListaTarjetasMovil aLoAncho vacia={movil.total === 0} mensajeVacio={hasFilters ? 'No hay gastos que coincidan con los filtros' : 'Sin gastos registrados'} {...movil}>
          {movil.visibles.map((g: any) => (
            <ListaTarjetaMovil
              key={g.id}
              titulo={g.concepto || '—'}
              linea2={[fmtDate(g.fecha), (g.vendedores as any)?.nombre, g.notas].filter(Boolean).join(' · ')}
              pildora={fmt(g.monto)}
              tono="peligro"
              className={highlightId === g.id ? 'bg-primary/15' : editId === g.id ? 'bg-primary/5' : undefined}
              onClick={() => startEdit(g)}
              acciones={[
                { key: 'editar', label: 'Editar', icon: Pencil, onClick: () => startEdit(g) },
                { key: 'eliminar', label: 'Eliminar (requiere PIN)', icon: Trash2, destructiva: true, separar: true, onClick: () => handleDelete(g) },
              ]}
            />
          ))}
        </ListaTarjetasMovil>
        )
      ) : (
      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="fecha" sort={ordenGastos.sort} onToggle={ordenGastos.toggle} className="text-[11px]">Fecha</SortableTableHead>
              <SortableTableHead sortKey="concepto" sort={ordenGastos.sort} onToggle={ordenGastos.toggle} className="text-[11px]">Concepto</SortableTableHead>
              <SortableTableHead sortKey="vendedor" sort={ordenGastos.sort} onToggle={ordenGastos.toggle} className="text-[11px]">Vendedor</SortableTableHead>
              <SortableTableHead sortKey="notas" sort={ordenGastos.sort} onToggle={ordenGastos.toggle} className="text-[11px]">Notas</SortableTableHead>
              <SortableTableHead sortKey="monto" sort={ordenGastos.sort} onToggle={ordenGastos.toggle} align="right" className="text-[11px] text-right">Monto</SortableTableHead>
              <TableHead className="text-[11px] w-20 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenGastos.sorted.map((g: any) => (
              <TableRow
                key={g.id}
                className={
                  highlightId === g.id ? 'bg-primary/15 transition-colors' :
                  editId === g.id ? 'bg-primary/5' : ''
                }
              >
                <TableCell className="text-[12px]">{fmtDate(g.fecha)}</TableCell>
                <TableCell className="font-medium text-[12px]">{g.concepto}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{(g.vendedores as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground truncate max-w-[200px]">{g.notas ?? '—'}</TableCell>
                <TableCell className="text-right font-bold text-destructive">{fmt(g.monto)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => startEdit(g)}>
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar (requiere PIN)" onClick={() => handleDelete(g)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                {hasFilters ? 'No hay gastos que coincidan con los filtros' : 'Sin gastos registrados'}
              </TableCell></TableRow>
            )}
          </TableBody>
          {!!filtered.length && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-[11px] text-muted-foreground font-semibold">Totales ({filtered.length})</TableCell>
                <TableCell className="text-right font-bold text-destructive tabular-nums">{fmt(totalGastos)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      )}
      <PinDialog />
    </div>
    </div>
  );
}
