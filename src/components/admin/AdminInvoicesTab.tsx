import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import ModalSelect from '@/components/ModalSelect';
import { Receipt, Search, ExternalLink, Download, Plus, Send, Mail, MessageCircle, Building2, Users, Percent, FileText, Phone, Globe } from 'lucide-react';
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

const COUNTRY_CODES = [
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+1', flag: '🇺🇸', name: 'USA/Canadá' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
];

function detectCountryCode(phone: string): { lada: string; number: string } {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  for (const cc of COUNTRY_CODES) {
    if (clean.startsWith(cc.code)) {
      return { lada: cc.code, number: clean.slice(cc.code.length) };
    }
  }
  // Default to MX if starts with digit
  if (clean.startsWith('52')) return { lada: '+52', number: clean.slice(2) };
  return { lada: '+52', number: clean.replace(/^\+/, '') };
}

export default function AdminInvoicesTab() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // Profiles cache: empresa_id -> { email, telefono, nombre }
  const [profilesMap, setProfilesMap] = useState<Record<string, { email: string; telefono: string; nombre: string }>>({});

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
    // Contact info
    correo: '',
    lada: '+52',
    telefono: '',
    enviar_email: true,
    enviar_whatsapp: true,
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [invoiceRes, empresasRes, plansRes, profilesRes] = await Promise.all([
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
      supabase.from('profiles').select('empresa_id, nombre, telefono, user_id'),
    ]);
    setInvoices(invoiceRes.invoices || []);
    setEmpresas((empresasRes.data || []) as EmpresaOption[]);
    const dbPlans = (plansRes.data || []) as PlanOption[];
    setPlans(dbPlans.length > 0 ? dbPlans : PLANES_PREDEFINIDOS);

    // Build profiles map (first profile per empresa)
    const pm: Record<string, { email: string; telefono: string; nombre: string }> = {};
    for (const p of (profilesRes.data || []) as any[]) {
      if (!pm[p.empresa_id]) {
        pm[p.empresa_id] = { email: '', telefono: p.telefono || '', nombre: p.nombre || '' };
      }
    }
    // Get emails from empresas directly
    for (const e of (empresasRes.data || []) as EmpresaOption[]) {
      if (pm[e.id]) {
        pm[e.id].email = e.email || '';
        if (!pm[e.id].telefono && e.telefono) pm[e.id].telefono = e.telefono;
      } else {
        pm[e.id] = { email: e.email || '', telefono: e.telefono || '', nombre: e.nombre };
      }
    }
    setProfilesMap(pm);
    setLoading(false);
  }

  // When empresa changes, auto-fill contact
  function handleEmpresaChange(empresaId: string) {
    const profile = profilesMap[empresaId];
    const empresa = empresas.find(e => e.id === empresaId);
    const tel = profile?.telefono || empresa?.telefono || '';
    const email = profile?.email || empresa?.email || '';
    const detected = tel ? detectCountryCode(tel) : { lada: '+52', number: '' };

    setForm(f => ({
      ...f,
      empresa_id: empresaId,
      correo: email,
      lada: detected.lada,
      telefono: detected.number,
    }));
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
    if (form.enviar_email && !form.correo) { toast.error('Ingresa un correo para enviar'); return; }
    if (form.enviar_whatsapp && !form.telefono) { toast.error('Ingresa un teléfono para WhatsApp'); return; }
    setCreating(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const items: { description: string; amount: number }[] = [];
      const subDesc = `Suscripción ${selectedPlan.nombre} — ${form.num_usuarios} usuario${form.num_usuarios > 1 ? 's' : ''} × ${fmtMXN(selectedPlan.precio_por_usuario)}/usr${selectedPlan.meses > 1 ? ` × ${selectedPlan.meses} meses` : ''}`;
      items.push({ description: subDesc, amount: Math.round((subtotalUsuarios - descuentoPlan) * 100) });

      if (form.timbres > 0) {
        items.push({
          description: `${form.timbres} timbres CFDI × ${fmtMXN(form.precio_timbre)}/timbre`,
          amount: Math.round(subtotalTimbres * 100),
        });
      }
      if (descuentoExtra > 0) {
        items.push({
          description: `Descuento adicional (${form.descuento_extra_pct}%)`,
          amount: -Math.round(descuentoExtra * 100),
        });
      }

      const concepto = form.concepto || `Suscripción Rutapp ${selectedPlan.nombre} — ${selectedEmpresa?.nombre || ''}`;
      const fullPhone = form.telefono ? `${form.lada}${form.telefono.replace(/\D/g, '')}` : '';

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
            empresa_email: form.correo,
            empresa_telefono: fullPhone,
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
            enviar_email: form.enviar_email,
            enviar_whatsapp: form.enviar_whatsapp,
            telefono_envio: fullPhone,
            correo_envio: form.correo,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const channels: string[] = [];
      if (form.enviar_email) channels.push('correo');
      if (form.enviar_whatsapp) channels.push('WhatsApp');
      toast.success(`Factura creada y enviada por ${channels.join(' y ')}`);
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
    setForm({ empresa_id: '', plan_id: 'mensual', num_usuarios: 3, timbres: 0, precio_timbre: 1, descuento_extra_pct: 0, dias_pagar: 3, mensaje_personal: '', concepto: '', correo: '', lada: '+52', telefono: '', enviar_email: true, enviar_whatsapp: true });
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

  const empresaOptions = empresas.map(e => ({ value: e.id, label: `${e.nombre}${e.email ? ` (${e.email})` : ''}` }));
  const planOptions = plans.map(p => ({
    value: p.id,
    label: `${p.nombre} — ${fmtMXN(p.precio_por_usuario)}/usr${p.descuento_pct > 0 ? ` (${p.descuento_pct}% desc.)` : ''}`,
  }));
  const ladaOptions = COUNTRY_CODES.map(c => ({ value: c.code, label: `${c.flag} ${c.code} ${c.name}` }));

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
              <ModalSelect
                options={empresaOptions}
                value={form.empresa_id}
                onChange={handleEmpresaChange}
                placeholder="Buscar empresa..."
              />
            </div>

            {/* Contact info - auto filled, editable */}
            {form.empresa_id && (
              <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-accent/30">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Datos de envío
                </h4>
                {/* Email */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enviar_email"
                      checked={form.enviar_email}
                      onCheckedChange={v => setForm(f => ({ ...f, enviar_email: !!v }))}
                    />
                    <Label htmlFor="enviar_email" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <Mail className="h-3.5 w-3.5" /> Enviar por correo
                    </Label>
                  </div>
                  {form.enviar_email && (
                    <Input
                      type="email"
                      placeholder="correo@empresa.com"
                      value={form.correo}
                      onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                      className="mt-1"
                    />
                  )}
                </div>
                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="enviar_whatsapp"
                      checked={form.enviar_whatsapp}
                      onCheckedChange={v => setForm(f => ({ ...f, enviar_whatsapp: !!v }))}
                    />
                    <Label htmlFor="enviar_whatsapp" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
                    </Label>
                  </div>
                  {form.enviar_whatsapp && (
                    <div className="flex gap-2 mt-1">
                      <div className="w-[180px] shrink-0">
                        <ModalSelect
                          options={ladaOptions}
                          value={form.lada}
                          onChange={v => setForm(f => ({ ...f, lada: v }))}
                          placeholder="Lada..."
                        />
                      </div>
                      <Input
                        type="tel"
                        placeholder="55 1234 5678"
                        value={form.telefono}
                        onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Plan + usuarios */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan</Label>
                <ModalSelect
                  options={planOptions}
                  value={form.plan_id}
                  onChange={v => setForm(f => ({ ...f, plan_id: v }))}
                  placeholder="Seleccionar plan..."
                />
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

              {/* Send summary */}
              {(form.enviar_email || form.enviar_whatsapp) && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Se enviará por:</p>
                  {form.enviar_email && form.correo && (
                    <p className="text-xs flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-primary" /> {form.correo}
                    </p>
                  )}
                  {form.enviar_whatsapp && form.telefono && (
                    <p className="text-xs flex items-center gap-1.5">
                      <MessageCircle className="h-3 w-3 text-primary" /> {form.lada} {form.telefono}
                    </p>
                  )}
                </div>
              )}
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
