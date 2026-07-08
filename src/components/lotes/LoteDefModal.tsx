import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export interface LoteDef {
  codigo: string;
  caducidad: string;
  fabricacion: string;
  costo: string;
}

interface Props {
  empresaId?: string;
  initial?: LoteDef | null;
  onClose: () => void;
  onConfirm: (def: LoteDef) => void;
}

interface CodigoExistente {
  codigo: string;
  caducidad: string;
  fabricacion: string;
  costo: string;
}

/**
 * Modal para DEFINIR un lote (código, caducidad, fabricación, costo) que luego se
 * asigna masivamente a varios productos (p.ej. desde Ajustes de inventario).
 * Permite reutilizar un código de lote ya existente o crear uno nuevo.
 */
export function LoteDefModal({ empresaId, initial, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<'existente' | 'nuevo'>('nuevo');
  const [existentes, setExistentes] = useState<CodigoExistente[]>([]);
  const [codigoSel, setCodigoSel] = useState('');
  const [codigo, setCodigo] = useState(initial?.codigo ?? '');
  const [caducidad, setCaducidad] = useState(initial?.caducidad ?? '');
  const [fabricacion, setFabricacion] = useState(initial?.fabricacion ?? '');
  const [costo, setCosto] = useState(initial?.costo ?? '');

  // Cargar los códigos de lote ya existentes en la empresa (distintos).
  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const { data } = await (supabase.from as any)('lotes')
        .select('codigo, fecha_caducidad, fecha_fabricacion, costo')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('created_at', { ascending: false });
      const byCode = new Map<string, CodigoExistente>();
      (data ?? []).forEach((r: any) => {
        if (!byCode.has(r.codigo)) {
          byCode.set(r.codigo, {
            codigo: r.codigo,
            caducidad: r.fecha_caducidad ?? '',
            fabricacion: r.fecha_fabricacion ?? '',
            costo: r.costo != null ? String(r.costo) : '',
          });
        }
      });
      const list = Array.from(byCode.values());
      setExistentes(list);
      if (list.length > 0 && !initial) {
        setMode('existente');
        setCodigoSel(list[0].codigo);
      }
    })();
  }, [empresaId]);

  const confirmar = () => {
    if (mode === 'existente') {
      const e = existentes.find(x => x.codigo === codigoSel);
      if (!e) { toast.error('Elige un lote'); return; }
      onConfirm({ codigo: e.codigo, caducidad: e.caducidad, fabricacion: e.fabricacion, costo: e.costo });
      return;
    }
    if (!codigo.trim()) { toast.error('El código de lote es obligatorio'); return; }
    onConfirm({ codigo: codigo.trim(), caducidad, fabricacion, costo });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Elegir / crear lote
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            Se asignará a los productos contados con su existencia. El producto pasará a manejar lote.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-1 bg-accent/40 p-1 rounded-lg">
            <button
              onClick={() => setMode('existente')}
              disabled={existentes.length === 0}
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
              <select className="input-odoo w-full" value={codigoSel} onChange={e => setCodigoSel(e.target.value)}>
                {existentes.map(e => (
                  <option key={e.codigo} value={e.codigo}>{e.codigo}{e.caducidad ? ` · caduca ${e.caducidad}` : ''}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Se usará su caducidad, fabricación y costo.</p>
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
          <button onClick={onClose} className="btn-odoo text-sm">Cancelar</button>
          <button onClick={confirmar} className="btn-odoo-primary text-sm">Usar este lote</button>
        </div>
      </div>
    </div>
  );
}
