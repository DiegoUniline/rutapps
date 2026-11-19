import { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Wallet, Banknote, MinusCircle } from 'lucide-react';
import { ETIQUETA_DESTINO, type DestinoExcedente, type ExcedenteInfo } from '@/lib/excedente';

const fmt = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Pregunta qué hacer con lo pagado de más (D-025). Uso:
 *   const { pedirDestino, excedenteDialog } = useExcedentePrompt();
 *   const destino = await pedirDestino(info); // null = el usuario canceló
 *   ...y renderizar {excedenteDialog}
 */
export function useExcedentePrompt() {
  const [info, setInfo] = useState<ExcedenteInfo | null>(null);
  const resolver = useRef<((d: DestinoExcedente | null) => void) | null>(null);

  const cerrar = (d: DestinoExcedente | null) => {
    resolver.current?.(d);
    resolver.current = null;
    setInfo(null);
  };

  const pedirDestino = useCallback((i: ExcedenteInfo) => new Promise<DestinoExcedente | null>(resolve => {
    resolver.current = resolve;
    setInfo(i);
  }), []);

  const excedenteDialog = (
    <Dialog open={!!info} onOpenChange={o => { if (!o) cerrar(null); }}>
      <DialogContent className="max-w-md z-[70]">
        <DialogHeader>
          <DialogTitle>Lo pagado supera el nuevo total</DialogTitle>
          <DialogDescription>
            {info?.mensaje || 'El nuevo total queda abajo de lo ya pagado.'} Sobran{' '}
            <strong className="text-foreground">{fmt(info?.monto ?? 0)}</strong>. ¿Qué hacemos con ese dinero?
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button className="justify-start gap-2" onClick={() => cerrar('saldo_favor')}>
            <Wallet className="h-4 w-4" /> {ETIQUETA_DESTINO.saldo_favor}
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={() => cerrar('reembolso')}>
            <Banknote className="h-4 w-4" /> {ETIQUETA_DESTINO.reembolso}
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={() => cerrar('nada')}>
            <MinusCircle className="h-4 w-4" /> {ETIQUETA_DESTINO.nada}
          </Button>
          <Button variant="ghost" onClick={() => cerrar(null)}>Volver sin guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { pedirDestino, excedenteDialog };
}
