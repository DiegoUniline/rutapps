import { useState } from 'react';
import { usePromociones, useSavePromocion, useDeletePromocion, type Promocion } from '@/hooks/usePromociones';
import { Plus, Pencil, Trash2, Tag, Percent, DollarSign, Gift, BarChart3, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { TableSkeleton } from '@/components/TableSkeleton';

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

const emptyPromo: Partial<Promocion> = {
  nombre: '', descripcion: '', tipo: 'descuento_porcentaje', aplica_a: 'todos',
  activa: true, valor: 0, cantidad_minima: 0, cantidad_gratis: 0,
  producto_ids: [], clasificacion_ids: [], cliente_ids: [], zona_ids: [],
  prioridad: 0, acumulable: false,
};

export default function PromocionesPage() {
  const { data: promociones, isLoading } = usePromociones();
  const savePromo = useSavePromocion();
  const deletePromo = useDeletePromocion();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Promocion> | null>(null);
  const pageSize = 20;

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

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    await deletePromo.mutateAsync(id);
    toast.success('Promoción eliminada');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Promociones</h1>
        <Button onClick={() => setEditing({ ...emptyPromo })} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Nueva promoción
        </Button>
      </div>

      <OdooFilterBar search={search} onSearchChange={setSearch} placeholder="Buscar promociones..." />

      {isLoading ? <TableSkeleton /> : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Valor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Aplica a</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(p => {
                const tipoInfo = TIPO_LABELS[p.tipo];
                const TipoIcon = tipoInfo?.icon || Tag;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
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
                      {p.tipo === 'descuento_porcentaje' || p.tipo === 'volumen' ? `${p.valor}%` : `$${p.valor}`}
                      {p.cantidad_minima > 0 && <span className="text-xs text-muted-foreground ml-1">(min {p.cantidad_minima})</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{APLICA_LABELS[p.aplica_a]}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={p.activa ? 'default' : 'secondary'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ ...p })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No hay promociones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <OdooPagination from={(page - 1) * pageSize + 1} to={Math.min(page * pageSize, filtered.length)} total={filtered.length} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => Math.min(totalPages, p + 1))} />

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
                <Input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} placeholder="Ej: 10% desc. en refrescos" />
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
                  <Select value={editing.aplica_a} onValueChange={v => setEditing({ ...editing, aplica_a: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(APLICA_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
              {editing.tipo === 'producto_gratis' && (
                <div>
                  <Label>Cantidad gratis</Label>
                  <Input type="number" value={editing.cantidad_gratis || ''} onChange={e => setEditing({ ...editing, cantidad_gratis: parseFloat(e.target.value) || 0 })} />
                </div>
              )}
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
