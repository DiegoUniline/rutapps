import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wrench } from 'lucide-react';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface LineaEdit {
  id: string;
  descripcion: string;
  cantidad: number;
  iva_pct: number;
  ieps_pct: number;
  descuento_pct: number;
  /** Precio unitario CON impuestos, ya neto de descuento (lo que se cobra). */
  brutoUnit: number;
}

interface Props {
  venta: any;
  lineas: any[];
  onSaved?: () => void;
}

/**
 * Corrección administrativa de una venta.
 *
 * Permite ajustar precio unitario y descuento por línea, y algunos datos del
 * encabezado. NO permite cambiar cantidades (eso movería inventario). Los
 * totales de la venta y el saldo del cliente los recalcula la base de datos
 * con sus triggers, así que las cuentas por cobrar quedan siempre al día.
 */
export function AdminEditVentaDialog({ venta, lineas, onSaved }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<LineaEdit[]>([]);
  const [fecha, setFecha] = useState<string>(venta?.fecha ?? '');
  const [condicion, setCondicion] = useState<string>(venta?.condicion_pago ?? 'contado');
  const [notas, setNotas] = useState<string>(venta?.notas ?? '');

  useEffect(() => {
    if (!open) return;
    setFecha(venta?.fecha ?? '');
    setCondicion(venta?.condicion_pago ?? 'contado');
    setNotas(venta?.notas ?? '');
    setRows(
      (lineas ?? []).map((l: any) => {
        const cant = Number(l.cantidad) || 0;
        return {
          id: l.id,
          descripcion: l.descripcion ?? '',
          cantidad: cant,
          iva_pct: Number(l.iva_pct) || 0,
          ieps_pct: Number(l.ieps_pct) || 0,
          descuento_pct: Number(l.descuento_pct) || 0,
          brutoUnit: cant > 0 ? r2((Number(l.total) || 0) / cant) : 0,
        };
      }),
    );
  }, [open, lineas, venta]);

  const setRow = (id: string, patch: Partial<LineaEdit>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const calcular = (r: LineaEdit) => {
    const totalNeto = r2(r.brutoUnit * r.cantidad);
    const base = totalNeto / ((1 + r.ieps_pct / 100) * (1 + r.iva_pct / 100));
    const ieps = r2(base * (r.ieps_pct / 100));
    const iva = r2((base + ieps) * (r.iva_pct / 100));
    const subtotal = r2(totalNeto - ieps - iva);
    return { subtotal, iva, ieps, total: totalNeto };
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        const m = calcular(r);
        const { error } = await supabase
          .from('venta_lineas')
          .update({
            subtotal: m.subtotal,
            iva_monto: m.iva,
            ieps_monto: m.ieps,
            total: m.total,
            descuento_pct: r.descuento_pct,
            precio_unitario: r.cantidad > 0 ? r2(m.subtotal / r.cantidad) : 0,
            precio_unitario_sin_redondeo: r.cantidad > 0 ? m.subtotal / r.cantidad : 0,
            descripcion: r.descripcion,
          })
          .eq('id', r.id);
        if (error) throw error;
      }

      const { error: eHead } = await supabase
        .from('ventas')
        .update({
          fecha: fecha || venta.fecha,
          condicion_pago: condicion,
          notas: notas || null,
        })
        .eq('id', venta.id);
      if (eHead) throw eHead;

      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta-lineas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      toast.success('Venta corregida. Totales y saldo actualizados.');
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const totalNuevo = rows.reduce((s, r) => s + calcular(r).total, 0);

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setOpen(true)}>
        <Wrench className="h-3 w-3" /> Corregir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle>Corregir venta {venta?.folio ?? ''}</DialogTitle>
            <DialogDescription>
              Ajusta precios, descuentos y datos del documento. Las cantidades no se pueden
              cambiar aquí porque moverían el inventario. El total y el saldo del cliente se
              recalculan automáticamente al guardar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={fecha ?? ''} onChange={e => setFecha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Condición de pago</Label>
                <Select value={condicion} onValueChange={setCondicion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="contado">Contado</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Notas</Label>
                <Textarea rows={1} value={notas} onChange={e => setNotas(e.target.value)} />
              </div>
            </div>

            <div className="border border-border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Producto</th>
                    <th className="text-right p-2">Cant.</th>
                    <th className="text-right p-2">Precio c/imp.</th>
                    <th className="text-right p-2">Desc. %</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 min-w-[180px]">
                        <Input value={r.descripcion} onChange={e => setRow(r.id, { descripcion: e.target.value })} className="h-7 text-xs" />
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{r.cantidad}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number" step="0.01" inputMode="decimal"
                          value={r.brutoUnit}
                          onChange={e => setRow(r.id, { brutoUnit: Number(e.target.value) })}
                          className="h-7 text-xs text-right w-24 ml-auto"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number" step="0.01" inputMode="decimal"
                          value={r.descuento_pct}
                          onChange={e => setRow(r.id, { descuento_pct: Number(e.target.value) })}
                          className="h-7 text-xs text-right w-20 ml-auto"
                        />
                      </td>
                      <td className="p-2 text-right font-semibold">{calcular(r).total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td className="p-2 font-semibold" colSpan={4}>Total nuevo</td>
                    <td className="p-2 text-right font-bold">{totalNuevo.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
