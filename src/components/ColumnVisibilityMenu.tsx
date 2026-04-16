import { Columns3, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ColumnDef {
  key: string;
  label: string;
  /** When true, the user cannot hide this column */
  required?: boolean;
}

interface Props {
  columns: ColumnDef[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll?: () => void;
  onReset?: () => void;
}

export function ColumnVisibilityMenu({ columns, visible, onToggle, onShowAll, onReset }: Props) {
  const visibleCount = columns.filter(c => visible[c.key]).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="btn-odoo-secondary"
          title="Mostrar / ocultar columnas"
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Columnas</span>
          <span className="text-[10px] text-muted-foreground">({visibleCount}/{columns.length})</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Columnas visibles
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="py-1">
          {columns.map(col => {
            const isOn = !!visible[col.key];
            const disabled = !!col.required;
            return (
              <button
                key={col.key}
                disabled={disabled}
                onClick={() => onToggle(col.key)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm",
                  disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-accent cursor-pointer"
                )}
              >
                <span className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                  isOn ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
                )}>
                  {isOn && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 text-left">{col.label}</span>
                {col.required && <span className="text-[9px] text-muted-foreground">fijo</span>}
              </button>
            );
          })}
        </div>
        {(onShowAll || onReset) && (
          <>
            <DropdownMenuSeparator />
            <div className="flex gap-1 p-1">
              {onShowAll && (
                <button onClick={onShowAll} className="flex-1 text-[11px] py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                  Mostrar todas
                </button>
              )}
              {onReset && (
                <button onClick={onReset} className="flex-1 text-[11px] py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                  Restaurar
                </button>
              )}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
