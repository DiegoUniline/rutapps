import { useState } from 'react';
import { Plus, Trash2, Star, Package } from 'lucide-react';
import { toast } from 'sonner';
import { usePresentaciones, useSavePresentacion, useDeletePresentacion, type ProductoPresentacion } from '@/hooks/usePresentaciones';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Props {
  productoId?: string;
  isNew: boolean;
  esGranel: boolean;
  unidadGranel: string;
}

/**
 * Unidades de Stock: define empaques solo para VISUALIZAR el stock desglosado.
 * No maneja precios — para precios usa la pestaña "Presentaciones".
 * Comparte la misma tabla `producto_presentaciones` (filas con precio_especial = null).
 */
export function ProductoUnidadesStockTab({ productoId, isNew, esGranel, unidadGranel }: Props) {
  const { data: items = [], isLoading } = usePresentaciones(productoId);
  const saveMut = useSavePresentacion();
  const delMut = useDeletePresentacion();

  const unidad = esGranel ? unidadGranel : 'pz';

  const [draft, setDraft] = useState<{ nombre: string; factor_base: string }>({
    nombre: '', factor_base: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<ProductoPresentacion | null>(null);

  if (isNew) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Guarda primero el producto para poder agregar unidades de stock.
      </div>
    );
  }

  const onAdd = async () => {
    const factor = Number(draft.factor_base);
    if (!draft.nombre.trim() || !factor || factor <= 0) {
      toast.error('Nombre y factor son obligatorios');
      return;
    }
    try {
      await saveMut.mutateAsync({
        producto_id: productoId!,
        nombre: draft.nombre.trim(),
        factor_base: factor,
        precio_especial: null,
        orden: items.length,
        activo: true,
      });
      setDraft({ nombre: '', factor_base: '' });
      toast.success('Unidad de stock agregada');
    } catch (e: any) { toast.error(e.message); }
  };

  const onUpdate = async (p: ProductoPresentacion, patch: Partial<ProductoPresentacion>) => {
    try { await saveMut.mutateAsync({ id: p.id, producto_id: p.producto_id, ...patch }); }
    catch (e: any) { toast.error(e.message); }
  };

  const onTogglePrincipal = async (p: ProductoPresentacion) => {
    try {
      const others = items.filter(x => x.id !== p.id && x.es_principal_stock);
      for (const o of others) {
        await saveMut.mutateAsync({ id: o.id, producto_id: o.producto_id, es_principal_stock: false });
      }
      await saveMut.mutateAsync({ id: p.id, producto_id: p.producto_id, es_principal_stock: !p.es_principal_stock });
    } catch (e: any) { toast.error(e.message); }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await delMut.mutateAsync(deleteTarget.id);
      toast.success('Unidad eliminada');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4 p-1">
      <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded p-3 space-y-1">
        <p className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          <span>Define las <strong>unidades de empaque</strong> en las que quieres ver tu stock (ej. <strong>Caja 12 {unidad}</strong>, <strong>Bulto 24 {unidad}</strong>).</span>
        </p>
        <p>Esta vista es <strong>solo para visualizar</strong> el stock desglosado. No maneja precios. Si necesitas vender por presentación con un precio especial, usa la pestaña <strong>Presentaciones</strong>.</p>
        <p>Marca con la <Star className="h-3 w-3 inline text-warning" /> la unidad <strong>principal</strong> para mostrar el desglose (ej. "1 caja + 6 {unidad}") en listados, inventario y POS.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded">
          <thead className="bg-accent/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-right px-3 py-2 w-40">Equivale a ({unidad})</th>
              <th className="text-center px-3 py-2 w-20" title="Principal para stock">Principal</th>
              <th className="text-center px-3 py-2 w-20">Activo</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">Cargando...</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">Sin unidades. Agrega la primera abajo.</td></tr>
            )}
            {items.map(p => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <input className="w-full bg-transparent border-b border-transparent focus:border-primary outline-none py-1"
                    defaultValue={p.nombre}
                    onBlur={(e) => e.target.value !== p.nombre && onUpdate(p, { nombre: e.target.value })} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input type="number" step="0.001" className="w-full text-right bg-transparent border-b border-transparent focus:border-primary outline-none py-1 tabular-nums"
                    defaultValue={p.factor_base}
                    onBlur={(e) => Number(e.target.value) !== Number(p.factor_base) && onUpdate(p, { factor_base: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => onTogglePrincipal(p)}
                    title={p.es_principal_stock ? 'Quitar como principal' : 'Marcar como principal'}
                    className={`p-1 rounded hover:bg-accent ${p.es_principal_stock ? 'text-warning' : 'text-muted-foreground/40'}`}
                  >
                    <Star className={`h-4 w-4 ${p.es_principal_stock ? 'fill-current' : ''}`} />
                  </button>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={p.activo}
                    onChange={(e) => onUpdate(p, { activo: e.target.checked })} />
                </td>
                <td className="px-2 text-center">
                  <button onClick={() => setDeleteTarget(p)} className="text-destructive hover:bg-destructive/10 rounded p-1" title="Eliminar unidad">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-accent/20 border-t border-border">
            <tr>
              <td className="px-3 py-2">
                <input className="w-full bg-card border border-border rounded px-2 py-1 text-sm"
                  placeholder={esGranel ? `Bulto X ${unidad}` : 'Caja 12 pz'}
                  value={draft.nombre}
                  onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input type="number" step="0.001" className="w-full bg-card border border-border rounded px-2 py-1 text-sm text-right tabular-nums"
                  placeholder="0.000"
                  value={draft.factor_base}
                  onChange={(e) => setDraft({ ...draft, factor_base: e.target.value })} />
              </td>
              <td colSpan={2}></td>
              <td className="text-center">
                <button onClick={onAdd} disabled={saveMut.isPending}
                  className="bg-primary text-primary-foreground rounded p-1.5 hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta unidad de stock?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la unidad <strong>{deleteTarget?.nombre}</strong>. El stock base no se verá afectado, pero dejará de mostrarse el desglose por esta unidad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
