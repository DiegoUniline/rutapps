import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LoteConStock {
  lote_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  cantidad: number;
}

interface Props {
  empresaId: string;
  almacenId: string;
  producto: { id: string; nombre: string } | null;
  onClose: () => void;
  onConfirm: (loteId: string, codigo: string) => void;
}

/**
 * Selector de lote AL VENDER: lista los lotes del producto que tienen existencia
 * en el almacén de la venta, ordenados FEFO (lo que caduca primero arriba, ya
 * pre-seleccionado). El vendedor puede cambiarlo.
 */
export function LoteVentaModal({ empresaId, almacenId, producto, onClose, onConfirm }: Props) {
  const [lotes, setLotes] = useState<LoteConStock[]>([]);
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!producto || !almacenId) return;
    setLoading(true);
    (async () => {
      // Stock por lote del producto en este almacén (solo con existencia).
      const { data: stock } = await (supabase.from as any)('stock_lotes')
        .select('lote_id, cantidad, lotes(codigo, fecha_caducidad, producto_id, activo)')
        .eq('empresa_id', empresaId)
        .eq('almacen_id', almacenId)
        .eq('producto_id', producto.id)
        .gt('cantidad', 0);
      const list: LoteConStock[] = (stock ?? [])
        .filter((r: any) => r.lotes?.activo !== false)
        .map((r: any) => ({
          lote_id: r.lote_id,
          codigo: r.lotes?.codigo ?? '—',
          fecha_caducidad: r.lotes?.fecha_caducidad ?? null,
          cantidad: Number(r.cantidad) || 0,
        }))
        // FEFO: caduca primero arriba (sin caducidad al final).
        .sort((a: LoteConStock, b: LoteConStock) =>
          (a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31'));
      setLotes(list);
      setSel(list[0]?.lote_id ?? '');
      setLoading(false);
    })();
  }, [producto?.id, almacenId, empresaId]);

  if (!producto) return null;

  const fmtCad = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin caducidad';
  const confirmar = () => {
    const l = lotes.find(x => x.lote_id === sel);
    if (!l) return;
    onConfirm(l.lote_id, l.codigo);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Elegir lote
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            <strong>{producto.nombre}</strong> — se sugiere el que caduca primero (FEFO).
          </p>
        </div>
        <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Cargando lotes…</div>
          ) : lotes.length === 0 ? (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] text-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>No hay existencia por lote de este producto en este almacén. Recibe o ajusta stock por lote antes de venderlo.</span>
            </div>
          ) : lotes.map((l, i) => {
            const on = sel === l.lote_id;
            return (
              <button key={l.lote_id} onClick={() => setSel(l.lote_id)}
                className={`w-full text-left rounded-lg border-2 px-3 py-2 transition-colors ${on ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{l.codigo}{i === 0 && <span className="ml-2 text-[10px] text-emerald-600 font-medium">FEFO</span>}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">{l.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })} disp.</span>
                </div>
                <div className="text-[11px] text-muted-foreground">Caduca {fmtCad(l.fecha_caducidad)}</div>
              </button>
            );
          })}
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={confirmar} className="btn-odoo-primary text-sm" disabled={!sel}>Usar este lote</button>
        </div>
      </div>
    </div>
  );
}
