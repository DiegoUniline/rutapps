import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';

interface LoteOpt { id: string; codigo: string; fecha_caducidad: string | null }
interface Asignacion { id: string; piezas: number; created_at: string; lote_id: string; lotes?: { codigo: string; fecha_caducidad: string | null } | null }

interface Props {
  open: boolean;
  empresaId: string;
  compraId: string;
  lineaId: string;
  almacenId: string | null;
  producto: { id: string; nombre: string };
  piezasTotal: number;
  userId?: string;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Loteo de una línea de compra: asigna piezas a lotes (existentes o nuevos).
 * Cada asignación carga el stock al almacén y al lote mediante trigger en base de datos.
 */
export function CompraLineaLotesDialog({ open, empresaId, compraId, lineaId, almacenId, producto, piezasTotal, userId, onClose, onChanged }: Props) {
  const qc = useQueryClient();
  /** Refresca las vistas que dependen del stock por lote (Lotes, inventario, kardex). */
  const invalidarStock = useCallback(() => {
    ['stock-lotes', 'lotes', 'lotes-almacenes', 'stock_almacen', 'inventario', 'productos', 'kardex-ubicacion', 'apartado-disponible']
      .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  }, [qc]);
  const [lotes, setLotes] = useState<LoteOpt[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'existente' | 'nuevo'>('existente');
  const [loteId, setLoteId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [fabricacion, setFabricacion] = useState('');
  const [piezas, setPiezas] = useState(0);

  const loteado = asignaciones.reduce((s, a) => s + Number(a.piezas || 0), 0);
  const pendiente = Math.max(0, piezasTotal - loteado);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lts }, { data: asg }] = await Promise.all([
      (supabase.from as any)('lotes').select('id, codigo, fecha_caducidad').eq('empresa_id', empresaId).eq('producto_id', producto.id).eq('activo', true).order('fecha_caducidad', { ascending: true, nullsFirst: false }),
      (supabase.from as any)('compra_linea_lotes').select('id, piezas, created_at, lote_id, lotes(codigo, fecha_caducidad)').eq('compra_linea_id', lineaId).order('created_at', { ascending: true }),
    ]);
    setLotes((lts ?? []) as LoteOpt[]);
    setAsignaciones((asg ?? []) as Asignacion[]);
    setLoading(false);
  }, [empresaId, producto.id, lineaId]);

  useEffect(() => { if (open) { load(); setMode('existente'); setLoteId(''); setCodigo(''); setCaducidad(''); setFabricacion(''); } }, [open, load]);
  useEffect(() => { setPiezas(pendiente); }, [pendiente]);

  const asignar = async () => {
    if (!almacenId) { toast.error('La compra no tiene almacén destino'); return; }
    const qty = Number(piezas) || 0;
    if (qty <= 0) { toast.error('Indica cuántas piezas vas a lotear'); return; }
    if (qty > pendiente + 0.0001) { toast.error(`Solo quedan ${pendiente} pieza(s) por lotear`); return; }
    setSaving(true);
    try {
      let finalLoteId = loteId;
      if (mode === 'nuevo') {
        if (!codigo.trim()) throw new Error('Escribe el código del lote');
        const { data, error } = await (supabase.from as any)('lotes').insert({
          empresa_id: empresaId, producto_id: producto.id, codigo: codigo.trim(),
          fecha_caducidad: caducidad || null, fecha_fabricacion: fabricacion || null, activo: true,
        }).select('id').single();
        if (error) throw error;
        finalLoteId = data.id;
      }
      if (!finalLoteId) throw new Error('Elige un lote');
      const { error: errAsg } = await (supabase.from as any)('compra_linea_lotes').insert({
        empresa_id: empresaId, compra_id: compraId, compra_linea_id: lineaId,
        producto_id: producto.id, lote_id: finalLoteId, almacen_id: almacenId,
        piezas: qty, user_id: userId ?? null,
      });
      if (errAsg) throw errAsg;
      toast.success(`${qty} pieza(s) loteadas y cargadas a stock`);
      setCodigo(''); setCaducidad(''); setFabricacion(''); setLoteId(''); setMode('existente');
      await load();
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'No se pudo lotear');
    } finally { setSaving(false); }
  };

  const quitar = async (a: Asignacion) => {
    setSaving(true);
    try {
      const { error } = await (supabase.from as any)('compra_linea_lotes').delete().eq('id', a.id);
      if (error) throw error;
      toast.success('Loteo revertido (stock descontado)');
      await load();
      onChanged();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Lotear {producto.nombre}</DialogTitle>
          <DialogDescription>Al asignar piezas a un lote se cargan automáticamente al almacén y se cuentan como recibidas.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>Comprado: <strong className="tabular-nums">{piezasTotal.toLocaleString('es-MX')}</strong></span>
          <span>Loteado: <strong className="tabular-nums text-emerald-600">{loteado.toLocaleString('es-MX')}</strong></span>
          <span>Pendiente: <strong className="tabular-nums text-amber-600">{pendiente.toLocaleString('es-MX')}</strong></span>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Cargando…</div>
        ) : (
          <>
            {asignaciones.length > 0 && (
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-2 py-1 text-xs">Lote</th>
                    <th className="text-left px-2 py-1 text-xs">Caducidad</th>
                    <th className="text-right px-2 py-1 text-xs">Piezas</th>
                    <th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {asignaciones.map(a => (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-1 font-medium">{a.lotes?.codigo ?? '—'}</td>
                        <td className="px-2 py-1 text-muted-foreground">{a.lotes?.fecha_caducidad ? fmtDate(a.lotes.fecha_caducidad) : '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Number(a.piezas).toLocaleString('es-MX')}</td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" disabled={saving} onClick={() => quitar(a)} className="text-destructive hover:text-destructive/80" title="Quitar loteo y descontar stock"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pendiente > 0 ? (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={mode === 'existente' ? 'default' : 'outline'} onClick={() => setMode('existente')}>Lote existente</Button>
                  <Button type="button" size="sm" variant={mode === 'nuevo' ? 'default' : 'outline'} onClick={() => setMode('nuevo')}>Crear lote</Button>
                </div>
                {mode === 'existente' ? (
                  <div>
                    <Label>Lote</Label>
                    <select className="input-odoo w-full" value={loteId} onChange={e => setLoteId(e.target.value)}>
                      <option value="">Selecciona un lote…</option>
                      {lotes.map(l => <option key={l.id} value={l.id}>{l.codigo}{l.fecha_caducidad ? ` · vence ${fmtDate(l.fecha_caducidad)}` : ''}</option>)}
                    </select>
                    {lotes.length === 0 && <p className="text-xs text-muted-foreground mt-1">Este producto aún no tiene lotes: crea uno.</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><Label>Código *</Label><Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="L-2026-01" /></div>
                    <div><Label>Caducidad</Label><Input type="date" value={caducidad} onChange={e => setCaducidad(e.target.value)} /></div>
                    <div><Label>Fabricación</Label><Input type="date" value={fabricacion} onChange={e => setFabricacion(e.target.value)} /></div>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <div className="w-40">
                    <Label>Piezas a lotear</Label>
                    <Input type="number" min={0} step="0.001" value={piezas} onChange={e => setPiezas(Number(e.target.value))} />
                  </div>
                  <Button onClick={asignar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Lotear y cargar a stock</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-emerald-600 font-medium border-t border-border pt-3">Esta línea está loteada al 100%.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
