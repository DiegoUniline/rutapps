import { useState } from 'react';
import { Boxes, Plus, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { TableSkeleton } from '@/components/TableSkeleton';
import { cn } from '@/lib/utils';

interface LoteRow {
  id: string;
  producto_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  fecha_fabricacion: string | null;
  costo: number | null;
  notas: string | null;
  activo: boolean;
  productos?: { nombre: string; codigo: string | null } | null;
}

interface EditState {
  id?: string;
  producto_id: string;
  codigo: string;
  fecha_caducidad: string;
  fecha_fabricacion: string;
  costo: string;
  notas: string;
}

const emptyEdit: EditState = { producto_id: '', codigo: '', fecha_caducidad: '', fecha_fabricacion: '', costo: '', notas: '' };

export default function LotesPage() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  // Productos que manejan lote (para el selector).
  const { data: productos } = useQuery({
    queryKey: ['lotes-productos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('productos')
        .select('id, nombre, codigo')
        .eq('empresa_id', empresa!.id)
        .eq('maneja_lote', true)
        .eq('status', 'activo')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string; codigo: string | null }[];
    },
  });

  // Lotes existentes.
  const { data: lotes, isLoading } = useQuery({
    queryKey: ['lotes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('lotes')
        .select('id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo, notas, activo, productos(nombre, codigo)')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('fecha_caducidad', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  // Stock por lote (suma en todos los almacenes).
  const { data: stockPorLote } = useQuery({
    queryKey: ['stock-lotes-total', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('stock_lotes')
        .select('lote_id, cantidad')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.lote_id, (map.get(r.lote_id) ?? 0) + Number(r.cantidad ?? 0)));
      return map;
    },
  });

  const fmtFecha = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const estaVencido = (d: string | null) => !!d && new Date(d + 'T00:00:00') < hoy;

  const openNew = () => setEdit({ ...emptyEdit });
  const openEdit = (l: LoteRow) => setEdit({
    id: l.id,
    producto_id: l.producto_id,
    codigo: l.codigo,
    fecha_caducidad: l.fecha_caducidad ?? '',
    fecha_fabricacion: l.fecha_fabricacion ?? '',
    costo: l.costo != null ? String(l.costo) : '',
    notas: l.notas ?? '',
  });

  const handleSave = async () => {
    if (!edit || !empresa?.id) return;
    if (!edit.producto_id) { toast.error('Elige el producto'); return; }
    if (!edit.codigo.trim()) { toast.error('El código de lote es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresa.id,
        producto_id: edit.producto_id,
        codigo: edit.codigo.trim(),
        fecha_caducidad: edit.fecha_caducidad || null,
        fecha_fabricacion: edit.fecha_fabricacion || null,
        costo: edit.costo.trim() ? Number(edit.costo) : null,
        notas: edit.notas.trim() || null,
      };
      if (edit.id) {
        const { error } = await (supabase.from as any)('lotes').update(payload).eq('id', edit.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)('lotes').insert(payload);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['lotes'] });
      toast.success('Lote guardado');
      setEdit(null);
    } catch (err: any) {
      // Choque de código repetido para el mismo producto.
      if (String(err?.message ?? '').includes('uq_lote_codigo')) {
        toast.error('Ya existe un lote con ese código para este producto');
      } else {
        toast.error(err?.message ?? 'Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  };

  const noHayProductos = (productos?.length ?? 0) === 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Lotes
        </h1>
        <button className="btn-odoo-primary text-sm flex items-center gap-1" onClick={openNew} disabled={noHayProductos}>
          <Plus className="h-4 w-4" /> Nuevo lote
        </button>
      </div>

      {noHayProductos && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] text-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Aún no hay productos marcados como <strong>"Maneja por lote"</strong>. Ve a un producto → pestaña General → activa el interruptor, y luego crea sus lotes aquí.</span>
        </div>
      )}

      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Producto</th>
                <th className="th-odoo text-left w-32">Código lote</th>
                <th className="th-odoo text-left w-32">Caducidad</th>
                <th className="th-odoo text-left w-32">Fabricación</th>
                <th className="th-odoo text-right w-24">Costo</th>
                <th className="th-odoo text-right w-24">Stock</th>
                <th className="th-odoo w-16 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(lotes ?? []).map(l => (
                <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover transition-colors group">
                  <td className="py-1.5 px-3">
                    <div className="text-foreground">{l.productos?.nombre ?? '—'}</div>
                    {l.productos?.codigo && <div className="text-[11px] text-muted-foreground">{l.productos.codigo}</div>}
                  </td>
                  <td className="py-1.5 px-3 font-medium text-foreground">{l.codigo}</td>
                  <td className={cn("py-1.5 px-3", estaVencido(l.fecha_caducidad) && "text-destructive font-medium")}>
                    {fmtFecha(l.fecha_caducidad)}{estaVencido(l.fecha_caducidad) && ' ⚠️'}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground">{fmtFecha(l.fecha_fabricacion)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{l.costo != null ? fmt(l.costo) : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{(stockPorLote?.get(l.id) ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                  <td className="py-1.5 px-3 text-right">
                    <button className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(l)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {(lotes?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Aún no hay lotes. Crea el primero con "Nuevo lote".
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear/editar */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && setEdit(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Boxes className="h-4 w-4" /> {edit.id ? 'Editar lote' : 'Nuevo lote'}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label-odoo">Producto *</label>
                <select className="input-odoo w-full" value={edit.producto_id} disabled={!!edit.id}
                  onChange={e => setEdit({ ...edit, producto_id: e.target.value })}>
                  <option value="">Selecciona un producto…</option>
                  {(productos ?? []).map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-odoo">Código de lote *</label>
                <input className="input-odoo w-full" value={edit.codigo}
                  onChange={e => setEdit({ ...edit, codigo: e.target.value })} placeholder="Ej. L-2026-014" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-odoo">Caducidad</label>
                  <input type="date" className="input-odoo w-full" value={edit.fecha_caducidad}
                    onChange={e => setEdit({ ...edit, fecha_caducidad: e.target.value })} />
                </div>
                <div>
                  <label className="label-odoo">Fabricación</label>
                  <input type="date" className="input-odoo w-full" value={edit.fecha_fabricacion}
                    onChange={e => setEdit({ ...edit, fecha_fabricacion: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label-odoo">Costo por unidad</label>
                <input type="number" step="0.0001" min="0" className="input-odoo w-full" value={edit.costo}
                  onChange={e => setEdit({ ...edit, costo: e.target.value })} placeholder="Opcional" />
              </div>
              <div>
                <label className="label-odoo">Notas</label>
                <input className="input-odoo w-full" value={edit.notas}
                  onChange={e => setEdit({ ...edit, notas: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              <button onClick={() => setEdit(null)} className="btn-odoo text-sm" disabled={saving}>Cancelar</button>
              <button onClick={handleSave} className="btn-odoo-primary text-sm" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
