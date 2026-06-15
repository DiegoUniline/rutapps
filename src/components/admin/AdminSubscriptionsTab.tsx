import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Edit2, Plus, Stamp, Users, CreditCard, CheckCircle2, AlertTriangle, Clock, Ban, HelpCircle } from 'lucide-react';
import { format, differenceInDays, addDays, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface SubscriptionRow {
  id: string; empresa_id: string; plan_id: string | null; status: string;
  trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null;
  max_usuarios: number; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  created_at: string; empresas?: { nombre: string };
  subscription_plans?: { nombre: string; precio_por_usuario: number; periodo: string } | null;
  descuento_porcentaje?: number;
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

const STALE = 2 * 60 * 1000;

type SubTab = 'todas' | 'activas' | 'vencidas' | 'trial' | 'sin_sub';

export default function AdminSubscriptionsTab() {
  const [tab, setTab] = useState<SubTab>('todas');
  const [search, setSearch] = useState('');

  // Data fetching with React Query for caching
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery<SubscriptionRow[]>({
    queryKey: ['admin-subscriptions-list'],
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('*, empresas(nombre), subscription_plans(nombre, precio_por_usuario, periodo)');
      return (data || []) as SubscriptionRow[];
    },
  });

  const { data: plans = [] } = useQuery<PlanRow[]>({
    queryKey: ['admin-subscription-plans'],
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase.from('subscription_plans').select('*').eq('activo', true);
      return (data || []) as PlanRow[];
    },
  });

  const { data: empresas = [] } = useQuery<EmpresaSimple[]>({
    queryKey: ['admin-empresas-simple'],
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase.from('empresas').select('id, nombre');
      return (data || []) as EmpresaSimple[];
    },
  });

  const { data: timbresSaldo = [] } = useQuery<{ empresa_id: string; saldo: number }[]>({
    queryKey: ['admin-timbres-saldo'],
    staleTime: STALE,
    queryFn: async () => {
      const { data } = await supabase.from('timbres_saldo').select('empresa_id, saldo');
      return (data || []) as { empresa_id: string; saldo: number }[];
    },
  });

  const timbresMap = useMemo(() => {
    const tm: Record<string, number> = {};
    timbresSaldo.forEach(t => { tm[t.empresa_id] = t.saldo; });
    return tm;
  }, [timbresSaldo]);

  const subEmpresaIds = useMemo(() => new Set(subscriptions.map(s => s.empresa_id)), [subscriptions]);
  const empresasSinSub = useMemo(() => empresas.filter(e => !subEmpresaIds.has(e.id)), [empresas, subEmpresaIds]);

  // Summary stats
  const stats = useMemo(() => {
    const total = subscriptions.length;
    const activas = subscriptions.filter(s => s.status === 'active').length;
    const trial = subscriptions.filter(s => s.status === 'trial').length;
    const vencidas = subscriptions.filter(s => s.status === 'past_due' || s.status === 'suspended').length;
    const canceladas = subscriptions.filter(s => s.status === 'cancelled').length;
    const sinSub = empresasSinSub.length;
    return { total, activas, trial, vencidas, canceladas, sinSub };
  }, [subscriptions, empresasSinSub]);

  // Filter by tab + search
  const filtered = useMemo(() => {
    let list: (SubscriptionRow | { id: string; empresa_id: string; nombre: string; status: 'sin_sub' })[] = [];

    if (tab === 'sin_sub') {
      list = empresasSinSub.map(e => ({ id: e.id, empresa_id: e.id, nombre: e.nombre, status: 'sin_sub' as const }));
    } else {
      list = subscriptions;
      if (tab === 'activas') list = list.filter(s => s.status === 'active');
      if (tab === 'vencidas') list = list.filter(s => s.status === 'past_due' || s.status === 'suspended');
      if (tab === 'trial') list = list.filter(s => s.status === 'trial');
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s: any) => {
      const nombre = s.empresas?.nombre || s.nombre || '';
      return nombre.toLowerCase().includes(q);
    });
  }, [subscriptions, empresasSinSub, tab, search]);

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
    empresa_id: '', plan_id: '', max_usuarios: 3, status: 'active', period_months: 1,
  });

  // Timbres dialog
  const [showTimbres, setShowTimbres] = useState(false);
  const [timbresEmpresa, setTimbresEmpresa] = useState<{ id: string; nombre: string } | null>(null);
  const [timbresCantidad, setTimbresCantidad] = useState('10');
  const [timbresLoading, setTimbresLoading] = useState(false);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  function openEdit(sub: SubscriptionRow) {
    setEditingSub(sub);
    setEditForm({
      plan_id: sub.plan_id || '',
      max_usuarios: sub.max_usuarios,
      status: sub.status,
      current_period_start: sub.current_period_start?.split('T')[0] || '',
      current_period_end: sub.current_period_end?.split('T')[0] || '',
      trial_ends_at: sub.trial_ends_at?.split('T')[0] || '',
      descuento_porcentaje: sub.descuento_porcentaje || 0,
    });
  }

  async function saveSubscription() {
    if (!editingSub) return;
    const payload: any = {
      plan_id: editForm.plan_id || null,
      max_usuarios: editForm.max_usuarios,
      status: editForm.status,
      acceso_bloqueado: ['suspended', 'cancelled', 'cancelada'].includes(editForm.status),
      descuento_porcentaje: editForm.descuento_porcentaje || 0,
      updated_at: new Date().toISOString(),
    };
    if (editForm.current_period_start) payload.current_period_start = editForm.current_period_start;
    if (editForm.current_period_end) payload.current_period_end = editForm.current_period_end;
    if (editForm.trial_ends_at) payload.trial_ends_at = editForm.trial_ends_at;

    const { error } = await supabase.from('subscriptions').update(payload).eq('id', editingSub.id);
    if (error) toast.error('Error: ' + error.message);
    else {
      toast.success('Suscripción actualizada');
      setEditingSub(null);
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions-list'] });
    }
  }

  async function createSubscription() {
    if (!createForm.empresa_id) { toast.error('Selecciona una empresa'); return; }
    const now = new Date();
    const periodEnd = addMonths(now, createForm.period_months);
    const { error } = await supabase.from('subscriptions').insert({
      empresa_id: createForm.empresa_id,
      plan_id: createForm.plan_id || null,
      max_usuarios: createForm.max_usuarios,
      status: createForm.status,
      acceso_bloqueado: ['suspended', 'cancelled', 'cancelada'].includes(createForm.status),
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: createForm.status === 'trial' ? addDays(now, 7).toISOString() : null,
    });
    if (error) toast.error('Error: ' + error.message);
    else {
      toast.success('Suscripción creada');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['admin-empresas-simple'] });
    }
  }

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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimbresLoading(false);
    }
  }

  function getDays(sub: SubscriptionRow) {
    const end = sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end;
    return end ? differenceInDays(new Date(end), new Date()) : null;
  }

  const SummaryCard = ({ icon: Icon, label, value, colorClass }: { icon: any; label: string; value: number; colorClass: string }) => (
    <Card className="border border-border/60 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", colorClass)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={CreditCard} label="Total" value={stats.total} colorClass="bg-primary" />
        <SummaryCard icon={CheckCircle2} label="Activas" value={stats.activas} colorClass="bg-emerald-500" />
        <SummaryCard icon={Clock} label="Trial" value={stats.trial} colorClass="bg-amber-500" />
        <SummaryCard icon={AlertTriangle} label="Vencidas" value={stats.vencidas} colorClass="bg-destructive" />
        <SummaryCard icon={Ban} label="Canceladas" value={stats.canceladas} colorClass="bg-slate-500" />
        <SummaryCard icon={HelpCircle} label="Sin sub" value={stats.sinSub} colorClass="bg-muted-foreground" />
      </div>

      {/* Tabs + Table */}
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Suscripciones
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56 h-9" />
              </div>
              <Button size="sm" onClick={() => { setCreateForm({ empresa_id: '', plan_id: '', max_usuarios: 3, status: 'active', period_months: 1 }); setShowCreate(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Crear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)}>
            <TabsList className="mb-3 bg-muted/50">
              <TabsTrigger value="todas">Todas ({stats.total})</TabsTrigger>
              <TabsTrigger value="activas">Activas ({stats.activas})</TabsTrigger>
              <TabsTrigger value="vencidas">Vencidas ({stats.vencidas})</TabsTrigger>
              <TabsTrigger value="trial">Trial ({stats.trial})</TabsTrigger>
              <TabsTrigger value="sin_sub">Sin sub ({stats.sinSub})</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="m-0">
              {loadingSubs ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : (
                <div className="overflow-x-auto">
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
                      {tab === 'sin_sub' ? (
                        (filtered as any[]).map((e: any) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.nombre}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">—</TableCell>
                            <TableCell><Badge variant="outline">Sin suscripción</Badge></TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => { setCreateForm(f => ({ ...f, empresa_id: e.id })); setShowCreate(true); }} title="Crear suscripción">
                                <Plus className="h-4 w-4 text-primary" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        (filtered as SubscriptionRow[]).map(sub => {
                          const days = getDays(sub);
                          const timbres = timbresMap[sub.empresa_id] ?? 0;
                          return (
                            <TableRow key={sub.id}>
                              <TableCell className="font-medium">{sub.empresas?.nombre || '—'}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {sub.subscription_plans?.nombre || 'Sin plan'}
                                {sub.descuento_porcentaje ? (
                                  <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">-{sub.descuento_porcentaje}%</Badge>
                                ) : null}
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
                                {days !== null && (
                                  <Badge variant={days <= 3 ? 'destructive' : days <= 7 ? 'secondary' : 'outline'}>
                                    {days <= 0 ? 'Vencido' : `${days}d`}
                                  </Badge>
                                )}
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
                        })
                      )}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                            No hay resultados
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
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
    </div>
  );
}

