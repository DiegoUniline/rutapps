import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Search, Package, Eye, Calendar, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import ModalSelect from '@/components/ModalSelect';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  en_proceso: { label: 'En proceso', variant: 'outline' },
  por_aprobar: { label: 'Por aprobar', variant: 'default' },
  aprobada: { label: 'Aprobada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
};

type FiltroTipo = 'todos' | 'clasificacion' | 'marca' | 'productos';

export default function AuditoriasPage() {
  const { empresa, user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterSearch, setFilterSearch] = useState('');
  const [notas, setNotas] = useState('');

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: marcas } = useQuery({
    queryKey: ['marcas-audit', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('marcas').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: productosAll } = useQuery({
    queryKey: ['productos-audit', empresa?.id],
    enabled: !!empresa?.id && showDialog && filtroTipo === 'productos',
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, nombre, codigo').eq('empresa_id', empresa!.id).eq('status', 'activo').order('nombre');
      return data ?? [];
    },
  });

  const { data: auditorias, isLoading } = useQuery({
    queryKey: ['auditorias', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditorias')
        .select('*, auditoria_lineas(count)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const almacenOptions = useMemo(() =>
    (almacenes ?? []).map(a => ({ value: a.id, label: a.nombre })),
    [almacenes]
  );

  // Items for the multi-select list based on filtroTipo
  const checklistItems = useMemo(() => {
    if (filtroTipo === 'clasificacion') return (clasificaciones ?? []).map(c => ({ id: c.id, label: c.nombre }));
    if (filtroTipo === 'marca') return (marcas ?? []).map(m => ({ id: m.id, label: m.nombre }));
    if (filtroTipo === 'productos') return (productosAll ?? []).map(p => ({ id: p.id, label: `${p.codigo ?? ''} — ${p.nombre}` }));
    return [];
  }, [filtroTipo, clasificaciones, marcas, productosAll]);

  const filteredChecklist = useMemo(() => {
    if (!filterSearch) return checklistItems;
    const s = filterSearch.toLowerCase();
    return checklistItems.filter(i => i.label.toLowerCase().includes(s));
  }, [checklistItems, filterSearch]);

  const filtered = useMemo(() => {
    if (!search) return auditorias ?? [];
    const s = search.toLowerCase();
    return (auditorias ?? []).filter((a: any) => a.nombre?.toLowerCase().includes(s));
  }, [auditorias, search]);

  // Preview count
  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const { data: previewCount } = useQuery({
    queryKey: ['audit-preview', almacenId, filtroTipo, selectedArray],
    enabled: !!almacenId && showDialog,
    queryFn: async () => {
      if (filtroTipo === 'productos' && selectedIds.size > 0) return selectedIds.size;

      let query = supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo');

      if (filtroTipo === 'clasificacion' && selectedIds.size > 0) {
        query = query.in('clasificacion_id', selectedArray);
      } else if (filtroTipo === 'marca' && selectedIds.size > 0) {
        query = query.in('marca_id', selectedArray);
      }

      const { count } = await query;
      return count ?? 0;
    },
  });

  const almacenNombre = (almacenes ?? []).find(a => a.id === almacenId)?.nombre ?? '';

  const autoNombre = useMemo(() => {
    const fecha = format(new Date(), "dd/MM/yyyy", { locale: es });
    let filtroLabel = 'Todos';
    if (filtroTipo !== 'todos' && selectedIds.size > 0) {
      const names = checklistItems.filter(i => selectedIds.has(i.id)).map(i => i.label);
      filtroLabel = names.length <= 2 ? names.join(', ') : `${names.length} ${filtroTipo === 'clasificacion' ? 'categorías' : filtroTipo === 'marca' ? 'marcas' : 'productos'}`;
    }
    return `Auditoría ${almacenNombre || '...'} — ${filtroLabel} — ${fecha}`;
  }, [almacenNombre, filtroTipo, selectedIds, checklistItems]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredChecklist.map(i => i.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const crearAuditoria = useMutation({
    mutationFn: async () => {
      if (!almacenId) throw new Error('Selecciona un almacén');
      if (filtroTipo !== 'todos' && selectedIds.size === 0) throw new Error('Selecciona al menos un elemento');

      const dbFiltroTipo = filtroTipo === 'todos' ? 'almacen' : filtroTipo;
      const dbFiltroValor = filtroTipo === 'todos' ? almacenId : selectedArray.join(',');

      const { data: auditoria, error } = await supabase.from('auditorias').insert({
        empresa_id: empresa!.id,
        nombre: autoNombre,
        filtro_tipo: dbFiltroTipo,
        filtro_valor: dbFiltroValor,
        notas: notas || null,
        user_id: user!.id,
        status: 'en_proceso',
        almacen_id: almacenId,
      } as any).select('id').single();
      if (error) throw error;

      // Fetch products based on filter
      let productoIds: string[] = [];

      if (filtroTipo === 'productos') {
        productoIds = selectedArray;
      } else {
        let query = supabase
          .from('productos')
          .select('id')
          .eq('empresa_id', empresa!.id)
          .eq('status', 'activo');

        if (filtroTipo === 'clasificacion' && selectedIds.size > 0) {
          query = query.in('clasificacion_id', selectedArray);
        } else if (filtroTipo === 'marca' && selectedIds.size > 0) {
          query = query.in('marca_id', selectedArray);
        }

        const { data } = await query;
        productoIds = (data ?? []).map((p: any) => p.id);
      }

      if (!productoIds.length) throw new Error('No hay productos activos con ese filtro');

      // Get stock from stock_almacen for the selected warehouse
      const { data: stockRows } = await supabase
        .from('stock_almacen')
        .select('producto_id, cantidad')
        .eq('almacen_id', almacenId)
        .in('producto_id', productoIds);

      const stockMap = new Map<string, number>();
      (stockRows ?? []).forEach((s: any) => stockMap.set(s.producto_id, Number(s.cantidad)));

      const now = new Date().toISOString();
      const { error: lErr } = await supabase.from('auditoria_lineas').insert(
        productoIds.map(pid => ({
          auditoria_id: auditoria.id,
          producto_id: pid,
          cantidad_esperada: stockMap.get(pid) ?? 0,
        }))
      );
      if (lErr) throw lErr;

      return auditoria;
    },
    onSuccess: (auditoria) => {
      toast.success('Auditoría creada — comienza el conteo');
      qc.invalidateQueries({ queryKey: ['auditorias'] });
      resetForm();
      navigate(`/almacen/auditorias/${auditoria.id}/conteo`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setShowDialog(false);
    setAlmacenId('');
    setFiltroTipo('todos');
    setSelectedIds(new Set());
    setFilterSearch('');
    setNotas('');
  };

  const canCreate = almacenId && (filtroTipo === 'todos' || selectedIds.size > 0);

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Auditorías de inventario
          <HelpButton title={HELP.auditorias.title} sections={HELP.auditorias.sections} />
        </h1>
        <Button onClick={() => setShowDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva auditoría
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Líneas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay auditorías
              </TableCell></TableRow>
            )}
            {filtered.map((a: any) => {
              const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE.pendiente;
              const almNombre = almacenes?.find(al => al.id === a.filtro_valor)?.nombre ?? '-';
              const lineasCount = a.auditoria_lineas?.[0]?.count ?? 0;
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => {
                  if (a.status === 'en_proceso') navigate(`/almacen/auditorias/${a.id}/conteo`);
                  else navigate(`/almacen/auditorias/${a.id}/resultados`);
                }}>
                  <TableCell className="font-medium">{a.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{almNombre}</TableCell>
                  <TableCell className="text-sm">{fmtDate(a.fecha)}</TableCell>
                  <TableCell className="text-sm">{lineasCount}</TableCell>
                  <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="gap-1">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={v => !v && resetForm()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva auditoría</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Info: fecha y usuario */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground bg-card rounded-md p-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>{profile?.nombre ?? user?.email ?? 'Usuario'}</span>
              </div>
            </div>

            <div>
              <Label>Almacén a auditar</Label>
              <ModalSelect options={almacenOptions} value={almacenId} onChange={setAlmacenId} placeholder="Seleccionar almacén..." />
            </div>

            <div>
              <Label>¿Qué auditar?</Label>
              <Select value={filtroTipo} onValueChange={(v: FiltroTipo) => { setFiltroTipo(v); setSelectedIds(new Set()); setFilterSearch(''); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los productos</SelectItem>
                  <SelectItem value="clasificacion">Por categoría(s)</SelectItem>
                  <SelectItem value="marca">Por marca(s)</SelectItem>
                  <SelectItem value="productos">Productos específicos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Multi-select checklist */}
            {filtroTipo !== 'todos' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    {filtroTipo === 'clasificacion' ? 'Categorías' : filtroTipo === 'marca' ? 'Marcas' : 'Productos'}
                    {selectedIds.size > 0 && <span className="ml-1 text-muted-foreground">({selectedIds.size})</span>}
                  </Label>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={selectAll}>
                      Seleccionar todo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={deselectAll}>
                      Quitar todo
                    </Button>
                  </div>
                </div>

                {checklistItems.length > 8 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar..."
                      className="h-8 pl-8 text-sm"
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                    />
                  </div>
                )}

                <ScrollArea className="border border-border rounded-md h-[200px]">
                  <div className="p-1">
                    {filteredChecklist.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Sin resultados</p>
                    )}
                    {filteredChecklist.map(item => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleId(item.id)}
                        />
                        <span className="truncate">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {almacenId && (
              <div className="text-sm text-muted-foreground bg-card rounded-md p-2 text-center">
                Se incluirán <span className="font-bold text-foreground">{previewCount ?? '...'}</span> productos
              </div>
            )}

            {almacenId && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Nombre:</span> {autoNombre}
              </div>
            )}

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={() => crearAuditoria.mutate()} disabled={crearAuditoria.isPending || !canCreate}>
                {crearAuditoria.isPending ? 'Creando...' : 'Crear y comenzar conteo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
