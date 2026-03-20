import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { CreditCard, Plus, Trash2, Users, Loader2, Store, Link2, Eye, EyeOff } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

// ─── OpenPay helpers ───
async function openpayAction(action: string, params: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('openpay', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data;
}

interface OpenPayPlan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  repeat_unit: string;
  repeat_every: number;
  trial_days: number;
  status: string;
  creation_date: string;
}

interface OpenPayCustomer {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  status: string;
  creation_date: string;
}

export default function AdminCobrosTab() {
  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" /> Cobros y Pasarelas de Pago
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="openpay_plans" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="openpay_plans">Planes OpenPay</TabsTrigger>
            <TabsTrigger value="openpay_customers">Clientes OpenPay</TabsTrigger>
            <TabsTrigger value="openpay_checkout">Cobro / Checkout</TabsTrigger>
          </TabsList>

          <TabsContent value="openpay_plans"><OpenPayPlansSection /></TabsContent>
          <TabsContent value="openpay_customers"><OpenPayCustomersSection /></TabsContent>
          <TabsContent value="openpay_checkout"><OpenPayCheckoutSection /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Plans Section ───
function OpenPayPlansSection() {
  const [plans, setPlans] = useState<OpenPayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', amount: '', repeat_unit: 'month', repeat_every: '1', trial_days: '0',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await openpayAction('list_plans');
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error('Error cargando planes: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.name || !form.amount) { toast.error('Nombre y monto son obligatorios'); return; }
    setSaving(true);
    try {
      await openpayAction('create_plan', {
        name: form.name,
        amount: parseFloat(form.amount),
        repeat_unit: form.repeat_unit,
        repeat_every: parseInt(form.repeat_every),
        trial_days: parseInt(form.trial_days),
      });
      toast.success('Plan creado');
      setShowCreate(false);
      setForm({ name: '', amount: '', repeat_unit: 'month', repeat_every: '1', trial_days: '0' });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(planId: string) {
    if (!confirm('¿Eliminar plan?')) return;
    try {
      await openpayAction('delete_plan', { plan_id: planId });
      toast.success('Plan eliminado');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const unitMap: Record<string, string> = { month: 'Mensual', week: 'Semanal', year: 'Anual' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Planes de suscripción configurados en OpenPay (Sandbox)</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo Plan
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : plans.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay planes creados aún.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead>Trial</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>${p.amount} {p.currency}</TableCell>
                <TableCell>{unitMap[p.repeat_unit] || p.repeat_unit} c/{p.repeat_every}</TableCell>
                <TableCell>{p.trial_days > 0 ? `${p.trial_days} días` : '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Plan OpenPay</DialogTitle>
            <DialogDescription>Este plan se creará en modo Sandbox</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre del plan</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Plan Mensual" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monto (MXN)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="99.99" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frecuencia</Label>
                <Select value={form.repeat_unit} onValueChange={v => setForm(f => ({ ...f, repeat_unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Semanal</SelectItem>
                    <SelectItem value="month">Mensual</SelectItem>
                    <SelectItem value="year">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Repetir cada</Label>
                <Input type="number" min="1" value={form.repeat_every} onChange={e => setForm(f => ({ ...f, repeat_every: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Días de prueba</Label>
                <Input type="number" min="0" value={form.trial_days} onChange={e => setForm(f => ({ ...f, trial_days: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Customers Section ───
function OpenPayCustomersSection() {
  const [customers, setCustomers] = useState<OpenPayCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await openpayAction('list_customers');
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.name || !form.email) { toast.error('Nombre y email son obligatorios'); return; }
    setSaving(true);
    try {
      await openpayAction('create_customer', { name: form.name, email: form.email, phone: form.phone || undefined });
      toast.success('Cliente creado en OpenPay');
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '' });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Clientes registrados en OpenPay (Sandbox)</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo Cliente
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : customers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay clientes en OpenPay.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.phone_number || '—'}</TableCell>
                <TableCell><Badge variant={c.status === 'active' ? 'default' : 'outline'}>{c.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Cliente OpenPay</DialogTitle>
            <DialogDescription>Registra un nuevo cliente para cobros</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono (opcional)</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="5512345678" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Checkout / Cobro Section ───
function OpenPayCheckoutSection() {
  const [mode, setMode] = useState<'stripe' | 'openpay'>('openpay');
  const [customers, setCustomers] = useState<OpenPayCustomer[]>([]);
  const [plans, setPlans] = useState<OpenPayPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Cobro form
  const [cobroForm, setCobroForm] = useState({
    customer_id: '',
    amount: '',
    description: '',
    plan_id: '',
    action_type: 'charge' as 'charge' | 'subscribe' | 'checkout_link',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [custs, pls] = await Promise.all([
        openpayAction('list_customers'),
        openpayAction('list_plans'),
      ]);
      setCustomers(Array.isArray(custs) ? custs : []);
      setPlans(Array.isArray(pls) ? pls : []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!cobroForm.customer_id && cobroForm.action_type !== 'checkout_link') {
      toast.error('Selecciona un cliente');
      return;
    }

    setActionLoading(true);
    try {
      if (mode === 'stripe') {
        // Stripe checkout via existing create-checkout function
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            amount: parseFloat(cobroForm.amount) * 100,
            description: cobroForm.description,
          },
        });
        if (error) throw error;
        if (data?.url) {
          window.open(data.url, '_blank');
          toast.success('Checkout de Stripe abierto');
        }
      } else {
        // OpenPay
        if (cobroForm.action_type === 'subscribe') {
          if (!cobroForm.plan_id) { toast.error('Selecciona un plan'); return; }
          // Need card — for now we'll show instructions
          toast.info('Para suscribir se necesita una tarjeta tokenizada del cliente. Usa el flujo de checkout.');
        } else if (cobroForm.action_type === 'checkout_link') {
          const result = await openpayAction('create_checkout', {
            customer_id: cobroForm.customer_id || undefined,
            amount: parseFloat(cobroForm.amount),
            description: cobroForm.description || 'Pago',
            redirect_url: window.location.origin + '/dashboard',
            order_id: `ORD-${Date.now()}`,
          });
          if (result?.payment_method?.reference) {
            toast.success('Link de pago generado');
            // Copy reference
            navigator.clipboard?.writeText(result.payment_method.reference);
            toast.info(`Referencia: ${result.payment_method.reference} (copiada)`);
          } else {
            toast.success('Cobro creado en OpenPay');
          }
        } else {
          // Direct charge — needs token
          toast.info('Para cobro directo con tarjeta, primero tokeniza la tarjeta del cliente desde el frontend con Openpay.js');
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Selecciona la pasarela de pago:</p>
        <div className="flex gap-2">
          <Button
            variant={mode === 'stripe' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('stripe')}
          >
            <CreditCard className="h-4 w-4 mr-1" /> Stripe
          </Button>
          <Button
            variant={mode === 'openpay' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('openpay')}
          >
            <Store className="h-4 w-4 mr-1" /> OpenPay
          </Button>
        </div>
        <Badge variant="secondary" className="ml-auto">Sandbox</Badge>
      </div>

      {mode === 'stripe' ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Usa Stripe para generar un checkout session. Se abrirá la página de pago de Stripe.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monto (MXN)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cobroForm.amount}
                  onChange={e => setCobroForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="499.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={cobroForm.description}
                  onChange={e => setCobroForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Suscripción mensual"
                />
              </div>
            </div>
            <Button onClick={handleAction} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Generar Checkout Stripe
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de acción</Label>
                  <Select value={cobroForm.action_type} onValueChange={v => setCobroForm(f => ({ ...f, action_type: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checkout_link">Generar link de pago (tienda/referencia)</SelectItem>
                      <SelectItem value="subscribe">Suscribir a plan</SelectItem>
                      <SelectItem value="charge">Cobro directo con tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cliente OpenPay</Label>
                  <Select value={cobroForm.customer_id} onValueChange={v => setCobroForm(f => ({ ...f, customer_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin cliente (anónimo)</SelectItem>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} — {c.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {cobroForm.action_type === 'subscribe' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Plan</Label>
                    <Select value={cobroForm.plan_id} onValueChange={v => setCobroForm(f => ({ ...f, plan_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — ${p.amount} MXN</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Monto (MXN)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cobroForm.amount}
                      onChange={e => setCobroForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="99.99"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descripción</Label>
                    <Input
                      value={cobroForm.description}
                      onChange={e => setCobroForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Pago de servicio"
                    />
                  </div>
                </div>

                <Button onClick={handleAction} disabled={actionLoading}>
                  {actionLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {cobroForm.action_type === 'checkout_link' ? 'Generar Link de Pago' :
                    cobroForm.action_type === 'subscribe' ? 'Crear Suscripción' : 'Realizar Cobro'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
