import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { TrendingUp, Layers, Sliders, ListChecks, BarChart3, Wallet, Receipt } from 'lucide-react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { cn } from '@/lib/utils';

const sections = [
  { to: 'avance', label: 'Avance', icon: TrendingUp, desc: 'Progreso en tiempo real' },
  { to: 'esquemas', label: 'Esquemas', icon: Layers, desc: 'Define cómo se calcula' },
  { to: 'reglas', label: 'Reglas de comisión', icon: Sliders, desc: 'Reglas por producto/categoría' },
  { to: 'generadas', label: 'Comisiones generadas', icon: ListChecks, desc: 'Detalle por venta' },
  { to: 'por-volumen', label: 'Por volumen', icon: BarChart3, desc: 'Calcula por metas' },
  { to: 'por-pagar', label: 'Por pagar', icon: Wallet, desc: 'Genera recibos' },
  { to: 'recibos', label: 'Recibos', icon: Receipt, desc: 'Historial y pagos' },
];

export default function ComisionesLayoutPage() {
  const { pathname } = useLocation();
  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          Comisiones
          <HelpButton title={HELP.comisiones.title} sections={HELP.comisiones.sections} />
        </h1>
      </div>

      <div className="flex gap-4">
        <aside className="w-56 shrink-0">
          <nav className="bg-card border border-border rounded overflow-hidden">
            {sections.map(s => {
              const active = pathname === `/finanzas/comisiones/${s.to}` || (s.to === 'avance' && pathname === '/finanzas/comisiones');
              const Icon = s.icon;
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 text-sm border-l-2 transition-colors',
                    active
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-transparent text-foreground hover:bg-muted/40'
                  )}
                >
                  <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0">
                    <div className="truncate">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
                  </div>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
