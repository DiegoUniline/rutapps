import { Plus, Trash2, ReceiptText } from 'lucide-react';
import ProductSearchInput from '@/components/ProductSearchInput';
import type { PromoResult } from '@/hooks/usePromociones';
import { VentaTotals } from '@/components/venta/VentaTotals';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { VentaLinea } from '@/types';
import { VentaLineaMobile } from './VentaLineaMobile';
import { VentaLineaDesktop } from './VentaLineaDesktop';
import { useCurrency } from '@/hooks/useCurrency';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';
import { ColumnVisibilityMenu } from '@/components/ColumnVisibilityMenu';
import {
  VENTA_LINEAS_GROUP_ORDER, VENTA_LINEAS_DEFAULT_VISIBILITY,
  VENTA_LINEAS_DESGLOSE_COLUMNS, VENTA_LINEAS_DESGLOSE_DEFAULTS, VENTA_LINEAS_DESGLOSE_OFF,
  VENTA_LINEAS_DESGLOSE_GROUP_ORDER, VENTA_LINEAS_NON_FINAL_OFF, getVentaLineasColumns,
} from './ventaLineasColumns';

import { useAuth } from '@/contexts/AuthContext';
import { desgloseLineaHabilitado } from '@/lib/ventaLineaDesglose';

interface Props {
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  readOnly: boolean;
  totals: { subtotal: number; descuento_total: number; iva_total: number; ieps_total: number; total: number; descuento_promo?: number; descuento_extra_amt?: number };
  promoResults?: PromoResult[];
  onProductSelect: (idx: number, pid: string) => void;
  onUpdateLine: (idx: number, field: string, val: any) => void;
  onRemoveLine: (idx: number) => void;
  onAddLine: () => void;
  setCellRef: (row: number, col: number, el: HTMLElement | null) => void;
  onCellKeyDown: (e: React.KeyboardEvent, row: number, col: number) => void;
  navigateCell: (row: number, col: number, dir: 'next' | 'prev') => void;
  setLineas: React.Dispatch<React.SetStateAction<Partial<VentaLinea>[]>>;
  sinImpuestos?: boolean;
  setSinImpuestos?: (v: boolean) => void;
  readOnlyForm?: boolean;
  saldoPendiente?: number;
  currencyCode?: string | null;
  cerradoSnapshot?: { lineas?: Array<{ producto_id: string; pedido: number; entregado: number }> } | null;
  canChangePrice?: boolean;
  canApplyDiscount?: boolean;
  onChangeLineListaPrecio?: (idx: number, selection: import('@/components/venta/ListaPrecioPicker').ListaPrecioSelection) => void;
}

export function VentaLineasTab(props: Props) {
  const isMobile = useIsMobile();
  const { symbol } = useCurrency();
  const { readOnly, totals, onAddLine, sinImpuestos, setSinImpuestos, readOnlyForm, saldoPendiente, promoResults, currencyCode, cerradoSnapshot } = props;
  const { empresa } = useAuth();
  const showDesglose = desgloseLineaHabilitado(empresa?.licencia);
  const defaults = { ...VENTA_LINEAS_DEFAULT_VISIBILITY, ...VENTA_LINEAS_DESGLOSE_DEFAULTS };
  const { visible: cols, toggleColumn, reset } = useColumnPreferences('venta_detalle_lineas_v7', defaults);
  const NORMAL_COLS_OFF = { precioNeto: false, precioBruto: false, iva: false, ieps: false, descMan: false, descPromo: false, subtotal: false, lote: false };
  const effectiveCols = readOnly
    ? (showDesglose ? { ...cols, ...NORMAL_COLS_OFF, ...VENTA_LINEAS_NON_FINAL_OFF } : { ...cols, ...VENTA_LINEAS_DESGLOSE_OFF })
    : { ...VENTA_LINEAS_DEFAULT_VISIBILITY, ...VENTA_LINEAS_DESGLOSE_OFF };
  const showCol = (k: string) => effectiveCols[k] !== false;



  // If pedido is cerrado, scale each line by its delivered/ordered ratio so
  // Cantidad, Subtotal and Total reflect what was actually entregado.
  const lineas = (() => {
    const raw = props.lineas;
    if (!cerradoSnapshot?.lineas?.length) return raw;
    const byProd = new Map(cerradoSnapshot.lineas.map(s => [s.producto_id, s]));
    return raw.map(l => {
      const snap = l.producto_id ? byProd.get(l.producto_id) : null;
      if (!snap) return l;
      const pedido = Number(snap.pedido) || 0;
      const entregado = Number(snap.entregado) || 0;
      const ratio = pedido > 0 ? Math.min(1, entregado / pedido) : 0;
      return {
        ...l,
        cantidad: entregado,
        pedido_cantidad: pedido,
        subtotal: (Number((l as any).subtotal) || 0) * ratio,
        total: (Number((l as any).total) || 0) * ratio,
        iva_total: (Number((l as any).iva_total) || 0) * ratio,
        ieps_total: (Number((l as any).ieps_total) || 0) * ratio,
        descuento_amount: (Number((l as any).descuento_amount) || 0) * ratio,
      } as Partial<VentaLinea>;

    });
  })();


  return (
    <div className="p-3 sm:p-4">
      {/* Tabla de líneas a lo ANCHO; la card de Resumen va DEBAJO de la tabla. */}
      <div className="space-y-4">
        <div className="space-y-3 min-w-0">
          {isMobile ? (
            <div className="space-y-2">
              {lineas.map((l, idx) => (
                <VentaLineaMobile key={idx} idx={idx} line={l} {...props} lineas={lineas} currencySymbol={symbol} currencyCode={currencyCode} />
              ))}
            </div>
          ) : (
            <>
              {readOnly && (
                <div className="flex justify-end">
                  <ColumnVisibilityMenu
                    columns={getVentaLineasColumns(showDesglose)}
                    visible={cols}
                    onToggle={toggleColumn}
                    groupOrder={showDesglose ? undefined : VENTA_LINEAS_GROUP_ORDER}

                    onReset={reset}
                  />
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-table-border text-left">
                      <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                      {showCol('cantidad') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">{cerradoSnapshot?.lineas?.length ? 'Pedido / Entregado' : 'Cantidad'}</th>}
                      <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[240px]">Producto</th>
                      {showCol('unidad') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center">Unidad</th>}
                      {showCol('precioBruto') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Precio<span className="font-normal"> c/imp</span></th>}
                      {showCol('precioNeto') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Precio<span className="font-normal"> s/imp</span></th>}
                      {showCol('iva') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">IVA</th>}
                      {showCol('ieps') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">IEPS</th>}
                      {showCol('descPromo') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Desc promo</th>}
                      {showCol('descMan') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-right">Desc man.</th>}
                      {showCol('subtotal') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right">Total línea</th>}
                      {showCol('lote') && <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24">Lote</th>}
                      {VENTA_LINEAS_DESGLOSE_COLUMNS.filter(c => showCol(c.key)).map(c => (
                        <th key={c.key} className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right whitespace-nowrap">{c.label}</th>
                      ))}
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l, idx) => (
                      <VentaLineaDesktop key={idx} idx={idx} line={l} isLast={idx === lineas.length - 1} {...props} lineas={lineas} currencySymbol={symbol} currencyCode={currencyCode} cols={effectiveCols} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!readOnly && (
            <div className="flex items-center justify-between">
              <button onClick={onAddLine} className="btn-odoo-secondary text-xs">
                <Plus className="h-3 w-3" /> Agregar producto
              </button>
              {setSinImpuestos && !readOnlyForm && (
                <button onClick={() => setSinImpuestos(!sinImpuestos)} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all border", sinImpuestos ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300" : "bg-accent/50 border-border/40 text-muted-foreground")}>
                  <ReceiptText className="h-3.5 w-3.5" />
                  Sin impuestos
                  <div className={cn("w-8 h-4 rounded-full relative transition-colors", sinImpuestos ? "bg-amber-500" : "bg-border")}>
                    <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform", sinImpuestos ? "translate-x-4" : "translate-x-0.5")} />
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="lg:w-80 lg:ml-auto">
          <VentaTotals {...totals} isMobile={isMobile} saldoPendiente={saldoPendiente} promoResults={promoResults} descuento_promo={totals.descuento_promo} descuento_extra_amt={totals.descuento_extra_amt} currencyCode={currencyCode} promoTotalGuardado={readOnly ? lineas.reduce((s, l) => s + (Number((l as any).descuento_promocion_monto) || 0), 0) : null} subtotalNetoGuardado={readOnly ? Math.round(lineas.reduce((s, l) => { const lista = Number((l as any).precio_lista_unitario); const qty = Number((l as any).cantidad) || 0; return s + (Number.isFinite(lista) ? Math.round(lista * qty * 100) / 100 : 0); }, 0) * 100) / 100 : null} descuentoNetoGuardado={readOnly ? Math.round(lineas.reduce((s, l) => { const a = l as any; const desc = (Number(a.descuento_promocion_monto) || 0) + (Number(a.descuento_manual_monto) || 0); if (desc <= 0) return s; const divisor = (1 + (Number(a.ieps_pct) || 0) / 100) * (1 + (Number(a.iva_pct) || 0) / 100); return s + Math.round((divisor > 0 ? desc / divisor : desc) * 100) / 100; }, 0) * 100) / 100 : null} />
        </div>
      </div>
    </div>
  );
}
