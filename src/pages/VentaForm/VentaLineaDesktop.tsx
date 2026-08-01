import { Trash2 } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/currency';
import ProductSearchInput from '@/components/ProductSearchInput';
import { ListaPrecioPicker, type ListaPrecioSelection } from '@/components/venta/ListaPrecioPicker';
import { cn } from '@/lib/utils';
import { calculateSaleLineAmounts, type SaleLinePricingLike } from '@/lib/salePricing';
import type { VentaLinea } from '@/types';
import type { PromoResult } from '@/hooks/usePromociones';

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
  onChangeLineListaPrecio?: (idx: number, selection: ListaPrecioSelection) => void;
  promoResults?: PromoResult[];
  /** Visibilidad de columnas (detalle). Si no viene, se muestran todas. */
  cols?: Record<string, boolean>;
}

export function VentaLineaDesktop({ idx, line: l, isLast, lineas, productosList, readOnly, onProductSelect, onUpdateLine, onRemoveLine, setCellRef, onCellKeyDown, navigateCell, setLineas, currencySymbol: cs = '$', currencyCode, canChangePrice = true, canApplyDiscount = true, sinImpuestos = false, onChangeLineListaPrecio, promoResults, cols }: Props) {
  const { fmt } = useCurrency();
  const money = (value: number | null | undefined) => currencyCode ? formatCurrency(value, currencyCode) : fmt(value);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const showCol = (k: string) => !cols || cols[k] !== false;
  const price = Number(l.precio_unitario) || 0;
  const desc = Number(l.descuento_pct) || 0;
  const amounts = calculateSaleLineAmounts({ ...l, precio_unitario: price } as SaleLinePricingLike, sinImpuestos);
  const grossSubtotal = amounts.subtotal;
  const discount = amounts.discount;
  const base = r2(grossSubtotal - discount);
  const ieps = amounts.ieps;
  const iva = amounts.iva;
  const lineTotal = amounts.total;
  const storedTotal = Number(l.total) || 0;
  const displayLineTotal = readOnly && storedTotal > 0 ? r2(storedTotal) : lineTotal;
  // El descuento de la columna "Desc %" viene SOLO de descuento_pct (manual);
  // la promoción se muestra aparte. Se eliminó la inferencia que comparaba el
  // subtotal recalculado contra el guardado, porque en productos con impuesto
  // fabricaba un descuento fantasma (p. ej. 7.4% = 1 − 1/1.08 con 8%).
  const inferredDesc = desc;
  const prod = productosList?.find((p: any) => p.id === l.producto_id);
  // Fallback to embedded product data from the DB join (venta_lineas → productos)
  const embeddedProd = (l as any).productos;
  const prodDisplay = prod || embeddedProd;
  const isEmpty = !l.producto_id;
  // Descuento de promoción que cae en ESTA línea (por producto), para mostrarlo
  // a nivel de línea y no solo en el resumen "Promociones".
  const linePromos = (promoResults ?? []).filter((r) => r.producto_id === l.producto_id);
  const linePromoDesc = r2(linePromos.reduce((s, r) => s + (Number(r.descuento) || 0), 0));
  // ¿La promo regala la linea completa? -> el subtotal se muestra GRATIS (solo
  // en vista de detalle). Se prefiere la cantidad gratis; si no, el monto.
  const lineGratisQty = linePromos
    .filter((r) => r.tipo === 'producto_gratis' || (Number(r.cantidad_gratis) || 0) > 0)
    .reduce((s, r) => s + (Number(r.cantidad_gratis) || 0), 0);
  const lineEsGratis = readOnly && (Number(displayLineTotal) || 0) > 0 && (
    lineGratisQty > 0
      ? lineGratisQty >= (Number(l.cantidad) || 0) - 0.001
      : linePromoDesc > 0 && linePromoDesc >= (Number(displayLineTotal) || 0) - 0.01
  );
  // Montos de impuesto mostrados por columna. En LECTURA se usan los montos
  // GUARDADOS (ya netos de promoción) para no mezclar el impuesto pre-promoción
  // recalculado con el total post-promoción; en edición se usan los recalculados
  // en vivo.
  const ivaShown = readOnly ? (Number(l.iva_monto) || 0) : iva;
  const iepsShown = readOnly ? (Number(l.ieps_monto) || 0) : ieps;

  // Ajuste visual para no confundir al usuario: en LECTURA (readOnly),
  // mostramos siempre los montos de impuestos UNITARIOS en las columnas de IVA/IEPS
  // para que (Neto + IVA + IEPS) = "Precio c/imp".
  const qty = Math.max(1, Number(l.cantidad) || 1);
  const ivaUnit = readOnly ? r2((Number(l.iva_monto) || 0) / qty) : iva;
  const iepsUnit = readOnly ? r2((Number(l.ieps_monto) || 0) / qty) : ieps;


  // Precio unitario CON impuestos (para la columna opcional "Precio c/imp").
  // En LECTURA (readOnly) reconstruimos desde el total guardado para que
  // coincida visualmente con el subtotal y el desglose de impuestos guardado.
  const ivaPctUnit = sinImpuestos ? 0 : (Number(l.iva_pct) || 0);
  const iepsPctUnit = sinImpuestos ? 0 : (Number(l.ieps_pct) || 0);
  const priceGross = readOnly 
    ? r2((Number(l.total) || 0) / qty)
    : r2(price * (1 + iepsPctUnit / 100) * (1 + ivaPctUnit / 100));

  // % de la promoción prorrateada, relativo al subtotal BRUTO (pre-promoción) de
  // la línea. Se reconstruye desde montos guardados para que sea independiente de
  // cómo se guardó el precio_unitario (bruto en escritorio, neto en ruta):
  //   base neta post-promo = total − IVA − IEPS ; bruto = base neta + promoción.
  const netBaseRO = readOnly
    ? r2((Number(displayLineTotal) || 0) - ivaShown - iepsShown)
    : base;
  const grossBaseForPromo = r2(netBaseRO + linePromoDesc);
  const promoDescPct = linePromoDesc > 0
    ? (lineEsGratis ? 100 : (grossBaseForPromo > 0 ? r2((linePromoDesc / grossBaseForPromo) * 100) : 0))
    : 0;
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
        {linePromoDesc > 0 && (
          <div className="text-[10px] text-primary font-medium mt-0.5">
            🎁 {linePromos[0].descripcion || linePromos[0].nombre} · −{money(linePromoDesc)}
          </div>
        )}
        {!isEmpty && (
          <div className="flex flex-wrap gap-1 md:hidden mt-0.5">
            {Number(l.iva_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'iva_pct', 0)} className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground">IVA {l.iva_pct}% ✕</button>}
            {Number(l.ieps_pct) > 0 && <button type="button" disabled={readOnly} onClick={() => !readOnly && onUpdateLine(idx, 'ieps_pct', 0)} className="text-[10px] px-1 py-0 rounded-full bg-accent text-accent-foreground">IEPS {l.ieps_pct}% ✕</button>}
          </div>
        )}
      </td>
      {showCol('cantidad') && (
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
      )}

      {showCol('unidad') && (
      <td className="py-1.5 px-2 text-center text-muted-foreground text-[12px]">{isEmpty ? '' : (unidadLabel || '—')}</td>
      )}
      {showCol('precioNeto') && (
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
              onSelectLista={(selection) => {
                if (onChangeLineListaPrecio) {
                  onChangeLineListaPrecio(idx, selection);
                  return;
                }
                setLineas(prev => {
                  const next = [...prev];
                  (next[idx] as any) = {
                    ...next[idx],
                    lista_precio_id: selection.listaPrecioId,
                    precio_unitario: selection.unitPrice,
                    display_unit_price: selection.displayPrice,
                    precio_unitario_sin_redondeo: selection.rawUnitPrice,
                    precio_display_sin_redondeo: selection.rawDisplayPrice,
                    base_precio: selection.basePrecio,
                    redondeo: selection.redondeo,
                    precio_manual: false,
                  };
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
      )}
      {/* Precio CON impuestos (columna opcional, siempre informativa) */}
      {showCol('precioBruto') && (
      <td className="py-1 px-2 text-right">
        {isEmpty ? '' : <span className="text-[12px] tabular-nums">{money(priceGross)}</span>}
      </td>
      )}
      {/* IVA (columna propia): en lectura el monto en $, en edición el chip para activar/quitar */}
      {showCol('iva') && (
      <td className="py-1.5 px-2 text-right">
        {isEmpty ? '' : readOnly ? (
          ivaUnit > 0
            ? <span className="text-[12px] tabular-nums">{money(ivaUnit)}<span className="text-muted-foreground text-[9px] ml-1">{Number(l.iva_pct) || 0}%</span></span>
            : <span className="text-muted-foreground text-[11px]">—</span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <button type="button" disabled={readOnly} onClick={handleIvaToggle}
              className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.iva_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}
              title={Number(l.iva_pct) > 0 ? "Clic para quitar IVA" : "Clic para aplicar IVA"}>
              IVA {Number(l.iva_pct) > 0 ? `${l.iva_pct}%` : ''}
            </button>
            {ivaUnit > 0 && <span className="text-[9px] text-muted-foreground tabular-nums">{money(ivaUnit)}</span>}
          </div>

        )}
      </td>
      )}
      {/* IEPS (columna propia): en lectura el monto en $, en edición el chip */}
      {showCol('ieps') && (
      <td className="py-1.5 px-2 text-right">
        {isEmpty ? '' : (() => {
          if (readOnly) {
            return iepsUnit > 0
              ? <span className="text-[12px] tabular-nums">{money(iepsUnit)}<span className="text-muted-foreground text-[9px] ml-1">{Number(l.ieps_pct) || 0}%</span></span>
              : <span className="text-muted-foreground text-[11px]">—</span>;
          }

          const p = productosList?.find((x: any) => x.id === l.producto_id);
          const prodHasIeps = !!p && (p.tiene_ieps || Number(p.ieps_pct ?? 0) > 0);
          const showIeps = Number(l.ieps_pct) > 0 || prodHasIeps || impuestosLabel.includes('IEPS');
          if (!showIeps) return <span className="text-muted-foreground text-[11px]">—</span>;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <button type="button" disabled={readOnly} onClick={handleIepsToggle}
                className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer", Number(l.ieps_pct) > 0 ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground line-through opacity-60")}
                title={Number(l.ieps_pct) > 0 ? "Clic para quitar IEPS" : "Clic para aplicar IEPS"}>
                IEPS {Number(l.ieps_pct) > 0 ? `${l.ieps_pct}%` : ''}
              </button>
              {iepsUnit > 0 && <span className="text-[9px] text-muted-foreground tabular-nums">{money(iepsUnit)}</span>}
            </div>

          );
        })()}
      </td>
      )}
      {/* Descuento MANUAL (descuento_pct) */}
      {showCol('descMan') && (
      <td className="py-1 px-2">
        {(readOnly || !canApplyDiscount) ? <span className="text-[12px] block text-right">{inferredDesc > 0 ? `${Number(inferredDesc.toFixed(2))}%` : '—'}</span>
        : <input ref={el => setCellRef(idx, 3, el)} type="number" inputMode="decimal" className="inline-edit-input text-[12px] text-right !py-1 w-full" value={l.descuento_pct ?? ''} onChange={e => onUpdateLine(idx, 'descuento_pct', e.target.value)} onKeyDown={e => onCellKeyDown(e, idx, 3)} onFocus={e => e.target.select()} min="0" max="100" step="0.1" />}
      </td>
      )}
      {/* Descuento por PROMOCIÓN (informativo, no editable) */}
      {showCol('descPromo') && (
      <td className="py-1.5 px-2 text-right">
        {isEmpty ? '' : linePromoDesc > 0 ? (
          <span className="text-[11px] text-primary font-medium tabular-nums">
            −{money(linePromoDesc)}
            {promoDescPct > 0 && <span className="text-muted-foreground text-[9px] ml-1">{Number(promoDescPct.toFixed(2))}%</span>}
          </span>
        ) : <span className="text-muted-foreground text-[11px]">—</span>}
      </td>
      )}
      <td className="py-1.5 px-2 text-right font-medium">
        {isEmpty ? '' : lineEsGratis ? (
          <div>
            <span className="text-muted-foreground line-through font-normal text-[11px] mr-1">{money(displayLineTotal)}</span>
            <span className="text-green-600 font-bold">GRATIS</span>
          </div>
        ) : (
          <div>
            <span>{money(displayLineTotal)}</span>
            {(() => {
              // Base gravable mostrada bajo el total. En lectura se usa la base
              // NETA post-promoción (total − IVA − IEPS) para que cuadre con los
              // montos guardados y no muestre la base pre-promoción recalculada.
              const baseShown = readOnly ? netBaseRO : base;
              return (ivaShown > 0 || iepsShown > 0 || discount > 0 || linePromoDesc > 0)
                ? <span className="block text-[10px] text-muted-foreground font-normal">base: {money(baseShown)}</span>
                : null;
            })()}
          </div>
        )}
      </td>
      {showCol('lote') && (
      <td className="py-1.5 px-2">
        {!isEmpty && (l as any).lote_codigo
          ? <span className="text-[11px]"><span className="font-medium">{(l as any).lote_codigo}</span></span>
          : (!isEmpty ? <span className="text-muted-foreground text-[11px]">—</span> : '')}
      </td>
      )}
      {/* ── Desglose por línea (columnas informativas, valores GUARDADOS) ── */}
      {(() => {
        const d = l as any;
        const num = (v: any) => (v == null ? null : Number(v));
        const cell = (key: string, content: React.ReactNode) => showCol(key) ? (
          <td key={key} className="py-1.5 px-2 text-right text-[12px] tabular-nums whitespace-nowrap">
            {isEmpty ? '' : (content ?? <span className="text-muted-foreground text-[11px]">—</span>)}
          </td>
        ) : null;
        const m = (v: any) => (num(v) == null ? null : money(Number(v)));
        return [
          cell('dPrecioLista', m(d.precio_lista_unitario)),
          cell('dImporteBruto', m(d.importe_bruto)),
          cell('dDescPromoMonto', num(d.descuento_promocion_monto) ? <span className="text-primary">−{money(Number(d.descuento_promocion_monto))}</span> : m(d.descuento_promocion_monto)),
          cell('dBaseDescMan', m(d.base_descuento_manual)),
          cell('dDescManMonto', m(d.descuento_manual_monto)),
          cell('dDescTotal', m(d.descuento_total_monto)),
          cell('dBaseIeps', m(d.base_ieps)),
          cell('dBaseIva', m(d.base_iva)),
          cell('dImpuestosTot', m(d.impuestos_totales)),
          cell('dPromoNombre', d.promocion_nombre ? <span className="text-[11px]">{d.promocion_nombre}</span> : null),
          cell('dCantBonificada', num(d.cantidad_bonificada) != null ? String(Number(d.cantidad_bonificada)) : null),
          cell('dEsBonificacion', d.es_bonificacion == null ? null : <span className="text-[11px]">{d.es_bonificacion ? 'Sí' : 'No'}</span>),
          cell('dMotivoDescMan', d.motivo_descuento_manual ? <span className="text-[11px]">{d.motivo_descuento_manual}</span> : null),
          cell('dObjetoImpuesto', d.objeto_impuesto ? <span className="text-[11px]">{d.objeto_impuesto}</span> : null),
        ];
      })()}
      <td className="py-1.5 px-2">
        {!readOnly && !isEmpty && <button onClick={() => onRemoveLine(idx)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
      </td>
    </tr>
  );
}
