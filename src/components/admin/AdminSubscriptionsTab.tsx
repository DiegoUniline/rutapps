import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Edit2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
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

export default function AdminSubscriptionsTab() {
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
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Suscripciones ({subscriptions.length})</CardTitle>
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
                    <TableCell className="text-muted-foreground">{sub.subscription_plans?.nombre || 'Sin plan'}</TableCell>
                    <TableCell>{statusBadge(sub.status)}</TableCell>
                    <TableCell>{sub.max_usuarios}</TableCell>
                    <TableCell className="text-muted-foreground">
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
