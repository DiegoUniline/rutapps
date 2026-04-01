import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Edit2, Plus, Stamp, Users, CreditCard } from 'lucide-react';
import { format, differenceInDays, addDays, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

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
interface EmpresaSimple { id: string; nombre: string; }

const STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'suspended'] as const;
const STATUS_MAP: Record<string, { l: string; v: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trial: { l: 'Trial', v: 'secondary' }, active: { l: 'Activa', v: 'default' },
  past_due: { l: 'Vencida', v: 'destructive' }, cancelled: { l: 'Cancelada', v: 'outline' },
  suspended: { l: 'Suspendida', v: 'destructive' },
};

export default function AdminSubscriptionsTab() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [empresasSinSub, setEmpresasSinSub] = useState<EmpresaSimple[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit dialog
  const [editingSub, setEditingSub] = useState<SubscriptionRow | null>(null);
  const [editForm, setEditForm] = useState({
    plan_id: '', max_usuarios: 3, status: 'trial',
    current_period_start: '', current_period_end: '', trial_ends_at: '',
    descuento_porcentaje: 0,
  });

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    empresa_id: '', plan_id: '', max_usuarios: 3, status: 'active',
    period_months: 1,
  });

  // Timbres dialog
  const [showTimbres, setShowTimbres] = useState(false);
  const [timbresEmpresa, setTimbresEmpresa] = useState<{ id: string; nombre: string } | null>(null);
  const [timbresCantidad, setTimbresCantidad] = useState('10');
  const [timbresLoading, setTimbresLoading] = useState(false);

  // Timbres saldo cache
  const [timbresMap, setTimbresMap] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [subsRes, plansRes, empresasRes, timbresRes] = await Promise.all([
      supabase.from('subscriptions').select('*, empresas(nombre), subscription_plans(nombre, precio_por_usuario, periodo)'),
      supabase.from('subscription_plans').select('*').eq('activo', true),
      supabase.from('empresas').select('id, nombre'),
      supabase.from('timbres_saldo').select('empresa_id, saldo'),
    ]);
    const subs = (subsRes.data || []) as any[];
    setSubscriptions(subs);
    setPlans((plansRes.data || []) as any);

    // Empresas sin suscripción
    const subEmpresaIds = new Set(subs.map((s: any) => s.empresa_id));
    setEmpresasSinSub(((empresasRes.data || []) as any[]).filter(e => !subEmpresaIds.has(e.id)));

    // Timbres map
    const tm: Record<string, number> = {};
    ((timbresRes.data || []) as any[]).forEach((t: any) => { tm[t.empresa_id] = t.saldo; });
    setTimbresMap(tm);
    setLoading(false);
  }

  // === Edit ===
  function openEdit(sub: SubscriptionRow) {
    setEditingSub(sub);
    setEditForm({
      plan_id: sub.plan_id || '',
      max_usuarios: sub.max_usuarios,
      status: sub.status,
      current_period_start: sub.current_period_start?.split('T')[0] || '',
      current_period_end: sub.current_period_end?.split('T')[0] || '',
      trial_ends_at: sub.trial_ends_at?.split('T')[0] || '',
      descuento_porcentaje: (sub as any).descuento_porcentaje || 0,
    });
  }

  async function saveSubscription() {
    if (!editingSub) return;
    const payload: any = {
      plan_id: editForm.plan_id || null,
      max_usuarios: editForm.max_usuarios,
      status: editForm.status,
      descuento_porcentaje: editForm.descuento_porcentaje || 0,
      updated_at: new Date().toISOString(),
    };
    if (editForm.current_period_start) payload.current_period_start = editForm.current_period_start;
    if (editForm.current_period_end) payload.current_period_end = editForm.current_period_end;
    if (editForm.trial_ends_at) payload.trial_ends_at = editForm.trial_ends_at;

    const { error } = await supabase.from('subscriptions').update(payload).eq('id', editingSub.id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Suscripción actualizada'); setEditingSub(null); load(); }
  }

  // === Create ===
  async function createSubscription() {
    if (!createForm.empresa_id) { toast.error('Selecciona una empresa'); return; }
    const now = new Date();
    const periodEnd = addMonths(now, createForm.period_months);
    const { error } = await supabase.from('subscriptions').insert({
      empresa_id: createForm.empresa_id,
      plan_id: createForm.plan_id || null,
      max_usuarios: createForm.max_usuarios,
      status: createForm.status,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: createForm.status === 'trial' ? addDays(now, 7).toISOString() : null,
    });
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Suscripción creada'); setShowCreate(false); load(); }
  }

  // === Timbres ===
  function openTimbres(empresaId: string, nombre: string) {
    setTimbresEmpresa({ id: empresaId, nombre });
    setTimbresCantidad('10');
    setShowTimbres(true);
  }

  async function handleAddTimbres() {
    if (!timbresEmpresa || !user) return;
    const cant = parseInt(timbresCantidad);
    if (!cant || cant < 1) { toast.error('Cantidad inválida'); return; }
    setTimbresLoading(true);
    try {
      const { data, error } = await supabase.rpc('add_timbres', {
        p_empresa_id: timbresEmpresa.id,
        p_cantidad: cant,
        p_user_id: user.id,
        p_notas: `Recarga de ${cant} timbres por admin`,
      });
      if (error) throw error;
      toast.success(`+${cant} timbres → saldo: ${data}`);
      setShowTimbres(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimbresLoading(false);
    }
  }

  // === Helpers ===
  function getDays(sub: SubscriptionRow) {
    const end = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
    return end ? differenceInDays(new Date(end), new Date()) : null;
  }

  const filtered = subscriptions.filter(s => (s.empresas?.nombre || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Suscripciones ({subscriptions.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
              </div>
              <Button size="sm" onClick={() => { setCreateForm({ empresa_id: '', plan_id: '', max_usuarios: 3, status: 'active', period_months: 1 }); setShowCreate(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Crear suscripción
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usuarios</TableHead>
                  <TableHead>Timbres</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Días</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(sub => {
                  const days = getDays(sub);
                  const timbres = timbresMap[sub.empresa_id] ?? 0;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.empresas?.nombre || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sub.subscription_plans?.nombre || 'Sin plan'}
                        {(sub as any).descuento_porcentaje > 0 && (
                          <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">-{(sub as any).descuento_porcentaje}%</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[sub.status]?.v || 'outline'}>
                          {STATUS_MAP[sub.status]?.l || sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" /> {sub.max_usuarios}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openTimbres(sub.empresa_id, sub.empresas?.nombre || '—')}
                          className="flex items-center gap-1 text-sm font-mono hover:text-primary transition-colors"
                          title="Agregar timbres"
                        >
                          <Stamp className="h-3.5 w-3.5" />
                          <span className={timbres > 0 ? 'text-primary font-semibold' : 'text-destructive font-semibold'}>{timbres}</span>
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
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
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(sub)} title="Editar">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openTimbres(sub.empresa_id, sub.empresas?.nombre || '—')} title="Timbres">
                            <Stamp className="h-4 w-4 text-primary" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingSub} onOpenChange={open => !open && setEditingSub(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {editingSub?.empresas?.nombre}</DialogTitle>
            <DialogDescription>Modifica plan, usuarios, fechas y status</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Plan</Label>
                <Select value={editForm.plan_id} onValueChange={v => setEditForm(f => ({ ...f, plan_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Sin plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} — ${p.precio_por_usuario}/usr</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s]?.l || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Máx. usuarios</Label>
                <Input type="number" min={1} value={editForm.max_usuarios}
                  onChange={e => setEditForm(f => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descuento %</Label>
                <Input type="number" min={0} max={100} value={editForm.descuento_porcentaje}
                  onChange={e => setEditForm(f => ({ ...f, descuento_porcentaje: parseFloat(e.target.value) || 0 }))} className="h-9" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Inicio período</Label>
                <Input type="date" value={editForm.current_period_start}
                  onChange={e => setEditForm(f => ({ ...f, current_period_start: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fin período</Label>
                <Input type="date" value={editForm.current_period_end}
                  onChange={e => setEditForm(f => ({ ...f, current_period_end: e.target.value }))} className="h-9" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Fin trial</Label>
              <Input type="date" value={editForm.trial_ends_at}
                onChange={e => setEditForm(f => ({ ...f, trial_ends_at: e.target.value }))} className="h-9" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingSub(null)}>Cancelar</Button>
              <Button onClick={saveSubscription}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Suscripción Manual</DialogTitle>
            <DialogDescription>Asigna una suscripción a una empresa sin suscripción</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Empresa</Label>
              <Select value={createForm.empresa_id} onValueChange={v => setCreateForm(f => ({ ...f, empresa_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                <SelectContent>
                  {empresasSinSub.map(e => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {empresasSinSub.length === 0 && <p className="text-xs text-muted-foreground">Todas las empresas ya tienen suscripción</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Plan</Label>
                <Select value={createForm.plan_id} onValueChange={v => setCreateForm(f => ({ ...f, plan_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Sin plan" /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={createForm.status} onValueChange={v => setCreateForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_MAP[s]?.l || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Máx. usuarios</Label>
                <Input type="number" min={1} value={createForm.max_usuarios}
                  onChange={e => setCreateForm(f => ({ ...f, max_usuarios: parseInt(e.target.value) || 1 }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duración (meses)</Label>
                <Input type="number" min={1} value={createForm.period_months}
                  onChange={e => setCreateForm(f => ({ ...f, period_months: parseInt(e.target.value) || 1 }))} className="h-9" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={createSubscription} disabled={!createForm.empresa_id}>Crear suscripción</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timbres Dialog */}
      <Dialog open={showTimbres} onOpenChange={setShowTimbres}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stamp className="h-5 w-5 text-primary" /> Agregar Timbres
            </DialogTitle>
            <DialogDescription>
              Agregar timbres a <strong>{timbresEmpresa?.nombre}</strong>
              <br />
              <span className="text-xs">Saldo actual: <strong>{timbresMap[timbresEmpresa?.id || ''] ?? 0}</strong></span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad de timbres</Label>
              <Input type="number" min="1" value={timbresCantidad} onChange={e => setTimbresCantidad(e.target.value)} className="font-mono h-9" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowTimbres(false)}>Cancelar</Button>
              <Button className="flex-1" disabled={timbresLoading} onClick={handleAddTimbres}>
                {timbresLoading ? 'Agregando...' : `+${timbresCantidad || 0} timbres`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
