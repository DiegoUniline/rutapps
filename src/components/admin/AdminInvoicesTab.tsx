import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Receipt, Search, ExternalLink, Download, Plus, Send, Mail, MessageCircle, Building2, Users, Percent, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminInvoice {
  id: string; number: string | null; status: string; amount_due: number; amount_paid: number;
  currency: string; created: number; due_date: number | null;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
  customer_email: string | null; description: string;
}

interface EmpresaOption {
  id: string; nombre: string; email: string | null; telefono: string | null;
  rfc: string | null; logo_url: string | null;
}

interface PlanOption {
  id: string; nombre: string; precio_por_usuario: number; periodo: string;
  descuento_pct: number; meses: number;
}

const PLANES_PREDEFINIDOS = [
  { id: 'mensual', nombre: 'Mensual', precio_por_usuario: 300, periodo: 'mensual', descuento_pct: 0, meses: 1 },
  { id: 'semestral', nombre: 'Semestral', precio_por_usuario: 300, periodo: 'semestral', descuento_pct: 10, meses: 6 },
  { id: 'anual', nombre: 'Anual', precio_por_usuario: 300, periodo: 'anual', descuento_pct: 20, meses: 12 },
];

export default function AdminInvoicesTab() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Empresas
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // Create form
  const [form, setForm] = useState({
    empresa_id: '',
    plan_id: 'mensual',
    num_usuarios: 3,
    timbres: 0,
    precio_timbre: 1,
    descuento_extra_pct: 0,
    dias_pagar: 3,
    mensaje_personal: '',
    concepto: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [invoiceRes, empresasRes, plansRes] = await Promise.all([
      (async () => {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices`,
            { headers: { 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
          );
          return await res.json();
        } catch { return { invoices: [] }; }
      })(),
      supabase.from('empresas').select('id, nombre, email, telefono, rfc, logo_url'),
      supabase.from('subscription_plans').select('id, nombre, precio_por_usuario, periodo, descuento_pct, meses').eq('activo', true),
    ]);
    setInvoices(invoiceRes.invoices || []);
    setEmpresas((empresasRes.data || []) as EmpresaOption[]);
    const dbPlans = (plansRes.data || []) as PlanOption[];
    setPlans(dbPlans.length > 0 ? dbPlans : PLANES_PREDEFINIDOS);
    setLoading(false);
  }

  // Calculated values
  const selectedPlan = plans.find(p => p.id === form.plan_id) || PLANES_PREDEFINIDOS[0];
  const selectedEmpresa = empresas.find(e => e.id === form.empresa_id);
  const subtotalUsuarios = selectedPlan.precio_por_usuario * form.num_usuarios * (selectedPlan.meses || 1);
  const descuentoPlan = subtotalUsuarios * (selectedPlan.descuento_pct / 100);
  const subtotalTimbres = form.timbres * form.precio_timbre;
  const subtotal = subtotalUsuarios - descuentoPlan + subtotalTimbres;
  const descuentoExtra = subtotal * (form.descuento_extra_pct / 100);
  const total = subtotal - descuentoExtra;

  const fmtMXN = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function handleCreateInvoice() {
    if (!form.empresa_id) { toast.error('Selecciona una empresa'); return; }
    if (form.num_usuarios < 1) { toast.error('Mínimo 1 usuario'); return; }
    setCreating(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      // Build line items
      const items: { description: string; amount: number }[] = [];

      // Suscripción
      const subDesc = `Suscripción ${selectedPlan.nombre} — ${form.num_usuarios} usuario${form.num_usuarios > 1 ? 's' : ''} × ${fmtMXN(selectedPlan.precio_por_usuario)}/usr${selectedPlan.meses > 1 ? ` × ${selectedPlan.meses} meses` : ''}`;
      items.push({ description: subDesc, amount: Math.round((subtotalUsuarios - descuentoPlan) * 100) });

      // Timbres
      if (form.timbres > 0) {
        items.push({
          description: `${form.timbres} timbres CFDI × ${fmtMXN(form.precio_timbre)}/timbre`,
          amount: Math.round(subtotalTimbres * 100),
        });
      }

      // Descuento extra como item negativo
      if (descuentoExtra > 0) {
        items.push({
          description: `Descuento adicional (${form.descuento_extra_pct}%)`,
          amount: -Math.round(descuentoExtra * 100),
        });
      }

      const concepto = form.concepto || `Suscripción Rutapp ${selectedPlan.nombre} — ${selectedEmpresa?.nombre || ''}`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=create_pro_invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            empresa_id: form.empresa_id,
            empresa_nombre: selectedEmpresa?.nombre || '',
            empresa_email: selectedEmpresa?.email || '',
            empresa_telefono: selectedEmpresa?.telefono || '',
            empresa_rfc: selectedEmpresa?.rfc || '',
            items,
            concepto,
            days_until_due: form.dias_pagar,
            plan_nombre: selectedPlan.nombre,
            num_usuarios: form.num_usuarios,
            timbres: form.timbres,
            descuento_plan_pct: selectedPlan.descuento_pct,
            descuento_extra_pct: form.descuento_extra_pct,
            total_centavos: Math.round(total * 100),
            mensaje_personal: form.mensaje_personal,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Factura creada exitosamente');
      setShowCreate(false);
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear factura');
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setForm({ empresa_id: '', plan_id: 'mensual', num_usuarios: 3, timbres: 0, precio_timbre: 1, descuento_extra_pct: 0, dias_pagar: 3, mensaje_personal: '', concepto: '' });
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
      toast.success(`Enviada por ${channel === 'whatsapp' ? 'WhatsApp' : 'correo'}`);
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
                <Plus className="h-4 w-4 mr-1.5" /> Nueva factura
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
                    <TableCell className="font-medium">{fmtMXN(inv.amount_due / 100)}</TableCell>
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

      {/* Create invoice dialog */}
      <Dialog open={showCreate} onOpenChange={v => { if (!v) resetForm(); setShowCreate(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Nueva factura profesional
            </DialogTitle>
            <DialogDescription>Selecciona la empresa, plan y usuarios para generar la factura automáticamente.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Empresa selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Empresa</Label>
              <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-medium">{e.nombre}</span>
                      {e.email && <span className="text-muted-foreground ml-2 text-xs">({e.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Plan + usuarios */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.plan_id} onValueChange={v => setForm(f => ({ ...f, plan_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} — {fmtMXN(p.precio_por_usuario)}/usr
                        {p.descuento_pct > 0 && ` (${p.descuento_pct}% desc.)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Usuarios</Label>
                <Input type="number" min={1} max={100} value={form.num_usuarios}
                  onChange={e => setForm(f => ({ ...f, num_usuarios: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
            </div>

            {/* Timbres */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Timbres CFDI</Label>
                <Input type="number" min={0} value={form.timbres}
                  onChange={e => setForm(f => ({ ...f, timbres: Math.max(0, parseInt(e.target.value) || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Precio por timbre (MXN)</Label>
                <Input type="number" min={0} step={0.5} value={form.precio_timbre}
                  onChange={e => setForm(f => ({ ...f, precio_timbre: Math.max(0, parseFloat(e.target.value) || 0) }))} />
              </div>
            </div>

            {/* Descuento extra + días */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Descuento extra (%)</Label>
                <Input type="number" min={0} max={100} value={form.descuento_extra_pct}
                  onChange={e => setForm(f => ({ ...f, descuento_extra_pct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
              </div>
              <div className="space-y-2">
                <Label>Días para pagar</Label>
                <Input type="number" min={1} value={form.dias_pagar}
                  onChange={e => setForm(f => ({ ...f, dias_pagar: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
            </div>

            {/* Concepto personalizado */}
            <div className="space-y-2">
              <Label>Concepto (opcional)</Label>
              <Input placeholder={`Suscripción Rutapp ${selectedPlan?.nombre || ''}`} value={form.concepto}
                onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} />
            </div>

            {/* Mensaje personal */}
            <div className="space-y-2">
              <Label>Mensaje personal para el email (opcional)</Label>
              <Textarea placeholder="Ej: Gracias por confiar en nosotros..." rows={2} value={form.mensaje_personal}
                onChange={e => setForm(f => ({ ...f, mensaje_personal: e.target.value }))} />
            </div>

            <Separator />

            {/* Resumen de cobro */}
            <div className="bg-accent/50 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-sm text-foreground">Resumen de cobro</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {form.num_usuarios} usuario{form.num_usuarios > 1 ? 's' : ''} × {fmtMXN(selectedPlan.precio_por_usuario)}
                    {selectedPlan.meses > 1 && ` × ${selectedPlan.meses} meses`}
                  </span>
                  <span>{fmtMXN(subtotalUsuarios)}</span>
                </div>
                {descuentoPlan > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descuento plan {selectedPlan.descuento_pct}%</span>
                    <span>-{fmtMXN(descuentoPlan)}</span>
                  </div>
                )}
                {form.timbres > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{form.timbres} timbres × {fmtMXN(form.precio_timbre)}</span>
                    <span>{fmtMXN(subtotalTimbres)}</span>
                  </div>
                )}
                {descuentoExtra > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descuento extra {form.descuento_extra_pct}%</span>
                    <span>-{fmtMXN(descuentoExtra)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary">{fmtMXN(total)} MXN</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowCreate(false); }}>Cancelar</Button>
              <Button disabled={creating || !form.empresa_id} onClick={handleCreateInvoice}>
                <Send className="h-4 w-4 mr-1.5" />
                {creating ? 'Creando...' : 'Crear y enviar factura'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
