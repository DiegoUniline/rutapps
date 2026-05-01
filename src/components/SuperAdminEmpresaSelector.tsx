import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, X } from 'lucide-react';

interface EmpresaOption {
  id: string;
  nombre: string;
}

export default function SuperAdminEmpresaSelector() {
  const { user, empresa, overrideEmpresaId, setOverrideEmpresaId } = useAuth();
  const { isSuperAdmin } = useSubscription();
  const qc = useQueryClient();
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);

  // Only for diego.leon@uniline.mx
  const isAllowed = isSuperAdmin && user?.email === 'diego.leon@uniline.mx';

  useEffect(() => {
    if (!isAllowed) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nombre')
        .order('nombre');
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('empresa_id, status, current_period_end, trial_ends_at');

      const subsByEmpresa = new Map<string, any>();
      (subs || []).forEach(s => subsByEmpresa.set(s.empresa_id, s));

      const isVigente = (s: any) => {
        if (!s) return false;
        if (s.status === 'gracia') return true;
        if (s.status === 'active' && s.current_period_end && s.current_period_end >= nowIso) return true;
        if (s.status === 'trial' && s.trial_ends_at && s.trial_ends_at >= nowIso) return true;
        return false;
      };

      const filtered = (empresasData || []).filter(e => {
        if (e.id === empresa?.id) return true; // siempre incluir la propia
        return isVigente(subsByEmpresa.get(e.id));
      });
      setEmpresas(filtered);
    })();
  }, [isAllowed, empresa?.id]);

  if (!isAllowed || empresas.length === 0) return null;

  const handleChange = async (val: string) => {
    const realEmpresaId = empresas.find(e => e.id === empresa?.id)?.id;
    if (val === realEmpresaId || !val) {
      await setOverrideEmpresaId(null);
    } else {
      await setOverrideEmpresaId(val);
    }
    // Invalidate all queries so they refetch with the new empresa_id
    qc.invalidateQueries();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
      <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
        Viendo:
      </span>
      <select
        className="h-7 rounded-md border border-amber-300 dark:border-amber-700 bg-background px-2 text-xs font-medium flex-1 min-w-0 max-w-xs"
        value={overrideEmpresaId || empresa?.id || ''}
        onChange={e => handleChange(e.target.value)}
      >
        {empresas.map(emp => (
          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
        ))}
      </select>
      {overrideEmpresaId && (
        <button
          onClick={() => handleChange('')}
          className="p-1 rounded hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
          title="Volver a mi empresa"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
