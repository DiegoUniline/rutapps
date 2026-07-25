import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveDevolucion } from '@/hooks/useDevoluciones';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RotateCcw } from 'lucide-react';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const MOTIVOS = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'error_pedido', label: 'Error de pedido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'caducado', label: 'Caducado' },
  { value: 'otro', label: 'Otro' },
];

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'deposito', label: 'Depósito' },
];

interface Props {
  venta: { id: string; folio?: string | null; cliente_id?: string | null };
  onClose: () => void;
  onDone: () => void;
}

export function DevolucionVentaModal({ venta, onClose, onDone }: Props) {
  const { empresa, user } = useAuth();
  const { fmt } = useCurrency();
  const save = useSaveDevolucion();

  const [qty, setQty] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState('no_vendido');
  const [almacenId, setAlmacenId] = useState('');
  const [bajaSaldo, setBajaSaldo] = useState(true);
  const [montoSaldo, setMontoSaldo] = useState('');
  const [montoTocado, setMontoTocado] = useState(false);
  const [reembolso, setReembolso] = useState(false);
  const [reembolsoMetodo, setReembolsoMetodo] = useState('efectivo');
  const [registrarGasto, setRegistrarGasto] = useState(false);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Líneas de la venta
  const { data: lineas = [] } = useQuery({
    queryKey: ['venta-lineas-devolucion', venta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_lineas')
        .select('producto_id, descripcion, cantidad, precio_unitario, total, productos!venta_lineas_producto_id_fkey(nombre)')
        .eq('venta_id', venta.id);
      return (data ?? []).filter((l: any) => l.producto_id);
    },
  });

  // Totales de la venta (para el resumen)
  const { data: ventaInfo } = useQuery({
    queryKey: ['venta-info-devolucion', venta.id],
    queryFn: async () => {
      const { data } = await supabase.from('ventas').select('total, saldo_pendiente').eq('id', venta.id).maybeSingle();
      return data;
    },
  });
  const ventaTotal = Number(ventaInfo?.total) || 0;
  const ventaSaldo = Number(ventaInfo?.saldo_pendiente) || 0;
  const ventaPagado = r2(ventaTotal - ventaSaldo);

  // Almacenes destino
  const { data: almacenes = [] } = useQuery({
    queryKey: ['almacenes-devolucion', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('almacenes').select('id, nombre, es_merma, activo')
        .eq('empresa_id', empresa!.id).eq('activo', true)
        .order('es_merma').order('nombre');
      return data ?? [];
    },
  });

  // Valor devuelto de una línea = total de la línea (con impuestos) prorrateado.
  const valorLinea = (l: any) => {
    const vend = Number(l.cantidad) || 0;
    const dev = Number(qty[l.producto_id]) || 0;
    if (vend <= 0) return 0;
    return r2((Number(l.total) || 0) * (dev / vend));
  };

  const valorSugerido = useMemo(
    () => r2((lineas as any[]).reduce((s, l) => s + valorLinea(l), 0)),
    [qty, lineas],
  );
  const montoSaldoNum = montoTocado ? r2(Number(montoSaldo) || 0) : valorSugerido;
  const nuevoSaldo = bajaSaldo ? Math.max(0, r2(ventaSaldo - montoSaldoNum)) : ventaSaldo;

  const setLineQty = (pid: string, vendida: number, val: number) => {
    setQty(prev => ({ ...prev, [pid]: Math.max(0, Math.min(vendida, val || 0)) }));
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
      const dev: any = await save.mutateAsync({
        devolucion: {
          venta_id: venta.id,
          cliente_id: venta.cliente_id ?? undefined,
          almacen_destino_id: almacenId,
          reembolso_efectivo: reembolso,
          reembolso_metodo: reembolso ? reembolsoMetodo : undefined,
          tipo: 'almacen',
          notas: notas || undefined,
          user_id: user.id,
        },
        lineas: items.map(l => ({
          producto_id: l.producto_id,
          cantidad: Number(qty[l.producto_id]) || 0,
          motivo,
          accion,
          monto_credito: bajaSaldo ? valorLinea(l) : 0,
        })),
      });

      // Baja de saldo → nota de crédito (cobro nota_credito aplicado a la venta).
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

      // Reembolso registrado como egreso en Gastos, ligado a la venta.
      if (reembolso && registrarGasto && valorSugerido > 0) {
        const { error: gErr } = await supabase.from('gastos').insert({
          empresa_id: empresa.id,
          venta_id: venta.id,
          devolucion_id: dev?.id ?? null,
          user_id: user.id,
          monto: valorSugerido,
          metodo_pago: reembolsoMetodo,
          concepto: `Reembolso devolución ${venta.folio ?? ''}`.trim(),
          notas: notas || null,
        } as any);
        if (gErr) throw gErr;
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
            <div className="max-h-52 overflow-y-auto">
              {(lineas as any[]).map(l => {
                const vendida = Number(l.cantidad) || 0;
                return (
                  <div key={l.producto_id} className="px-3 py-1.5 text-xs border-t border-border grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 truncate">{l.productos?.nombre || l.descripcion || '—'}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{vendida}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{fmt(r2(Number(l.precio_unitario) || 0))}</div>
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
              <div className="flex items-center gap-2 pl-6 flex-wrap">
                <span className="text-xs text-muted-foreground">Monto a descontar:</span>
                <Input type="number" min={0} step="0.01" inputMode="decimal" className="h-7 w-32 text-right text-xs"
                  value={montoTocado ? montoSaldo : String(valorSugerido)}
                  onChange={e => { setMontoTocado(true); setMontoSaldo(e.target.value); }} />
                {montoTocado && <button type="button" className="text-[11px] text-primary underline" onClick={() => { setMontoTocado(false); setMontoSaldo(''); }}>usar sugerido</button>}
              </div>
            )}
          </div>

          {/* Reembolso */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reembolso} onChange={e => setReembolso(e.target.checked)} />
              <span>Se devolvió el dinero al cliente</span>
            </label>
            {reembolso && (
              <div className="pl-6 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Método:</span>
                  <select value={reembolsoMetodo} onChange={e => setReembolsoMetodo(e.target.value)} className="border border-border rounded-md px-2 py-1 text-xs bg-background">
                    {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">· {fmt(valorSugerido)}</span>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={registrarGasto} onChange={e => setRegistrarGasto(e.target.checked)} />
                  <span>Registrar egreso en <strong>Gastos</strong> (ligado a esta venta)</span>
                </label>
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">Notas</label>
            <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional…" />
          </div>

          {/* Resumen de la cuenta */}
          <div className="bg-accent/30 border border-border rounded-lg p-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div><div className="text-[10px] text-muted-foreground uppercase">Total venta</div><div className="font-bold tabular-nums">{fmt(ventaTotal)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Pagado</div><div className="font-bold tabular-nums">{fmt(ventaPagado)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Saldo actual</div><div className="font-bold tabular-nums">{fmt(ventaSaldo)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Saldo tras devol.</div><div className={`font-bold tabular-nums ${bajaSaldo ? 'text-primary' : ''}`}>{fmt(nuevoSaldo)}</div></div>
            </div>
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              <p>• Regresa <strong>{items.reduce((s, l) => s + (Number(qty[l.producto_id]) || 0), 0)}</strong> unidad(es) a <strong>{(almacenes as any[]).find(a => a.id === almacenId)?.nombre ?? '—'}</strong>.</p>
              {bajaSaldo && <p>• Baja el saldo en <strong>{fmt(montoSaldoNum)}</strong> (nota de crédito).</p>}
              {reembolso && <p>• Reembolso de <strong>{fmt(valorSugerido)}</strong> en <strong>{METODOS.find(m => m.value === reembolsoMetodo)?.label}</strong>{registrarGasto ? ' — se registra en Gastos.' : ' (solo anotado).'}</p>}
            </div>
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
