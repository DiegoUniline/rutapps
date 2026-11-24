import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import ProductSearchInput from '@/components/ProductSearchInput';
import type { PromoResult } from '@/hooks/usePromociones';
import { VentaTotals } from '@/components/venta/VentaTotals';
import { useIsMobile } from '@/hooks/use-mobile';
import type { VentaLinea } from '@/types';
import { VentaLineaMobile } from './VentaLineaMobile';
import { VentaLineaDesktop } from './VentaLineaDesktop';
import { VentaLineasFooter } from './VentaLineasFooter';
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
import { useManejaLotes } from '@/hooks/useManejaLotes';
import { useVentaLineaLotes } from '@/hooks/useVentaLineaLotes';
import { useAllPresentaciones, type ProductoPresentacion } from '@/hooks/usePresentaciones';
import { BuscadorProductoMovil, RenglonCompactoMovil, type AgregarProductoDatos, type PresentacionBuscable, type ProductoBuscable } from '@/components/productos/BuscadorProductoMovil';
import { calculateSaleLineAmounts, type SaleLinePricingLike } from '@/lib/salePricing';
import { formatCurrency } from '@/lib/currency';


interface Props {
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  readOnly: boolean;
  pricingReady?: boolean;
  totals: { subtotal: number; descuento_total: number; iva_total: number; ieps_total: number; total: number; descuento_promo?: number; descuento_extra_amt?: number };
  promoResults?: PromoResult[];
  onChangePresentation?: import('@/components/venta/VentaPresentacion').ChangePresentation;
  onProductSelect: (idx: number, pid: string, presentacion?: import('@/components/ProductSearchInput').PresentacionOption) => void;
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
  totalPagado?: number;
  currencyCode?: string | null;
  cerradoSnapshot?: { lineas?: Array<{ producto_id: string; pedido: number; entregado: number }> } | null;
  canChangePrice?: boolean;
  canApplyDiscount?: boolean;
  descuentoExtraValor?: number;
  descuentoExtraTipo?: string;
  onDescuentoExtraChange?: (value: number) => void;
  onToggleDescuentoExtraTipo?: () => void;
  onChangeLineListaPrecio?: (idx: number, selection: import('@/components/venta/ListaPrecioPicker').ListaPrecioSelection) => void;
  onPickLote?: (idx: number) => void;
  /** D-038: precio neto por unidad base de la lista del cliente (buscador móvil). */
  getPrecioLista?: (productoId: string, presentacion: ProductoPresentacion | null) => number;
}

type ProductoBuscableVenta = ProductoBuscable & { _stock?: number | null };
const fmtCant = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });

export function VentaLineasTab(props: Props) {
  const isMobile = useIsMobile();
  const { symbol, fmt } = useCurrency();
  const {
    readOnly, totals, onAddLine, pricingReady = true, sinImpuestos, setSinImpuestos,
    readOnlyForm, saldoPendiente, totalPagado, promoResults, currencyCode, cerradoSnapshot,
    canApplyDiscount, descuentoExtraValor, descuentoExtraTipo,
    onDescuentoExtraChange, onToggleDescuentoExtraTipo,
  } = props;
  const { empresa } = useAuth();
  const showDesglose = desgloseLineaHabilitado(empresa?.licencia);
  const defaults = { ...VENTA_LINEAS_DEFAULT_VISIBILITY, ...VENTA_LINEAS_DESGLOSE_DEFAULTS };
  const { visible: cols, toggleColumn, reset } = useColumnPreferences('venta_detalle_lineas_v7', defaults);
  const NORMAL_COLS_OFF = { precioNeto: false, precioBruto: false, iva: false, ieps: false, descMan: false, descPromo: false, subtotal: false, lote: false, loteado: false };
  // Si alguna línea es de un producto que maneja lote, la columna Lote se
  // muestra siempre (también en pedidos cerrados) para poder lotear desde aquí.
  // La columna Lote se muestra si algún producto maneja lote o si la línea ya
  // trae lote guardado (evita depender del catálogo en caché tras activar lotes).
  const manejaLotes = useManejaLotes();
  // Presentaciones activas: se listan directo en el buscador de productos.
  const { data: presentacionesActivas } = useAllPresentaciones();
  const ventaIdActual = (props.lineas ?? []).map(l => (l as any).venta_id).find(Boolean) as string | undefined;
  const lotesPorLinea = useVentaLineaLotes(ventaIdActual, manejaLotes);

  const hayLotes = manejaLotes && ((props.lineas ?? []).some(l =>
    !!(props.productosList ?? []).find((p: any) => p.id === l.producto_id)?.maneja_lote
    || !!(l as any).lote_id || !!(l as any).lote_codigo,
  ) || (!!(empresa as any)?.maneja_lotes && (props.lineas ?? []).some(l => {
    const p: any = (props.productosList ?? []).find((x: any) => x.id === l.producto_id);
    return !!l.producto_id && (!p || p.maneja_lote === undefined);
  })));
  const effectiveColsBase = readOnly
    ? (showDesglose ? { ...cols, ...NORMAL_COLS_OFF, ...VENTA_LINEAS_NON_FINAL_OFF } : { ...cols, ...VENTA_LINEAS_DESGLOSE_OFF })
    : { ...VENTA_LINEAS_DEFAULT_VISIBILITY, ...VENTA_LINEAS_DESGLOSE_OFF };
  const effectiveCols = hayLotes ? { ...effectiveColsBase, lote: true, loteado: true } : effectiveColsBase;
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
        paquetes: l.paquetes != null ? Number(l.paquetes) * ratio : null,
        pedido_cantidad: pedido,
        subtotal: (Number((l as any).subtotal) || 0) * ratio,
        total: (Number((l as any).total) || 0) * ratio,
        iva_total: (Number((l as any).iva_total) || 0) * ratio,
        ieps_total: (Number((l as any).ieps_total) || 0) * ratio,
        descuento_amount: (Number((l as any).descuento_amount) || 0) * ratio,
      } as Partial<VentaLinea>;

    });
  })();


  // ── D-038 · Teléfono: buscador a pantalla completa + renglones compactos ──
  const capturaMovil = isMobile && !readOnly;
  const money = (v: number | null | undefined) => (currencyCode ? formatCurrency(v, currencyCode) : fmt(v));
  const [renglonAbierto, setRenglonAbierto] = useState<number | null>(null);
  useEffect(() => { setRenglonAbierto(null); }, [lineas.length]);
  const presentacionesDe = (productoId: string) => ((presentacionesActivas ?? []) as ProductoPresentacion[])
    .filter(x => x.producto_id === productoId && x.activo !== false && Number(x.factor_base) > 0);
  const precioDe = (p: ProductoBuscable, pres: PresentacionBuscable | null) => {
    const completa = pres ? presentacionesDe(p.id).find(x => x.id === pres.id) ?? null : null;
    return props.getPrecioLista ? props.getPrecioLista(p.id, completa) : 0;
  };
  // Tras elegir el producto con handleProductSelect, la cantidad y el precio se
  // aplican con updateLine cuando el renglón ya existe (misma validación de stock).
  const pendienteRef = useRef<{ idx: number; productoId: string; cantidad: number; porPaquetes: boolean; precio: number | null } | null>(null);
  useEffect(() => {
    const p = pendienteRef.current;
    if (!p) return;
    const l = props.lineas[p.idx];
    if (!l || l.producto_id !== p.productoId) return;
    pendienteRef.current = null;
    props.onUpdateLine(p.idx, p.porPaquetes ? 'paquetes' : 'cantidad', p.cantidad);
    if (p.precio != null) props.onUpdateLine(p.idx, 'precio_unitario', p.precio);
  }, [props.lineas]); // eslint-disable-line react-hooks/exhaustive-deps
  const agregarDesdeBuscador = ({ producto, cantidad, presentacion, precio }: AgregarProductoDatos<ProductoBuscableVenta>) => {
    const pres = presentacion ? presentacionesDe(producto.id).find(x => x.id === presentacion.id) ?? null : null;
    const existente = props.lineas.findIndex(l => l.producto_id === producto.id);
    if (existente >= 0) {
      const l = props.lineas[existente];
      if ((l.presentacion_id ?? null) !== (pres?.id ?? null)) {
        toast.error('Ese producto ya está en el documento con otra presentación. Cámbialo en su renglón.');
        return false;
      }
      if (pres) props.onUpdateLine(existente, 'paquetes', (Number(l.paquetes) || 0) + cantidad);
      else props.onUpdateLine(existente, 'cantidad', (Number(l.cantidad) || 0) + cantidad);
      return;
    }
    let idx = props.lineas.findIndex(l => !l.producto_id);
    if (idx < 0) { onAddLine(); idx = props.lineas.length; }
    props.onProductSelect(idx, producto.id, pres ?? undefined);
    const precioLista = precioDe(producto, presentacion);
    pendienteRef.current = {
      idx, productoId: producto.id, cantidad, porPaquetes: !!pres,
      precio: props.canChangePrice && Math.abs(precio - precioLista) > 0.00005 ? precio : null,
    };
  };
  const productosBuscador: ProductoBuscableVenta[] = capturaMovil ? (props.productosList ?? []).map((p: any) => ({
    id: p.id, codigo: p.codigo ?? '', nombre: p.nombre ?? '', textoBusqueda: p.formula ?? '',
    unidad: p.es_granel ? (p.unidad_granel || 'kg') : (p.unidades_venta?.abreviatura || 'pz'),
    _stock: p._stock,
  })) : [];

  return (
    <div className="min-w-0 max-w-full overflow-hidden p-2.5 sm:p-3">
      {!readOnly && !pricingReady && (
        <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] text-foreground">
          Selecciona un cliente para cargar su lista de precios antes de agregar productos.
        </div>
      )}
      {/* Tabla de líneas a lo ANCHO; la card de Resumen va DEBAJO de la tabla. */}
      <div className="min-w-0 max-w-full space-y-3">
        <div className="min-w-0 max-w-full space-y-3">
          {capturaMovil ? (
            <div>
              <BuscadorProductoMovil<ProductoBuscableVenta>
                modo="venta"
                productos={productosBuscador}
                getExistencia={p => (p._stock == null ? null : Number(p._stock))}
                getPresentaciones={p => presentacionesDe(p.id).map(x => ({ id: x.id, nombre: x.nombre, factor: Number(x.factor_base) }))}
                getPrecio={precioDe}
                puedeEditarPrecio={!!props.canChangePrice}
                etiquetaPrecio="Precio s/imp."
                agregados={new Set(lineas.map(l => l.producto_id).filter(Boolean) as string[])}
                onAgregar={agregarDesdeBuscador}
                disabled={!pricingReady}
                avisoDeshabilitado="Elige primero el cliente."
                fmt={v => money(v)}
              />
              {lineas.every(l => !l.producto_id) ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay productos. Toca «Buscar producto».</p>
              ) : (
                <div className="mt-3 border-b border-border">
                  {lineas.map((l, idx) => {
                    if (!l.producto_id) return null;
                    const prod: any = (props.productosList ?? []).find((p: any) => p.id === l.producto_id);
                    const snap: any = (l as any).productos;
                    const unidad = (l as any).unidad_label || (prod?.es_granel ? prod.unidad_granel : '') || 'pz';
                    const precio = Number(l.precio_unitario) || 0;
                    const total = calculateSaleLineAmounts({ ...l, precio_unitario: precio } as SaleLinePricingLike, sinImpuestos).total;
                    const detalle = l.presentacion_nombre
                      ? `${fmtCant(Number(l.paquetes) || 0)} × ${l.presentacion_nombre} · ${money(precio)}`
                      : `${fmtCant(Number(l.cantidad) || 0)} × ${unidad} · ${money(precio)}`;
                    return (
                      <RenglonCompactoMovil
                        key={idx}
                        nombre={prod?.nombre ?? snap?.nombre ?? l.descripcion ?? '—'}
                        detalle={detalle}
                        importe={money(total)}
                        abierto={renglonAbierto === idx}
                        onToggle={() => setRenglonAbierto(a => (a === idx ? null : idx))}
                      >
                        <VentaLineaMobile idx={idx} line={l} {...props} presentaciones={presentacionesActivas} lineas={lineas} currencySymbol={symbol} currencyCode={currencyCode} sinMarco />
                      </RenglonCompactoMovil>
                    );
                  })}
                </div>
              )}
            </div>
          ) : isMobile ? (
            <div className="space-y-2">
              {lineas.map((l, idx) => (
                <VentaLineaMobile key={idx} idx={idx} line={l} {...props} presentaciones={presentacionesActivas} lineas={lineas} currencySymbol={symbol} currencyCode={currencyCode} />
              ))}
            </div>
          ) : (
            <>
              {readOnly && (
                <div className="flex justify-end">
                  <ColumnVisibilityMenu
                    columns={getVentaLineasColumns(showDesglose).filter(c => manejaLotes || c.key !== 'lote')}
                    visible={cols}
                    onToggle={toggleColumn}
                    groupOrder={showDesglose ? undefined : VENTA_LINEAS_GROUP_ORDER}

                    onReset={reset}
                  />
                </div>
              )}
              <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
                <table data-no-scroll className="w-max min-w-full table-auto text-[12px]">
                  <thead>
                    <tr className="border-b border-table-border text-left sticky top-0 z-10 bg-card">
                      <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-8">#</th>
                      {showCol('cantidad') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-24 text-right">{cerradoSnapshot?.lineas?.length ? 'Pedido / Entregado' : 'Cantidad'}</th>}
                      <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-[18%] min-w-[120px]">Producto</th>
                      {showCol('unidad') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-16 text-center">Unidad</th>}
                      {showCol('precioBruto') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">Precio<span className="font-normal"> c/imp</span></th>}
                      {showCol('precioNeto') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">Precio<span className="font-normal"> s/imp</span></th>}
                      {showCol('iva') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">IVA</th>}
                      {showCol('ieps') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">IEPS</th>}
                      {showCol('descPromo') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">Desc promo</th>}
                      {showCol('descMan') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-16 text-right">Desc man.</th>}
                      {showCol('subtotal') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">Total línea</th>}
                      {showCol('lote') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-24">Lote</th>}
                      {showCol('loteado') && <th className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] w-20 text-right">Loteado</th>}
                      {VENTA_LINEAS_DESGLOSE_COLUMNS.filter(c => showCol(c.key)).map(c => (
                        <th key={c.key} className="py-1.5 px-2 bg-card text-muted-foreground font-medium text-[11px] text-right">{c.label}</th>
                      ))}
                      <th className="py-1.5 px-2 bg-card w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l, idx) => (
                      <VentaLineaDesktop key={idx} idx={idx} line={l} isLast={idx === lineas.length - 1} {...props} lineas={lineas} presentaciones={presentacionesActivas} currencySymbol={symbol} currencyCode={currencyCode} cols={effectiveCols} lotesAsignados={lotesPorLinea[(l as any).id] ?? undefined} />
                    ))}

                  </tbody>
                  <VentaLineasFooter lineas={lineas} cols={effectiveCols} currencyCode={currencyCode} />
                </table>
              </div>
            </>
          )}

          {!readOnly && !capturaMovil && (
            <div className="flex items-center">
              <button onClick={onAddLine} disabled={!pricingReady} className="btn-odoo-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="h-3 w-3" /> Agregar producto
              </button>
            </div>
          )}
        </div>

        <div className="flex w-full justify-end">
          <div className="w-full lg:w-96">
            <VentaTotals {...totals} isMobile={isMobile} saldoPendiente={saldoPendiente} totalPagado={totalPagado} promoResults={promoResults} descuento_promo={totals.descuento_promo} descuento_extra_amt={totals.descuento_extra_amt} descuentoExtraValor={descuentoExtraValor} descuentoExtraTipo={descuentoExtraTipo} canEditDescuentoExtra={!readOnly && !!canApplyDiscount} onDescuentoExtraChange={onDescuentoExtraChange} onToggleDescuentoExtraTipo={onToggleDescuentoExtraTipo} sinImpuestos={sinImpuestos} canToggleSinImpuestos={!readOnlyForm && !!setSinImpuestos} onSinImpuestosChange={setSinImpuestos} currencyCode={currencyCode} promoTotalGuardado={readOnly ? lineas.reduce((s, l) => s + (Number((l as any).descuento_promocion_monto) || 0), 0) : null} subtotalNetoGuardado={readOnly ? Math.round(lineas.reduce((s, l) => { const lista = Number((l as any).precio_lista_unitario); const qty = Number((l as any).cantidad) || 0; return s + (Number.isFinite(lista) ? Math.round(lista * qty * 100) / 100 : 0); }, 0) * 100) / 100 : null} descuentoNetoGuardado={readOnly ? Math.round(lineas.reduce((s, l) => { const a = l as any; const desc = (Number(a.descuento_promocion_monto) || 0) + (Number(a.descuento_manual_monto) || 0); if (desc <= 0) return s; const divisor = (1 + (Number(a.ieps_pct) || 0) / 100) * (1 + (Number(a.iva_pct) || 0) / 100); return s + Math.round((divisor > 0 ? desc / divisor : desc) * 100) / 100; }, 0) * 100) / 100 : null} />
          </div>
        </div>
      </div>
    </div>
  );
}
