import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { BriefcaseBusiness, Building2, History, Plus, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import CommissionClientsPanel from './commissions/CommissionClientsPanel';
import CommissionHistoryPanel from './commissions/CommissionHistoryPanel';
import CommissionTeamPanel, { type CommissionPersonDraft } from './commissions/CommissionTeamPanel';
import type {
  CommissionAdminData,
  CommissionAttribution,
  CommissionAuditEntry,
  CommissionCompany,
  CommissionPerson,
} from './commissions/types';

const QUERY_KEY = ['admin-commissions'] as const;
const EMPTY_DATA: CommissionAdminData = { people: [], companies: [], attributions: [], audit: [] };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const source = error as Record<string, unknown>;
    const details = ['message', 'details', 'hint', 'code']
      .map(key => typeof source[key] === 'string' ? source[key] : '')
      .filter(Boolean);
    if (details.length) return [...new Set(details)].join(' · ');
  }
  return String(error || 'Error desconocido');
}

async function loadCommissionAdminData(): Promise<CommissionAdminData> {
  const [people, companies, attributions, auditResult] = await Promise.all([
    fetchAllPages<CommissionPerson>((from, to) => supabase
      .from('commission_people')
      .select('*')
      .order('name')
      .range(from, to)),
    fetchAllPages<CommissionCompany>((from, to) => supabase
      .from('empresas')
      .select('id, nombre, created_at, subscriptions(status, current_period_end, trial_ends_at)')
      .eq('is_partner_sandbox', false)
      .order('nombre')
      .range(from, to)),
    fetchAllPages<CommissionAttribution>((from, to) => supabase
      .from('commission_client_attributions')
      .select('*')
      .range(from, to)),
    supabase
      .from('commission_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (auditResult.error) throw auditResult.error;
  return {
    people,
    companies,
    attributions,
    audit: (auditResult.data ?? []) as CommissionAuditEntry[],
  };
}

function StatCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-0.5">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{detail}</div>
        </div>
        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCommissionsTab() {
  const queryClient = useQueryClient();
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [activeTab, setActiveTab] = useState('clients');
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadCommissionAdminData,
    staleTime: 30_000,
  });

  const data = query.data ?? EMPTY_DATA;
  const stats = useMemo(() => {
    const activePeopleIds = new Set(data.people.filter(person => person.is_active).map(person => person.id));
    const assignedCompanies = new Set(
      data.attributions.filter(item => item.managed_by_id && activePeopleIds.has(item.managed_by_id)).map(item => item.empresa_id),
    );
    return {
      activePeople: data.people.filter(person => person.is_active).length,
      internalPeople: data.people.filter(person => person.person_type === 'internal' && person.is_active).length,
      assignedCompanies: assignedCompanies.size,
      unassignedCompanies: Math.max(data.companies.length - assignedCompanies.size, 0),
    };
  }, [data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const savePerson = async (draft: CommissionPersonDraft) => {
    const { error } = await supabase.rpc('admin_save_commission_person', {
      p_person_id: draft.id ?? undefined,
      p_name: draft.name,
      p_email: draft.email || undefined,
      p_phone: draft.phone || undefined,
      p_manager_id: draft.managerId || undefined,
      p_is_active: draft.isActive,
      p_notes: draft.notes || undefined,
      p_change_reason: draft.changeReason || undefined,
    });
    if (error) throw error;
    toast.success(draft.id ? 'Colaborador actualizado' : 'Colaborador agregado');
    await refresh();
  };

  if (query.isLoading) {
    return <div className="min-h-[45vh] flex items-center justify-center text-muted-foreground">Cargando estructura de comisiones...</div>;
  }

  if (query.isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-8 text-center space-y-3">
          <div className="font-semibold text-destructive">No se pudo cargar el módulo de Comisiones</div>
          <div className="text-sm text-muted-foreground">{errorMessage(query.error)}</div>
          <Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Comisiones</h1>
                <Badge variant="outline">Fase de atribución</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Quién consiguió cada cliente, quién lo atiende y quién dirige a cada colaborador.</p>
            </div>
          </div>
        </div>
        <Button onClick={() => { setActiveTab('team'); setCreatingPerson(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Personal interno
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Equipo activo" value={stats.activePeople} detail="Internos y partners" icon={Users} />
        <StatCard label="Personal interno" value={stats.internalPeople} detail="Colaboradores de Uniline" icon={UserCheck} />
        <StatCard label="Clientes asignados" value={stats.assignedCompanies} detail="Con encargado actual" icon={Building2} />
        <StatCard label="Sin encargado" value={stats.unassignedCompanies} detail="Requieren revisión" icon={History} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="clients" className="gap-1.5"><Building2 className="h-4 w-4" /> Clientes</TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5"><Users className="h-4 w-4" /> Equipo y jerarquía</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-4 w-4" /> Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <CommissionClientsPanel
            companies={data.companies}
            people={data.people}
            attributions={data.attributions}
            onSaved={refresh}
          />
        </TabsContent>
        <TabsContent value="team">
          <CommissionTeamPanel
            people={data.people}
            attributions={data.attributions}
            createOpen={creatingPerson}
            onCreateOpenChange={setCreatingPerson}
            onSave={savePerson}
          />
        </TabsContent>
        <TabsContent value="history">
          <CommissionHistoryPanel
            entries={data.audit}
            people={data.people}
            companies={data.companies}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
