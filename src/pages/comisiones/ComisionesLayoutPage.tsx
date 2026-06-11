import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Percent } from 'lucide-react';

// Prefetch all tab chunks so switching tabs is instant (no chunk download)
const prefetchTabs = () => {
  import('./ComisionesAvancePage');
  import('./ComisionesGeneradasPage');
  import('./ComisionesVolumenPage');
  import('./ComisionesPorPagarPage');
  import('./ComisionesRecibosPage');
  import('./ComisionesEsquemasPage');
  import('./ComisionesReglasPage');
};

const TABS: { label: string; path: string; end?: boolean; badge?: boolean }[] = [
  { label: 'Avance', path: '/comisiones', end: true },
  { label: 'Generadas', path: '/comisiones/generadas' },
  { label: 'Por volumen', path: '/comisiones/por-volumen' },
  { label: 'Por pagar', path: '/comisiones/por-pagar', badge: true },
  { label: 'Recibos', path: '/comisiones/recibos' },
  { label: 'Esquemas', path: '/comisiones/esquemas' },
  { label: 'Reglas', path: '/comisiones/reglas' },
];

export default function ComisionesLayoutPage() {
  const { empresa } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => { prefetchTabs(); }, []);


  const { data: porPagarCount } = useQuery({
    queryKey: ['comisiones-por-pagar-count', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('venta_comisiones')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .eq('pagada', false)
        .is('pago_comision_id', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div className="min-h-full">
      <div className="px-4 md:px-6 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Percent className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Comisiones</h1>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-border -mx-4 px-4 md:-mx-6 md:px-6">
          {TABS.map(t => {
            const active = t.end ? pathname === t.path : pathname.startsWith(t.path);
            return (
              <NavLink
                key={t.path}
                to={t.path}
                end={t.end}
                className={cn(
                  'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
                {t.badge && (porPagarCount ?? 0) > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {porPagarCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
