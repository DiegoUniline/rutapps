import { useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { Search, Plus, Minus, Trash2, ShoppingCart, RotateCcw, ScanLine, Eye, Pencil, Tag, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import BarcodeScanner from '@/components/ruta/BarcodeScanner';
import NumericKeypadModal from '@/components/ruta/NumericKeypadModal';
import PedidoSugeridoBanner from '@/components/ruta/PedidoSugeridoBanner';
import SaldoPendienteBanner from '@/components/ruta/SaldoPendienteBanner';
import { ProductoDetalleModal } from '@/components/ruta/ProductoDetalleModal';
import type { CartItem, DevolucionItem } from './types';

interface Props {
  clienteNombre: string;
  devoluciones: DevolucionItem[];
  searchProducto: string;
  setSearchProducto: (v: string) => void;
  filteredProductos: any[] | undefined;
  cart: CartItem[];
  cambioItems: CartItem[];
  tipoVenta: 'venta_directa' | 'pedido';
  totals: { items: number; total: number };
  addToCart: (p: any, esCambio?: boolean) => void;
  updateQty: (pid: string, delta: number, esCambio?: boolean) => void;
  removeFromCart: (pid: string, esCambio?: boolean) => void;
  getItemInCart: (pid: string) => CartItem | undefined;
  getMaxQty: (pid: string) => number;
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
}

export function StepProductos(props: Props) {
  const {
    clienteNombre, devoluciones, searchProducto, setSearchProducto, filteredProductos,
    cart, cambioItems, tipoVenta, totals, addToCart, updateQty, removeFromCart,
    getItemInCart, getMaxQty, setStep, setCart, stockAbordo, usandoAlmacen, fmt,
    insights, bannerDismissed, setBannerDismissed,
    applyManualList, applyHistorialAvg, repeatLastSale, findProductByCode, setItemQty,
  } = props;
  const { symbol: s } = useCurrency();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [keypadFor, setKeypadFor] = useState<{ producto_id: string; nombre: string; cantidad: number; max: number; granel: boolean } | null>(null);

  const handleScan = (code: string) => {
    const prod = findProductByCode(code);
    if (!prod) { toast.error(`Sin coincidencias para "${code}"`); return; }
    addToCart(prod);
    toast.success(`+ ${prod.nombre}`);
    // keep scanner open for rapid scanning
  };

  const showBanner = !bannerDismissed;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
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
        {filteredProductos?.map(p => {
          const inCart = getItemInCart(p.id);
          const maxQty = getMaxQty(p.id);
          const stockLabel = tipoVenta === 'venta_directa' ? `${maxQty} ${usandoAlmacen ? 'en almacén' : 'a bordo'}` : `${p.cantidad ?? 0} en almacén`;
          const stockOk = tipoVenta === 'pedido' || maxQty > 0;
          const atMax = inCart && tipoVenta === 'venta_directa' && inCart.cantidad >= maxQty;
          return (
            <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${inCart ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0" onClick={() => !inCart && stockOk && addToCart(p)}>
                  <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-px">
                    <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span><span className="text-[10px] text-muted-foreground">·</span>
                    <span className={`text-[10px] font-medium ${stockOk ? 'text-green-600' : 'text-destructive'}`}>{stockLabel}</span>
                  </div>
                  <p className="text-[13px] font-bold text-foreground mt-px">{s}{(p.precio_principal ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{p.es_granel ? p.unidad_granel : ((p.unidades as any)?.abreviatura || 'pz')}</span></p>
                </div>
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
                    <button onClick={() => addToCart(p)} disabled={!!atMax} className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-90 transition-transform ${atMax ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}><Plus className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0"><Plus className="h-4 w-4" /></button>
                )}
              </div>
              {atMax && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">Máximo a bordo alcanzado</p>}
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
        maxValue={tipoVenta === 'venta_directa' && keypadFor && !keypadFor.granel ? keypadFor.max : undefined}
        onClose={() => setKeypadFor(null)}
        onConfirm={(v) => { if (keypadFor) setItemQty(keypadFor.producto_id, v); }}
      />
    </div>
  );
}
