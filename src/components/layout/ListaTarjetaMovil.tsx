import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileListCard } from '@/components/MobileListCard';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AccionMovil } from '@/components/shared/MasAccionesMovil';

export interface CampoTarjeta {
  label: string;
  value: ReactNode;
  className?: string;
}

interface ListaTarjetaMovilProps {
  /** Texto principal: cliente, proveedor, producto o nombre del documento. */
  titulo: string;
  /** Folio, tipo u otra referencia corta. */
  subtitulo?: string;
  /** Estado como badge (p. ej. <StatusChip />). */
  estado?: ReactNode;
  /** Datos en dos columnas: fecha, monto, saldo, etc. */
  campos: CampoTarjeta[];
  /** Acciones de la fila; se agrupan en el menú «⋯». */
  acciones?: AccionMovil[];
  onClick?: () => void;
  leading?: ReactNode;
  className?: string;
}

/**
 * Tarjeta estándar de las listas administrativas en teléfono (regla
 * «Listas en teléfono = tarjeta estándar», docs/sistema-diseno.md).
 * Mismo diseño que la lista móvil de Ventas: título + folio, estado como
 * badge, campos en dos columnas y acciones en «⋯». Solo presentación.
 */
export function ListaTarjetaMovil({ titulo, subtitulo, estado, campos, acciones, onClick, leading, className }: ListaTarjetaMovilProps) {
  const visibles = (acciones ?? []).filter(Boolean);
  return (
    <MobileListCard
      title={titulo}
      subtitle={subtitulo}
      leading={leading}
      className={className}
      onClick={onClick}
      fields={campos}
      badge={(estado || visibles.length > 0) ? (
        <div className="flex items-center gap-1 shrink-0">
          {estado}
          {visibles.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label="Acciones"
                  className="-my-1 -mr-1.5 h-9 w-9 inline-flex items-center justify-center rounded hover:bg-accent"
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[176px] max-w-[calc(100vw-1rem)]" onClick={e => e.stopPropagation()}>
                {visibles.map(a => (
                  <div key={a.key}>
                    {a.separar && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      disabled={a.disabled}
                      onSelect={() => a.onClick()}
                      className={cn('gap-2 py-2.5 text-[13px]', a.destructiva && 'text-destructive focus:text-destructive')}
                    >
                      {a.icon && <a.icon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{a.label}</span>
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : undefined}
    />
  );
}

interface ListaTarjetasMovilProps {
  children: ReactNode;
  /** Se muestra cuando `vacia` es true. */
  vacia?: boolean;
  mensajeVacio?: ReactNode;
  className?: string;
}

/** Contenedor de tarjetas: separación estándar y estado vacío. */
export function ListaTarjetasMovil({ children, vacia, mensajeVacio = 'Sin registros', className }: ListaTarjetasMovilProps) {
  if (vacia) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{mensajeVacio}</div>;
  }
  return <div data-lista-tarjetas="" className={cn('space-y-2', className)}>{children}</div>;
}

export default ListaTarjetaMovil;
