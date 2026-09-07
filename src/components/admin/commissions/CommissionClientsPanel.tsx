import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import {
  COMMISSION_CHANNELS,
  attributionChanged,
  commissionChannelLabel,
  type CommissionChannel,
} from '@/lib/commissionAdmin';
import { getEffectiveCompanyStatus } from '@/lib/adminCompanyStatus';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Pencil, Search, UserRoundCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionAttribution, CommissionCompany, CommissionPerson } from './types';

interface AssignmentForm {
  capturedById: string;
  managedById: string;
  channel: CommissionChannel;
  capturedAt: string;
  notes: string;
  changeReason: string;
}

const NONE = '__none__';

const STATUS_ORDER = ['active', 'trial', 'past_due', 'gracia', 'suspended', 'cancelada', 'sin_sub', 'pendiente_pago'];

const STATUS_META: Record<string, { label: string; pluralLabel: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Activa', pluralLabel: 'Activas', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  trial: { label: 'Trial', pluralLabel: 'Trial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  past_due: { label: 'Vencida', pluralLabel: 'Vencidas', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
  gracia: { label: 'Gracia', pluralLabel: 'Gracia', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertCircle },
  suspended: { label: 'Suspendida', pluralLabel: 'Suspendidas', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  cancelada: { label: 'Cancelada', pluralLabel: 'Canceladas', color: 'bg-muted text-muted-foreground', icon: XCircle },
  sin_sub: { label: 'Sin suscripción', pluralLabel: 'Sin suscripción', color: 'bg-muted text-muted-foreground', icon: XCircle },
  pendiente_pago: { label: 'Pendiente pago', pluralLabel: 'Pendiente pago', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
};

function dateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function personBadge(person?: CommissionPerson) {
  if (!person) return <span className="text-muted-foreground">Sin asignar</span>;
  return (
    <div className="min-w-0">
      <div className="font-medium truncate">{person.name}</div>
      <Badge variant="outline" className="text-[10px] mt-0.5">
        {person.person_type === 'partner' ? 'Partner' : 'Interno'}
      </Badge>
    </div>
  );
}

export default function CommissionClientsPanel({ companies, people, attributions, onSaved }: {
  companies: CommissionCompany[];
  people: CommissionPerson[];
  attributions: CommissionAttribution[];
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedCompany, setSelectedCompany] = useState<CommissionCompany | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssignmentForm>({
    capturedById: NONE,
    managedById: NONE,
    channel: 'manual',
    capturedAt: '',
    notes: '',
    changeReason: '',
  });

  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const attributionByCompany = useMemo(
    () => new Map(attributions.map(attribution => [attribution.empresa_id, attribution])),
    [attributions],
  );
  const activePeople = useMemo(
    () => people.filter(person => person.is_active).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [people],
  );
  const capturedPeople = useMemo(() => {
    const currentId = form.capturedById === NONE ? null : form.capturedById;
    return people
      .filter(person => person.is_active || person.id === currentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [form.capturedById, people]);

  const statusCounts = useMemo(() => companies.reduce<Record<string, number>>((counts, company) => {
    const status = getEffectiveCompanyStatus(company.subscriptions?.[0]);
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {}), [companies]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return companies.filter(company => {
      const attribution = attributionByCompany.get(company.id);
      const captured = attribution?.captured_by_id ? peopleById.get(attribution.captured_by_id) : null;
      const managed = attribution?.managed_by_id ? peopleById.get(attribution.managed_by_id) : null;
      const hasActiveManager = Boolean(managed?.is_active);
      if (statusFilter !== 'todos' && getEffectiveCompanyStatus(company.subscriptions?.[0]) !== statusFilter) return false;
      if (filter === 'assigned' && !hasActiveManager) return false;
      if (filter === 'unassigned' && hasActiveManager) return false;
      if (!term) return true;
      return [company.nombre, captured?.name, managed?.name, attribution?.channel]
        .some(value => value?.toLocaleLowerCase('es').includes(term));
    });
  }, [attributionByCompany, companies, filter, peopleById, search, statusFilter]);

  const openAssignment = (company: CommissionCompany) => {
    const attribution = attributionByCompany.get(company.id);
    setSelectedCompany(company);
    setForm({
      capturedById: attribution?.captured_by_id ?? NONE,
      managedById: attribution?.managed_by_id ?? NONE,
      channel: (attribution?.channel as CommissionChannel | undefined) ?? 'manual',
      capturedAt: dateInput(attribution?.captured_at ?? company.created_at),
      notes: attribution?.notes ?? '',
      changeReason: '',
    });
  };

  const save = async () => {
    if (!selectedCompany) return;
    const current = attributionByCompany.get(selectedCompany.id) ?? null;
    const next = {
      captured_by_id: form.capturedById === NONE ? null : form.capturedById,
      managed_by_id: form.managedById === NONE ? null : form.managedById,
      channel: form.channel,
      notes: form.notes.trim() || null,
    };
    if (current && attributionChanged(current, next) && !form.changeReason.trim()) {
      toast.error('Indica el motivo de la reasignación');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_set_commission_client_attribution', {
        p_empresa_id: selectedCompany.id,
        p_captured_by_id: next.captured_by_id,
        p_managed_by_id: next.managed_by_id,
        p_channel: form.channel,
        p_captured_at: form.capturedAt ? `${form.capturedAt}T12:00:00.000Z` : undefined,
        p_notes: next.notes,
        p_change_reason: form.changeReason.trim() || undefined,
      });
      if (error) throw error;
      toast.success(current ? 'Asignación actualizada y auditada' : 'Cliente atribuido correctamente');
      setSelectedCompany(null);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la asignación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, captador o encargado..." className="pl-9" />
            </div>
            <Select value={filter} onValueChange={value => setFilter(value as typeof filter)}>
              <SelectTrigger className="w-full lg:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los encargados</SelectItem>
                <SelectItem value="assigned">Con encargado</SelectItem>
                <SelectItem value="unassigned">Sin encargado</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground whitespace-nowrap">{rows.length} de {companies.length}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            <button
              type="button"
              onClick={() => setStatusFilter('todos')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === 'todos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Todos ({companies.length})
            </button>
            {STATUS_ORDER.filter(status => statusCounts[status]).map(status => {
              const meta = STATUS_META[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(current => current === status ? 'todos' : status)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${statusFilter === status ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {meta?.pluralLabel ?? status} ({statusCounts[status]})
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Cliente</TableHead>
                <TableHead className="min-w-[125px]">Estado</TableHead>
                <TableHead className="min-w-[170px]">Lo consiguió</TableHead>
                <TableHead className="min-w-[170px]">Encargado actual</TableHead>
                <TableHead className="min-w-[150px]">Canal</TableHead>
                <TableHead className="min-w-[115px]">Alta</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(company => {
                const attribution = attributionByCompany.get(company.id);
                const captured = attribution?.captured_by_id ? peopleById.get(attribution.captured_by_id) : undefined;
                const managed = attribution?.managed_by_id ? peopleById.get(attribution.managed_by_id) : undefined;
                const status = getEffectiveCompanyStatus(company.subscriptions?.[0]);
                const statusMeta = STATUS_META[status];
                return (
                  <TableRow key={company.id} className={!managed?.is_active ? 'bg-amber-50/50 dark:bg-amber-950/10' : undefined}>
                    <TableCell>
                      <div className="font-semibold">{company.nombre}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{company.id}</div>
                    </TableCell>
                    <TableCell>
                      {statusMeta ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.color}`}>
                          <statusMeta.icon className="h-3 w-3" /> {statusMeta.label}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{personBadge(captured)}</TableCell>
                    <TableCell>
                      {managed?.is_active ? personBadge(managed) : managed ? (
                        <div>
                          <div className="flex items-center gap-1.5 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> {managed.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">Encargado inactivo</div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertTriangle className="h-4 w-4" /> Sin encargado
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{attribution ? commissionChannelLabel(attribution.channel) : '—'}</TableCell>
                    <TableCell className="text-sm">{new Date(company.created_at).toLocaleDateString('es-MX')}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => openAssignment(company)} title="Editar atribución">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">No hay clientes con esos filtros.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={Boolean(selectedCompany)} onOpenChange={open => !open && setSelectedCompany(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-primary" /> Asignar {selectedCompany?.nombre}</DialogTitle>
            <DialogDescription>
              “Lo consiguió” conserva la autoría comercial; “Encargado actual” puede cambiar con el tiempo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Lo consiguió</Label>
              <Select value={form.capturedById} onValueChange={value => setForm(current => ({ ...current, capturedById: value }))}>
                <SelectTrigger><SelectValue placeholder="Sin atribuir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin atribuir / orgánico</SelectItem>
                  {capturedPeople.map(person => <SelectItem key={person.id} value={person.id}>{person.name} · {person.person_type === 'partner' ? 'Partner' : 'Interno'}{person.is_active ? '' : ' · Inactivo'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Encargado actual</Label>
              <Select value={form.managedById} onValueChange={value => setForm(current => ({ ...current, managedById: value }))}>
                <SelectTrigger><SelectValue placeholder="Sin encargado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin encargado</SelectItem>
                  {activePeople.map(person => <SelectItem key={person.id} value={person.id}>{person.name} · {person.person_type === 'partner' ? 'Partner' : 'Interno'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal de llegada</Label>
              <Select value={form.channel} onValueChange={value => setForm(current => ({ ...current, channel: value as CommissionChannel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMISSION_CHANNELS.map(channel => <SelectItem key={channel} value={channel}>{commissionChannelLabel(channel)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de captación</Label>
              <Input type="date" value={form.capturedAt} onChange={event => setForm(current => ({ ...current, capturedAt: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observaciones</Label>
              <Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Contexto del contacto, acuerdo o seguimiento..." />
            </div>
            {selectedCompany && attributionByCompany.has(selectedCompany.id) && (
              <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
                <Label>Motivo del cambio *</Label>
                <Input value={form.changeReason} onChange={event => setForm(current => ({ ...current, changeReason: event.target.value }))} placeholder="Ej. Fabiola tomará el seguimiento desde septiembre" />
                <p className="text-[11px] text-muted-foreground">Se guardará en el historial junto con los datos anteriores y nuevos.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCompany(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar asignación'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
