import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Bell, Search, RotateCcw, MessageCircle, Mail, ExternalLink, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotificationRow {
  id: string;
  customer_email: string;
  customer_phone: string | null;
  channel: string;
  tipo: string;
  mensaje: string | null;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  monto_centavos: number;
  status: string;
  error_detalle: string | null;
  created_at: string;
}

export default function AdminNotificationsTab() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [viewMsg, setViewMsg] = useState<NotificationRow | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('billing_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setNotifications((data as any) || []);
    setLoading(false);
  }

  async function resend(notif: NotificationRow) {
    setResendingId(notif.id);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=resend_notification`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            original_id: notif.id,
            channel: notif.channel,
            customer_email: notif.customer_email,
            customer_phone: notif.customer_phone,
            mensaje: notif.mensaje,
            stripe_invoice_id: notif.stripe_invoice_id,
            stripe_invoice_url: notif.stripe_invoice_url,
            monto_centavos: notif.monto_centavos,
            tipo: notif.tipo,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Notificación reenviada');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al reenviar');
    } finally {
      setResendingId(null);
    }
  }

  const channelBadge = (ch: string) => (
    <Badge variant="outline" className={ch === 'whatsapp' ? 'text-success border-success/30 bg-success/5' : 'text-primary border-primary/30 bg-primary/5'}>
      {ch === 'whatsapp' ? <MessageCircle className="h-3 w-3 mr-1" /> : <Mail className="h-3 w-3 mr-1" />}
      {ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
    </Badge>
  );

  const tipoBadge = (t: string) => {
    const m: Record<string, string> = {
      pre_cobro: '🔔 Pre-cobro', cobro_exitoso: '✅ Cobro OK', cobro_fallido: '⚠️ Cobro fallido',
      suspension: '🔴 Suspensión', factura: '📋 Factura', recordatorio: '🔔 Recordatorio', prueba: '🧪 Prueba',
    };
    return <span className="text-xs">{m[t] || t}</span>;
  };

  const statusBadge = (s: string) => (
    <Badge variant={s === 'sent' ? 'default' : 'destructive'}>{s === 'sent' ? 'Enviado' : 'Error'}</Badge>
  );

  const filtered = notifications.filter(n =>
    n.customer_email.toLowerCase().includes(search.toLowerCase()) ||
    (n.customer_phone || '').includes(search)
  );

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> Historial de notificaciones ({notifications.length})
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por email o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
              </div>
              <Button size="sm" variant="outline" onClick={load}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando historial...</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin notificaciones enviadas</TableCell></TableRow>
                ) : filtered.map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(n.created_at), 'dd MMM yy HH:mm', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{n.customer_email}</div>
                      {n.customer_phone && <div className="text-xs text-muted-foreground">{n.customer_phone}</div>}
                    </TableCell>
                    <TableCell>{channelBadge(n.channel)}</TableCell>
                    <TableCell>{tipoBadge(n.tipo)}</TableCell>
                    <TableCell className="font-medium">
                      {n.monto_centavos ? `$${(n.monto_centavos / 100).toLocaleString('es-MX')}` : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(n.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewMsg(n)} title="Ver mensaje">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={resendingId === n.id} onClick={() => resend(n)} title="Reenviar">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        {n.stripe_invoice_url && (
                          <Button size="sm" variant="ghost" asChild title="Ver factura">
                            <a href={n.stripe_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
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

      <Dialog open={!!viewMsg} onOpenChange={open => !open && setViewMsg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensaje enviado</DialogTitle>
          </DialogHeader>
          {viewMsg && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Para:</span> {viewMsg.customer_email}</div>
                <div>{channelBadge(viewMsg.channel)}</div>
                <div>{statusBadge(viewMsg.status)}</div>
              </div>
              {viewMsg.stripe_invoice_url && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Enlace de pago: </span>
                  <a href={viewMsg.stripe_invoice_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{viewMsg.stripe_invoice_url}</a>
                </div>
              )}
              <div className="rounded-lg bg-accent/50 p-4 text-sm whitespace-pre-wrap font-mono">
                {viewMsg.mensaje || 'Sin contenido de mensaje'}
              </div>
              {viewMsg.error_detalle && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <strong>Error:</strong> {viewMsg.error_detalle}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewMsg(null)}>Cerrar</Button>
                <Button disabled={resendingId === viewMsg.id} onClick={() => { resend(viewMsg); setViewMsg(null); }}>
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Reenviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
