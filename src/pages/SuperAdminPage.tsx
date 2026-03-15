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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Building2, Users, CreditCard, Search, Plus, Edit2, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmpresaRow {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  created_at: string;
}

interface SubscriptionRow {
  id: string;
  empresa_id: string;
  plan_id: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  max_usuarios: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  empresas?: { nombre: string };
  subscription_plans?: { nombre: string; precio_por_usuario: number; periodo: string } | null;
}

interface PlanRow {
  id: string;
  nombre: string;
  periodo: string;
  precio_por_usuario: number;
  descuento_pct: number;
  meses: number;
  activo: boolean;
}

export default function SuperAdminPage() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [search, setSearch] = useState('');
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [editForm, setEditForm] = useState({ plan_id: '', max_usuarios: 3, status: 'trial' });

  useEffect(() => {
    if (!user) return;
    checkSuperAdmin();
  }, [user]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin]);

  async function checkSuperAdmin() {
    const { data } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle();
    setIsSuperAdmin(!!data);
  }

  async function loadData() {
    const [empresasRes, subsRes, plansRes] = await Promise.all([
      supabase.from('empresas').select('id, nombre, email, telefono, created_at'),
      supabase.from('subscriptions').select('*, empresas(nombre), subscription_plans(nombre, precio_por_usuario, periodo)'),
      supabase.from('subscription_plans').select('*').eq('activo', true),
    ]);
    // Super admin needs to see all empresas - we use a special query via the admin function
    if (empresasRes.data) setEmpresas(empresasRes.data as any);
    if (subsRes.data) setSubscriptions(subsRes.data as any);
    if (plansRes.data) setPlans(plansRes.data as any);
  }

  function openEdit(sub: SubscriptionRow) {
    setEditingSub(sub);
    setEditForm({
      plan_id: sub.plan_id || '',
      max_usuarios: sub.max_usuarios,
      status: sub.status,
    });
  }

  async function saveSubscription() {
    if (!editingSub) return;
    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan_id: editForm.plan_id || null,
        max_usuarios: editForm.max_usuarios,
        status: editForm.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingSub.id);
    if (error) {
      toast.error('Error: ' + error.message);
    } else {
      toast.success('Suscripción actualizada');
      setEditingSub(null);
      loadData();
    }
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      trial: { label: 'Trial', variant: 'secondary' },
      active: { label: 'Activa', variant: 'default' },
      past_due: { label: 'Vencida', variant: 'destructive' },
      cancelled: { label: 'Cancelada', variant: 'outline' },
      suspended: { label: 'Suspendida', variant: 'destructive' },
    };
    const info = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  }

  function getDaysRemaining(sub: SubscriptionRow) {
    const endDate = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
    if (!endDate) return null;
    return differenceInDays(new Date(endDate), new Date());
  }

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Verificando permisos...</div>;
  }
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredSubs = subscriptions.filter(s => {
    const empresa = s.empresas?.nombre || '';
    return empresa.toLowerCase().includes(search.toLowerCase());
  });

  const totalEmpresas = empresas.length;
  const activeSubs = subscriptions.filter(s => s.status === 'active' || s.status === 'trial').length;
  const pastDue = subscriptions.filter(s => s.status === 'past_due' || s.status === 'suspended').length;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-background border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Super Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Gestión de empresas y suscripciones</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{totalEmpresas}</div>
                  <div className="text-xs text-muted-foreground">Empresas registradas</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-emerald-500" />
                <div>
                  <div className="text-2xl font-bold">{activeSubs}</div>
                  <div className="text-xs text-muted-foreground">Suscripciones activas</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <div>
                  <div className="text-2xl font-bold">{pastDue}</div>
                  <div className="text-xs text-muted-foreground">Vencidas / Suspendidas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscriptions table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Suscripciones</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar empresa..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
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
                  <TableHead>Días rest.</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No hay suscripciones registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubs.map(sub => {
                    const days = getDaysRemaining(sub);
                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.empresas?.nombre || '—'}</TableCell>
                        <TableCell>{sub.subscription_plans?.nombre || 'Sin plan'}</TableCell>
                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                        <TableCell>{sub.max_usuarios}</TableCell>
                        <TableCell>
                          {sub.status === 'trial' && sub.trial_ends_at
                            ? format(new Date(sub.trial_ends_at), 'dd MMM yyyy', { locale: es })
                            : sub.current_period_end
                            ? format(new Date(sub.current_period_end), 'dd MMM yyyy', { locale: es })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {days !== null && (
                            <Badge variant={days <= 3 ? 'destructive' : days <= 7 ? 'secondary' : 'outline'}>
                              {days <= 0 ? 'Vencido' : `${days} días`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(sub)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSub} onOpenChange={open => !open && setEditingSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar suscripción — {editingSub?.empresas?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={editForm.plan_id} onValueChange={v => setEditForm(f => ({ ...f, plan_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} — ${p.precio_por_usuario}/usuario/{p.periodo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Máx. usuarios</label>
              <Input
                type="number"
                min={1}
                value={editForm.max_usuarios}
                onChange={e => setEditForm(f => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Activa</SelectItem>
                  <SelectItem value="past_due">Vencida</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                  <SelectItem value="suspended">Suspendida</SelectItem>
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
    </div>
  );
}
