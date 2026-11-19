import { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ban, Wallet, Banknote } from 'lucide-react';
import { ETIQUETA_DESTINO_PAGO, type DestinoPagoCancelacion, type PagadaInfo } from '@/lib/cancelarVenta';

const fmt = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Pregunta qué hacer con lo pagado al cancelar una venta (D-020). Uso:
 *   const { pedirDestinoPago, cancelarPagoDialog } = useCancelarPagoPrompt();
 *   const destino = await pedirDestinoPago(info); // null = el usuario canceló
 *   ...y renderizar {cancelarPagoDialog}
 */
export function useCancelarPagoPrompt(nota?: string) {
  const [info, setInfo] = useState<PagadaInfo | null>(null);
  const resolver = useRef<((d: DestinoPagoCancelacion | null) => void) | null>(null);

  const cerrar = (d: DestinoPagoCancelacion | null) => {
    resolver.current?.(d);
    resolver.current = null;
    setInfo(null);
  };

  const pedirDestinoPago = useCallback((i: PagadaInfo) => new Promise<DestinoPagoCancelacion | null>(resolve => {
    resolver.current = resolve;
    setInfo(i);
  }), []);

  const cancelarPagoDialog = (
    <Dialog open={!!info} onOpenChange={o => { if (!o) cerrar(null); }}>
      <DialogContent className="max-w-md z-[70]">
        <DialogHeader>
          <DialogTitle>La venta tiene pagos</DialogTitle>
          <DialogDescription>
            Se pagaron <strong className="text-foreground">{fmt(info?.monto ?? 0)}</strong>. ¿Qué hacemos con ese dinero al cancelar?
            {nota && <span className="block mt-1">{nota}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button variant="outline" className="justify-start gap-2 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => cerrar('cancelar_pago')}>
            <Ban className="h-4 w-4" /> {ETIQUETA_DESTINO_PAGO.cancelar_pago}
          </Button>
          <Button className="justify-start gap-2" onClick={() => cerrar('saldo_favor')}>
            <Wallet className="h-4 w-4" /> {ETIQUETA_DESTINO_PAGO.saldo_favor}
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={() => cerrar('reembolso')}>
            <Banknote className="h-4 w-4" /> {ETIQUETA_DESTINO_PAGO.reembolso}
          </Button>
          <Button variant="ghost" onClick={() => cerrar(null)}>No cancelar la venta</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { pedirDestinoPago, cancelarPagoDialog };
}
