import { useCurrency } from '@/hooks/useCurrency';
import { Search, Plus, Minus, Trash2, ShoppingCart, RotateCcw } from 'lucide-react';
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
}

export function StepProductos(props: Props) {
  const { clienteNombre, devoluciones, searchProducto, setSearchProducto, filteredProductos, cart, cambioItems, tipoVenta, totals, addToCart, updateQty, removeFromCart, getItemInCart, getMaxQty, setStep, setCart, stockAbordo, usandoAlmacen, fmt } = props;
  const { symbol: s } = useCurrency();

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
      <div className="px-3 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar producto..." className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            value={searchProducto} onChange={e => setSearchProducto(e.target.value)} autoFocus />
        </div>
      </div>
      {cambioItems.length > 0 && (
        <div className="mx-3 mb-1.5 bg-accent/40 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Cambios (sin cargo)</p>
          {cambioItems.map(item => (
            <div key={`cambio-${item.producto_id}`} className="flex justify-between text-[11px] py-0.5">
              <span className="text-foreground">{item.cantidad}x {item.nombre}</span><span className="text-muted-foreground"{s}0.00</span>
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
                  <p className="text-[13px] font-bold text-foreground mt-px">${(p.precio_principal ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{(p.unidades as any)?.abreviatura || 'pz'}</span></p>
                </div>
                {inCart ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => inCart.cantidad === 1 ? removeFromCart(p.id) : updateQty(p.id, -1)} className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                      {inCart.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                    </button>
                    <input type="number" inputMode="numeric" className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                      value={inCart.cantidad} onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val) && val > 0) { const capped = tipoVenta === 'venta_directa' ? Math.min(val, maxQty) : val; setCart((prev: CartItem[]) => prev.map(c => c.producto_id === p.id && !c.es_cambio ? { ...c, cantidad: capped } : c)); } }} onFocus={e => e.target.select()} />
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
            <span className="text-[14px] font-bold">{s}{fmt(totals.total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
