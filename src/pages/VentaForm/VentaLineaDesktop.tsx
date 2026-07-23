import { Trash2 } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/currency';
import ProductSearchInput from '@/components/ProductSearchInput';
import { ListaPrecioPicker } from '@/components/venta/ListaPrecioPicker';
import { cn } from '@/lib/utils';
import { calculateSaleLineAmounts, type SaleLinePricingLike } from '@/lib/salePricing';
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
  currencySymbol?: string;
  currencyCode?: string | null;
  canChangePrice?: boolean;
  canApplyDiscount?: boolean;
  sinImpuestos?: boolean;
}

export function VentaLineaDesktop({ idx, line: l, isLast, lineas, productosList, readOnly, onProductSelect, onUpdateLine, onRemoveLine, setCellRef, onCellKeyDown, navigateCell, setLineas, currencySymbol: cs = '$', currencyCode, canChangePrice = true, canApplyDiscount = true, sinImpuestos = false }: Props) {
  const { fmt } = useCurrency();
  const money = (value: number | null | undefined) => currencyCode ? formatCurrency(value, currencyCode) : fmt(value);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const price = Number(l.precio_unitario) || 0;
  const desc = Number(l.descuento_pct) || 0;
  const amounts = calculateSaleLineAmounts({ ...l, precio_unitario: price } as SaleLinePricingLike, sinImpuestos);
  const grossSubtotal = amounts.subtotal;
  const discount = amounts.discount;
  const base = r2(grossSubtotal - discount);
  const ieps = amounts.ieps;
  const iva = amounts.iva;
  const lineTotal = amounts.total;
  const storedBase = Number(l.subtotal) || 0;
  const storedTotal = Number(l.total) || 0;
  const displayLineTotal = readOnly && storedTotal > 0 ? r2(storedTotal) : lineTotal;
  const inferredDesc = readOnly && desc <= 0 && grossSubtotal > 0
    ? Math.max(0, ((grossSubtotal - (storedBase > 0 ? Math.min(storedBase, grossSubtotal) : Math.min(displayLineTotal, grossSubtotal))) / grossSubtotal) * 100)
    : desc;
  const prod = productosList?.find((p: any) => p.id === l.producto_id);
  // Fallback to embedded product data from the DB join (venta_lineas → productos)
  const embeddedProd = (l as any).productos;
  const prodDisplay = prod || embeddedProd;
  const isEmpty = !l.producto_id;
  const lineData = l as any;
  const unidadLabel = lineData.unidad_label
    || (l as any).unidades?.abreviatura
    || (embeddedProd as any)?.unidades_venta?.abreviatura
    || (prodDisplay?.es_granel ? prodDisplay?.unidad_granel : '')
    || '';
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
        {readOnly ? <span className="text-[12px]">{prodDisplay ? `${prodDisplay.codigo ?? ''} · ${prodDisplay.nombre}`.replace(/^ · /, '') : (l.descripcion || '—')}{prod?._stock != null && <span className="ml-1.5 text-[10px] text-muted-foreground font-medium">(Stock: {prod._stock})</span>}</span> : (
          <ProductSearchInput
            products={(productosList ?? []).filter((p: any) => !lineas.filter((_, j) => j !== idx).map(ll => ll.producto_id).filter(Boolean).includes(p.id)).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, formula: p.formula, precio_principal: p.precio_principal, _stock: p._stock }))}
            value={l.producto_id ?? ''} displayText={prodDisplay ? `${prodDisplay.codigo ?? ''} · ${prodDisplay.nombre}${prod?._stock != null ? ` (Stock: ${prod._stock})` : ''}`.replace(/^ · /, '') : (l.descripcion || undefined)}
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
        {readOnly ? (
          (l as any).pedido_cantidad != null ? (
            <span className="text-[12px] block text-right tabular-nums">
              <span className="text-muted-foreground">{(l as any).pedido_cantidad}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-medium">{l.cantidad}</span>
              {unidadLabel && <span className="text-muted-foreground ml-1 text-[10px]">{unidadLabel}</span>}
            </span>
          ) : (
            <span className="text-[12px] block text-right">{l.cantidad}{(prod ?? prodDisplay)?.es_granel && <span className="text-muted-foreground ml-0.5 text-[10px]">{(prod ?? prodDisplay).unidad_granel}</span>}<span className="md:hidden text-muted-foreground ml-1">{unidadLabel}</span></span>
          )
        ) : (
          <div className="flex items-center gap-1 justify-end">
            <input ref={el => setCellRef(idx, 1, el)} type="number" inputMode={prod?.es_granel ? "decimal" : "numeric"} className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.cantidad ?? ''} onChange={e => onUpdateLine(idx, 'cantidad', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 1)} onFocus={e => e.target.select()} min="0" step={prod?.es_granel ? "0.001" : "1"} />
            {prod?.es_granel && <span className="text-[10px] text-muted-foreground shrink-0">{prod.unidad_granel}</span>}
            {unidadLabel && !prod?.es_granel && <span className="text-[10px] text-muted-foreground shrink-0 md:hidden">{unidadLabel}</span>}
          </div>
        )}
      </td>

      <td className="py-1.5 px-2 text-center text-muted-foreground text-[12px] hidden md:table-cell">{isEmpty ? '' : (unidadLabel || '—')}</td>
      <td className="py-1 px-2">
        {readOnly ? <span className="text-[12px] block text-right">{money(price)}</span>
        : isEmpty ? <span></span>
        : !canChangePrice ? <span className="text-[12px] block text-right">{money(price)}</span>
        : (
          <div className="flex items-center gap-1 justify-end">
            <ListaPrecioPicker
              producto={prod ?? prodDisplay}
              currentListaPrecioId={(l as any).lista_precio_id ?? null}
              isManual={!!(l as any).precio_manual}
              compact
              onSelectLista={(listaPrecioId, _tarifaId, unitPrice, displayPrice, _nombre) => {
                setLineas(prev => {
                  const next = [...prev];
                  (next[idx] as any) = { ...next[idx], lista_precio_id: listaPrecioId, precio_unitario: unitPrice, display_unit_price: displayPrice, precio_manual: false };
                  return next;
                });
              }}
            />
            {(() => {
              const basePrecio = ((l as any).base_precio ?? 'sin_impuestos');
              const showGross = basePrecio === 'con_impuestos';
              const shownValue = showGross
                ? ((l as any).display_unit_price ?? l.precio_unitario ?? '')
                : (l.precio_unitario ?? '');
              return (
                <input
                  ref={el => setCellRef(idx, 2, el)}
                  type="number" inputMode="decimal"
                  className="inline-edit-input text-[12px] text-right !py-1 w-20"
                  value={shownValue}
                  onChange={e => {
                    onUpdateLine(idx, 'precio_unitario', e.target.value);
                    setLineas(prev => {
                      const next = [...prev];
                      (next[idx] as any).precio_manual = true;
                      return next;
                    });
                  }}
                  onKeyDown={e => onCellKeyDown(e, idx, 2)}
                  onFocus={e => e.target.select()}
                  min="0" step="0.01"
                />
              );
            })()}
          </div>
        )}
      </td>
      <td className="py-1.5 px-2 text-center hidden md:table-cell">
        {isEmpty ? '' : (
          <div className="inline-flex flex-wrap gap-1 justify-center">
            <button type="button" disabled={readOnly} onClick={handleIvaToggle}
              className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.iva_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}
              title={Number(l.iva_pct) > 0 ? "Clic para quitar IVA" : "Clic para aplicar IVA"}>
              IVA {Number(l.iva_pct) > 0 ? `${l.iva_pct}%` : ''}
            </button>
            {(() => {
              const p = productosList?.find((x: any) => x.id === l.producto_id);
              const prodHasIeps = !!p && (p.tiene_ieps || Number(p.ieps_pct ?? 0) > 0);
              const showIeps = Number(l.ieps_pct) > 0 || prodHasIeps || impuestosLabel.includes('IEPS');
              if (!showIeps) return null;
              return (
                <button type="button" disabled={readOnly} onClick={handleIepsToggle}
                  className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.ieps_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}
                  title={Number(l.ieps_pct) > 0 ? "Clic para quitar IEPS" : "Clic para aplicar IEPS"}>
                  IEPS {Number(l.ieps_pct) > 0 ? `${l.ieps_pct}%` : ''}
                </button>
              );
            })()}
            {Number(l.iva_pct) === 0 && Number(l.ieps_pct) === 0 && !impuestosLabel.includes('IEPS') && <span className="text-muted-foreground text-[11px]">—</span>}
          </div>
        )}
      </td>
      <td className="py-1 px-2">
        {(readOnly || !canApplyDiscount) ? <span className="text-[12px] block text-right">{inferredDesc > 0 ? `${Number(inferredDesc.toFixed(2))}%` : '0%'}</span>
        : <input ref={el => setCellRef(idx, 3, el)} type="number" inputMode="decimal" className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.descuento_pct ?? ''} onChange={e => onUpdateLine(idx, 'descuento_pct', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 3)} onFocus={e => e.target.select()} min="0" max="100" step="0.1" />}
      </td>
      <td className="py-1.5 px-2 text-right font-medium">
        {isEmpty ? '' : (
          <div>
            <span>{money(displayLineTotal)}</span>
            {(discount > 0 || iva > 0 || ieps > 0) && <span className="block text-[10px] text-muted-foreground font-normal">base: {money(base)}</span>}
          </div>
        )}
      </td>
      <td className="py-1.5 px-2 hidden md:table-cell">
        {!isEmpty && (l as any).lote_codigo
          ? <span className="text-[11px]"><span className="font-medium">{(l as any).lote_codigo}</span></span>
          : (!isEmpty ? <span className="text-muted-foreground text-[11px]">—</span> : '')}
      </td>
      <td className="py-1.5 px-2">
        {!readOnly && !isEmpty && <button onClick={() => onRemoveLine(idx)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
      </td>
    </tr>
  );
}
