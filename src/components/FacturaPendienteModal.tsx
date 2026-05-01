import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Clock } from 'lucide-react';
import { useFacturaPendiente } from '@/hooks/useFacturaPendiente';
import { fmtMoney } from '@/lib/currency';

const SNOOZE_KEY = 'factura_pendiente_snooze';
const SNOOZE_HOURS = 12;

export default function FacturaPendienteModal() {
  const fp = useFacturaPendiente();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!fp.hasPendiente || fp.loading) return;
    // No mostrar en rutas que ya son del flujo de pago
    if (location.pathname.startsWith('/mi-suscripcion')) return;
    if (location.pathname.startsWith('/suscripcion-bloqueada')) return;
    if (location.pathname.startsWith('/ruta')) return;

    // Si está en gracia (vencida), siempre mostrar (no se puede posponer)
    if (fp.isExpired) {
      setOpen(true);
      return;
    }

    // Si aún no vence, respetar snooze por factura
    try {
      const raw = localStorage.getItem(`${SNOOZE_KEY}:${fp.facturaId}`);
      if (raw) {
        const until = parseInt(raw, 10);
        if (Date.now() < until) return;
      }
    } catch {}
    setOpen(true);
  }, [fp.hasPendiente, fp.loading, fp.facturaId, fp.isExpired, location.pathname]);

  if (!fp.hasPendiente) return null;

  const handleSnooze = () => {
    try {
      localStorage.setItem(
        `${SNOOZE_KEY}:${fp.facturaId}`,
        String(Date.now() + SNOOZE_HOURS * 3600 * 1000)
      );
    } catch {}
    setOpen(false);
  };

  const handlePay = () => {
    setOpen(false);
    navigate('/mi-suscripcion');
  };

  const isUrgent = fp.isExpired;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isUrgent || !v) setOpen(v); }}>
      <DialogContent
        className="max-w-md z-[70]"
        // Si está en gracia (vencida), no se puede cerrar haciendo click fuera
        onInteractOutside={(e) => { if (isUrgent) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isUrgent) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className={`mx-auto mb-3 h-14 w-14 rounded-full flex items-center justify-center ${isUrgent ? 'bg-destructive/10' : 'bg-amber-100'}`}>
            {isUrgent
              ? <AlertTriangle className="h-7 w-7 text-destructive" />
              : <Clock className="h-7 w-7 text-amber-600" />}
          </div>
          <DialogTitle className="text-center text-xl">
            {isUrgent ? '¡Tu factura venció!' : 'Tienes una factura pendiente'}
          </DialogTitle>
          <DialogDescription className="text-center">
            Folio <strong>{fp.numeroFactura}</strong> por <strong>{fmtMoney(fp.total)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className={`rounded-lg p-4 text-center ${isUrgent ? 'bg-destructive/5 border border-destructive/20' : 'bg-amber-50 border border-amber-200'}`}>
          {isUrgent ? (
            <>
              <p className="text-sm text-destructive font-semibold mb-1">
                {fp.diasGraciaRestantes && fp.diasGraciaRestantes > 0
                  ? `Te quedan ${fp.diasGraciaRestantes} día${fp.diasGraciaRestantes !== 1 ? 's' : ''} de gracia`
                  : 'Tu acceso será suspendido'}
              </p>
              <p className="text-xs text-muted-foreground">
                Paga ahora para evitar la suspensión del servicio.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-amber-900 font-semibold mb-1">
                Tienes {fp.diasParaPagar} día{fp.diasParaPagar !== 1 ? 's' : ''} para pagar
              </p>
              <p className="text-xs text-muted-foreground">
                Después del vencimiento contarás con 3 días de gracia adicionales antes de la suspensión.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button onClick={handlePay} className="w-full" size="lg">
            <CreditCard className="h-4 w-4 mr-2" />
            Pagar ahora
          </Button>
          {!isUrgent && (
            <Button onClick={handleSnooze} variant="ghost" className="w-full">
              Recordarme más tarde
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
