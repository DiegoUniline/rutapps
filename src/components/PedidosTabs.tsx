import { NavLink } from 'react-router-dom';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Pendientes', path: '/logistica/pedidos' },
  { label: 'Entregas', path: '/logistica/entregas' },
];

// Prefetch sibling chunks so tab switches are instant
const prefetchTabs = () => {
  import('@/pages/DemandaPage');
  import('@/pages/EntregaListPage');
};

export function PedidosTabs() {
  useEffect(() => { prefetchTabs(); }, []);
  return (
    <div className="border-b mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <nav className="flex gap-1 min-w-max py-1.5">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end
            className={({ isActive }) =>
              cn(
                'px-3 py-1.5 text-sm font-medium whitespace-nowrap rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default PedidosTabs;
