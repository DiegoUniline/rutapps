import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveDevolucion } from '@/hooks/useDevoluciones';
import { useCurrency } from '@/hooks/useCurrency';
import { SALDO_FAVOR_METODO } from '@/lib/saldoFavor';
import { todayInTimezone } from '@/lib/utils';
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

type Destino = 'saldo_favor' | 'aplicar_venta' | 'devolver_dinero';

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
  const [destino, setDestino] = useState<Destino>('saldo_favor');
  const [monto, setMonto] = useState('');
  const [montoTocado, setMontoTocado] = useState(false);
  const [reembolsoMetodo, setReembolsoMetodo] = useState('efectivo');
  const [registrarGasto, setRegistrarGasto] = useState(false);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

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
  const tieneSaldo = ventaSaldo > 0.01;

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

  // Precio unitario CON impuestos (como en ventas) = total de línea / cantidad.
  const precioConIva = (l: any) => {
    const c = Number(l.cantidad) || 0;
    return c > 0 ? r2((Number(l.total) || 0) / c) : r2(Number(l.precio_unitario) || 0);
  };
  const valorLinea = (l: any) => r2(precioConIva(l) * (Number(qty[l.producto_id]) || 0));

  const valorSugerido = useMemo(
    () => r2((lineas as any[]).reduce((s, l) => s + valorLinea(l), 0)),
    [qty, lineas],
  );
  const esDinero = destino === 'devolver_dinero';
  const montoNum = esDinero ? valorSugerido : (montoTocado ? r2(Number(monto) || 0) : valorSugerido);
  const nuevoSaldo = destino === 'aplicar_venta' ? Math.max(0, r2(ventaSaldo - montoNum)) : ventaSaldo;

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
      // Fecha de HOY en la zona horaria de la empresa (no UTC del dispositivo).
      const hoy = todayInTimezone(empresa?.zona_horaria);
      const emiteCredito = destino !== 'devolver_dinero';
      const accion = esDinero ? 'devolucion_dinero' : 'nota_credito';
      const dev: any = await save.mutateAsync({
        devolucion: {
          venta_id: venta.id,
          cliente_id: venta.cliente_id ?? undefined,
          almacen_destino_id: almacenId,
          reembolso_efectivo: esDinero,
          reembolso_metodo: esDinero ? reembolsoMetodo : undefined,
          tipo: 'almacen',
          fecha: hoy,
          notas: notas || undefined,
          user_id: user.id,
        },
        lineas: items.map(l => ({
          producto_id: l.producto_id,
          cantidad: Number(qty[l.producto_id]) || 0,
          motivo,
          accion,
          // El crédito emitido (saldo a favor) sale de monto_credito con accion nota_credito.
          monto_credito: emiteCredito ? valorLinea(l) : 0,
        })),
      });

      // Aplicar a ESTA venta = usar el crédito recién emitido como pago 'saldo_favor'
      // sobre la venta → baja su saldo (emitido − usado se neutraliza en la cuenta).
      if (destino === 'aplicar_venta' && montoNum > 0 && venta.cliente_id) {
        const aplicar = Math.min(montoNum, ventaSaldo);
        const { error: cErr } = await (supabase as any).rpc('aplicar_cobro', {
          p_empresa_id: empresa.id,
          p_cliente_id: venta.cliente_id,
          p_monto: aplicar,
          p_metodo: SALDO_FAVOR_METODO,
          p_referencia: `Devolución ${venta.folio ?? ''}`.trim(),
          p_fecha: hoy,
          p_aplicaciones: [{ venta_id: venta.id, monto_aplicado: aplicar }],
          p_notas: 'Nota de crédito por devolución aplicada a la venta',
          p_user_id: user.id,
        });
        if (cErr) throw cErr;
      }

      // Devolver dinero → egreso en Gastos ligado a la venta (opcional).
      if (esDinero && registrarGasto && valorSugerido > 0) {
        const { error: gErr } = await supabase.from('gastos').insert({
          empresa_id: empresa.id,
          venta_id: venta.id,
          devolucion_id: dev?.id ?? null,
          user_id: user.id,
          monto: valorSugerido,
          metodo_pago: reembolsoMetodo,
          fecha: hoy,
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
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{fmt(precioConIva(l))}</div>
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

          {/* ¿Qué hacer con el valor devuelto? */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">¿Qué hacer con el valor de la devolución?</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="destino" className="mt-1" checked={destino === 'saldo_favor'} onChange={() => setDestino('saldo_favor')} />
              <span><strong>Saldo a favor</strong> — crédito para próximas compras del cliente.</span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${!tieneSaldo ? 'opacity-40' : ''}`}>
              <input type="radio" name="destino" className="mt-1" disabled={!tieneSaldo} checked={destino === 'aplicar_venta'} onChange={() => setDestino('aplicar_venta')} />
              <span><strong>Aplicar a esta venta</strong> — baja el saldo de esta venta{!tieneSaldo ? ' (ya está pagada)' : ` (${fmt(ventaSaldo)} pendiente)`}.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="destino" className="mt-1" checked={destino === 'devolver_dinero'} onChange={() => setDestino('devolver_dinero')} />
              <span><strong>Devolver el dinero</strong> — reembolso al cliente.</span>
            </label>

            {/* Monto (crédito) editable para saldo_favor / aplicar_venta */}
            {!esDinero && (
              <div className="flex items-center gap-2 pl-6 pt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">Monto:</span>
                <Input type="number" min={0} step="0.01" inputMode="decimal" className="h-7 w-32 text-right text-xs"
                  value={montoTocado ? monto : String(valorSugerido)}
                  onChange={e => { setMontoTocado(true); setMonto(e.target.value); }} />
                {montoTocado && <button type="button" className="text-[11px] text-primary underline" onClick={() => { setMontoTocado(false); setMonto(''); }}>usar sugerido</button>}
              </div>
            )}

            {/* Devolver dinero: método + gasto */}
            {esDinero && (
              <div className="pl-6 pt-1 space-y-2">
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

          {/* Resumen */}
          <div className="bg-accent/30 border border-border rounded-lg p-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div><div className="text-[10px] text-muted-foreground uppercase">Total venta</div><div className="font-bold tabular-nums">{fmt(ventaTotal)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Pagado</div><div className="font-bold tabular-nums">{fmt(ventaPagado)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Saldo actual</div><div className="font-bold tabular-nums">{fmt(ventaSaldo)}</div></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Saldo tras devol.</div><div className={`font-bold tabular-nums ${destino === 'aplicar_venta' ? 'text-primary' : ''}`}>{fmt(nuevoSaldo)}</div></div>
            </div>
            <div className="mt-2 pt-2 border-t border-border space-y-0.5">
              <p>• Regresa <strong>{items.reduce((s, l) => s + (Number(qty[l.producto_id]) || 0), 0)}</strong> unidad(es) a <strong>{(almacenes as any[]).find(a => a.id === almacenId)?.nombre ?? '—'}</strong>.</p>
              {destino === 'saldo_favor' && <p>• Genera <strong>{fmt(montoNum)}</strong> de <strong>saldo a favor</strong> del cliente (para próximas compras).</p>}
              {destino === 'aplicar_venta' && <p>• Baja el saldo de esta venta en <strong>{fmt(Math.min(montoNum, ventaSaldo))}</strong>.</p>}
              {esDinero && <p>• Reembolso de <strong>{fmt(valorSugerido)}</strong> en <strong>{METODOS.find(m => m.value === reembolsoMetodo)?.label}</strong>{registrarGasto ? ' — se registra en Gastos.' : ' (solo anotado).'}</p>}
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
