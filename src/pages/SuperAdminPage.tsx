import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Building2, Users, CreditCard, Search, Edit2, Shield, AlertTriangle,
  DollarSign, Receipt, TrendingUp, ExternalLink, Download, Trash2, Plus, LogOut
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmpresaRow {
  id: string; nombre: string; email: string | null; telefono: string | null; created_at: string;
}
interface SubscriptionRow {
  id: string; empresa_id: string; plan_id: string | null; status: string;
  trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null;
  max_usuarios: number; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  created_at: string; empresas?: { nombre: string };
  subscription_plans?: { nombre: string; precio_por_usuario: number; periodo: string } | null;
}
interface PlanRow {
  id: string; nombre: string; periodo: string; precio_por_usuario: number;
  descuento_pct: number; meses: number; activo: boolean;
}
interface AdminInvoice {
  id: string; number: string | null; status: string; amount_due: number; amount_paid: number;
  currency: string; created: number; due_date: number | null;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
  customer_email: string | null; description: string;
}
interface DashboardStats {
  balance_available: number; balance_pending: number; total_invoiced: number;
  total_paid: number; total_open: number; active_subscriptions: number;
  total_customers: number; mrr: number;
}

export default function SuperAdminPage() {
  const { user, signOut } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [user]);

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Verificando permisos...</div>;
  }
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-background border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Panel Master</h1>
              <p className="text-xs text-muted-foreground">Control total de empresas, suscripciones y facturación</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1.5" /> Salir
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="empresas">Empresas</TabsTrigger>
            <TabsTrigger value="subscriptions">Suscripciones</TabsTrigger>
            <TabsTrigger value="invoices">Facturas Stripe</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><StatsTab /></TabsContent>
          <TabsContent value="empresas"><EmpresasTab /></TabsContent>
          <TabsContent value="subscriptions"><SubscriptionsTab /></TabsContent>
          <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ─── Dashboard Tab ─── */
function StatsTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.functions.invoke('admin-billing', { body: null, headers: {} })
      .then(() => {});
    // Use query param approach
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=dashboard_stats`, {
      headers: {
        'Authorization': `Bearer ${(supabase as any).auth.session?.()?.access_token || ''}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }).catch(() => {});

    loadStats();
  }, []);

  async function loadStats() {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=dashboard_stats`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('es-MX')}`;

  if (loading) return <div className="text-muted-foreground text-center py-10">Cargando estadísticas...</div>;
  if (!stats) return <div className="text-muted-foreground text-center py-10">Error al cargar</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Balance disponible" value={fmt(stats.balance_available)} color="text-emerald-500" />
        <StatCard icon={TrendingUp} label="MRR" value={fmt(stats.mrr)} color="text-primary" />
        <StatCard icon={CreditCard} label="Facturas abiertas" value={fmt(stats.total_open)} color="text-destructive" />
        <StatCard icon={Receipt} label="Total cobrado" value={fmt(stats.total_paid)} color="text-emerald-500" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Clientes Stripe" value={stats.total_customers.toString()} color="text-primary" />
        <StatCard icon={CreditCard} label="Suscripciones activas" value={stats.active_subscriptions.toString()} color="text-emerald-500" />
        <StatCard icon={Receipt} label="Total facturado" value={fmt(stats.total_invoiced)} color="text-muted-foreground" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <Icon className={`h-7 w-7 ${color}`} />
          <div>
            <div className="text-xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Empresas Tab ─── */
function EmpresasTab() {
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('empresas').select('id, nombre, email, telefono, created_at');
    setEmpresas(data || []);
    setLoading(false);
  }

  async function deleteEmpresa(id: string, nombre: string) {
    if (!confirm(`¿Eliminar empresa "${nombre}" y TODOS sus datos? Esta acción es irreversible.`)) return;
    // Delete subscription first, then empresa (cascades handle the rest)
    await supabase.from('subscriptions').delete().eq('empresa_id', id);
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) {
      toast.error('Error: ' + error.message);
    } else {
      toast.success('Empresa eliminada');
      load();
    }
  }

  const filtered = empresas.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Empresas ({empresas.length})
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Fecha registro</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nombre}</TableCell>
                  <TableCell>{e.email || '—'}</TableCell>
                  <TableCell>{e.telefono || '—'}</TableCell>
                  <TableCell>{format(new Date(e.created_at), 'dd MMM yyyy', { locale: es })}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteEmpresa(e.id, e.nombre)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Subscriptions Tab ─── */
function SubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [search, setSearch] = useState('');
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [editForm, setEditForm] = useState({ plan_id: '', max_usuarios: 3, status: 'trial' });

  useEffect(() => { load(); }, []);

  async function load() {
    const [subsRes, plansRes] = await Promise.all([
      supabase.from('subscriptions').select('*, empresas(nombre), subscription_plans(nombre, precio_por_usuario, periodo)'),
      supabase.from('subscription_plans').select('*').eq('activo', true),
    ]);
    if (subsRes.data) setSubscriptions(subsRes.data as any);
    if (plansRes.data) setPlans(plansRes.data as any);
  }

  function openEdit(sub: SubscriptionRow) {
    setEditingSub(sub);
    setEditForm({ plan_id: sub.plan_id || '', max_usuarios: sub.max_usuarios, status: sub.status });
  }

  async function saveSubscription() {
    if (!editingSub) return;
    const { error } = await supabase
      .from('subscriptions')
      .update({ plan_id: editForm.plan_id || null, max_usuarios: editForm.max_usuarios, status: editForm.status, updated_at: new Date().toISOString() })
      .eq('id', editingSub.id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Actualizado'); setEditingSub(null); load(); }
  }

  function getDays(sub: SubscriptionRow) {
    const end = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
    return end ? differenceInDays(new Date(end), new Date()) : null;
  }

  const statusBadge = (s: string) => {
    const m: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      trial: { l: 'Trial', v: 'secondary' }, active: { l: 'Activa', v: 'default' },
      past_due: { l: 'Vencida', v: 'destructive' }, cancelled: { l: 'Cancelada', v: 'outline' },
      suspended: { l: 'Suspendida', v: 'destructive' },
    };
    const i = m[s] || { l: s, v: 'outline' as const };
    return <Badge variant={i.v}>{i.l}</Badge>;
  };

  const filtered = subscriptions.filter(s => (s.empresas?.nombre || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Suscripciones</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Días</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(sub => {
                const days = getDays(sub);
                return (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.empresas?.nombre || '—'}</TableCell>
                    <TableCell>{sub.subscription_plans?.nombre || 'Sin plan'}</TableCell>
                    <TableCell>{statusBadge(sub.status)}</TableCell>
                    <TableCell>{sub.max_usuarios}</TableCell>
                    <TableCell>
                      {sub.status === 'trial' && sub.trial_ends_at
                        ? format(new Date(sub.trial_ends_at), 'dd MMM yy', { locale: es })
                        : sub.current_period_end
                        ? format(new Date(sub.current_period_end), 'dd MMM yy', { locale: es })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {days !== null && <Badge variant={days <= 3 ? 'destructive' : days <= 7 ? 'secondary' : 'outline'}>{days <= 0 ? 'Vencido' : `${days}d`}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(sub)}><Edit2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingSub} onOpenChange={open => !open && setEditingSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar — {editingSub?.empresas?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={editForm.plan_id} onValueChange={v => setEditForm(f => ({ ...f, plan_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} — ${p.precio_por_usuario}/usr</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Máx. usuarios</label>
              <Input type="number" min={1} value={editForm.max_usuarios}
                onChange={e => setEditForm(f => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['trial', 'active', 'past_due', 'cancelled', 'suspended'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingSub(null)}>Cancelar</Button>
              <Button onClick={saveSubscription}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Invoices Tab ─── */
function InvoicesTab() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-billing?action=list_all_invoices`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Todas las facturas ({invoices.length})
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-center py-8 text-muted-foreground">Cargando facturas de Stripe...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin facturas</TableCell></TableRow>
              ) : filtered.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm">{inv.customer_email || '—'}</TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]">{inv.description}</TableCell>
                  <TableCell>{statusBadge(inv.status || 'draft')}</TableCell>
                  <TableCell className="font-medium">
                    ${(inv.amount_due / 100).toLocaleString('es-MX')}
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(inv.created * 1000), 'dd MMM yy', { locale: es })}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
  );
}
