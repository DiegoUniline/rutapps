import { Trash2 } from 'lucide-react';
import ProductSearchInput from '@/components/ProductSearchInput';
import type { VentaLinea } from '@/types';

interface Props {
  idx: number;
  line: Partial<VentaLinea>;
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  readOnly: boolean;
  onProductSelect: (idx: number, pid: string) => void;
  onUpdateLine: (idx: number, field: string, val: any) => void;
  onRemoveLine: (idx: number) => void;
}

export function VentaLineaMobile({ idx, line: l, lineas, productosList, readOnly, onProductSelect, onUpdateLine, onRemoveLine }: Props) {
  const qty = Number(l.cantidad) || 0;
  const price = Number(l.precio_unitario) || 0;
  const desc = Number(l.descuento_pct) || 0;
  const base = qty * price * (1 - desc / 100);
  const ieps = base * ((Number(l.ieps_pct) || 0) / 100);
  const iva = (base + ieps) * ((Number(l.iva_pct) || 0) / 100);
  const lineTotal = base + ieps + iva;
  const prod = productosList?.find((p: any) => p.id === l.producto_id);
  const isEmpty = !l.producto_id;
  const lineData = l as any;
  const unidadLabel = lineData.unidad_label || 'PZA';

  if (isEmpty && readOnly) return null;

  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="text-sm font-medium truncate">{prod ? `${prod.codigo} · ${prod.nombre}` : '—'}</div>
          ) : (
            <ProductSearchInput
              products={(productosList ?? []).filter((p: any) => !lineas.filter((_, j) => j !== idx).map(ll => ll.producto_id).filter(Boolean).includes(p.id)).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_principal: p.precio_principal }))}
              value={l.producto_id ?? ''} displayText={prod ? `${prod.codigo} · ${prod.nombre}` : undefined}
              onSelect={pid => onProductSelect(idx, pid)} autoFocus={idx === lineas.length - 1 && isEmpty} readOnly={readOnly}
            />
          )}
          {!isEmpty && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Number(l.iva_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'iva_pct', 0)} className="text-[10px] px-1.5 py-0 rounded-full bg-accent text-accent-foreground">IVA {l.iva_pct}% ✕</button>}
              {Number(l.ieps_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'ieps_pct', 0)} className="text-[10px] px-1.5 py-0 rounded-full bg-accent text-accent-foreground">IEPS {l.ieps_pct}% ✕</button>}
            </div>
          )}
        </div>
        {!readOnly && !isEmpty && <button onClick={() => onRemoveLine(idx)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>}
      </div>
      {!isEmpty && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block">Cantidad {prod?.es_granel && <span className="text-primary font-medium">({prod.unidad_granel})</span>}</label>
            {readOnly ? <span className="text-sm font-medium">{l.cantidad} {prod?.es_granel ? prod.unidad_granel : unidadLabel}</span> : (
              <div className="flex items-center gap-1">
                <input type="number" inputMode={prod?.es_granel ? "decimal" : "numeric"} className="inline-edit-input text-sm text-right !py-1 w-full" value={l.cantidad ?? ''} onChange={e => onUpdateLine(idx, 'cantidad', e.target.value)} min="0" step={prod?.es_granel ? "0.001" : "1"} onFocus={e => e.target.select()} />
                <span className="text-[10px] text-muted-foreground shrink-0">{prod?.es_granel ? prod.unidad_granel : unidadLabel}</span>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block">Precio</label>
            {readOnly ? <span className="text-sm">${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> : (
              <input type="number" inputMode="decimal" className="inline-edit-input text-sm text-right !py-1 w-full" value={l.precio_unitario ?? ''} onChange={e => onUpdateLine(idx, 'precio_unitario', e.target.value)} min="0" step="0.01" onFocus={e => e.target.select()} />
            )}
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block">Total</label>
            <span className="text-sm font-semibold">${lineTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
