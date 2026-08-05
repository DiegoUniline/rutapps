import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, X, Search, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

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
  const { user, empresa, realEmpresa, overrideEmpresaId, setOverrideEmpresaId } = useAuth();
  const qc = useQueryClient();
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');

  // Gate by email only. The empresas query is RLS-gated and will return only
  // the user's own empresa for non-super-admins (so the selector renders but
  // does nothing useful). This avoids depending on useSubscription's async
  // isSuperAdmin flag, which during initial load returns false and hid the bar.
  const isAllowed = isSuperAdminEmail(user?.email);

  // AHORRO DE DATOS: la lista de empresas (cientos de KB) se pide SOLO cuando
  // el super admin abre el selector, no en cada arranque de la app/móvil.
  useEffect(() => {
    if (!isAllowed || !open || empresas.length > 0) return;
    (async () => {
      const nowIso = new Date().toISOString();

      // Source 1: SECURITY DEFINER RPC -> siempre devuelve TODAS las empresas
      // para el super admin (evita cualquier filtro de RLS sobre empresas/subscriptions).
      const { data: rpcData, error: rpcError } = await supabase.rpc('super_admin_list_empresas');

      let rows: any[] = (rpcData as any[]) || [];

      if (rpcError || rows.length === 0) {
        if (rpcError) console.warn('[SA] super_admin_list_empresas RPC error:', rpcError);
        const [{ data: empresasData }, { data: subs }] = await Promise.all([
          supabase.from('empresas').select('id, nombre').order('nombre'),
          supabase.from('subscriptions').select('empresa_id, status, current_period_end, trial_ends_at'),
        ]);
        const subsByEmpresa = new Map<string, any>();
        (subs || []).forEach(s => subsByEmpresa.set(s.empresa_id, s));
        rows = (empresasData || []).map(e => {
          const s = subsByEmpresa.get(e.id);
          return {
            id: e.id,
            nombre: e.nombre,
            status: s?.status ?? null,
            current_period_end: s?.current_period_end ?? null,
            trial_ends_at: s?.trial_ends_at ?? null,
          };
        });
      }

      const isVigente = (s: any) => {
        if (!s?.status) return false;
        if (s.status === 'gracia') return true;
        if (s.status === 'active' && s.current_period_end && s.current_period_end >= nowIso) return true;
        if (s.status === 'trial' && s.trial_ends_at && s.trial_ends_at >= nowIso) return true;
        return false;
      };

      const all: EmpresaOption[] = rows
        .map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          status: r.status ?? null,
          current_period_end: r.current_period_end ?? null,
          trial_ends_at: r.trial_ends_at ?? null,
          vigente: isVigente(r),
        }))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setEmpresas(all);
    })();
  }, [isAllowed, open, empresas.length, realEmpresa?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return empresas.filter(e => {
      if (statusFilter !== 'todas' && e.status !== statusFilter) return false;
      if (q && !e.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [empresas, search, statusFilter]);

  if (!isAllowed) return null;

  const realId = realEmpresa?.id || '';
  const currentId = overrideEmpresaId || empresa?.id || '';
  const currentEmpresa = empresas.find(e => e.id === currentId) || (empresa ? { id: empresa.id, nombre: empresa.nombre, status: null } as any : null);
  const isOverridden = !!overrideEmpresaId && overrideEmpresaId !== realId;

  const handleSelect = async (val: string) => {
    if (!val || val === realId) {
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

  // Override active: keep a LOUD red bar (safety).
  // Default state: a tiny, discreet pill so it doesn't show up in screen recordings.
  const wrapperClass = isOverridden
    ? 'flex w-full min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-destructive text-destructive-foreground border-b-2 border-destructive shadow-md'
    : 'flex min-w-0 max-w-full items-center gap-1 px-2 py-0.5 opacity-40 hover:opacity-100 transition-opacity';

  return (
    <div className={wrapperClass}>
      {isOverridden ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      {isOverridden && (
        <span className="text-[10px] sm:text-[11px] font-bold whitespace-nowrap">
          <span className="hidden sm:inline">⚠ VIENDO OTRA EMPRESA:</span>
          <span className="sm:hidden">⚠ OTRA EMPRESA:</span>
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={
              isOverridden
                ? 'h-7 rounded-md border px-2 text-xs font-semibold flex items-center gap-1.5 flex-1 min-w-0 sm:min-w-[180px] max-w-full sm:max-w-xs justify-between border-destructive-foreground/40 bg-destructive-foreground/10 text-destructive-foreground hover:bg-destructive-foreground/20'
                : 'h-5 rounded px-1.5 text-[10px] text-muted-foreground/70 hover:text-foreground flex items-center gap-1 min-w-0 max-w-[140px]'
            }
          >
            <span className="truncate">{currentEmpresa?.nombre || '—'}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[min(380px,calc(100vw-1.5rem))] max-w-[380px] p-0" align="start" collisionPadding={8}>
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

          {/* Quick: back to my empresa */}
          {realEmpresa && (
            <button
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-2 border-b text-xs font-semibold flex items-center justify-between gap-2 ${
                !isOverridden ? 'bg-primary/5 text-primary' : 'hover:bg-muted'
              }`}
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" />
                MI EMPRESA · {realEmpresa.nombre}
              </span>
              {!isOverridden && <Check className="h-3.5 w-3.5" />}
            </button>
          )}

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
                const isMine = emp.id === realId;
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
                      {isMine && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">MÍA</span>}
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

      {isOverridden && (
        <button
          onClick={() => handleSelect('')}
          className="shrink-0 sm:ml-auto flex items-center gap-1 px-2 py-1 rounded bg-destructive-foreground text-destructive text-[10px] sm:text-[11px] font-bold hover:opacity-90 whitespace-nowrap"
          title="Volver a mi empresa"
        >
          <X className="h-3 w-3 shrink-0" />
          <span className="hidden sm:inline">Volver a mi empresa</span>
          <span className="sm:hidden">Volver</span>
        </button>
      )}

    </div>
  );
}
