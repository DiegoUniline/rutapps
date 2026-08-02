import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/hooks/useCurrency';

interface Fila {
  venta_id: string;
  folio: string | null;
  empresa: string | null;
  total_anterior: number;
  descuento: number;
  total_nuevo: number;
}

/**
 * Reparador de promociones (SOLO super admin: diego.leon@uniline.mx).
 *
 * Vuelve a evaluar en el servidor las promociones vigentes de cada venta que
 * NO tiene ninguna promoción registrada y aplica el descuento faltante a las
 * líneas. Los totales y el saldo del cliente se recalculan con los triggers
 * existentes. Es idempotente: una venta con promociones ya registradas se omite.
 */
export function RepararPromocionesButton() {
  const isSuper = useIsSuperAdmin();
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [todas, setTodas] = useState(false);
  const [desde, setDesde] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [result, setResult] = useState<Fila[] | null>(null);

  if (!isSuper) return null;

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_reparar_promociones' as any, {
        _empresa_id: todas ? null : empresa?.id ?? null,
        _desde: desde || null,
      });
      if (error) throw error;
      const filas = (data ?? []) as Fila[];
      setResult(filas);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta-lineas'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      toast.success(filas.length ? `${filas.length} venta(s) corregida(s)` : 'No había ventas por corregir');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo reparar');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setResult(null); setOpen(true); }}
        className="btn-odoo shrink-0"
        title="Reparar promociones (solo super admin)"
      >
        <Wand2 className="h-3.5 w-3.5" /> Actualizar promos
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle>Actualizar promociones</DialogTitle>
            <DialogDescription>
              Revisa las ventas sin promoción registrada, aplica el descuento que correspondía y
              recalcula totales y saldos. No crea cobros, entregas ni movimientos de inventario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Desde (fecha de la venta)</Label>
              <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} />
              Aplicar a <strong>todas las empresas</strong> (si no, solo {empresa?.nombre ?? 'la empresa actual'})
            </label>

            {result && (
              <div className="border border-border rounded max-h-64 overflow-y-auto text-xs">
                {result.length === 0 ? (
                  <p className="p-3 text-muted-foreground">Sin ventas por corregir.</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Folio</th>
                        <th className="text-left p-2">Empresa</th>
                        <th className="text-right p-2">Antes</th>
                        <th className="text-right p-2">Desc.</th>
                        <th className="text-right p-2">Ahora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.map(r => (
                        <tr key={r.venta_id} className="border-t border-border">
                          <td className="p-2">{r.folio}</td>
                          <td className="p-2">{r.empresa}</td>
                          <td className="p-2 text-right">{fmt(Number(r.total_anterior))}</td>
                          <td className="p-2 text-right text-destructive">-{fmt(Number(r.descuento))}</td>
                          <td className="p-2 text-right font-semibold">{fmt(Number(r.total_nuevo))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Actualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
