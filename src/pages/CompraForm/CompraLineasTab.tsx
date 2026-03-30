import { Plus, X } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import type { CompraLinea } from './types';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  lineas: Partial<CompraLinea>[];
  productosList: any[] | undefined;
  isEditable: boolean;
  updateLinea: (idx: number, key: string, val: any) => void;
  addLine: () => void;
  removeLine: (idx: number) => void;
}

export function CompraLineasTab({ lineas, productosList, isEditable, updateLinea, addLine, removeLine }: Props) {
  const { fmt } = useCurrency();
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-table-border">
            <th className="th-odoo text-left w-8">#</th><th className="th-odoo text-left" style={{ width: '40%' }}>Producto</th>
            <th className="th-odoo text-center w-14">Ud.</th><th className="th-odoo text-right w-24">Cant.</th>
            <th className="th-odoo text-center w-20">Factor</th><th className="th-odoo text-right w-20">Piezas</th>
            <th className="th-odoo text-right w-28">Costo</th><th className="th-odoo text-center w-14">IVA</th>
            <th className="th-odoo text-center w-14">IEPS</th><th className="th-odoo text-right w-24">Total</th>
            {isEditable && <th className="th-odoo w-8"></th>}
          </tr></thead>
          <tbody>
            {lineas.map((line, idx) => {
              const iepsLabel = line._tiene_ieps ? (line._ieps_tipo === 'cuota' ? `$${line._ieps_pct}` : `${line._ieps_pct}%`) : '';
              return (
                <tr key={idx} className="border-b border-table-border" data-row={idx}>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="py-1.5 px-2">
                    {isEditable ? (
                      <SearchableSelect options={(productosList as any[])?.filter(p => { const usedIds = lineas.filter((_, j) => j !== idx).map(l => l.producto_id).filter(Boolean); return !usedIds.includes(p.id); }).map(p => ({ value: p.id, label: `[${p.codigo}] ${p.nombre}` })) ?? []} value={line.producto_id ?? ''} onChange={val => updateLinea(idx, 'producto_id', val)} placeholder="Buscar producto..." />
                    ) : <span className="text-xs truncate block">{line.productos ? `[${line.productos.codigo}] ${line.productos.nombre}` : '—'}</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center text-xs text-muted-foreground uppercase">{line._unidad_compra || 'pz'}</td>
                  <td className="py-1.5 px-2"><input type="number" className="input-odoo w-full text-right text-xs" value={line.cantidad ?? 1} onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))} disabled={!isEditable} min={0} /></td>
                  <td className="py-1.5 px-1"><input type="number" className="w-full text-center text-xs bg-transparent border border-border rounded px-1 py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary" value={line._factor_conversion ?? 1} onChange={e => updateLinea(idx, '_factor_conversion', Math.max(1, Number(e.target.value) || 1))} disabled={!isEditable} min={1} /></td>
                  <td className="py-1.5 px-2 text-right text-xs font-medium text-foreground tabular-nums">{((line.cantidad ?? 1) * (line._factor_conversion ?? 1)).toLocaleString('es-MX')}</td>
                  <td className="py-1.5 px-3"><input type="number" className="input-odoo w-full text-right text-xs" value={line.precio_unitario ?? 0} onChange={e => updateLinea(idx, 'precio_unitario', Number(e.target.value))} disabled={!isEditable} step="0.01" /></td>
                  <td className="py-1.5 px-3 text-center"><div className="flex flex-col items-center gap-0.5"><Switch checked={line._tiene_iva ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_iva', v)} disabled={!isEditable} className="scale-75" />{line._tiene_iva && <span className="text-[10px] text-muted-foreground">{line._iva_pct}%</span>}</div></td>
                  <td className="py-1.5 px-3 text-center"><div className="flex flex-col items-center gap-0.5"><Switch checked={line._tiene_ieps ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_ieps', v)} disabled={!isEditable} className="scale-75" />{line._tiene_ieps && <span className="text-[10px] text-muted-foreground">{iepsLabel}</span>}</div></td>
                  <td className="py-1.5 px-3 text-right font-medium text-xs">{fmt(line.total ?? 0)}</td>
                  {isEditable && <td className="py-1.5 px-3"><button onClick={() => removeLine(idx)} className="text-destructive hover:text-destructive/80"><X className="h-3.5 w-3.5" /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isEditable && <button onClick={addLine} className="btn-odoo-secondary text-xs gap-1"><Plus className="h-3.5 w-3.5" /> Agregar línea</button>}
    </div>
  );
}
