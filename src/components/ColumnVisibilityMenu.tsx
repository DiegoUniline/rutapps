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
  /** Optional sub-label shown under the column name */
  sub?: string;
  /** Optional group name used to render sections (only when `groupOrder` is provided) */
  group?: string;
}

export interface ColumnPreset {
  key: string;
  label: string;
  /** Keys to turn ON for this preset (the rest are turned off, except required columns). */
  columns: string[];
}

interface Props {
  columns: ColumnDef[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll?: () => void;
  onReset?: () => void;
  /** Quick "views" shown as chips at the top. Requires `onApplyPreset`. */
  presets?: ColumnPreset[];
  onApplyPreset?: (columns: string[]) => void;
  /** When provided, columns are rendered grouped by `col.group` in this order. */
  groupOrder?: string[];
  /** Compact trigger for dense toolbars. */
  compact?: boolean;
}


export function ColumnVisibilityMenu({
  columns, visible, onToggle, onShowAll, onReset, presets, onApplyPreset, groupOrder, compact,
}: Props) {

  const visibleCount = columns.filter(c => c.required || visible[c.key]).length;

  // ¿Qué preset coincide con la selección actual? (para resaltar el chip activo)
  const activePreset = (presets ?? []).find(p => {
    const target = new Set([...p.columns, ...columns.filter(c => c.required).map(c => c.key)]);
    const current = new Set(columns.filter(c => c.required || visible[c.key]).map(c => c.key));
    if (target.size !== current.size) return false;
    for (const k of target) if (!current.has(k)) return false;
    return true;
  });

  const renderOption = (col: ColumnDef) => {
    const isOn = col.required || !!visible[col.key];
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
        <span className="flex-1 text-left">
          {col.label}
          {col.sub && <span className="block text-[10px] text-muted-foreground">{col.sub}</span>}
        </span>
        {col.required && <span className="text-[9px] text-muted-foreground">fijo</span>}
      </button>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg border bg-card text-foreground hover:bg-accent transition-colors shrink-0",
            compact ? "h-7 px-2 text-[11px] font-medium" : "btn-odoo-secondary"
          )}
          title="Mostrar / ocultar columnas"
        >
          <Columns3 className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          <span className="hidden sm:inline">Columnas</span>
          <span className="text-[10px] text-muted-foreground">({visibleCount}/{columns.length})</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 max-h-[70dvh] overflow-y-auto">
        {presets && presets.length > 0 && onApplyPreset && (
          <>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Vistas rápidas
            </DropdownMenuLabel>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
              {presets.map(p => (
                <button
                  key={p.key}
                  onClick={() => onApplyPreset(p.columns)}
                  className={cn(
                    "text-[11px] rounded-full px-2.5 py-1 border transition-colors",
                    activePreset?.key === p.key
                      ? "bg-primary border-primary text-primary-foreground font-medium"
                      : "border-input text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Columnas visibles
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {groupOrder && groupOrder.length > 0 ? (
          <div className="py-1">
            {groupOrder.map(g => {
              const items = columns.filter(c => (c.group ?? '') === g);
              if (!items.length) return null;
              return (
                <div key={g} className="py-0.5">
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">{g}</div>
                  {items.map(renderOption)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-1">
            {columns.map(renderOption)}
          </div>
        )}

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
