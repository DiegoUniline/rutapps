import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { usePromociones, useSavePromocion, useDeletePromocion, type Promocion } from '@/hooks/usePromociones';
import { Plus, Pencil, Trash2, Tag, Percent, DollarSign, Gift, BarChart3, Star, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TIPO_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  descuento_porcentaje: { label: '% Descuento', icon: Percent, color: 'bg-primary/10 text-primary' },
  descuento_monto: { label: '$ Descuento', icon: DollarSign, color: 'bg-emerald-500/10 text-emerald-600' },
  producto_gratis: { label: 'Producto gratis', icon: Gift, color: 'bg-orange-500/10 text-orange-600' },
  precio_especial: { label: 'Precio especial', icon: Star, color: 'bg-violet-500/10 text-violet-600' },
  volumen: { label: 'Por volumen', icon: BarChart3, color: 'bg-sky-500/10 text-sky-600' },
};

const APLICA_LABELS: Record<string, string> = {
  todos: 'Todos los productos',
  producto: 'Productos específicos',
  clasificacion: 'Por clasificación',
  cliente: 'Clientes específicos',
  zona: 'Por zona',
};

const DIAS_SEMANA = [
  { key: 'lunes', label: 'Lun' },
  { key: 'martes', label: 'Mar' },
  { key: 'miércoles', label: 'Mié' },
  { key: 'jueves', label: 'Jue' },
  { key: 'viernes', label: 'Vie' },
  { key: 'sábado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
];

const emptyPromo: Partial<Promocion> = {
  nombre: '', descripcion: '', tipo: 'descuento_porcentaje', aplica_a: 'todos',
  activa: true, valor: 0, cantidad_minima: 0, cantidad_gratis: 1,
  producto_ids: [], clasificacion_ids: [], cliente_ids: [], zona_ids: [],
  dias_semana: [],
  prioridad: 0, acumulable: false, producto_gratis_id: null,
};

export default function PromocionesPage() {
  const { empresa } = useAuth();
  const { data: promociones, isLoading } = usePromociones();
  const { symbol: s } = useCurrency();
  const savePromo = useSavePromocion();
  const deletePromo = useDeletePromocion();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Promocion> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const pageSize = 20;

  // Load catalogs for selectors
  const { data: productos } = useQuery({
    queryKey: ['promo-productos', empresa?.id],
    enabled: !!empresa?.id && !!editing,
    queryFn: async () => {
      const { data } = await (supabase.from('productos').select('id, nombre, codigo') as any).eq('empresa_id', empresa!.id).eq('activo', true).order('nombre').limit(500);
      return (data ?? []) as { id: string; nombre: string; codigo: string | null }[];
    },
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['promo-clasificaciones', empresa?.id],
    enabled: !!empresa?.id && !!editing,
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ['promo-clientes', empresa?.id],
    enabled: !!empresa?.id && !!editing,
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, codigo').eq('empresa_id', empresa!.id).order('nombre').limit(500);
      return data ?? [];
    },
  });

  const { data: zonas } = useQuery({
    queryKey: ['promo-zonas', empresa?.id],
    enabled: !!empresa?.id && !!editing,
    queryFn: async () => {
      const { data } = await supabase.from('zonas').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const filtered = (promociones ?? []).filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSave = async () => {
    if (!editing?.nombre) { toast.error('Nombre requerido'); return; }
    try {
      await savePromo.mutateAsync(editing as any);
      toast.success(editing.id ? 'Promoción actualizada' : 'Promoción creada');
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deletePromo.mutateAsync(deleteTarget);
    toast.success('Promoción eliminada');
    setDeleteTarget(null);
  };

  // Helpers for multi-select chips
  const toggleArrayItem = (field: 'producto_ids' | 'clasificacion_ids' | 'cliente_ids' | 'zona_ids' | 'dias_semana', id: string) => {
    if (!editing) return;
    const arr = (editing[field] as string[]) ?? [];
    const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    setEditing({ ...editing, [field]: next });
  };

  // Name lookup maps
  const productoMap = useMemo(() => new Map((productos ?? []).map(p => [p.id, `${p.codigo ? p.codigo + ' — ' : ''}${p.nombre}`])), [productos]);
  const clasificacionMap = useMemo(() => new Map((clasificaciones ?? []).map(c => [c.id, c.nombre])), [clasificaciones]);
  const clienteMap = useMemo(() => new Map((clientes ?? []).map(c => [c.id, `${c.codigo ? c.codigo + ' — ' : ''}${c.nombre}`])), [clientes]);
  const zonaMap = useMemo(() => new Map((zonas ?? []).map(z => [z.id, z.nombre])), [zonas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">Promociones <HelpButton title={HELP.promociones.title} sections={HELP.promociones.sections} /></h1>
        <Button onClick={() => setEditing({ ...emptyPromo })} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Nueva promoción
        </Button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar promociones..." />

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Valor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Aplica a</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Días</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(p => {
                const tipoInfo = TIPO_LABELS[p.tipo];
                const TipoIcon = tipoInfo?.icon || Tag;
                const dias = (p.dias_semana ?? []);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-card transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{p.nombre}</div>
                      {p.descripcion && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.descripcion}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium", tipoInfo?.color)}>
                        <TipoIcon className="h-3.5 w-3.5" />
                        {tipoInfo?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">
                      {p.tipo === 'producto_gratis'
                        ? `${p.cantidad_minima} → +${p.cantidad_gratis}`
                        : p.tipo === 'descuento_porcentaje' || p.tipo === 'volumen'
                          ? `${p.valor}%`
                          : `${s}${p.valor}`}
                      {p.cantidad_minima > 0 && p.tipo !== 'producto_gratis' && (
                        <span className="text-xs text-muted-foreground ml-1">(min {p.cantidad_minima})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{APLICA_LABELS[p.aplica_a]}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                      {dias.length === 0 ? 'Todos' : dias.map(d => d.slice(0, 3)).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={p.activa ? 'default' : 'secondary'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ ...p })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No hay promociones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <OdooPagination from={(page - 1) * pageSize + 1} to={Math.min(page * pageSize, filtered.length)} total={filtered.length} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta promoción?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit / Create Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} placeholder="Ej: 3x2 en Coca 600ml" />
              </div>
              <div>
                <Label>Descripción</Label>
                <Input value={editing.descripcion || ''} onChange={e => setEditing({ ...editing, descripcion: e.target.value })} placeholder="Descripción opcional" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={editing.tipo} onValueChange={v => setEditing({ ...editing, tipo: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aplica a</Label>
                  <Select value={editing.aplica_a} onValueChange={v => setEditing({ ...editing, aplica_a: v as any, producto_ids: [], clasificacion_ids: [], cliente_ids: [], zona_ids: [] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(APLICA_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Scope selectors */}
              {editing.aplica_a === 'producto' && (
                <MultiChipSelector
                  label="Productos"
                  items={(productos ?? []).map(p => ({ id: p.id, label: `${p.codigo ? p.codigo + ' — ' : ''}${p.nombre}` }))}
                  selected={editing.producto_ids ?? []}
                  onToggle={(id) => toggleArrayItem('producto_ids', id)}
                  nameMap={productoMap}
                />
              )}
              {editing.aplica_a === 'clasificacion' && (
                <MultiChipSelector
                  label="Clasificaciones"
                  items={(clasificaciones ?? []).map(c => ({ id: c.id, label: c.nombre }))}
                  selected={editing.clasificacion_ids ?? []}
                  onToggle={(id) => toggleArrayItem('clasificacion_ids', id)}
                  nameMap={clasificacionMap}
                />
              )}
              {editing.aplica_a === 'cliente' && (
                <MultiChipSelector
                  label="Clientes"
                  items={(clientes ?? []).map(c => ({ id: c.id, label: `${c.codigo ? c.codigo + ' — ' : ''}${c.nombre}` }))}
                  selected={editing.cliente_ids ?? []}
                  onToggle={(id) => toggleArrayItem('cliente_ids', id)}
                  nameMap={clienteMap}
                />
              )}
              {editing.aplica_a === 'zona' && (
                <MultiChipSelector
                  label="Zonas"
                  items={(zonas ?? []).map(z => ({ id: z.id, label: z.nombre }))}
                  selected={editing.zona_ids ?? []}
                  onToggle={(id) => toggleArrayItem('zona_ids', id)}
                  nameMap={zonaMap}
                />
              )}

              {/* Value / quantity fields */}
              {editing.tipo !== 'producto_gratis' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{editing.tipo === 'descuento_porcentaje' || editing.tipo === 'volumen' ? 'Porcentaje (%)' : 'Valor ($)'}</Label>
                    <Input type="number" value={editing.valor || ''} onChange={e => setEditing({ ...editing, valor: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Cantidad mínima</Label>
                    <Input type="number" value={editing.cantidad_minima || ''} onChange={e => setEditing({ ...editing, cantidad_minima: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              )}

              {editing.tipo === 'producto_gratis' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Compra mínima (cantidad)</Label>
                      <Input type="number" value={editing.cantidad_minima || ''} onChange={e => setEditing({ ...editing, cantidad_minima: parseFloat(e.target.value) || 0 })} placeholder="Ej: 3" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Cuántos debe comprar</p>
                    </div>
                    <div>
                      <Label>Cantidad gratis</Label>
                      <Input type="number" value={editing.cantidad_gratis || ''} onChange={e => setEditing({ ...editing, cantidad_gratis: parseFloat(e.target.value) || 0 })} placeholder="Ej: 1" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Cuántos se regalan</p>
                    </div>
                  </div>
                  <div>
                    <Label>Producto que se regala</Label>
                    <Select value={editing.producto_gratis_id || '_mismo'} onValueChange={v => setEditing({ ...editing, producto_gratis_id: v === '_mismo' ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="El mismo producto" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_mismo">El mismo producto</SelectItem>
                        {(productos ?? []).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <strong>Ejemplo 3×2:</strong> Compra mínima = 3, Cantidad gratis = 1. Al comprar 3 unidades, se agrega 1 gratis.
                  </div>
                </div>
              )}

              {/* Vigencia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vigencia inicio</Label>
                  <Input type="date" value={editing.vigencia_inicio || ''} onChange={e => setEditing({ ...editing, vigencia_inicio: e.target.value || null })} />
                </div>
                <div>
                  <Label>Vigencia fin</Label>
                  <Input type="date" value={editing.vigencia_fin || ''} onChange={e => setEditing({ ...editing, vigencia_fin: e.target.value || null })} />
                </div>
              </div>

              {/* Días de la semana */}
              <div>
                <Label>Días de la semana</Label>
                <p className="text-[10px] text-muted-foreground mb-1.5">Deja vacío para que aplique todos los días</p>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map(d => {
                    const selected = (editing.dias_semana ?? []).includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleArrayItem('dias_semana', d.key)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prioridad</Label>
                  <Input type="number" value={editing.prioridad || 0} onChange={e => setEditing({ ...editing, prioridad: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={editing.acumulable ?? false} onCheckedChange={v => setEditing({ ...editing, acumulable: v })} />
                  <Label>Acumulable</Label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.activa ?? true} onCheckedChange={v => setEditing({ ...editing, activa: v })} />
                <Label>Activa</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={savePromo.isPending}>
                  {savePromo.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Reusable multi-select chip component ──
function MultiChipSelector({ label, items, selected, onToggle, nameMap }: {
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  nameMap: Map<string, string>;
}) {
  const [filterText, setFilterText] = useState('');
  const filteredItems = items.filter(i =>
    !filterText || i.label.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div>
      <Label>{label}</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
          {selected.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
              {nameMap.get(id) ?? id.slice(0, 8)}
              <button type="button" onClick={() => onToggle(id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={filterText}
        onChange={e => setFilterText(e.target.value)}
        placeholder={`Buscar ${label.toLowerCase()}...`}
        className="h-8 text-xs mb-1"
      />
      <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
        {filteredItems.slice(0, 50).map(item => {
          const isSelected = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                'w-full text-left px-2.5 py-1.5 text-xs transition-colors',
                isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/50',
              )}
            >
              {item.label}
            </button>
          );
        })}
        {filteredItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>
        )}
      </div>
    </div>
  );
}
