import { useState, useEffect, useMemo } from 'react';
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
import { CreditCard, Plus, Trash2, Loader2, Store, Building2, Search, CheckCircle, AlertCircle, MessageSquare, Mail, Copy, Send } from 'lucide-react';

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
  id: string; name: string; amount: number; currency: string;
  repeat_unit: string; repeat_every: number; trial_days: number;
  status: string; creation_date: string;
}
interface OpenPayCustomer {
  id: string; name: string; email: string; phone_number: string | null;
  status: string; creation_date: string;
}
interface EmpresaRow {
  id: string; nombre: string; email: string; telefono: string;
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
        <Tabs defaultValue="suscribir" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="suscribir">Suscribir Empresa</TabsTrigger>
            <TabsTrigger value="planes">Planes OpenPay</TabsTrigger>
            <TabsTrigger value="clientes">Clientes OpenPay</TabsTrigger>
          </TabsList>
          <TabsContent value="suscribir"><SuscribirEmpresaSection /></TabsContent>
          <TabsContent value="planes"><OpenPayPlansSection /></TabsContent>
          <TabsContent value="clientes"><OpenPayCustomersSection /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Main: Suscribir Empresa ───
function SuscribirEmpresaSection() {
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [opCustomers, setOpCustomers] = useState<OpenPayCustomer[]>([]);
  const [plans, setPlans] = useState<OpenPayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Selected empresa
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaRow | null>(null);
  // Editable fields for OpenPay customer creation
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custName, setCustName] = useState('');
  // Selected plan
  const [selectedPlanId, setSelectedPlanId] = useState('');
  // Pasarela
  const [pasarela, setPasarela] = useState<'openpay' | 'stripe'>('openpay');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [empRes, custRes, plansRes] = await Promise.all([
        supabase.from('empresas').select('id, nombre, email, telefono'),
        openpayAction('list_customers'),
        openpayAction('list_plans'),
      ]);
      setEmpresas((empRes.data || []) as EmpresaRow[]);
      setOpCustomers(Array.isArray(custRes) ? custRes : []);
      setPlans(Array.isArray(plansRes) ? plansRes : []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Check if empresa already exists as OpenPay customer (by email match)
  const matchedCustomer = useMemo(() => {
    if (!selectedEmpresa) return null;
    return opCustomers.find(c =>
      c.email.toLowerCase() === custEmail.toLowerCase() ||
      c.name.toLowerCase() === selectedEmpresa.nombre.toLowerCase()
    ) || null;
  }, [selectedEmpresa, opCustomers, custEmail]);

  function handleSelectEmpresa(emp: EmpresaRow) {
    setSelectedEmpresa(emp);
    setCustEmail(emp.email || '');
    setCustPhone(emp.telefono || '');
    setCustName(emp.nombre || '');
    setSelectedPlanId('');
  }

  const filtered = empresas.filter(e =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSuscribir() {
    if (!selectedEmpresa) return;
    if (!selectedPlanId) { toast.error('Selecciona un plan'); return; }
    if (!custEmail) { toast.error('El email es obligatorio'); return; }

    setActionLoading(true);
    try {
      if (pasarela === 'openpay') {
        // 1. Find or create customer in OpenPay
        let customerId = matchedCustomer?.id;

        if (!customerId) {
          const newCust = await openpayAction('create_customer', {
            name: custName,
            email: custEmail,
            phone: custPhone || undefined,
          });
          customerId = newCust.id;
          toast.success('Cliente creado en OpenPay: ' + custName);
        }

        // 2. Create a store-type charge (generates payment reference)
        const selectedPlan = plans.find(p => p.id === selectedPlanId);
        if (!selectedPlan) throw new Error('Plan no encontrado');

        const result = await openpayAction('create_checkout', {
          customer_id: customerId,
          amount: selectedPlan.amount,
          description: `Suscripción: ${selectedPlan.name} — ${selectedEmpresa.nombre}`,
          redirect_url: window.location.origin + '/dashboard',
          order_id: `SUB-${selectedEmpresa.id.slice(0, 8)}-${Date.now()}`,
        });

        if (result?.payment_method?.reference) {
          toast.success(`Referencia de pago generada: ${result.payment_method.reference}`);
          navigator.clipboard?.writeText(result.payment_method.reference);
        } else if (result?.payment_method?.url) {
          window.open(result.payment_method.url, '_blank');
          toast.success('Link de pago abierto');
        } else {
          toast.success('Cobro creado exitosamente en OpenPay');
        }

        // Refresh customers
        const freshCustomers = await openpayAction('list_customers');
        setOpCustomers(Array.isArray(freshCustomers) ? freshCustomers : []);
      } else {
        // Stripe checkout
        const selectedPlan = plans.find(p => p.id === selectedPlanId);
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            amount: selectedPlan ? selectedPlan.amount * 100 : 0,
            description: `Suscripción — ${selectedEmpresa.nombre}`,
          },
        });
        if (error) throw error;
        if (data?.url) {
          window.open(data.url, '_blank');
          toast.success('Checkout de Stripe abierto');
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  const unitMap: Record<string, string> = { month: 'Mensual', week: 'Semanal', year: 'Anual' };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Pasarela selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Pasarela:</Label>
        <div className="flex gap-2">
          <Button variant={pasarela === 'openpay' ? 'default' : 'outline'} size="sm" onClick={() => setPasarela('openpay')}>
            <Store className="h-4 w-4 mr-1" /> OpenPay
          </Button>
          <Button variant={pasarela === 'stripe' ? 'default' : 'outline'} size="sm" onClick={() => setPasarela('stripe')}>
            <CreditCard className="h-4 w-4 mr-1" /> Stripe
          </Button>
        </div>
        <Badge variant="secondary" className="ml-auto">Sandbox</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Select Empresa */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" /> 1. Seleccionar Empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmpresa(emp)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedEmpresa?.id === emp.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <p className="text-sm font-medium">{emp.nombre}</p>
                  <p className="text-xs text-muted-foreground">{emp.email || 'Sin email'} · {emp.telefono || 'Sin tel.'}</p>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No se encontraron empresas</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Configure & Subscribe */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> 2. Configurar y Cobrar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedEmpresa ? (
              <p className="text-sm text-muted-foreground text-center py-8">← Selecciona una empresa para continuar</p>
            ) : (
              <>
                {/* Customer status */}
                {matchedCustomer ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Cliente existente en OpenPay</p>
                      <p className="text-xs text-muted-foreground">ID: {matchedCustomer.id}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Se creará como nuevo cliente en OpenPay</p>
                  </div>
                )}

                {/* Editable customer data */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre (OpenPay)</Label>
                    <Input value={custName} onChange={e => setCustName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Email *</Label>
                      <Input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono</Label>
                      <Input value={custPhone} onChange={e => setCustPhone(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Plan selection */}
                <div className="space-y-1">
                  <Label className="text-xs">Plan</Label>
                  {plans.length === 0 ? (
                    <p className="text-xs text-destructive">No hay planes creados. Ve a la pestaña "Planes OpenPay" para crear uno.</p>
                  ) : (
                    <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — ${p.amount} MXN / {unitMap[p.repeat_unit] || p.repeat_unit}
                            {p.trial_days > 0 && ` (${p.trial_days}d prueba)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Summary */}
                {selectedPlanId && (
                  <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-1">
                    <p className="text-xs font-semibold text-foreground">Resumen:</p>
                    <p className="text-xs text-muted-foreground">
                      Empresa: <span className="font-medium text-foreground">{selectedEmpresa.nombre}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Plan: <span className="font-medium text-foreground">{plans.find(p => p.id === selectedPlanId)?.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Monto: <span className="font-medium text-foreground">${plans.find(p => p.id === selectedPlanId)?.amount} MXN</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pasarela: <span className="font-medium text-foreground">{pasarela === 'openpay' ? 'OpenPay' : 'Stripe'}</span>
                    </p>
                  </div>
                )}

                {/* Action button */}
                <Button
                  className="w-full"
                  onClick={handleSuscribir}
                  disabled={actionLoading || !selectedPlanId}
                >
                  {actionLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  {pasarela === 'openpay' ? 'Generar Cobro OpenPay' : 'Generar Checkout Stripe'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
        name: form.name, amount: parseFloat(form.amount),
        repeat_unit: form.repeat_unit, repeat_every: parseInt(form.repeat_every),
        trial_days: parseInt(form.trial_days),
      });
      toast.success('Plan creado');
      setShowCreate(false);
      setForm({ name: '', amount: '', repeat_unit: 'month', repeat_every: '1', trial_days: '0' });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(planId: string) {
    if (!confirm('¿Eliminar plan?')) return;
    try {
      await openpayAction('delete_plan', { plan_id: planId });
      toast.success('Plan eliminado'); load();
    } catch (e: any) { toast.error(e.message); }
  }

  const unitMap: Record<string, string> = { month: 'Mensual', week: 'Semanal', year: 'Anual' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Planes de suscripción en OpenPay (Sandbox)</p>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo Plan</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : plans.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay planes creados aún.</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nombre</TableHead><TableHead>Monto</TableHead><TableHead>Frecuencia</TableHead>
            <TableHead>Trial</TableHead><TableHead>ID</TableHead><TableHead className="w-16"></TableHead>
          </TableRow></TableHeader>
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

  async function load() {
    setLoading(true);
    try {
      const data = await openpayAction('list_customers');
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Clientes registrados en OpenPay (Sandbox). Se crean automáticamente al suscribir una empresa.</p>
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : customers.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay clientes en OpenPay aún.</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nombre</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead>
            <TableHead>Status</TableHead><TableHead>ID</TableHead>
          </TableRow></TableHeader>
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
    </div>
  );
}
