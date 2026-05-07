import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, X, Search, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

type StatusFilter = 'todas' | 'active' | 'trial' | 'past_due' | 'gracia' | 'suspended' | 'cancelled';

interface EmpresaOption {
  id: string;
  nombre: string;
  status: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  vigente: boolean;
}

const STATUS_CONFIG: Record<StatusFilter, { label: string; color: string }> = {
  todas: { label: 'Todas', color: 'bg-muted text-foreground' },
  active: { label: 'Activas', color: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  trial: { label: 'Trial', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  past_due: { label: 'Vencidas', color: 'bg-destructive/10 text-destructive' },
  gracia: { label: 'Gracia', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  suspended: { label: 'Suspendidas', color: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Canceladas', color: 'bg-muted text-muted-foreground' },
};

export default function SuperAdminEmpresaSelector() {
  const { user, empresa, overrideEmpresaId, setOverrideEmpresaId } = useAuth();
  const { isSuperAdmin } = useSubscription();
  const qc = useQueryClient();
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');

  const isAllowed = isSuperAdmin && user?.email === 'diego.leon@uniline.mx';

  useEffect(() => {
    if (!isAllowed) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const [{ data: empresasData }, { data: subs }] = await Promise.all([
        supabase.from('empresas').select('id, nombre').order('nombre'),
        supabase.from('subscriptions').select('empresa_id, status, current_period_end, trial_ends_at'),
      ]);

      const subsByEmpresa = new Map<string, any>();
      (subs || []).forEach(s => subsByEmpresa.set(s.empresa_id, s));

      const isVigente = (s: any) => {
        if (!s) return false;
        if (s.status === 'gracia') return true;
        if (s.status === 'active' && s.current_period_end && s.current_period_end >= nowIso) return true;
        if (s.status === 'trial' && s.trial_ends_at && s.trial_ends_at >= nowIso) return true;
        return false;
      };

      const all: EmpresaOption[] = (empresasData || []).map(e => {
        const s = subsByEmpresa.get(e.id);
        return {
          id: e.id,
          nombre: e.nombre,
          status: s?.status ?? null,
          current_period_end: s?.current_period_end ?? null,
          trial_ends_at: s?.trial_ends_at ?? null,
          vigente: isVigente(s),
        };
      });
      setEmpresas(all);
    })();
  }, [isAllowed, empresa?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return empresas.filter(e => {
      if (statusFilter !== 'todas' && e.status !== statusFilter) return false;
      if (q && !e.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [empresas, search, statusFilter]);

  if (!isAllowed) return null;

  const currentId = overrideEmpresaId || empresa?.id || '';
  const currentEmpresa = empresas.find(e => e.id === currentId);

  const handleSelect = async (val: string) => {
    const realEmpresaId = empresa?.id;
    if (val === realEmpresaId || !val) {
      await setOverrideEmpresaId(null);
    } else {
      await setOverrideEmpresaId(val);
    }
    qc.invalidateQueries();
    setOpen(false);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: empresas.length };
    empresas.forEach(e => {
      if (e.status) c[e.status] = (c[e.status] || 0) + 1;
    });
    return c;
  }, [empresas]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
      <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
        Viendo:
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 rounded-md border border-amber-300 dark:border-amber-700 bg-background px-2 text-xs font-medium flex items-center gap-1.5 min-w-[180px] max-w-xs justify-between hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            <span className="truncate">{currentEmpresa?.nombre || 'Selecciona empresa'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0" align="start">
          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar empresa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          {/* Status filter chips */}
          <div className="p-2 border-b flex flex-wrap gap-1">
            {(Object.keys(STATUS_CONFIG) as StatusFilter[]).map(key => {
              const cfg = STATUS_CONFIG[key];
              const count = counts[key] || 0;
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full transition border ${
                    active ? 'bg-primary text-primary-foreground border-primary' : `${cfg.color} border-transparent hover:border-border`
                  }`}
                >
                  {cfg.label} {count > 0 && <span className="opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">Sin resultados</div>
            ) : (
              filtered.map(emp => {
                const isCurrent = emp.id === currentId;
                const cfg = STATUS_CONFIG[(emp.status as StatusFilter) || 'todas'] || STATUS_CONFIG.todas;
                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelect(emp.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-2 border-b border-border/40 last:border-b-0 ${
                      isCurrent ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      <span className={`text-sm truncate ${isCurrent ? 'font-semibold' : ''}`}>{emp.nombre}</span>
                    </div>
                    {emp.status && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.color} shrink-0`}>
                        {cfg.label}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {overrideEmpresaId && (
        <button
          onClick={() => handleSelect('')}
          className="p-1 rounded hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
          title="Volver a mi empresa"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
