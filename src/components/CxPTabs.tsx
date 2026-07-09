import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/finanzas/por-pagar', label: 'Cuentas por pagar' },
  { to: '/finanzas/pagos-proveedores', label: 'Pagos proveedores' },
  { to: '/finanzas/saldos-proveedor', label: 'Saldos proveedor' },
];

export function CxPTabs() {
  return (
    <div className="border-b border-border flex gap-1 overflow-x-auto">
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
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
    </div>
  );
}
