import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface BaseProps {
  id?: string | null;
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const linkClass = 'underline underline-offset-2 decoration-foreground/40 hover:decoration-primary hover:text-primary transition-colors cursor-pointer';

export function ProductoLink({ id, children, className, title, onClick }: BaseProps) {
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link
      to={`/productos/${id}`}
      className={cn(linkClass, className)}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    >
      {children}
    </Link>
  );
}

export function ClienteLink({ id, children, className, title, onClick }: BaseProps) {
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link
      to={`/clientes/${id}`}
      className={cn(linkClass, className)}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    >
      {children}
    </Link>
  );
}
