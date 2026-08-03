import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface LoteOpt {
  id: string;
  codigo: string;
  fecha_caducidad: string | null;
}

interface Props {
  empresaId: string;
  producto: { id: string; nombre: string } | null;
  piezas: number;
  onClose: () => void;
  /** Devuelve el lote elegido/creado para recibir la mercancía. */
  onConfirm: (loteId: string, codigo?: string) => void;
  /** Texto del botón de confirmar (por defecto: recibir). */
  confirmLabel?: string;
  /** Título del modal. */
  title?: string;
  /** Descripción opcional; si no se pasa se muestra la de recepción. */
  descripcion?: string;
}

/**
 * Modal para asignar un LOTE al recibir mercancía de una compra.
 * Permite elegir un lote existente del producto o crear uno nuevo
 * (código, caducidad, fabricación, costo).
 */
export function LoteReceptionModal({ empresaId, producto, piezas, onClose, onConfirm, confirmLabel, title, descripcion }: Props) {
  const [mode, setMode] = useState<'existente' | 'nuevo'>('nuevo');
  const [lotes, setLotes] = useState<LoteOpt[]>([]);
  const [loteId, setLoteId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [fabricacion, setFabricacion] = useState('');
  const [costo, setCosto] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!producto) return;
    (async () => {
      const { data } = await (supabase.from as any)('lotes')
        .select('id, codigo, fecha_caducidad')
        .eq('empresa_id', empresaId)
        .eq('producto_id', producto.id)
        .eq('activo', true)
        .order('fecha_caducidad', { ascending: true, nullsFirst: false });
      const list = (data ?? []) as LoteOpt[];
      setLotes(list);
      // Si ya hay lotes, por defecto ofrecemos elegir existente.
      setMode(list.length > 0 ? 'existente' : 'nuevo');
      setLoteId(list[0]?.id ?? '');
    })();
  }, [producto?.id, empresaId]);

  if (!producto) return null;

  const fmtCad = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'sin caducidad';

  const confirmar = async () => {
    if (saving) return;
    if (mode === 'existente') {
      if (!loteId) { toast.error('Elige un lote'); return; }
      onConfirm(loteId, lotes.find(l => l.id === loteId)?.codigo);
      return;
    }
    // Crear lote nuevo
    if (!codigo.trim()) { toast.error('El código de lote es obligatorio'); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase.from as any)('lotes').insert({
        empresa_id: empresaId,
        producto_id: producto.id,
        codigo: codigo.trim(),
        fecha_caducidad: caducidad || null,
        fecha_fabricacion: fabricacion || null,
        costo: costo.trim() ? Number(costo) : null,
      }).select('id').single();
      if (error) throw error;
      onConfirm((data as any).id, codigo.trim());
    } catch (err: any) {
      if (String(err?.message ?? '').includes('uq_lote')) {
        toast.error('Ya existe ese lote (código + caducidad) para este producto. Elígelo en "Lote existente".');
      } else {
        toast.error(err?.message ?? 'Error al crear el lote');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> {title ?? 'Asignar lote'}
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            {descripcion ?? <>Vas a recibir <strong>{piezas}</strong> pza(s) de <strong>{producto.nombre}</strong>. Indica a qué lote entran.</>}
          </p>
        </div>

        <div className="p-5 space-y-3">
          {/* Tabs existente / nuevo */}
          <div className="flex gap-1 bg-accent/40 p-1 rounded-lg">
            <button
              onClick={() => setMode('existente')}
              disabled={lotes.length === 0}
              className={`flex-1 py-2 text-[13px] font-medium rounded-md transition-colors ${mode === 'existente' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'} disabled:opacity-40`}
            >Lote existente</button>
            <button
              onClick={() => setMode('nuevo')}
              className={`flex-1 py-2 text-[13px] font-medium rounded-md transition-colors ${mode === 'nuevo' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >Crear nuevo</button>
          </div>

          {mode === 'existente' ? (
            <div>
              <label className="label-odoo">Lote</label>
              <select className="input-odoo w-full" value={loteId} onChange={e => setLoteId(e.target.value)}>
                {lotes.map(l => (
                  <option key={l.id} value={l.id}>{l.codigo} · caduca {fmtCad(l.fecha_caducidad)}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="label-odoo">Código de lote *</label>
                <input className="input-odoo w-full" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej. L-2026-014" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-odoo">Caducidad</label>
                  <input type="date" className="input-odoo w-full" value={caducidad} onChange={e => setCaducidad(e.target.value)} />
                </div>
                <div>
                  <label className="label-odoo">Fabricación</label>
                  <input type="date" className="input-odoo w-full" value={fabricacion} onChange={e => setFabricacion(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label-odoo">Costo por unidad</label>
                <input type="number" step="0.0001" min="0" className="input-odoo w-full" value={costo} onChange={e => setCosto(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="btn-odoo text-sm" disabled={saving}>Cancelar</button>
          <button onClick={confirmar} className="btn-odoo-primary text-sm" disabled={saving}>
            {saving ? 'Guardando…' : (confirmLabel ?? 'Recibir en este lote')}
          </button>
        </div>
      </div>
    </div>
  );
}
