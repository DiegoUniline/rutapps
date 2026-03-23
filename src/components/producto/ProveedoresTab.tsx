import { useState } from 'react';
import { Trash2, Plus, Crown } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import { toast } from 'sonner';

interface ProveedoresTabProps {
  productoId?: string;
  isNew: boolean;
  proveedores: { id: string; nombre: string }[];
  prodProveedores: any[];
  onSave: (row: any) => Promise<any>;
  onDelete: (row: { id: string; producto_id: string }) => Promise<any>;
  saving: boolean;
  onCreateProveedor?: (name: string) => Promise<string | undefined>;
}

export function ProveedoresTab({ productoId, isNew, proveedores, prodProveedores, onSave, onDelete, saving, onCreateProveedor }: ProveedoresTabProps) {
  const [adding, setAdding] = useState(false);
  const [newProv, setNewProv] = useState({ proveedor_id: '', precio_compra: 0, tiempo_entrega_dias: 0 });

  const usedIds = new Set(prodProveedores.map((pp: any) => pp.proveedor_id));
  const availableProvs = proveedores.filter(p => !usedIds.has(p.id));

  const handleAdd = async () => {
    if (!newProv.proveedor_id || !productoId) return;
    try {
      await onSave({ producto_id: productoId, proveedor_id: newProv.proveedor_id, es_principal: prodProveedores.length === 0, precio_compra: newProv.precio_compra, tiempo_entrega_dias: newProv.tiempo_entrega_dias });
      setNewProv({ proveedor_id: '', precio_compra: 0, tiempo_entrega_dias: 0 });
      setAdding(false);
      toast.success('Proveedor agregado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSetPrincipal = async (pp: any) => {
    try { await onSave({ id: pp.id, producto_id: pp.producto_id, proveedor_id: pp.proveedor_id, es_principal: true }); toast.success('Proveedor principal actualizado'); } catch (err: any) { toast.error(err.message); }
  };

  const handleRemove = async (pp: any) => {
    try { await onDelete({ id: pp.id, producto_id: pp.producto_id }); toast.success('Proveedor eliminado'); } catch (err: any) { toast.error(err.message); }
  };

  if (isNew) {
    return <div className="text-[12px] text-muted-foreground py-4 bg-accent/30 border border-accent/50 rounded px-3">💡 Guarda el producto primero para poder agregar proveedores.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Proveedor</th>
              <th className="th-odoo text-right">Precio compra</th>
              <th className="th-odoo text-right">Tiempo entrega (días)</th>
              <th className="th-odoo text-center w-20">Principal</th>
              <th className="th-odoo w-10"></th>
            </tr>
          </thead>
          <tbody>
            {prodProveedores.map((pp: any) => (
              <tr key={pp.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                <td className="py-1.5 px-3 font-medium">{pp.proveedores?.nombre ?? '—'}{pp.es_principal && <Crown className="inline h-3.5 w-3.5 ml-1.5 text-warning fill-warning" />}</td>
                <td className="py-1.5 px-3 text-right font-mono">$ {(pp.precio_compra ?? 0).toFixed(2)}</td>
                <td className="py-1.5 px-3 text-right">{pp.tiempo_entrega_dias ?? 0}</td>
                <td className="py-1.5 px-3 text-center">
                  {pp.es_principal ? <span className="text-[11px] text-primary font-medium">✓ Principal</span> : <button onClick={() => handleSetPrincipal(pp)} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">Hacer principal</button>}
                </td>
                <td className="py-1.5 px-3 text-center"><button onClick={() => handleRemove(pp)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
            {prodProveedores.length === 0 && !adding && <tr><td colSpan={5} className="py-3 px-3 text-[12px] text-muted-foreground">Sin proveedores asignados</td></tr>}
            {adding && (
              <tr className="border-b border-table-border bg-primary/5">
                <td className="py-1.5 px-3"><SearchableSelect options={availableProvs.map(p => ({ value: p.id, label: p.nombre }))} value={newProv.proveedor_id} onChange={val => setNewProv(p => ({ ...p, proveedor_id: val }))} placeholder="Buscar proveedor..." onCreateNew={onCreateProveedor} /></td>
                <td className="py-1.5 px-3"><input type="number" className="input-odoo py-1 text-[13px] w-24 ml-auto block text-right" value={newProv.precio_compra} onChange={e => setNewProv(p => ({ ...p, precio_compra: +e.target.value }))} /></td>
                <td className="py-1.5 px-3"><input type="number" className="input-odoo py-1 text-[13px] w-20 ml-auto block text-right" value={newProv.tiempo_entrega_dias} onChange={e => setNewProv(p => ({ ...p, tiempo_entrega_dias: +e.target.value }))} /></td>
                <td className="py-1.5 px-3 text-center" colSpan={2}>
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={handleAdd} disabled={!newProv.proveedor_id || saving} className="btn-odoo-primary text-[11px] py-0.5 px-2">Agregar</button>
                    <button onClick={() => setAdding(false)} className="btn-odoo-secondary text-[11px] py-0.5 px-2">Cancelar</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && <button className="odoo-link" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 inline mr-1" />Agregar proveedor</button>}
    </div>
  );
}
