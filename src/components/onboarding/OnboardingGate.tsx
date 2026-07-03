import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'react-router-dom';

const PrimerosPasosModal = lazy(() => import('./PrimerosPasosModal'));

export default function OnboardingGate() {
  const { empresa } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['onboarding-gate', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 15 * 60_000, // el conteo de productos/clientes casi no cambia; 15 min basta
    queryFn: async () => {
      const eid = empresa!.id;
      const [emp, prod, cli] = await Promise.all([
        supabase.from('empresas').select('onboarding_completado').eq('id', eid).single(),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
        supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', eid),
      ]);
      return {
        done: !!emp.data?.onboarding_completado,
        productos: prod.count ?? 0,
        clientes: cli.count ?? 0,
      };
    },
  });

  useEffect(() => {
    if (!empresa?.id || !data) return;
    // Don't auto-open on mobile route module or POS kiosk
    if (location.pathname.startsWith('/ruta') || location.pathname.startsWith('/pos')) return;
    const dismissed = sessionStorage.getItem(`primeros_pasos_session_dismissed_${empresa.id}`);
    if (dismissed) return;
    if (!data.done && (data.productos === 0 || data.clientes === 0)) {
      setOpen(true);
    }
  }, [empresa?.id, data, location.pathname]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v && empresa?.id) {
      sessionStorage.setItem(`primeros_pasos_session_dismissed_${empresa.id}`, '1');
    }
  };

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <PrimerosPasosModal open={open} onOpenChange={handleOpenChange} />
    </Suspense>
  );
}
