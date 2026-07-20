import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { applyStockAdjustments, type StockConflictVenta } from '@/lib/revalidateStock';
import { processSyncQueue } from '@/lib/syncQueue';

/**
 * Diálogo global que aparece cuando, al reconectar, se detecta que uno o más
 * pedidos hechos offline ya no tienen stock disponible en el servidor.
 * El vendedor puede reducir o eliminar líneas antes de subirlas.
 */
export default function StockAdjustmentDialog() {
  const [conflicts, setConflicts] = useState<StockConflictVenta[] | null>(null);
  const [decisions, setDecisions] = useState<Map<number, number>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as StockConflictVenta[];
      if (!detail || detail.length === 0) return;
      // Precargar decisiones con el máximo disponible
      const init = new Map<number, number>();
      for (const v of detail) {
        for (const l of v.lines) init.set(l.queueItemId, l.disponibleReal);
      }
      setDecisions(init);
      setConflicts(detail);
    };
    window.addEventListener('uniline:stock-adjustment-needed', handler as any);
    return () => window.removeEventListener('uniline:stock-adjustment-needed', handler as any);
  }, []);

  if (!conflicts) return null;

  const update = (id: number, val: number) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(0, val));
      return next;
    });
  };

  const acceptAll = () => {
    // Ya está precargado con disponibleReal
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const v of conflicts) {
        for (const l of v.lines) next.set(l.queueItemId, l.disponibleReal);
      }
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await applyStockAdjustments(conflicts, decisions);
      toast.success('Pedidos ajustados. Sincronizando…');
      setConflicts(null);
      // Reanudar sincronización
      processSyncQueue().catch((err) => console.warn('sync tras ajuste falló', err));
    } catch (err) {
      console.error(err);
      toast.error('No se pudieron aplicar los ajustes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!conflicts} onOpenChange={(o) => { if (!o && !saving) setConflicts(null); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle>Ajuste de stock requerido</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Mientras estabas sin señal, otros pedidos apartaron parte del stock.
            Revisa las cantidades antes de subir tus pedidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {conflicts.map((v) => (
            <div key={v.queueItemId} className="border rounded-lg p-3 bg-amber-50/50">
              <div className="font-medium text-sm mb-2">
                {v.folio ? `${v.folio} · ` : ''}{v.clienteNombre}
              </div>
              <div className="space-y-2">
                {v.lines.map((l) => {
                  const val = decisions.get(l.queueItemId) ?? l.disponibleReal;
                  return (
                    <div key={l.queueItemId} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{l.productoNombre}</div>
                        <div className="text-xs text-muted-foreground">
                          Pediste <b>{l.cantidadPedida}</b> · Disponible <b>{l.disponibleReal}</b>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={l.disponibleReal}
                        value={val}
                        onChange={(e) => update(l.queueItemId, Number(e.target.value))}
                        className="w-20 h-9"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={acceptAll} disabled={saving}>
            Usar disponible
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Aplicando…' : 'Aceptar y sincronizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
