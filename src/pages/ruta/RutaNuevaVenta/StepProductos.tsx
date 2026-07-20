import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { Search, Plus, Minus, Trash2, ShoppingCart, RotateCcw, ScanLine, Eye, Pencil, Tag, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import BarcodeScanner from '@/components/ruta/BarcodeScanner';
import NumericKeypadModal from '@/components/ruta/NumericKeypadModal';
import PedidoSugeridoBanner from '@/components/ruta/PedidoSugeridoBanner';
import SaldoPendienteBanner from '@/components/ruta/SaldoPendienteBanner';
import { ProductoDetalleModal } from '@/components/ruta/ProductoDetalleModal';
import { PresentacionSelectorModal } from '@/components/ruta/PresentacionSelectorModal';
import { useAllPresentaciones } from '@/hooks/usePresentaciones';
import type { CartItem, DevolucionItem } from './types';
import { useApartadoAlmacenes } from '@/hooks/useApartadoStock';

interface Props {
  clienteNombre: string;
  clienteListaNombre?: string | null;
  devoluciones: DevolucionItem[];
  searchProducto: string;
  setSearchProducto: (v: string) => void;
  filteredProductos: any[] | undefined;
  cart: CartItem[];
  cambioItems: CartItem[];
  tipoVenta: 'venta_directa' | 'pedido';
  totals: { items: number; total: number };
  addToCart: (p: any, esCambio?: boolean) => void;
  addGranelLine: (p: any, opts: { cantidadBase: number; precioUnitario: number; paquetes: number | null; presentacion: { id: string; nombre: string; factor_base: number } | null }) => void;
  updateQty: (pid: string, delta: number, esCambio?: boolean) => void;
  removeFromCart: (pid: string, esCambio?: boolean) => void;
  getItemInCart: (pid: string) => CartItem | undefined;
  getMaxQty: (pid: string) => number;
  getDispSigned?: (pid: string) => number;
  setStep: (s: any) => void;
  setCart: (v: any) => void;
  stockAbordo: Map<string, number>;
  usandoAlmacen: boolean;
  fmt: (n: number) => string;
  // Smart actions
  insights: { suggested: any[]; manualList: any[]; historialAvg: any[]; lastSaleLineas: any[]; saldoPendiente: number; creditoInfo: { limite: number; disponible: number; dias: number } | null };
  bannerDismissed: boolean;
  setBannerDismissed: (v: boolean) => void;
  applyManualList: () => void;
  applyHistorialAvg: () => void;
  repeatLastSale: () => void;
  findProductByCode: (code: string) => any | null;
  setItemQty: (pid: string, qty: number, esCambio?: boolean) => void;
  // Price overrides
  getSuggestedPrice: (pid: string) => number;
  setItemPriceManual: (pid: string, price: number) => void;
  setItemPriceFromLista: (pid: string, listaPrecioId: string | null, tarifaId: string | null, unitPrice: number, listaNombre: string) => void;
  resetItemToSuggested: (pid: string) => void;
  /** True if user can change prices manually (else manual entry stays read-only) */
  canChangePrice: boolean;
  /** True if user can switch price lists (else the list picker is read-only) */
  canChangeLista: boolean;
  // Apartado de stock en pedidos
  apartadoActivoPedido: boolean;
  pedidoAlmacenId: string | null;
  setPedidoAlmacenId: (id: string | null) => void;
}

export function StepProductos(props: Props) {
  const {
    clienteNombre, clienteListaNombre, devoluciones, searchProducto, setSearchProducto, filteredProductos,
    cart, cambioItems, tipoVenta, totals, addToCart, addGranelLine, updateQty, removeFromCart,
    getItemInCart, getMaxQty, getDispSigned, setStep, setCart, stockAbordo, usandoAlmacen, fmt,
    insights, bannerDismissed, setBannerDismissed,
    applyManualList, applyHistorialAvg, repeatLastSale, findProductByCode, setItemQty,
    getSuggestedPrice, setItemPriceManual, setItemPriceFromLista, resetItemToSuggested,
    canChangePrice, canChangeLista,
    apartadoActivoPedido, pedidoAlmacenId, setPedidoAlmacenId,
  } = props;
  const { symbol: s } = useCurrency();
  const { data: allPresentaciones } = useAllPresentaciones();
  const { data: apartadoAlmacenes } = useApartadoAlmacenes();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [keypadFor, setKeypadFor] = useState<{ producto_id: string; nombre: string; cantidad: number; max: number; granel: boolean } | null>(null);
  const [granelFor, setGranelFor] = useState<any | null>(null);
  const { empresa } = useAuth();
  const soloConStockDefault = !!(empresa as any)?.apartado_solo_con_stock;
  const [stockFilter, setStockFilter] = useState<'con' | 'sin' | 'todos'>(soloConStockDefault ? 'con' : 'todos');


  // Wrap addToCart: abrir el selector si es granel O si el producto tiene
  // presentaciones (caja/paquete) — igual que el POS de escritorio. Sin
  // presentaciones y no-granel, se agrega directo por pieza.
  const handleAdd = (p: any, esCambio?: boolean) => {
    const tienePresentaciones = (allPresentaciones ?? []).some(
      (pr: any) => pr.producto_id === p?.id && pr.activo !== false
    );
    if (!esCambio && (p?.es_granel || tienePresentaciones)) { setGranelFor(p); return; }
    addToCart(p, esCambio);
  };
  const [detalleProducto, setDetalleProducto] = useState<any | null>(null);

  const handleScan = (code: string) => {
    const norm = code.trim().toLowerCase();

    // 1) Match contra código de barras de presentación
    const pres = (allPresentaciones ?? []).find(p =>
      p.activo && p.codigo_barras && p.codigo_barras.trim().toLowerCase() === norm
    );
    if (pres) {
      const prod = (filteredProductos ?? []).find(x => x.id === pres.producto_id)
        ?? findProductByCode(pres.producto_id);
      if (prod) {
        const factor = Number(pres.factor_base) || 1;
        const precioUnit = pres.precio_especial != null
          ? Number(pres.precio_especial) / factor
          : getSuggestedPrice(prod.id);
        addGranelLine(prod, {
          cantidadBase: factor,
          precioUnitario: precioUnit,
          paquetes: 1,
          presentacion: { id: pres.id, nombre: pres.nombre, factor_base: factor },
        });
        toast.success(`+ ${prod.nombre} · ${pres.nombre}`);
        return;
      }
    }

    // 2) Match contra código del producto
    const prod = findProductByCode(code);
    if (!prod) { toast.error(`Sin coincidencias para "${code}"`); return; }
    handleAdd(prod);
    toast.success(`+ ${prod.nombre}`, {
      action: { label: 'Deshacer', onClick: () => removeFromCart(prod.id) },
      duration: 4000,
    });
    // keep scanner open for rapid scanning
  };

  const showBanner = !bannerDismissed;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-1 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
            <span className="text-[10px] text-muted-foreground">Cliente:</span>
            <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
          </div>
          {devoluciones.length > 0 && (
            <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
              <RotateCcw className="h-2.5 w-2.5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">{devoluciones.length} dev.</span>
            </div>
          )}
        </div>
        {clienteListaNombre && (
          <div className="text-[10px] text-muted-foreground px-1">
            Lista: <span className="font-medium text-foreground">{clienteListaNombre}</span>
          </div>
        )}
      </div>

      <SaldoPendienteBanner saldoPendiente={insights.saldoPendiente} creditoInfo={insights.creditoInfo} />

      {showBanner && (
        <PedidoSugeridoBanner
          manualCount={insights.manualList.length}
          historialCount={insights.historialAvg.length}
          lastSaleCount={insights.lastSaleLineas.length}
          onApplyManual={applyManualList}
          onApplyHistorial={applyHistorialAvg}
          onRepeatLastSale={repeatLastSale}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      <div className="px-3 pb-1.5 flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar producto..." className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            value={searchProducto} onChange={e => setSearchProducto(e.target.value)} />
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          aria-label="Escanear código"
          className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 active:scale-95 transition-transform shadow-sm shadow-primary/20"
        >
          <ScanLine className="h-4.5 w-4.5" />
        </button>
      </div>
      {apartadoActivoPedido && (apartadoAlmacenes?.length ?? 0) > 0 && (
        <div className="px-3 pb-1.5">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Almacén del pedido</label>
          <select
            value={pedidoAlmacenId ?? ''}
            onChange={(e) => setPedidoAlmacenId(e.target.value || null)}
            className="w-full bg-accent/60 rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
          >
            {(apartadoAlmacenes ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
          <div className="flex gap-1.5 mt-2">
            {([
              { k: 'con', label: 'Con stock' },
              { k: 'sin', label: 'Sin stock' },
              { k: 'todos', label: 'Todos' },
            ] as const).map(opt => (
              <button
                key={opt.k}
                onClick={() => setStockFilter(opt.k)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all active:scale-95 ${stockFilter === opt.k ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-muted-foreground'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {cambioItems.length > 0 && (
        <div className="mx-3 mb-1.5 bg-accent/40 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Cambios (sin cargo)</p>
          {cambioItems.map(item => (
            <div key={`cambio-${item.producto_id}`} className="flex justify-between text-[11px] py-0.5">
              <span className="text-foreground">{item.cantidad}x {item.nombre}</span><span className="text-muted-foreground">{s}0.00</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
        {filteredProductos?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/60 flex items-center justify-center mb-3">
              <PackageSearch className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-1">
              {searchProducto ? 'Sin coincidencias' : 'Sin productos disponibles'}
            </p>
            <p className="text-[12px] text-muted-foreground max-w-[260px]">
              {searchProducto
                ? `No encontramos "${searchProducto}". Prueba con otro nombre o código.`
                : tipoVenta === 'venta_directa'
                  ? 'No tienes productos cargados a bordo. Cambia a "Pedido" o realiza una carga.'
                  : 'Aún no tienes productos en tu catálogo activo.'}
            </p>
            {searchProducto && (
              <button
                onClick={() => setSearchProducto('')}
                className="mt-3 text-[12px] font-medium text-primary px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}
        {filteredProductos?.filter(p => {
          if (!(apartadoActivoPedido && tipoVenta === 'pedido')) return true;
          if (stockFilter === 'todos') return true;
          const disp = getMaxQty(p.id);
          return stockFilter === 'con' ? disp > 0 : disp <= 0;
        }).map(p => {
          const inCart = getItemInCart(p.id);
          const maxQty = getMaxQty(p.id);
          // Show real stock, not Infinity (which appears when vender_sin_stock is enabled)
          const realStock = apartadoActivoPedido && tipoVenta === 'pedido'
            ? maxQty
            : tipoVenta === 'venta_directa'
            ? (stockAbordo.get(p.id) ?? 0)
            : (p.cantidad ?? 0);
          const stockLabel = tipoVenta === 'venta_directa'
            ? `${realStock} ${usandoAlmacen ? 'en almacén' : 'a bordo'}`
            : `${realStock} en almacén`;
          const stockOk = (apartadoActivoPedido && tipoVenta === 'pedido') ? realStock > 0 : (tipoVenta === 'pedido' || realStock > 0 || !!p.vender_sin_stock);
          const atMax = inCart && maxQty !== Infinity && inCart.cantidad >= maxQty;
          const isManual = !!inCart?.precio_manual;
          const hasLista = !!inCart?.lista_precio_id;
          const displayPrice = inCart?.precio_unitario ?? (p.precio_principal ?? 0);
          return (
            <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${inCart ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0" onClick={() => !inCart && stockOk && handleAdd(p)}>
                  <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-px flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                    {(p as any).formula && (
                      <span className="text-[10px] text-muted-foreground italic truncate max-w-[140px]">· {(p as any).formula}</span>
                    )}
                    {!(apartadoActivoPedido && tipoVenta === 'pedido' && pedidoAlmacenId) && (
                      <>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={`text-[10px] font-medium ${stockOk ? 'text-green-600' : 'text-destructive'}`}>{stockLabel}</span>
                      </>
                    )}
                    {apartadoActivoPedido && tipoVenta === 'pedido' && (() => {
                      const disp = maxQty;
                      const bg = disp > 0 ? 'bg-green-500/15 text-green-700 dark:text-green-300' : disp === 0 ? 'bg-muted text-muted-foreground' : 'bg-destructive/15 text-destructive';
                      return (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${bg}`}>
                          Disp: {disp.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                        </span>
                      );
                    })()}

                  </div>
                  <div className="flex items-center gap-1.5 mt-px">
                    <p className={`text-[13px] font-bold ${isManual ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                      {s}{displayPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      <span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{p.es_granel ? p.unidad_granel : ((p.unidades as any)?.abreviatura || 'pz')}</span>
                    </p>
                    {isManual && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                        <Pencil className="h-2 w-2" /> Manual
                      </span>
                    )}
                    {hasLista && !isManual && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium max-w-[80px]">
                        <Tag className="h-2 w-2 shrink-0" /><span className="truncate">{inCart?.lista_nombre}</span>
                      </span>
                    )}
                    {inCart?.presentacion_nombre && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary font-medium">
                        {inCart.paquetes?.toLocaleString('es-MX')}× {inCart.presentacion_nombre} = {inCart.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })} {p.unidad_granel || 'kg'}
                      </span>
                    )}
                  </div>
                </div>
                {(canChangePrice || canChangeLista) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetalleProducto(p); }}
                    aria-label="Ver detalle y precios"
                    className="w-8 h-8 rounded-lg bg-accent/60 hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all shrink-0"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                {inCart ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => inCart.cantidad === 1 ? removeFromCart(p.id) : updateQty(p.id, -1)} className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                      {inCart.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                    </button>
                    <button
                      onClick={() => setKeypadFor({ producto_id: p.id, nombre: p.nombre, cantidad: inCart.cantidad, max: maxQty === Infinity ? Number.MAX_SAFE_INTEGER : maxQty, granel: !!p.es_granel })}
                      className="min-w-[36px] px-1 h-7 text-center text-[13px] font-bold bg-transparent text-foreground active:bg-accent/40 rounded-md transition-colors"
                      aria-label="Editar cantidad"
                    >
                      {inCart.cantidad}
                    </button>
                    <button onClick={() => handleAdd(p)} disabled={!!atMax} className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-90 transition-transform ${atMax ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}><Plus className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => handleAdd(p)} disabled={!stockOk} className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-all shrink-0 ${stockOk ? 'bg-accent hover:bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Plus className="h-4 w-4" /></button>
                )}
              </div>
              {atMax && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">Máximo disponible alcanzado</p>}
            </div>
          );
        })}
      </div>
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
          <button onClick={() => setStep('resumen')} className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20">
            <div className="flex items-center gap-1.5"><ShoppingCart className="h-4 w-4 opacity-80" /><span className="text-[13px] font-medium">{totals.items} {totals.items === 1 ? 'producto' : 'productos'}</span></div>
            <span className="text-[14px] font-bold">{fmt(totals.total)}</span>
          </button>
        </div>
      )}

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} />

      <NumericKeypadModal
        open={!!keypadFor}
        title="Cantidad"
        subtitle={keypadFor?.nombre}
        initialValue={keypadFor?.cantidad ?? 0}
        allowDecimal={!!keypadFor?.granel}
        maxValue={keypadFor && keypadFor.max !== Number.MAX_SAFE_INTEGER ? keypadFor.max : undefined}
        onClose={() => setKeypadFor(null)}
        onConfirm={(v) => { if (keypadFor) setItemQty(keypadFor.producto_id, v); }}
      />

      <ProductoDetalleModal
        open={!!detalleProducto}
        onClose={() => setDetalleProducto(null)}
        producto={detalleProducto}
        currentUnitPrice={detalleProducto ? (getItemInCart(detalleProducto.id)?.precio_unitario ?? getSuggestedPrice(detalleProducto.id)) : 0}
        suggestedPrice={detalleProducto ? getSuggestedPrice(detalleProducto.id) : 0}
        isManual={!!(detalleProducto && getItemInCart(detalleProducto.id)?.precio_manual)}
        currentListaPrecioId={detalleProducto ? (getItemInCart(detalleProducto.id)?.lista_precio_id ?? null) : null}
        canEditManual={canChangePrice}
        canSelectLista={canChangeLista}
        onSelectLista={(listaId, tarifaId, unitPrice, listaNombre) => detalleProducto && setItemPriceFromLista(detalleProducto.id, listaId, tarifaId, unitPrice, listaNombre)}
        onSetManualPrice={(price) => detalleProducto && setItemPriceManual(detalleProducto.id, price)}
        onResetToSuggested={() => detalleProducto && resetItemToSuggested(detalleProducto.id)}
      />

      <PresentacionSelectorModal
        open={!!granelFor}
        onClose={() => setGranelFor(null)}
        producto={granelFor}
        presentaciones={(allPresentaciones ?? []).filter(p => granelFor && p.producto_id === granelFor.id)}
        precioPorUnidadBase={granelFor ? (getSuggestedPrice(granelFor.id) || (granelFor.precio_principal ?? 0)) : 0}
        stockMax={granelFor ? (granelFor.vender_sin_stock ? Infinity : getMaxQty(granelFor.id)) : Infinity}
        onConfirm={(data) => {
          if (!granelFor) return;
          addGranelLine(granelFor, {
            cantidadBase: data.cantidadBase,
            precioUnitario: data.precioUnitario,
            paquetes: data.paquetes,
            presentacion: data.presentacion ? { id: data.presentacion.id, nombre: data.presentacion.nombre, factor_base: Number(data.presentacion.factor_base) } : null,
          });
        }}
      />
    </div>
  );
}
