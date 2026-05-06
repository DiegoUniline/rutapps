import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface BaseProps {
  id?: string | null;
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const linkClass = 'underline underline-offset-2 decoration-foreground/40 hover:decoration-primary hover:text-primary transition-colors cursor-pointer';

// Hosts under which we mount nested /productos/:id and /clientes/:id routes.
// Order matters — longest match wins.
const NESTED_HOSTS = [
  '/almacen/inventario',
  '/almacen/compras',
  '/almacen/traspasos',
  '/almacen/ajustes',
  '/almacen/auditorias',
  '/almacen/conteos',
  '/almacen/mermas',
  '/finanzas/por-cobrar',
  '/finanzas/por-pagar',
  '/finanzas/saldos-cliente',
  '/finanzas/saldos-proveedor',
  '/finanzas/aplicar-pagos',
  '/ventas/cobranza',
  '/ventas/devoluciones',
  '/ventas/reporte-diario',
  '/logistica/entregas',
  '/logistica/pedidos',
  '/logistica/dashboard',
  '/reportes/entregas',
  '/reportes',
  '/control',
  '/ventas',
];

function useHostPrefix() {
  const loc = useLocation();
  const path = loc.pathname;
  // pick longest matching host that is a path-segment prefix
  const match = NESTED_HOSTS
    .filter((h) => path === h || path.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match || '';
}

function useFromState() {
  const loc = useLocation();
  return { from: loc.pathname + loc.search };
}

export function ProductoLink({ id, children, className, title, onClick }: BaseProps) {
  const state = useFromState();
  const prefix = useHostPrefix();
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link
      to={`${prefix}/productos/${id}`}
      state={state}
      className={cn(linkClass, className)}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    >
      {children}
    </Link>
  );
}

export function ClienteLink({ id, children, className, title, onClick }: BaseProps) {
  const state = useFromState();
  const prefix = useHostPrefix();
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link
      to={`${prefix}/clientes/${id}`}
      state={state}
      className={cn(linkClass, className)}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    >
      {children}
    </Link>
  );
}
