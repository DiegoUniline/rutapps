import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LoteRow { lote_id: string; codigo: string; fecha_caducidad: string | null; disponible: number; }

interface Props {
  empresaId: string;
  almacenId: string;
  producto: { id: string; nombre: string } | null;
  /** Cantidad a surtir (pedida). Se autollena FEFO hasta este número. */
  cantidadObjetivo: number;
  onClose: () => void;
  /** Devuelve la asignación [{lote_id, cantidad}] (solo > 0). */
  onConfirm: (asignacion: { lote_id: string; cantidad: number }[], total: number) => void;
}

/**
 * Surtido por lote: muestra de qué lotes saldrá la mercancía (FEFO — caduca
 * primero), autollena hasta la cantidad pedida y permite cambiar todo.
 */
export function LoteSurtidoModal({ empresaId, almacenId, producto, cantidadObjetivo, onClose, onConfirm }: Props) {
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [asign, setAsign] = useState<Record<string, string>>({}); // lote_id -> cantidad (string)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!producto || !almacenId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from as any)('stock_lotes')
        .select('lote_id, cantidad, lotes(codigo, fecha_caducidad, producto_id, activo)')
        .eq('empresa_id', empresaId).eq('almacen_id', almacenId).eq('producto_id', producto.id).gt('cantidad', 0);
      const list: LoteRow[] = (data ?? [])
        .filter((r: any) => r.lotes?.activo !== false)
        .map((r: any) => ({ lote_id: r.lote_id, codigo: r.lotes?.codigo ?? '—', fecha_caducidad: r.lotes?.fecha_caducidad ?? null, disponible: Number(r.cantidad) || 0 }))
        .sort((a: LoteRow, b: LoteRow) => (a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31'));
      setLotes(list);
      // Autollenado FEFO hasta la cantidad objetivo.
      let restante = cantidadObjetivo;
      const auto: Record<string, string> = {};
      for (const l of list) {
        if (restante <= 0) break;
        const usar = Math.min(l.disponible, restante);
        auto[l.lote_id] = String(usar);
        restante -= usar;
      }
      setAsign(auto);
      setLoading(false);
    })();
  }, [producto?.id, almacenId, empresaId, cantidadObjetivo]);

  if (!producto) return null;

  const fmtCad = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin caducidad';
  const totalAsignado = lotes.reduce((s, l) => s + (Number(asign[l.lote_id]) || 0), 0);
  const excedeAlguno = lotes.some(l => (Number(asign[l.lote_id]) || 0) > l.disponible);

  const setCant = (loteId: string, v: string) => setAsign(prev => ({ ...prev, [loteId]: v }));

  const confirmar = () => {
    if (excedeAlguno) return;
    const items = lotes
      .map(l => ({ lote_id: l.lote_id, cantidad: Number(asign[l.lote_id]) || 0 }))
      .filter(it => it.cantidad > 0);
    if (items.length === 0) return;
    onConfirm(items, items.reduce((s, it) => s + it.cantidad, 0));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Surtir por lote
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            <strong>{producto.nombre}</strong> — pedido: <strong>{cantidadObjetivo}</strong>. Se sugiere FEFO (caduca primero); puedes cambiar.
          </p>
        </div>
        <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Cargando lotes…</div>
          ) : lotes.length === 0 ? (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>No hay existencia por lote de este producto en el almacén origen.</span>
            </div>
          ) : lotes.map((l, i) => (
            <div key={l.lote_id} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm">{l.codigo}{i === 0 && <span className="ml-2 text-[10px] text-emerald-600 font-medium">FEFO</span>}</div>
                <div className="text-[11px] text-muted-foreground">Caduca {fmtCad(l.fecha_caducidad)} · {l.disponible.toLocaleString('es-MX', { maximumFractionDigits: 3 })} disp.</div>
              </div>
              <input type="number" min={0} max={l.disponible} value={asign[l.lote_id] ?? ''}
                onChange={e => setCant(l.lote_id, e.target.value)}
                className={`input-odoo w-24 text-right ${(Number(asign[l.lote_id]) || 0) > l.disponible ? 'border-destructive' : ''}`} />
            </div>
          ))}
        </div>
        <div className="px-5 pb-2 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Asignado</span>
          <span className={`font-semibold tabular-nums ${totalAsignado > cantidadObjetivo ? 'text-amber-600' : totalAsignado < cantidadObjetivo ? 'text-muted-foreground' : 'text-emerald-600'}`}>
            {totalAsignado.toLocaleString('es-MX', { maximumFractionDigits: 3 })} / {cantidadObjetivo}
          </span>
        </div>
        {totalAsignado < cantidadObjetivo && !loading && lotes.length > 0 && (
          <div className="px-5 text-[11px] text-amber-600">Ojo: se surtirá menos de lo pedido (no alcanza el stock por lote).</div>
        )}
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={confirmar} className="btn-odoo-primary text-sm" disabled={excedeAlguno || totalAsignado <= 0}>
            Surtir {totalAsignado > 0 ? totalAsignado.toLocaleString('es-MX', { maximumFractionDigits: 3 }) : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
