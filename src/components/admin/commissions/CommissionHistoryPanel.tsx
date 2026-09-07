import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Building2, Clock3, Search, UserRound } from 'lucide-react';
import type { CommissionAuditEntry, CommissionCompany, CommissionPerson } from './types';

function snapshot(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function actionLabel(action: CommissionAuditEntry['action']): string {
  if (action === 'created') return 'Creación';
  if (action === 'deleted') return 'Eliminación';
  return 'Cambio';
}

export default function CommissionHistoryPanel({ entries, people, companies }: {
  entries: CommissionAuditEntry[];
  people: CommissionPerson[];
  companies: CommissionCompany[];
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'person' | 'client_attribution'>('all');
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person.name])), [people]);
  const companiesById = useMemo(() => new Map(companies.map(company => [company.id, company.nombre])), [companies]);

  const rows = useMemo(() => entries.filter(entry => {
    if (type !== 'all' && entry.entity_type !== type) return false;
    const before = snapshot(entry.previous_data);
    const after = snapshot(entry.new_data);
    const empresaId = nullableString(after.empresa_id) ?? nullableString(before.empresa_id);
    const personName = peopleById.get(entry.entity_id);
    const companyName = empresaId ? companiesById.get(empresaId) : null;
    const term = search.trim().toLocaleLowerCase('es');
    return !term || [personName, companyName, entry.reason, entry.action]
      .some(value => value?.toLocaleLowerCase('es').includes(term));
  }), [companiesById, entries, peopleById, search, type]);

  const nameFor = (id: unknown) => {
    const normalized = nullableString(id);
    return normalized ? peopleById.get(normalized) ?? 'Persona no disponible' : 'Sin asignar';
  };

  const changeSummary = (entry: CommissionAuditEntry) => {
    const before = snapshot(entry.previous_data);
    const after = snapshot(entry.new_data);
    if (entry.entity_type === 'person') {
      if (entry.action === 'created') return `Se agregó ${nullableString(after.name) ?? 'una persona'} al equipo.`;
      const oldManager = nameFor(before.manager_id);
      const newManager = nameFor(after.manager_id);
      if (oldManager !== newManager) return `Encargado: ${oldManager} → ${newManager}`;
      if (before.is_active !== after.is_active) return after.is_active ? 'Se reactivó al colaborador.' : 'Se desactivó al colaborador.';
      return 'Se actualizaron sus datos internos.';
    }

    if (entry.action === 'created') {
      return `Captó: ${nameFor(after.captured_by_id)} · Encargado: ${nameFor(after.managed_by_id)}`;
    }
    const parts: string[] = [];
    if (before.captured_by_id !== after.captured_by_id) parts.push(`Captó: ${nameFor(before.captured_by_id)} → ${nameFor(after.captured_by_id)}`);
    if (before.managed_by_id !== after.managed_by_id) parts.push(`Encargado: ${nameFor(before.managed_by_id)} → ${nameFor(after.managed_by_id)}`);
    if (before.channel !== after.channel) parts.push(`Canal: ${String(before.channel ?? '—')} → ${String(after.channel ?? '—')}`);
    return parts.join(' · ') || 'Se actualizaron observaciones o fecha.';
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar en el historial..." className="pl-9" />
          </div>
          <Select value={type} onValueChange={value => setType(value as typeof type)}>
            <SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los movimientos</SelectItem>
              <SelectItem value="client_attribution">Asignaciones de clientes</SelectItem>
              <SelectItem value="person">Cambios del equipo</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.map(entry => {
          const before = snapshot(entry.previous_data);
          const after = snapshot(entry.new_data);
          const empresaId = nullableString(after.empresa_id) ?? nullableString(before.empresa_id);
          const title = entry.entity_type === 'person'
            ? peopleById.get(entry.entity_id) ?? nullableString(after.name) ?? nullableString(before.name) ?? 'Persona'
            : (empresaId ? companiesById.get(empresaId) : null) ?? 'Cliente';
          const Icon = entry.entity_type === 'person' ? UserRound : Building2;
          return (
            <Card key={entry.id}>
              <CardContent className="p-4 flex gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{title}</span>
                    <Badge variant="outline">{actionLabel(entry.action)}</Badge>
                    {entry.entity_type === 'client_attribution' && <Badge variant="secondary">Cliente</Badge>}
                  </div>
                  <div className="text-sm mt-1 flex items-center gap-1.5 text-foreground/80">
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{changeSummary(entry)}</span>
                  </div>
                  {entry.reason && <div className="text-xs mt-2 rounded-md bg-muted px-2.5 py-1.5"><b>Motivo:</b> {entry.reason}</div>}
                </div>
                <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                  <Clock3 className="h-3.5 w-3.5" /> {new Date(entry.created_at).toLocaleString('es-MX')}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!rows.length && <Card><CardContent className="p-10 text-center text-muted-foreground">No hay movimientos con ese filtro.</CardContent></Card>}
      </div>
    </div>
  );
}
