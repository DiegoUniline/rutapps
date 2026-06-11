import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Cobranza', path: '/ventas/cobranza' },
  { label: 'CxC', path: '/finanzas/por-cobrar' },
  { label: 'Saldos', path: '/finanzas/saldos-cliente' },
];

export function CobranzaTabs() {
  return (
    <div className="border-b mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <nav className="flex gap-1 min-w-max">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end
            className={({ isActive }) =>
              cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
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

export default CobranzaTabs;
