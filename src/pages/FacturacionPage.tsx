import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import SubscriptionCard from '@/components/SubscriptionCard';
import { Receipt, ExternalLink, Download, AlertTriangle, LogOut, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  due_date: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid: { label: 'Pagada', variant: 'default' },
  open: { label: 'Pendiente', variant: 'destructive' },
  draft: { label: 'Borrador', variant: 'secondary' },
  void: { label: 'Anulada', variant: 'outline' },
  uncollectible: { label: 'Incobrable', variant: 'outline' },
};

export default function FacturacionPage() {
  const { signOut, empresa } = useAuth();
  const subscription = useSubscription();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, [empresa?.id]);

  async function loadInvoices() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-invoices');
      if (error) throw error;
      setInvoices(data?.invoices || []);
    } catch (err) {
      console.error('Error loading invoices:', err);
    } finally {
      setLoading(false);
    }
  }

  const openInvoices = invoices.filter(i => i.status === 'open');
  const otherInvoices = invoices.filter(i => i.status !== 'open');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Facturación</h1>
              <p className="text-xs text-muted-foreground">{empresa?.nombre || 'Mi empresa'}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-1.5" />
            Salir
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Alert if blocked */}
        {subscription.isBlocked && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">Acceso suspendido</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tu suscripción ha vencido. Paga tu factura pendiente o contrata un plan para reactivar tu cuenta.
              </p>
            </div>
          </div>
        )}

        {/* Subscription Card — users, timbres, plan, days left, subscribe */}
        <SubscriptionCard />

        {/* Open invoices */}
        {openInvoices.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-destructive" />
                Facturas pendientes de pago
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {openInvoices.map(inv => (
                <InvoiceRow key={inv.id} invoice={inv} highlight />
              ))}
            </CardContent>
          </Card>
        )}

        {/* All invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial de facturas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay facturas aún.</p>
            ) : (
              <div className="space-y-2">
                {otherInvoices.map(inv => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
                {otherInvoices.length === 0 && openInvoices.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay facturas anteriores.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice, highlight }: { invoice: Invoice; highlight?: boolean }) {
  const statusInfo = STATUS_MAP[invoice.status] || { label: invoice.status, variant: 'outline' as const };
  const amount = (invoice.amount_due / 100).toLocaleString('es-MX', { style: 'currency', currency: invoice.currency.toUpperCase() });
  const date = format(new Date(invoice.created * 1000), "d MMM yyyy", { locale: es });

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${highlight ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{invoice.description}</span>
          <Badge variant={statusInfo.variant} className="text-[10px] shrink-0">{statusInfo.label}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>{invoice.number || '—'}</span>
          <span>{date}</span>
          <span className="font-semibold text-foreground">{amount}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-3">
        {invoice.status === 'open' && invoice.hosted_invoice_url && (
          <Button size="sm" asChild>
            <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
              Pagar
            </a>
          </Button>
        )}
        {invoice.hosted_invoice_url && invoice.status !== 'open' && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" title="Ver">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        {invoice.invoice_pdf && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={invoice.invoice_pdf} target="_blank" rel="noopener noreferrer" title="PDF">
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
