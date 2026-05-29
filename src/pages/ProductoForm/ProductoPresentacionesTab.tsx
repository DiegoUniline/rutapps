import { useState } from 'react';
import { Plus, Trash2, GripVertical, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePresentaciones, useSavePresentacion, useDeletePresentacion, type ProductoPresentacion } from '@/hooks/usePresentaciones';
import { useCurrency } from '@/hooks/useCurrency';

/** Celda con código principal + alias (chips). Usado por filas existentes. */
function BarcodesCell({ p, onUpdate }: { p: ProductoPresentacion; onUpdate: (patch: Partial<ProductoPresentacion>) => void }) {
  const [aliasDraft, setAliasDraft] = useState('');
  const aliases = p.codigos_barras ?? [];
  const addAlias = () => {
    const v = aliasDraft.trim();
    if (!v) return;
    const exists = (p.codigo_barras ?? '').toLowerCase() === v.toLowerCase()
      || aliases.some(a => a.toLowerCase() === v.toLowerCase());
    if (exists) { setAliasDraft(''); return; }
    onUpdate({ codigos_barras: [...aliases, v] });
    setAliasDraft('');
  };
  const removeAlias = (v: string) => {
    onUpdate({ codigos_barras: aliases.filter(a => a !== v) });
  };
  return (
    <div className="space-y-1">
      <input
        className="w-full bg-transparent border-b border-transparent focus:border-primary outline-none py-1 font-mono text-xs"
        placeholder="—"
        defaultValue={p.codigo_barras ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if ((v ?? null) !== (p.codigo_barras ?? null)) onUpdate({ codigo_barras: v });
        }}
      />
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {aliases.map(a => (
            <span key={a} className="inline-flex items-center gap-1 bg-accent/60 border border-border rounded px-1.5 py-0.5 text-[10px] font-mono">
              {a}
              <button type="button" onClick={() => removeAlias(a)} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full bg-transparent border-b border-dashed border-border/60 focus:border-primary outline-none py-0.5 font-mono text-[10px] text-muted-foreground placeholder:text-muted-foreground/60"
        placeholder="+ alias (Enter)"
        value={aliasDraft}
        onChange={(e) => setAliasDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
        onBlur={addAlias}
      />
    </div>
  );
}

interface Props {
  productoId?: string;
  isNew: boolean;
  esGranel: boolean;
  unidadGranel: string;
  precioPorUnidadBase: number;
}

export function ProductoPresentacionesTab({ productoId, isNew, esGranel, unidadGranel, precioPorUnidadBase }: Props) {
  const { data: items = [], isLoading } = usePresentaciones(productoId);
  const saveMut = useSavePresentacion();
  const delMut = useDeletePresentacion();
  const { symbol } = useCurrency();

  const unidad = esGranel ? unidadGranel : 'pz';

  const [draft, setDraft] = useState<{ nombre: string; factor_base: string; precio_especial: string; codigo_barras: string }>({
    nombre: '', factor_base: '', precio_especial: '', codigo_barras: '',
  });

  if (isNew) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Guarda primero el producto para poder agregar presentaciones.
      </div>
    );
  }

  const onAdd = async () => {
    const factor = Number(draft.factor_base);
    if (!draft.nombre.trim() || !factor || factor <= 0) {
      toast.error('Nombre y factor son obligatorios');
      return;
    }
    const precio = draft.precio_especial.trim() ? Number(draft.precio_especial) : null;
    try {
      await saveMut.mutateAsync({
        producto_id: productoId!,
        nombre: draft.nombre.trim(),
        factor_base: factor,
        precio_especial: precio,
        codigo_barras: draft.codigo_barras.trim() || null,
        orden: items.length,
        activo: true,
      });
      setDraft({ nombre: '', factor_base: '', precio_especial: '', codigo_barras: '' });
      toast.success('Presentación agregada');
    } catch (e: any) { toast.error(e.message); }
  };

  const onUpdate = async (p: ProductoPresentacion, patch: Partial<ProductoPresentacion>) => {
    try { await saveMut.mutateAsync({ id: p.id, producto_id: p.producto_id, ...patch }); }
    catch (e: any) { toast.error(e.message); }
  };

  const onTogglePrincipal = async (p: ProductoPresentacion) => {
    try {
      // First unmark any other principal to avoid the unique index conflict
      const others = items.filter(x => x.id !== p.id && x.es_principal_stock);
      for (const o of others) {
        await saveMut.mutateAsync({ id: o.id, producto_id: o.producto_id, es_principal_stock: false });
      }
      await saveMut.mutateAsync({ id: p.id, producto_id: p.producto_id, es_principal_stock: !p.es_principal_stock });
    } catch (e: any) { toast.error(e.message); }
  };

  const onDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta presentación?')) return;
    try { await delMut.mutateAsync(id); toast.success('Eliminada'); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 p-1">
      <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded p-3 space-y-1">
        {esGranel ? (
          <p>Define los paquetes en los que vendes este producto a granel (ej. <strong>Paquete 1 {unidad}</strong>, <strong>Paquete 7 {unidad}</strong>). El stock se sigue manejando en <strong>{unidad}</strong>.</p>
        ) : (
          <p>Define las presentaciones de empaque (ej. <strong>Caja 12 pz</strong>, <strong>Six pack 6 pz</strong>). El factor es cuántas piezas trae cada presentación. El stock se sigue contando en <strong>piezas</strong>.</p>
        )}
        <p>
          Marca con la <Star className="h-3 w-3 inline text-warning" /> la presentación <strong>principal</strong> para mostrar el desglose de stock (ej. "1 caja + 6 pz") en listados, inventario y POS.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded">
          <thead className="bg-accent/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-8"></th>
              <th className="text-left px-3 py-2 w-40">Código de barras</th>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-right px-3 py-2 w-32">Factor ({unidad})</th>
              <th className="text-right px-3 py-2 w-40">Precio especial</th>
              <th className="text-right px-3 py-2 w-32">Calculado</th>
              <th className="text-center px-3 py-2 w-16" title="Principal para stock">Stock</th>
              <th className="text-center px-3 py-2 w-20">Activo</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-4 text-muted-foreground">Cargando...</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={9} className="text-center py-4 text-muted-foreground">Sin presentaciones. Agrega la primera abajo.</td></tr>
            )}
            {items.map(p => {
              const calc = p.precio_especial ?? (precioPorUnidadBase * Number(p.factor_base));
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /></td>
                  <td className="px-3 py-1.5 align-top">
                    <BarcodesCell p={p} onUpdate={(patch) => onUpdate(p, patch)} />
                  </td>
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
                  <td className="px-3 py-1.5 text-right">
                    <input type="number" step="0.01" placeholder="—" className="w-full text-right bg-transparent border-b border-transparent focus:border-primary outline-none py-1 tabular-nums"
                      defaultValue={p.precio_especial ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim() === '' ? null : Number(e.target.value);
                        if (v !== p.precio_especial) onUpdate(p, { precio_especial: v });
                      }} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{symbol}{calc.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => onTogglePrincipal(p)}
                      title={p.es_principal_stock ? 'Quitar como principal' : 'Marcar como principal para stock'}
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
                    <button onClick={() => onDelete(p.id)} className="text-destructive hover:bg-destructive/10 rounded p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-accent/20 border-t border-border">
            <tr>
              <td></td>
              <td className="px-3 py-2">
                <input className="w-full bg-card border border-border rounded px-2 py-1 text-sm font-mono"
                  placeholder="Cód. barras"
                  value={draft.codigo_barras}
                  onChange={(e) => setDraft({ ...draft, codigo_barras: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input className="w-full bg-card border border-border rounded px-2 py-1 text-sm"
                  placeholder={esGranel ? `Paquete X ${unidad}` : 'Caja 12 pz'}
                  value={draft.nombre}
                  onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input type="number" step="0.001" className="w-full bg-card border border-border rounded px-2 py-1 text-sm text-right tabular-nums"
                  placeholder="0.000"
                  value={draft.factor_base}
                  onChange={(e) => setDraft({ ...draft, factor_base: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input type="number" step="0.01" className="w-full bg-card border border-border rounded px-2 py-1 text-sm text-right tabular-nums"
                  placeholder="(opcional)"
                  value={draft.precio_especial}
                  onChange={(e) => setDraft({ ...draft, precio_especial: e.target.value })} />
              </td>
              <td colSpan={3}></td>
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
    </div>
  );
}
