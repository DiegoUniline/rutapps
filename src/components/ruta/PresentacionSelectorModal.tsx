import { useState, useEffect } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

interface Props {
  open: boolean;
  onClose: () => void;
  producto: any | null;
  presentaciones: ProductoPresentacion[];
  /** Base unit price (per unidad_granel, ej. por kg) */
  precioPorUnidadBase: number;
  /** Máximo permitido (en unidad base). Infinity si no hay límite. */
  stockMax?: number;
  onConfirm: (data: {
    cantidadBase: number;
    paquetes: number | null;
    presentacion: ProductoPresentacion | null;
    precioUnitario: number; // por unidad base
  }) => void;
}

/**
 * Selector de presentaciones para producto a granel.
 * - Chips: cada presentación + "Peso libre"
 * - Cantidad de paquetes (editable a decimal)
 * - Peso real opcional (override del factor)
 * - Resultado: cantidad en unidad base = paquetes × factor
 */
export function PresentacionSelectorModal({ open, onClose, producto, presentaciones, precioPorUnidadBase, stockMax = Infinity, onConfirm }: Props) {
  const { symbol } = useCurrency();
  const [mode, setMode] = useState<'pres' | 'libre'>('pres');
  const [presId, setPresId] = useState<string | null>(null);
  const [paquetes, setPaquetes] = useState('1');
  const [pesoOverride, setPesoOverride] = useState(''); // peso real total opcional
  const [pesoLibre, setPesoLibre] = useState('');

  const unidad = producto?.unidad_granel || 'kg';
  const presActivas = presentaciones.filter(p => p.activo);

  useEffect(() => {
    if (!open) return;
    if (presActivas.length > 0) {
      setMode('pres');
      setPresId(presActivas[0].id);
    } else {
      setMode('libre');
      setPresId(null);
    }
    setPaquetes('1');
    setPesoOverride('');
    setPesoLibre('');
  }, [open, producto?.id]);

  if (!open || !producto) return null;

  const presSel = presActivas.find(p => p.id === presId) ?? null;
  const factor = presSel ? Number(presSel.factor_base) : 0;
  const paqNum = Math.max(0, Number(paquetes) || 0);
  const pesoOvr = pesoOverride.trim() ? Number(pesoOverride) : null;

  const fmtNum = (n: number, dec = 2) => n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtQty = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  let cantidadBase = 0;
  let precioUnitario = precioPorUnidadBase;

  if (mode === 'pres' && presSel) {
    cantidadBase = pesoOvr && pesoOvr > 0 ? pesoOvr : paqNum * factor;
    if (presSel.precio_especial != null && factor > 0) {
      precioUnitario = Number(presSel.precio_especial) / factor;
    }
  } else {
    cantidadBase = Math.max(0, Number(pesoLibre) || 0);
  }

  const subtotal = cantidadBase * precioUnitario;
  const excedeStock = Number.isFinite(stockMax) && cantidadBase > stockMax;
  const canConfirm = cantidadBase > 0 && !excedeStock;

  const confirmar = () => {
    if (!canConfirm) return;
    onConfirm({
      cantidadBase,
      paquetes: mode === 'pres' ? paqNum : null,
      presentacion: mode === 'pres' ? presSel : null,
      precioUnitario,
    });
    onClose();
  };

  const adjustPaquetes = (delta: number) => {
    const next = Math.max(0, paqNum + delta);
    setPaquetes(String(next));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-2xl lg:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base sm:text-xl font-semibold">{producto.nombre}</h3>
            <p className="text-[12px] sm:text-sm text-muted-foreground">{symbol}{fmtNum(precioPorUnidadBase)} / {unidad}{Number.isFinite(stockMax) && <> · <span className="text-foreground">Stock: {fmtQty(stockMax)} {unidad}</span></>}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-accent/40 p-1 rounded-lg">
            <button
              onClick={() => setMode('pres')}
              disabled={presActivas.length === 0}
              className={`flex-1 py-2 sm:py-2.5 text-[13px] sm:text-sm font-medium rounded-md transition-colors ${mode === 'pres' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'} disabled:opacity-40`}
            >Presentaciones</button>
            <button
              onClick={() => setMode('libre')}
              className={`flex-1 py-2 sm:py-2.5 text-[13px] sm:text-sm font-medium rounded-md transition-colors ${mode === 'libre' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >Peso libre</button>
          </div>

          {mode === 'pres' && (
            <>
              {presActivas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Este producto no tiene presentaciones definidas.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                    {presActivas.map(p => {
                      const active = p.id === presId;
                      const pUnit = p.precio_especial ?? (precioPorUnidadBase * Number(p.factor_base));
                      return (
                        <button key={p.id} onClick={() => setPresId(p.id)}
                          className={`text-left rounded-lg px-3 py-3 border-2 transition-all ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/40'}`}>
                          <p className="text-sm sm:text-base font-semibold leading-tight">{p.nombre}</p>
                          <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums mt-0.5">{fmtQty(Number(p.factor_base))} {unidad}</p>
                          <p className="text-sm sm:text-base font-bold text-primary tabular-nums mt-1">{symbol}{fmtNum(pUnit)}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm font-medium text-muted-foreground uppercase">Cantidad de paquetes</label>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => adjustPaquetes(-1)} className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-accent flex items-center justify-center active:scale-95"><Minus className="h-5 w-5" /></button>
                      <input type="number" inputMode="decimal" step="0.001" min="0" value={paquetes}
                        onChange={e => setPaquetes(e.target.value)}
                        className="flex-1 h-12 sm:h-14 text-center bg-card border border-border rounded-lg text-xl sm:text-2xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <button onClick={() => adjustPaquetes(1)} className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-primary text-primary-foreground flex items-center justify-center active:scale-95"><Plus className="h-5 w-5" /></button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm font-medium text-muted-foreground uppercase">
                      Peso real total ({unidad}) <span className="normal-case font-normal text-muted-foreground/70">— opcional, si los paquetes pesan distinto</span>
                    </label>
                    <input type="number" inputMode="decimal" step="0.001" min="0" placeholder={`Sugerido: ${fmtQty(paqNum * factor)}`}
                      value={pesoOverride}
                      onChange={e => setPesoOverride(e.target.value)}
                      className="mt-2 w-full h-11 sm:h-12 px-3 bg-card border border-border rounded-lg text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </>
              )}
            </>
          )}

          {mode === 'libre' && (
            <div>
              <label className="text-xs sm:text-sm font-medium text-muted-foreground uppercase">Peso ({unidad})</label>
              <input type="number" inputMode="decimal" step="0.001" min="0" autoFocus
                value={pesoLibre}
                onChange={e => setPesoLibre(e.target.value)}
                className="mt-2 w-full h-14 sm:h-16 px-3 bg-card border border-border rounded-lg text-2xl sm:text-3xl font-bold text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}

          {/* Resumen */}
          <div className="bg-accent/30 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cantidad total:</span>
              <span className={`font-semibold tabular-nums ${excedeStock ? 'text-destructive' : ''}`}>{fmtQty(cantidadBase)} {unidad}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Precio unitario:</span>
              <span className="tabular-nums">{symbol}{fmtNum(precioUnitario)} / {unidad}</span>
            </div>
            <div className="flex justify-between text-base sm:text-lg pt-2 border-t border-border/60">
              <span className="font-semibold">Subtotal:</span>
              <span className="font-bold text-primary tabular-nums">{symbol}{fmtNum(subtotal)}</span>
            </div>
          </div>

          {excedeStock && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
              No puedes vender más de {fmtQty(stockMax)} {unidad} disponibles en stock.
            </div>
          )}

          <button onClick={confirmar} disabled={!canConfirm}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-base sm:text-lg font-semibold active:scale-[0.98] transition-transform disabled:opacity-40">
            {excedeStock ? 'Excede el stock disponible' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  );
}
