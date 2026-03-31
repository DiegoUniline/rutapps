import { Trash2 } from 'lucide-react';
import ProductSearchInput from '@/components/ProductSearchInput';
import { cn } from '@/lib/utils';
import type { VentaLinea } from '@/types';

interface Props {
  idx: number;
  line: Partial<VentaLinea>;
  isLast: boolean;
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  readOnly: boolean;
  onProductSelect: (idx: number, pid: string) => void;
  onUpdateLine: (idx: number, field: string, val: any) => void;
  onRemoveLine: (idx: number) => void;
  setCellRef: (row: number, col: number, el: HTMLElement | null) => void;
  onCellKeyDown: (e: React.KeyboardEvent, row: number, col: number) => void;
  navigateCell: (row: number, col: number, dir: 'next' | 'prev') => void;
  setLineas: React.Dispatch<React.SetStateAction<Partial<VentaLinea>[]>>;
}

export function VentaLineaDesktop({ idx, line: l, isLast, lineas, productosList, readOnly, onProductSelect, onUpdateLine, onRemoveLine, setCellRef, onCellKeyDown, navigateCell, setLineas }: Props) {
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
  const unidadLabel = lineData.unidad_label || '';
  const impuestosLabel = lineData.impuestos_label || '';

  const handleIvaToggle = () => {
    if (readOnly) return;
    const currentIva = Number(l.iva_pct) || 0;
    const p = productosList?.find((x: any) => x.id === l.producto_id);
    const defaultIva = p?.tiene_iva ? Number(p.iva_pct ?? 16) : 16;
    const newIva = currentIva > 0 ? 0 : defaultIva;
    onUpdateLine(idx, 'iva_pct', newIva);
    const newIeps = Number(l.ieps_pct) || 0;
    const taxes: string[] = [];
    if (newIva > 0) taxes.push(`IVA ${newIva}%`);
    if (newIeps > 0) taxes.push(`IEPS ${newIeps}%`);
    setLineas(prev => { const next = [...prev]; (next[idx] as any).impuestos_label = taxes.join(', '); return next; });
  };

  const handleIepsToggle = () => {
    if (readOnly) return;
    const currentIeps = Number(l.ieps_pct) || 0;
    const p = productosList?.find((x: any) => x.id === l.producto_id);
    const defaultIeps = p?.tiene_ieps ? Number(p.ieps_pct ?? 0) : 0;
    const newIeps = currentIeps > 0 ? 0 : defaultIeps;
    onUpdateLine(idx, 'ieps_pct', newIeps);
    const newIva = Number(l.iva_pct) || 0;
    const taxes: string[] = [];
    if (newIva > 0) taxes.push(`IVA ${newIva}%`);
    if (newIeps > 0) taxes.push(`IEPS ${newIeps}%`);
    setLineas(prev => { const next = [...prev]; (next[idx] as any).impuestos_label = taxes.join(', '); return next; });
  };

  return (
    <tr className={cn("border-b border-table-border transition-colors group", isEmpty ? "bg-transparent" : "hover:bg-table-hover")}>
      <td className="py-1.5 px-2 text-muted-foreground text-xs">{isEmpty ? '' : idx + 1}</td>
      <td className="py-1 px-2">
        {readOnly ? <span className="text-[12px]">{prod ? `${prod.codigo} · ${prod.nombre}` : '—'}</span> : (
          <ProductSearchInput
            products={(productosList ?? []).filter((p: any) => !lineas.filter((_, j) => j !== idx).map(ll => ll.producto_id).filter(Boolean).includes(p.id)).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_principal: p.precio_principal }))}
            value={l.producto_id ?? ''} displayText={prod ? `${prod.codigo} · ${prod.nombre}` : undefined}
            onSelect={pid => onProductSelect(idx, pid)} onNavigate={dir => navigateCell(idx, 0, dir)} readOnly={readOnly}
            registerRef={el => setCellRef(idx, 0, el)}
          />
        )}
        {!isEmpty && (
          <div className="flex flex-wrap gap-1 md:hidden mt-0.5">
            {Number(l.iva_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'iva_pct', 0)} className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground">IVA {l.iva_pct}% ✕</button>}
            {Number(l.ieps_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'ieps_pct', 0)} className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground">IEPS {l.ieps_pct}% ✕</button>}
          </div>
        )}
      </td>
      <td className="py-1 px-2">
        {readOnly ? <span className="text-[12px] block text-right">{l.cantidad}{prod?.es_granel && <span className="text-muted-foreground ml-0.5 text-[10px]">{prod.unidad_granel}</span>}<span className="md:hidden text-muted-foreground ml-1">{unidadLabel}</span></span> : (
          <div className="flex items-center gap-1 justify-end">
            <input ref={el => setCellRef(idx, 1, el)} type="number" inputMode={prod?.es_granel ? "decimal" : "numeric"} className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.cantidad ?? ''} onChange={e => onUpdateLine(idx, 'cantidad', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 1)} onFocus={e => e.target.select()} min="0" step={prod?.es_granel ? "0.001" : "1"} />
            {prod?.es_granel && <span className="text-[10px] text-muted-foreground shrink-0">{prod.unidad_granel}</span>}
            {unidadLabel && !prod?.es_granel && <span className="text-[10px] text-muted-foreground shrink-0 md:hidden">{unidadLabel}</span>}
          </div>
        )}
      </td>
      <td className="py-1.5 px-2 text-center text-muted-foreground text-[12px] hidden md:table-cell">{isEmpty ? '' : (unidadLabel || '—')}</td>
      <td className="py-1 px-2">
        {readOnly ? <span className="text-[12px] block text-right">${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        : isEmpty ? <span></span>
        : <input ref={el => setCellRef(idx, 2, el)} type="number" inputMode="decimal" className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.precio_unitario ?? ''} onChange={e => onUpdateLine(idx, 'precio_unitario', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 2)} onFocus={e => e.target.select()} min="0" step="0.01" />}
      </td>
      <td className="py-1.5 px-2 text-center hidden md:table-cell">
        {isEmpty ? '' : (
          <div className="inline-flex flex-wrap gap-1 justify-center">
            <button type="button" disabled={readOnly} onClick={handleIvaToggle}
              className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.iva_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}
              title={Number(l.iva_pct) > 0 ? "Clic para quitar IVA" : "Clic para aplicar IVA"}>
              IVA {Number(l.iva_pct) > 0 ? `${l.iva_pct}%` : ''}
            </button>
            {(Number(l.ieps_pct) > 0 || (impuestosLabel).includes('IEPS')) && (
              <button type="button" disabled={readOnly} onClick={handleIepsToggle}
                className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.ieps_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}>
                IEPS {Number(l.ieps_pct) > 0 ? `${l.ieps_pct}%` : ''}
              </button>
            )}
            {Number(l.iva_pct) === 0 && Number(l.ieps_pct) === 0 && !impuestosLabel.includes('IEPS') && <span className="text-muted-foreground text-[11px]">—</span>}
          </div>
        )}
      </td>
      <td className="py-1 px-2">
        {readOnly ? <span className="text-[12px] block text-right">{l.descuento_pct ?? 0}%</span>
        : <input ref={el => setCellRef(idx, 3, el)} type="number" inputMode="decimal" className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.descuento_pct ?? ''} onChange={e => onUpdateLine(idx, 'descuento_pct', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 3)} onFocus={e => e.target.select()} min="0" max="100" step="0.1" />}
      </td>
      <td className="py-1.5 px-2 text-right font-medium">
        {isEmpty ? '' : (
          <div>
            <span>${lineTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {(iva > 0 || ieps > 0) && <span className="block text-[10px] text-muted-foreground font-normal">sin imp: ${base.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
          </div>
        )}
      </td>
      <td className="py-1.5 px-2">
        {!readOnly && !isEmpty && <button onClick={() => onRemoveLine(idx)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
      </td>
    </tr>
  );
}
