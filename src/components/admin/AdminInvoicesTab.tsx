import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Receipt, Search, ExternalLink, Download, Plus, Send, Mail, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminInvoice {
  id: string; number: string | null; status: string; amount_due: number; amount_paid: number;
  currency: string; created: number; due_date: number | null;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
  customer_email: string | null; description: string;
}

export default function AdminInvoicesTab() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ email: '', amount: '', description: 'Suscripción Rutapp', days_due: '1' });
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInvoice() {
    if (!newInvoice.email || !newInvoice.amount) {
      toast.error('Email y monto son requeridos');
      return;
    }
    setCreating(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=create_invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: newInvoice.email,
            amount: Math.round(parseFloat(newInvoice.amount) * 100),
            description: newInvoice.description,
            days_until_due: parseInt(newInvoice.days_due) || 1,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Factura creada y enviada');
      setShowCreate(false);
      setNewInvoice({ email: '', amount: '', description: 'Suscripción Rutapp', days_due: '1' });
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear factura');
    } finally {
      setCreating(false);
    }
  }

  async function sendInvoiceNotification(inv: AdminInvoice, channel: 'email' | 'whatsapp') {
    setSendingId(inv.id);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=send_invoice_notification`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: inv.id,
            channel,
            customer_email: inv.customer_email,
            amount: inv.amount_due,
            hosted_url: inv.hosted_invoice_url,
            description: inv.description,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Notificación enviada por ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar');
    } finally {
      setSendingId(null);
    }
  }

  const statusBadge = (s: string) => {
    const m: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      paid: { l: 'Pagada', v: 'default' }, open: { l: 'Pendiente', v: 'destructive' },
      draft: { l: 'Borrador', v: 'secondary' }, void: { l: 'Anulada', v: 'outline' },
    };
    const i = m[s] || { l: s, v: 'outline' as const };
    return <Badge variant={i.v}>{i.l}</Badge>;
  };

  const filtered = invoices.filter(i =>
    (i.customer_email || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Facturas ({invoices.length})
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
              </div>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Crear factura
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando facturas...</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-32">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin facturas</TableCell></TableRow>
                ) : filtered.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm">{inv.customer_email || '—'}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px] text-muted-foreground">{inv.description}</TableCell>
                    <TableCell>{statusBadge(inv.status || 'draft')}</TableCell>
                    <TableCell className="font-medium">${(inv.amount_due / 100).toLocaleString('es-MX')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created * 1000), 'dd MMM yy', { locale: es })}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {inv.status === 'open' && (
                          <>
                            <Button size="sm" variant="ghost" disabled={sendingId === inv.id} onClick={() => sendInvoiceNotification(inv, 'whatsapp')} title="Enviar por WhatsApp">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={sendingId === inv.id} onClick={() => sendInvoiceNotification(inv, 'email')} title="Enviar por correo">
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {inv.hosted_invoice_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                        {inv.invoice_pdf && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear factura manualmente</DialogTitle>
            <DialogDescription>Se creará en Stripe y se enviará al cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Email del cliente</label>
              <Input placeholder="cliente@email.com" value={newInvoice.email}
                onChange={e => setNewInvoice(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Monto (MXN)</label>
              <Input type="number" placeholder="900" value={newInvoice.amount}
                onChange={e => setNewInvoice(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Input value={newInvoice.description}
                onChange={e => setNewInvoice(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Días para pagar</label>
              <Input type="number" min={1} value={newInvoice.days_due}
                onChange={e => setNewInvoice(f => ({ ...f, days_due: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button disabled={creating} onClick={handleCreateInvoice}>
                <Send className="h-4 w-4 mr-1.5" />
                {creating ? 'Creando...' : 'Crear y enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
