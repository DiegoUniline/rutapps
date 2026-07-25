import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePermisos } from '@/hooks/usePermisos';
import { useSaveDevolucion } from '@/hooks/useDevoluciones';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RotateCcw } from 'lucide-react';

const MOTIVOS = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'error_pedido', label: 'Error de pedido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'caducado', label: 'Caducado' },
  { value: 'otro', label: 'Otro' },
];

interface Props {
  venta: { id: string; folio?: string | null; cliente_id?: string | null };
  onClose: () => void;
  onDone: () => void;
}

export function DevolucionVentaModal({ venta, onClose, onDone }: Props) {
  const { empresa, user } = useAuth();
  const { isOwner } = usePermisos();
  const { fmt } = useCurrency();
  const save = useSaveDevolucion();

  const [qty, setQty] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState('no_vendido');
  const [almacenId, setAlmacenId] = useState('');
  const [bajaSaldo, setBajaSaldo] = useState(true);
  const [montoSaldo, setMontoSaldo] = useState<string>('');
  const [montoTocado, setMontoTocado] = useState(false);
  const [reembolso, setReembolso] = useState(false);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Líneas de la venta (para elegir qué devolver)
  const { data: lineas = [] } = useQuery({
    queryKey: ['venta-lineas-devolucion', venta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_lineas')
        .select('producto_id, descripcion, cantidad, precio_unitario, productos!venta_lineas_producto_id_fkey(nombre)')
        .eq('venta_id', venta.id);
      return (data ?? []).filter((l: any) => l.producto_id);
    },
  });

  // Almacenes destino (vendibles + mermas)
  const { data: almacenes = [] } = useQuery({
    queryKey: ['almacenes-devolucion', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('almacenes')
        .select('id, nombre, es_merma, activo')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('es_merma')
        .order('nombre');
      return data ?? [];
    },
  });

  const precioDe = (pid: string) => Number((lineas as any[]).find(l => l.producto_id === pid)?.precio_unitario) || 0;

  // Valor sugerido = Σ precio × cantidad a devolver
  const valorSugerido = useMemo(
    () => (lineas as any[]).reduce((s, l) => s + (Number(qty[l.producto_id]) || 0) * precioDe(l.producto_id), 0),
    [qty, lineas],
  );
  const montoSaldoNum = montoTocado ? (Number(montoSaldo) || 0) : valorSugerido;

  const setLineQty = (pid: string, vendida: number, val: number) => {
    const v = Math.max(0, Math.min(vendida, val || 0));
    setQty(prev => ({ ...prev, [pid]: v }));
  };

  const items = (lineas as any[]).filter(l => (Number(qty[l.producto_id]) || 0) > 0);
  const canSave = !saving && items.length > 0 && !!almacenId;

  const handleSave = async () => {
    if (!empresa?.id || !user?.id) return;
    if (!almacenId) { toast.error('Elige el almacén destino'); return; }
    if (items.length === 0) { toast.error('Indica al menos una cantidad a devolver'); return; }
    setSaving(true);
    try {
      const accion = bajaSaldo ? 'nota_credito' : reembolso ? 'devolucion_dinero' : 'reposicion';
      await save.mutateAsync({
        devolucion: {
          venta_id: venta.id,
          cliente_id: venta.cliente_id ?? undefined,
          almacen_destino_id: almacenId,
          reembolso_efectivo: reembolso,
          tipo: 'almacen',
          notas: notas || undefined,
          user_id: user.id,
        },
        lineas: items.map(l => ({
          producto_id: l.producto_id,
          cantidad: Number(qty[l.producto_id]) || 0,
          motivo,
          accion,
          monto_credito: bajaSaldo ? (Number(qty[l.producto_id]) || 0) * precioDe(l.producto_id) : 0,
        })),
      });

      // Baja de saldo: se registra como cobro tipo nota_credito aplicado a la venta
      // (reusa aplicar_cobro; el trigger de saldo baja el saldo_pendiente).
      if (bajaSaldo && montoSaldoNum > 0 && venta.cliente_id) {
        const { error: cErr } = await (supabase as any).rpc('aplicar_cobro', {
          p_empresa_id: empresa.id,
          p_cliente_id: venta.cliente_id,
          p_monto: montoSaldoNum,
          p_metodo: 'nota_credito',
          p_referencia: `Devolución ${venta.folio ?? ''}`.trim(),
          p_fecha: new Date().toISOString().slice(0, 10),
          p_aplicaciones: [{ venta_id: venta.id, monto_aplicado: montoSaldoNum }],
          p_notas: 'Nota de crédito por devolución',
          p_user_id: user.id,
        });
        if (cErr) throw cErr;
      }

      toast.success('Devolución registrada');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar la devolución');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Registrar devolución {venta.folio ? `· ${venta.folio}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Productos */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-accent/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase grid grid-cols-12 gap-2">
              <div className="col-span-6">Producto</div>
              <div className="col-span-2 text-right">Vendida</div>
              <div className="col-span-2 text-right">Precio</div>
              <div className="col-span-2 text-right">Devolver</div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {(lineas as any[]).map(l => {
                const vendida = Number(l.cantidad) || 0;
                return (
                  <div key={l.producto_id} className="px-3 py-1.5 text-xs border-t border-border grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 truncate">{l.productos?.nombre || l.descripcion || '—'}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{vendida}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{fmt(Number(l.precio_unitario) || 0)}</div>
                    <div className="col-span-2">
                      <Input type="number" min={0} max={vendida} inputMode="decimal"
                        className="h-7 text-right text-xs"
                        value={qty[l.producto_id] ?? ''}
                        onChange={e => setLineQty(l.producto_id, vendida, parseFloat(e.target.value))} />
                    </div>
                  </div>
                );
              })}
              {(lineas as any[]).length === 0 && <div className="px-3 py-6 text-center text-muted-foreground text-xs">Esta venta no tiene productos.</div>}
            </div>
          </div>

          {/* Motivo + Almacén destino */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Motivo</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Almacén destino *</label>
              <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                <option value="">Elegir…</option>
                {(almacenes as any[]).map(a => <option key={a.id} value={a.id}>{a.nombre}{a.es_merma ? ' (Mermas)' : ''}</option>)}
              </select>
            </div>
          </div>

          {/* Baja saldo */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bajaSaldo} onChange={e => setBajaSaldo(e.target.checked)} />
              <span>Bajar el saldo de esta venta (nota de crédito)</span>
            </label>
            {bajaSaldo && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-muted-foreground">Monto a descontar:</span>
                <Input type="number" min={0} inputMode="decimal" className="h-7 w-32 text-right text-xs"
                  value={montoTocado ? montoSaldo : String(valorSugerido)}
                  onChange={e => { setMontoTocado(true); setMontoSaldo(e.target.value); }} />
                <button type="button" className="text-[11px] text-primary underline" onClick={() => { setMontoTocado(false); setMontoSaldo(''); }}>usar sugerido</button>
              </div>
            )}
          </div>

          {/* Reembolso */}
          <div className="border border-border rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reembolso} onChange={e => setReembolso(e.target.checked)} />
              <span>Se devolvió el dinero en efectivo</span>
            </label>
            {reembolso && (
              <p className="text-[11px] text-muted-foreground mt-1 pl-6">
                Se deja anotado en la devolución. {isOwner ? 'Para registrar el egreso en caja, hazlo desde Gastos.' : ''}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Notas</label>
            <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional…" />
          </div>

          {/* Resumen del efecto */}
          <div className="bg-accent/30 border border-border rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold">Al guardar:</p>
            <p>• Regresa <strong>{items.reduce((s, l) => s + (Number(qty[l.producto_id]) || 0), 0)}</strong> unidad(es) al almacén <strong>{(almacenes as any[]).find(a => a.id === almacenId)?.nombre ?? '—'}</strong>.</p>
            {bajaSaldo
              ? <p>• Baja el saldo de la venta en <strong>{fmt(montoSaldoNum)}</strong> (nota de crédito).</p>
              : <p>• No modifica el saldo de la venta.</p>}
            {reembolso && <p>• Marca que se devolvió el dinero en efectivo.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Registrar devolución'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
