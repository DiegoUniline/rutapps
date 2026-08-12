import { useEffect, useMemo, useState } from 'react';
import { Boxes, AlertTriangle, Trash2, Wand2 } from 'lucide-react';
import { getLotesDisponibles, fmtCaducidad, type LoteDisponible } from '@/lib/lotesFefo';

export interface LoteAsignacion {
  lote_id: string;
  codigo: string;
  cantidad: number;
}

interface Props {
  empresaId: string;
  almacenId: string | null;
  producto: { id: string; nombre: string } | null;
  /** Cantidad de la línea que debe quedar 100% loteada. */
  cantidad: number;
  /** Lotes ya asignados a la línea. */
  asignadas: LoteAsignacion[];
  /** Venta en edición: su propio apartado no descuenta disponible. */
  excluirVentaId?: string | null;
  /** Solo lectura (venta cancelada / cerrada). */
  readOnly?: boolean;
  onClose: () => void;
  onConfirm: (lotes: LoteAsignacion[]) => void;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Selector de lotes de UNA línea de venta/pedido en móvil (/ruta).
 * Permite repartir la cantidad entre uno o varios lotes (FEFO sugerido) y
 * exige que lo loteado sea EXACTAMENTE igual a lo pedido antes de aceptar.
 * Funciona offline: `getLotesDisponibles` cae a la caché de IndexedDB.
 */
export function LotesLineaMovilModal({
  empresaId, almacenId, producto, cantidad, asignadas, excluirVentaId, readOnly = false, onClose, onConfirm,
}: Props) {
  const [lotes, setLotes] = useState<LoteDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!producto || !almacenId) { setLoading(false); return; }
    let cancel = false;
    setLoading(true);
    (async () => {
      const list = await getLotesDisponibles({ empresaId, almacenId, productoId: producto.id, excluirVentaId });
      if (cancel) return;
      setLotes(list);
      const inicial: Record<string, number> = {};
      for (const a of asignadas) inicial[a.lote_id] = r3(Number(a.cantidad) || 0);
      // Sin asignación previa: reparte FEFO automáticamente.
      if (Object.keys(inicial).length === 0) {
        let resta = cantidad;
        for (const l of list) {
          if (resta <= 0) break;
          const usar = Math.min(l.disponible, resta);
          if (usar > 0) { inicial[l.lote_id] = r3(usar); resta = r3(resta - usar); }
        }
      }
      setSel(inicial);
      setLoading(false);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id, almacenId, empresaId, excluirVentaId, cantidad]);

  const codigoDe = useMemo(() => {
    const m = new Map(lotes.map(l => [l.lote_id, l.codigo]));
    for (const a of asignadas) if (!m.has(a.lote_id)) m.set(a.lote_id, a.codigo);
    return m;
  }, [lotes, asignadas]);

  const asignado = r3(Object.values(sel).reduce((s, n) => s + (Number(n) || 0), 0));
  const pendiente = r3(cantidad - asignado);
  const completo = Math.abs(pendiente) < 0.0005;

  if (!producto) return null;

  const setQty = (loteId: string, qty: number, max: number) => {
    const v = Math.max(0, Math.min(r3(qty), r3(max)));
    setSel(prev => {
      const next = { ...prev };
      if (v <= 0) delete next[loteId]; else next[loteId] = v;
      return next;
    });
  };

  const autoFefo = () => {
    const next: Record<string, number> = {};
    let resta = cantidad;
    for (const l of lotes) {
      if (resta <= 0) break;
      const usar = Math.min(l.disponible, resta);
      if (usar > 0) { next[l.lote_id] = r3(usar); resta = r3(resta - usar); }
    }
    setSel(next);
  };

  const confirmar = () => {
    if (!completo) return;
    onConfirm(
      Object.entries(sel)
        .filter(([, c]) => Number(c) > 0)
        .map(([lote_id, c]) => ({ lote_id, codigo: codigoDe.get(lote_id) ?? '—', cantidad: r3(Number(c)) })),
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Lotes de la línea
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1"><strong>{producto.nombre}</strong> — reparte la cantidad entre los lotes. Se sugiere FEFO (lo que caduca primero).</p>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-accent/50 px-3 py-2 text-[12px]">
            <span>Pedido: <strong className="tabular-nums">{cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</strong></span>
            <span>Loteado: <strong className={`tabular-nums ${completo ? 'text-green-600' : 'text-amber-600'}`}>{asignado.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</strong></span>
            <span>Falta: <strong className="tabular-nums">{pendiente.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</strong></span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Cargando lotes…</div>
          ) : !almacenId ? (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Selecciona primero el almacén para poder elegir lotes.</span>
            </div>
          ) : lotes.length === 0 ? (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>No hay existencia por lote de este producto en este almacén.</span>
            </div>
          ) : lotes.map((l, i) => {
            const val = sel[l.lote_id] ?? 0;
            const on = val > 0;
            const maxLote = Math.max(l.disponible, val);
            return (
              <div key={l.lote_id} className={`rounded-lg border-2 px-3 py-2 transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] text-foreground truncate">
                      {l.codigo}{i === 0 && <span className="ml-2 text-[10px] text-emerald-600 font-medium">FEFO</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Caduca {fmtCaducidad(l.fecha_caducidad)} · {l.disponible.toLocaleString('es-MX', { maximumFractionDigits: 3 })} disp.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number" inputMode="decimal" min={0} step="0.001" max={maxLote}
                      disabled={readOnly}
                      value={val === 0 ? '' : val}
                      placeholder="0"
                      onChange={e => setQty(l.lote_id, Number(e.target.value), maxLote)}
                      className="w-20 text-right text-[13px] font-bold rounded-md bg-accent/60 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 disabled:opacity-60"
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setQty(l.lote_id, 0, maxLote)}
                        className="w-8 h-8 rounded-md bg-accent flex items-center justify-center active:scale-90"
                        aria-label="Quitar este lote"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                {!readOnly && pendiente > 0 && l.disponible > val && (
                  <button
                    type="button"
                    onClick={() => setQty(l.lote_id, val + Math.min(pendiente, l.disponible - val), maxLote)}
                    className="mt-1.5 text-[11px] text-primary font-semibold"
                  >
                    Usar lo que falta ({Math.min(pendiente, l.disponible - val).toLocaleString('es-MX', { maximumFractionDigits: 3 })})
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2">
          {!readOnly && lotes.length > 0 && (
            <button onClick={autoFefo} className="btn-odoo text-[12px] flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" /> FEFO</button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="btn-odoo text-[13px]">{readOnly ? 'Cerrar' : 'Cancelar'}</button>
          {!readOnly && (
            <button onClick={confirmar} disabled={!completo} className="btn-odoo-primary text-[13px] disabled:opacity-40">
              {completo ? 'Guardar lotes' : `Falta ${Math.abs(pendiente).toLocaleString('es-MX', { maximumFractionDigits: 3 })}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
