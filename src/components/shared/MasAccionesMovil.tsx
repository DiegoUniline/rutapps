import type React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface AccionMovil {
  key: string;
  label: React.ReactNode;
  icon?: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  /** Rojo (D-029): cancelar, eliminar, devolución. */
  destructiva?: boolean;
  /** Dibuja una línea divisoria antes de esta acción. */
  separar?: boolean;
}

interface Props {
  acciones: AccionMovil[];
  /** Clases del botón; por defecto solo se muestra en teléfono (sm:hidden). */
  className?: string;
  label?: string;
}

/**
 * Botón «⋯» que agrupa las acciones secundarias de un encabezado en un menú.
 * En teléfono evita que la barra de botones se encime o se salga de la
 * pantalla; en escritorio las mismas acciones se muestran como botones.
 */
export function MasAccionesMovil({ acciones, className, label = 'Más acciones' }: Props) {
  if (acciones.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn('btn-odoo-secondary !h-9 !w-9 !p-0 sm:hidden', className)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px] max-w-[calc(100vw-1rem)]">
        {acciones.map(a => (
          <div key={a.key}>
            {a.separar && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={a.disabled}
              onSelect={() => a.onClick()}
              className={cn('gap-2 py-2.5 text-[13px]', a.destructiva && 'text-destructive focus:text-destructive')}
            >
              {a.icon && <a.icon className="h-4 w-4 shrink-0" />}
              <span className="truncate">{a.label}</span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default MasAccionesMovil;
