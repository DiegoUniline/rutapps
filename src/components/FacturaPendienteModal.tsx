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
    if (location.pathname.startsWith('/mi-suscripcion')) return;
    if (location.pathname.startsWith('/suscripcion-bloqueada')) return;
    if (location.pathname.startsWith('/ruta')) return;

    // Si ya venció (bloqueo), siempre mostrar y no permitir cerrar
    if (fp.shouldBlock) {
      setOpen(true);
      return;
    }

    // Aún en periodo de gracia → respetar snooze
    try {
      const raw = localStorage.getItem(`${SNOOZE_KEY}:${fp.facturaId}`);
      if (raw) {
        const until = parseInt(raw, 10);
        if (Date.now() < until) return;
      }
    } catch {}
    setOpen(true);
  }, [fp.hasPendiente, fp.loading, fp.facturaId, fp.shouldBlock, location.pathname]);

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

  const isBlocked = fp.shouldBlock;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isBlocked || !v) setOpen(v); }}>
      <DialogContent
        className="max-w-md z-[70]"
        onInteractOutside={(e) => { if (isBlocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isBlocked) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className={`mx-auto mb-3 h-14 w-14 rounded-full flex items-center justify-center ${isBlocked ? 'bg-destructive/10' : 'bg-amber-100'}`}>
            {isBlocked
              ? <AlertTriangle className="h-7 w-7 text-destructive" />
              : <Clock className="h-7 w-7 text-amber-600" />}
          </div>
          <DialogTitle className="text-center text-xl">
            {isBlocked ? 'Acceso suspendido' : 'Tienes una factura pendiente'}
          </DialogTitle>
          <DialogDescription className="text-center">
            Folio <strong>{fp.numeroFactura}</strong> por <strong>{fmtMoney(fp.total)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className={`rounded-lg p-4 text-center ${isBlocked ? 'bg-destructive/5 border border-destructive/20' : 'bg-amber-50 border border-amber-200'}`}>
          {isBlocked ? (
            <>
              <p className="text-sm text-destructive font-semibold mb-1">
                Tu factura venció. El acceso al sistema está bloqueado.
              </p>
              <p className="text-xs text-muted-foreground">
                Paga ahora para reactivar tu cuenta inmediatamente.
              </p>
            </>
          ) : fp.diasRestantes === 0 ? (
            <>
              <p className="text-sm text-amber-900 font-semibold mb-1">
                ¡Hoy vence tu factura!
              </p>
              <p className="text-xs text-muted-foreground">
                Si no pagas hoy, mañana se suspenderá tu acceso al sistema.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-amber-900 font-semibold mb-1">
                Te queda{fp.diasRestantes !== 1 ? 'n' : ''} {fp.diasRestantes} día{fp.diasRestantes !== 1 ? 's' : ''} para pagar
              </p>
              <p className="text-xs text-muted-foreground">
                Si no pagas antes del vencimiento, tu acceso al sistema se suspenderá.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button onClick={handlePay} className="w-full" size="lg">
            <CreditCard className="h-4 w-4 mr-2" />
            Pagar ahora
          </Button>
          {!isBlocked && (
            <Button onClick={handleSnooze} variant="ghost" className="w-full">
              Recordarme más tarde
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
