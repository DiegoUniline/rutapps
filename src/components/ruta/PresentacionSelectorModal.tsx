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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">{producto.nombre}</h3>
            <p className="text-[11px] text-muted-foreground">{symbol}{fmtNum(precioPorUnidadBase)} / {unidad}{Number.isFinite(stockMax) && <> · <span className="text-foreground">Stock: {fmtQty(stockMax)} {unidad}</span></>}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-accent/40 p-1 rounded-lg">
            <button
              onClick={() => setMode('pres')}
              disabled={presActivas.length === 0}
              className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-colors ${mode === 'pres' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'} disabled:opacity-40`}
            >Presentaciones</button>
            <button
              onClick={() => setMode('libre')}
              className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-colors ${mode === 'libre' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >Peso libre</button>
          </div>

          {mode === 'pres' && (
            <>
              {presActivas.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-2">Este producto no tiene presentaciones definidas.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presActivas.map(p => {
                      const active = p.id === presId;
                      const pUnit = p.precio_especial ?? (precioPorUnidadBase * Number(p.factor_base));
                      return (
                        <button key={p.id} onClick={() => setPresId(p.id)}
                          className={`text-left rounded-lg px-2 py-2 border transition-all ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/40'}`}>
                          <p className="text-[12px] font-semibold leading-tight">{p.nombre}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">{fmtQty(Number(p.factor_base))} {unidad}</p>
                          <p className="text-[11px] font-medium text-primary tabular-nums">{symbol}{fmtNum(pUnit)}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase">Cantidad de paquetes</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => adjustPaquetes(-1)} className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center active:scale-95"><Minus className="h-4 w-4" /></button>
                      <input type="number" inputMode="decimal" step="0.001" min="0" value={paquetes}
                        onChange={e => setPaquetes(e.target.value)}
                        className="flex-1 h-9 text-center bg-card border border-border rounded-lg text-[15px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <button onClick={() => adjustPaquetes(1)} className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center active:scale-95"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground uppercase">
                      Peso real total ({unidad}) <span className="normal-case font-normal">— opcional, si los paquetes pesan distinto</span>
                    </label>
                    <input type="number" inputMode="decimal" step="0.001" min="0" placeholder={`Sugerido: ${fmtQty(paqNum * factor)}`}
                      value={pesoOverride}
                      onChange={e => setPesoOverride(e.target.value)}
                      className="mt-1 w-full h-9 px-3 bg-card border border-border rounded-lg text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </>
              )}
            </>
          )}

          {mode === 'libre' && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase">Peso ({unidad})</label>
              <input type="number" inputMode="decimal" step="0.001" min="0" autoFocus
                value={pesoLibre}
                onChange={e => setPesoLibre(e.target.value)}
                className="mt-1 w-full h-12 px-3 bg-card border border-border rounded-lg text-[18px] font-bold text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}

          {/* Resumen */}
          <div className="bg-accent/30 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">Cantidad total:</span>
              <span className={`font-semibold tabular-nums ${excedeStock ? 'text-destructive' : ''}`}>{fmtQty(cantidadBase)} {unidad}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">Precio unitario:</span>
              <span className="tabular-nums">{symbol}{fmtNum(precioUnitario)} / {unidad}</span>
            </div>
            <div className="flex justify-between text-[14px] pt-1 border-t border-border/60">
              <span className="font-semibold">Subtotal:</span>
              <span className="font-bold text-primary tabular-nums">{symbol}{fmtNum(subtotal)}</span>
            </div>
          </div>

          {excedeStock && (
            <div className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
              No puedes vender más de {fmtQty(stockMax)} {unidad} disponibles en stock.
            </div>
          )}

          <button onClick={confirmar} disabled={!canConfirm}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform disabled:opacity-40">
            {excedeStock ? 'Excede el stock disponible' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  );
}
