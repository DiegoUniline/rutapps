import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** Link corto de pago: /pagar/in_... redirige a la página de pago de la factura de Stripe. */
export default function PagarPage() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    if (!/^in_[A-Za-z0-9]+$/.test(token)) {
      setError('Este enlace de pago no existe, ha expirado o ya fue utilizado.');
      return;
    }
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('get-stripe-invoice-url', {
          body: { invoice_id: token },
        });
        if (fnErr || data?.error) throw new Error(data?.error || fnErr?.message || 'Factura no encontrada');
        if (!data?.hosted_invoice_url) throw new Error('Esta factura no tiene página de pago disponible');
        window.location.replace(data.hosted_invoice_url);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [token]);

  if (!error && token) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-lg border border-border p-8 max-w-md w-full text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Enlace no válido</h1>
        <p className="text-muted-foreground text-sm">{error || 'Este enlace de pago no existe, ha expirado o ya fue utilizado.'}</p>
      </div>
    </div>
  );
}
