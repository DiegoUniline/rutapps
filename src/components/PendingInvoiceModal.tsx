import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Clock, Loader2 } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface PendingFactura {
  id: string;
  numero_factura: string | null;
  total: number;
  num_usuarios: number;
  fecha_emision: string;
  fecha_vencimiento: string | null;
}

const SESSION_KEY = 'pending_invoice_modal_shown';

export default function PendingInvoiceModal() {
  const { user, empresa } = useAuth();
  const navigate = useNavigate();
  const [factura, setFactura] = useState<PendingFactura | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !empresa?.id) return;
    // Only show once per session
    if (sessionStorage.getItem(`${SESSION_KEY}:${empresa.id}`)) return;

    (async () => {
      const { data } = await supabase
        .from('facturas')
        .select('id, numero_factura, total, num_usuarios, fecha_emision, fecha_vencimiento')
        .eq('empresa_id', empresa.id)
        .eq('estado', 'pendiente')
        .order('fecha_emision', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setFactura(data as PendingFactura);
        setOpen(true);
        sessionStorage.setItem(`${SESSION_KEY}:${empresa.id}`, '1');
      }
    })();
  }, [user, empresa?.id]);

  const handlePay = async () => {
    if (!factura || !empresa?.id) return;
    setLoading(true);
    try {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('stripe_price_id')
        .eq('activo', true)
        .order('precio_por_usuario', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan?.stripe_price_id) throw new Error('No se encontró plan');

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: plan.stripe_price_id, quantity: factura.num_usuarios, empresa_id: empresa.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Sin URL de pago');
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || 'Error al generar pago');
      setLoading(false);
    }
  };

  if (!factura) return null;

  const diasRestantes = factura.fecha_vencimiento
    ? differenceInDays(new Date(factura.fecha_vencimiento), new Date())
    : 3;
  const vencida = diasRestantes < 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-2 ${vencida ? 'bg-destructive/15' : 'bg-amber-500/15'}`}>
            <AlertTriangle className={`h-7 w-7 ${vencida ? 'text-destructive' : 'text-amber-600'}`} />
          </div>
          <DialogTitle className="text-center text-xl">
            {vencida ? 'Factura vencida' : 'Tu factura está lista'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {vencida
              ? 'Tu factura está vencida. Realiza el pago para evitar la suspensión del servicio.'
              : `Se ha generado tu factura mensual. Tienes ${diasRestantes} día${diasRestantes === 1 ? '' : 's'} para pagarla.`}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          {factura.numero_factura && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Factura</span>
              <span className="font-mono font-semibold">{factura.numero_factura}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Usuarios</span>
            <span className="font-semibold">{factura.num_usuarios}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="font-semibold">Total a pagar</span>
            <span className="text-2xl font-black text-primary">
              ${factura.total.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
            </span>
          </div>
          {factura.fecha_vencimiento && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Clock className="h-3.5 w-3.5" />
              Vence: {format(new Date(factura.fecha_vencimiento), "d 'de' MMMM yyyy", { locale: es })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => { setOpen(false); navigate('/mi-suscripcion'); }}
            disabled={loading}
          >
            Ver detalles
          </Button>
          <Button onClick={handlePay} disabled={loading} className="gap-2 font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pagar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
