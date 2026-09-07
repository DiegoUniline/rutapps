import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { activeManagerOptions, directReportCounts } from '@/lib/commissionAdmin';
import { Building2, Network, Pencil, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionAttribution, CommissionPerson } from './types';

const NONE = '__none__';

export interface CommissionPersonDraft {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  managerId: string | null;
  isActive: boolean;
  notes: string;
  changeReason: string;
}

const EMPTY_DRAFT: CommissionPersonDraft = {
  id: null,
  name: '',
  email: '',
  phone: '',
  managerId: null,
  isActive: true,
  notes: '',
  changeReason: '',
};

export default function CommissionTeamPanel({
  people,
  attributions,
  createOpen,
  onCreateOpenChange,
  onSave,
}: {
  people: CommissionPerson[];
  attributions: CommissionAttribution[];
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onSave: (draft: CommissionPersonDraft) => Promise<void>;
}) {
  const [editing, setEditing] = useState<CommissionPerson | null>(null);
  const [draft, setDraft] = useState<CommissionPersonDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const reportCounts = useMemo(() => directReportCounts(people), [people]);
  const clientCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const attribution of attributions) {
      if (!attribution.managed_by_id) continue;
      counts.set(attribution.managed_by_id, (counts.get(attribution.managed_by_id) ?? 0) + 1);
    }
    return counts;
  }, [attributions]);

  const managerGroups = useMemo(() => people
    .filter(person => person.is_active && (reportCounts.get(person.id) ?? 0) > 0)
    .map(manager => ({
      manager,
      reports: people.filter(person => person.is_active && person.manager_id === manager.id),
    })), [people, reportCounts]);

  const dialogOpen = createOpen || Boolean(editing);
  const activeDraftPerson = editing;
  const managerOptions = useMemo(
    () => activeManagerOptions(activeDraftPerson?.id ?? null, people),
    [activeDraftPerson?.id, people],
  );

  const openEdit = (person: CommissionPerson) => {
    setEditing(person);
    setDraft({
      id: person.id,
      name: person.name,
      email: person.email ?? '',
      phone: person.phone ?? '',
      managerId: person.manager_id,
      isActive: person.is_active,
      notes: person.notes ?? '',
      changeReason: '',
    });
  };

  const closeDialog = () => {
    setEditing(null);
    onCreateOpenChange(false);
    setDraft(EMPTY_DRAFT);
  };

  const ensureCreationDraft = () => {
    if (createOpen && !editing && draft.id !== null) setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
      closeDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar al colaborador');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4 text-primary" /> Estructura actual</CardTitle>
        </CardHeader>
        <CardContent>
          {managerGroups.length ? (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {managerGroups.map(group => (
                <div key={group.manager.id} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{group.manager.name}</div>
                      <div className="text-[11px] text-muted-foreground">Encargado de {group.reports.length}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.reports.map(report => <Badge key={report.id} variant="secondary">{report.name}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">Todavía no hay relaciones de encargado y colaborador.</div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[210px]">Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="min-w-[170px]">Su encargado</TableHead>
                <TableHead className="text-center">Personas a cargo</TableHead>
                <TableHead className="text-center">Clientes a cargo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map(person => (
                <TableRow key={person.id} className={!person.is_active ? 'opacity-60' : undefined}>
                  <TableCell>
                    <div className="font-semibold">{person.name}</div>
                    <div className="text-[11px] text-muted-foreground">{person.email || person.phone || 'Sin datos de contacto'}</div>
                  </TableCell>
                  <TableCell><Badge variant={person.person_type === 'partner' ? 'default' : 'secondary'}>{person.person_type === 'partner' ? 'Partner' : 'Interno'}</Badge></TableCell>
                  <TableCell>{person.manager_id ? peopleById.get(person.manager_id)?.name ?? 'No disponible' : <span className="text-muted-foreground">Sin encargado</span>}</TableCell>
                  <TableCell className="text-center"><span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5 text-muted-foreground" /> {reportCounts.get(person.id) ?? 0}</span></TableCell>
                  <TableCell className="text-center"><span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {clientCounts.get(person.id) ?? 0}</span></TableCell>
                  <TableCell><Badge variant={person.is_active ? 'outline' : 'secondary'}>{person.is_active ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => openEdit(person)} title="Editar"><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {!people.length && <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">Agrega al primer integrante del equipo.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); else ensureCreationDraft(); }}>
        <DialogContent className="sm:max-w-xl" onOpenAutoFocus={ensureCreationDraft}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" /> {editing ? `Editar ${editing.name}` : 'Agregar personal interno'}</DialogTitle>
            <DialogDescription>
              {editing?.person_type === 'partner'
                ? 'Sus datos y estado se administran desde Partners; aquí defines su encargado dentro de la estructura.'
                : 'Esta persona podrá recibir clientes y formar parte de la jerarquía comercial.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nombre *</Label>
              <Input value={draft.name} disabled={editing?.person_type === 'partner'} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Correo</Label>
              <Input type="email" value={draft.email} disabled={editing?.person_type === 'partner'} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={draft.phone} disabled={editing?.person_type === 'partner'} onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Su encargado</Label>
              <Select value={draft.managerId ?? NONE} onValueChange={value => setDraft(current => ({ ...current, managerId: value === NONE ? null : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin encargado</SelectItem>
                  {managerOptions.map(person => <SelectItem key={person.id} value={person.id}>{person.name} · {person.person_type === 'partner' ? 'Partner' : 'Interno'}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Las opciones que formarían un ciclo se excluyen automáticamente.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas internas</Label>
              <Textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Zona, funciones, acuerdos u observaciones..." />
            </div>
            {editing?.person_type !== 'partner' && (
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div><Label>Colaborador activo</Label><p className="text-[11px] text-muted-foreground">Los inactivos conservan su historial, pero no reciben nuevas asignaciones.</p></div>
                <Switch checked={draft.isActive} onCheckedChange={checked => setDraft(current => ({ ...current, isActive: checked }))} />
              </div>
            )}
            {editing && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Motivo del cambio</Label>
                <Input value={draft.changeReason} onChange={event => setDraft(current => ({ ...current, changeReason: event.target.value }))} placeholder="Ej. Reorganización del equipo comercial" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
