import { useEffect, useState } from 'react';
import { Boxes, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LoteMov { codigo: string; fecha_caducidad: string | null; cantidad: number; }

interface Props {
  empresaId: string;
  entregaId: string;
  producto: { id: string; nombre: string } | null;
  onClose: () => void;
}

/**
 * Muestra (solo lectura) de qué lotes se surtió una línea de entrega. Lee los
 * movimientos de salida con lote registrados al surtir (referencia 'entrega').
 */
export function LotesAsignadosModal({ empresaId, entregaId, producto, onClose }: Props) {
  const [movs, setMovs] = useState<LoteMov[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!producto) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from as any)('movimientos_inventario')
        .select('cantidad, lote_id, lotes(codigo, fecha_caducidad)')
        .eq('empresa_id', empresaId)
        .eq('referencia_tipo', 'entrega')
        .eq('referencia_id', entregaId)
        .eq('producto_id', producto.id)
        .eq('tipo', 'salida')
        .not('lote_id', 'is', null);
      const list: LoteMov[] = (data ?? [])
        .map((r: any) => ({ codigo: r.lotes?.codigo ?? '—', fecha_caducidad: r.lotes?.fecha_caducidad ?? null, cantidad: Number(r.cantidad) || 0 }))
        .sort((a: LoteMov, b: LoteMov) => (a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31'));
      setMovs(list);
      setLoading(false);
    })();
  }, [producto?.id, entregaId, empresaId]);

  if (!producto) return null;

  const fmtCad = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin caducidad';
  const total = movs.reduce((s, m) => s + m.cantidad, 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Lotes surtidos
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            <strong>{producto.nombre}</strong> — lotes con los que se surtió esta línea.
          </p>
        </div>
        <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Cargando lotes…</div>
          ) : movs.length === 0 ? (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>No se encontraron lotes registrados para esta línea.</span>
            </div>
          ) : movs.map((m, i) => (
            <div key={i} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm">{m.codigo}</div>
                <div className="text-[11px] text-muted-foreground">Caduca {fmtCad(m.fecha_caducidad)}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">{m.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-2 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Total surtido</span>
          <span className="font-semibold tabular-nums text-primary">{total.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</span>
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo-primary text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
