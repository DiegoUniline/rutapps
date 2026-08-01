import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';
import SuperAdminEmpresaSelector from '@/components/SuperAdminEmpresaSelector';

/**
 * Barra fija solo visible para Super Admin (diego.leon@uniline.mx).
 * Permite cambiar la empresa activa y el vendedor de esa empresa
 * para inspeccionar la app móvil con los datos correctos.
 */
export default function SuperAdminMobileBar() {
  const { user, empresa, overrideVendedorId, setOverrideVendedorId } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  const { data: vendedores } = useQuery({
    queryKey: ['sa-mobile-vendedores', empresa?.id],
    enabled: !!empresa?.id && isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, telefono')
        .eq('empresa_id', empresa!.id)
        .order('nombre');
      if (error) console.error('[SA-Mobile] vendedores error:', error);
      return data ?? [];
    },
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 w-full min-w-0 overflow-hidden">
      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase shrink-0">SA</span>
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <SuperAdminEmpresaSelector />
      </div>
      <select
        value={overrideVendedorId ?? ''}
        onChange={e => setOverrideVendedorId(e.target.value || null)}
        className="flex-1 min-w-0 bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate"
      >
        <option value="">Todos los vendedores</option>
        {(vendedores ?? []).map((v: any) => (
          <option key={v.id} value={v.id}>{v.nombre || v.telefono || v.id.slice(0, 8)}</option>
        ))}
      </select>
    </div>
  );
}
