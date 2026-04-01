import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, Search, Trash2, Stamp, CreditCard, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

interface ProfileRow {
  nombre: string | null;
  user_id: string;
}

interface SubRow {
  status: string | null;
  max_usuarios: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan_id: string | null;
}

interface EmpresaRow {
  id: string; nombre: string; email: string | null; telefono: string | null; created_at: string;
  timbres_saldo?: { saldo: number }[];
  subscriptions?: SubRow[];
  profiles?: ProfileRow[];
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Activa', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  trial: { label: 'Trial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  past_due: { label: 'Vencida', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  suspended: { label: 'Suspendida', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  gracia: { label: 'Gracia', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertCircle },
  cancelada: { label: 'Cancelada', color: 'bg-muted text-muted-foreground', icon: XCircle },
  pendiente_pago: { label: 'Pendiente pago', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  sin_sub: { label: 'Sin suscripción', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

export default function AdminEmpresasTab({ onSelectEmpresa }: { onSelectEmpresa?: (id: string) => void }) {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [showAddTimbres, setShowAddTimbres] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaRow | null>(null);
  const [cantidadTimbres, setCantidadTimbres] = useState('10');
  const [addingTimbres, setAddingTimbres] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre, email, telefono, created_at, timbres_saldo(saldo), subscriptions(status, max_usuarios, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at, plan_id), profiles(nombre, user_id)')
      .order('created_at', { ascending: false });
    setEmpresas((data as any) || []);
    setLoading(false);
  }

  async function deleteEmpresa(id: string, nombre: string) {
    if (!confirm(`¿Eliminar empresa "${nombre}" y TODOS sus datos? Esta acción es irreversible.`)) return;
    await supabase.from('subscriptions').delete().eq('empresa_id', id);
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Empresa eliminada'); load(); }
  }

  async function handleAddTimbres() {
    if (!selectedEmpresa || !user) return;
    const cant = parseInt(cantidadTimbres);
    if (!cant || cant < 1) { toast.error('Cantidad inválida'); return; }

    setAddingTimbres(true);
    try {
      const { data, error } = await supabase.rpc('add_timbres', {
        p_empresa_id: selectedEmpresa.id,
        p_cantidad: cant,
        p_user_id: user.id,
        p_notas: `Recarga de ${cant} timbres por admin`,
      });
      if (error) throw error;
      toast.success(`Se agregaron ${cant} timbres. Nuevo saldo: ${data}`);
      setShowAddTimbres(false);
      setCantidadTimbres('10');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingTimbres(false);
    }
  }

  const filtered = empresas.filter(e => {
    const matchSearch = e.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.telefono || '').toLowerCase().includes(search.toLowerCase());
    if (statusFilter === 'todos') return matchSearch;
    const sub = e.subscriptions?.[0];
    const status = sub?.status || 'sin_sub';
    return matchSearch && status === statusFilter;
  });

  // Group by status
  const STATUS_ORDER = ['active', 'trial', 'past_due', 'gracia', 'suspended', 'cancelada', 'sin_sub', 'pendiente_pago'];
  const grouped = filtered.reduce<Record<string, EmpresaRow[]>>((acc, e) => {
    const status = e.subscriptions?.[0]?.status || 'sin_sub';
    if (!acc[status]) acc[status] = [];
    acc[status].push(e);
    return acc;
  }, {});
  const sortedGroups = STATUS_ORDER.filter(s => grouped[s]?.length).map(s => ({ status: s, items: grouped[s] }));
  // Add any statuses not in order
  Object.keys(grouped).filter(s => !STATUS_ORDER.includes(s)).forEach(s => sortedGroups.push({ status: s, items: grouped[s] }));

  // Counts per status for filter chips
  const statusCounts = empresas.reduce<Record<string, number>>((acc, e) => {
    const s = e.subscriptions?.[0]?.status || 'sin_sub';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Empresas ({empresas.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Status filter chips */}
        <div className="px-6 pb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'todos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Todos ({empresas.length})
          </button>
          {STATUS_ORDER.filter(s => statusCounts[s]).map(s => {
            const info = STATUS_MAP[s] || { label: s, color: 'text-muted-foreground' };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? 'todos' : s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {info.label} ({statusCounts[s]})
              </button>
            );
          })}
        </div>

        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Usuarios</TableHead>
                    <TableHead className="text-center">Timbres</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Próximo cobro</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedGroups.map(group => {
                    const groupInfo = STATUS_MAP[group.status] || { label: group.status, color: 'bg-muted text-muted-foreground', icon: AlertCircle };
                    const GroupIcon = groupInfo.icon;
                    return (
                      <React.Fragment key={group.status}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50 border-t-2 border-border">
                          <TableCell colSpan={9} className="py-2">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${groupInfo.color}`}>
                                <GroupIcon className="h-3 w-3" />
                                {groupInfo.label}
                              </span>
                              <span className="text-xs text-muted-foreground font-medium">
                                ({group.items.length})
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {group.items.map(e => {
                          const saldo = e.timbres_saldo?.[0]?.saldo ?? 0;
                          const sub = e.subscriptions?.[0];
                          const status = sub?.status || 'sin_sub';
                          const statusInfo = STATUS_MAP[status];
                          const hasStripeCustomer = !!sub?.stripe_customer_id;
                          const hasStripeSub = !!sub?.stripe_subscription_id;
                          const usersCount = e.profiles?.length || 0;
                          return (
                            <TableRow key={e.id} className="cursor-pointer hover:bg-card" onClick={() => onSelectEmpresa?.(e.id)}>
                              <TableCell>
                                <div className="font-medium">{e.nombre}</div>
                                <div className="text-[10px] text-muted-foreground">{usersCount} usuario{usersCount !== 1 ? 's' : ''}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-xs space-y-0.5">
                                  <div className="text-muted-foreground">{e.email || '—'}</div>
                                  <div className="text-muted-foreground">{e.telefono || '—'}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {statusInfo ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusInfo.color}`}>
                                    <statusInfo.icon className="h-3 w-3" />
                                    {statusInfo.label}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">Sin sub</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="font-mono font-semibold text-sm">{sub?.max_usuarios ?? '—'}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`font-mono font-semibold text-sm ${saldo > 0 ? 'text-primary' : 'text-destructive'}`}>
                                  {saldo}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {hasStripeCustomer ? (
                                    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                                      <CreditCard className="h-3 w-3" />
                                      Cliente
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-muted text-muted-foreground">
                                      <XCircle className="h-3 w-3" />
                                      Sin Stripe
                                    </Badge>
                                  )}
                                  {hasStripeSub && (
                                    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                                      Sub
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const endDate = sub?.status === 'trial' ? sub?.trial_ends_at : sub?.current_period_end;
                                  if (!endDate) return <span className="text-xs text-muted-foreground">—</span>;
                                  const d = new Date(endDate);
                                  const normalized = d.getDate() === 1 ? d : new Date(d.getFullYear(), d.getMonth() + 1, 1);
                                  return (
                                    <div className="text-xs">
                                      <div className="font-medium">{format(normalized, 'dd MMM yyyy', { locale: es })}</div>
                                      {normalized < new Date() && (
                                        <span className="text-[10px] text-destructive font-semibold">VENCIDO</span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {format(new Date(e.created_at), 'dd MMM yyyy', { locale: es })}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                                  <Button size="sm" variant="ghost" title="Agregar timbres" onClick={() => { setSelectedEmpresa(e); setShowAddTimbres(true); }}>
                                    <Stamp className="h-4 w-4 text-primary" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteEmpresa(e.id, e.nombre)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Timbres Dialog */}
      <Dialog open={showAddTimbres} onOpenChange={setShowAddTimbres}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stamp className="h-5 w-5 text-primary" /> Agregar Timbres
            </DialogTitle>
            <DialogDescription>
              Agregar timbres a <strong>{selectedEmpresa?.nombre}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad de timbres</Label>
              <Input
                type="number"
                min="1"
                value={cantidadTimbres}
                onChange={e => setCantidadTimbres(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddTimbres(false)}>Cancelar</Button>
              <Button className="flex-1" disabled={addingTimbres} onClick={handleAddTimbres}>
                {addingTimbres ? 'Agregando...' : `Agregar ${cantidadTimbres || 0} timbres`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
