import { useState } from 'react';
import { Columns3, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface ColumnChooserProps {
  columns: ColumnDef[];
  visible: Set<string>;
  onChange: (visible: Set<string>) => void;
}

export function useColumnVisibility(columns: ColumnDef[]) {
  const [visible, setVisible] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const c of columns) {
      if (c.defaultVisible !== false) set.add(c.key);
    }
    return set;
  });
  return { visible, setVisible, isVisible: (key: string) => visible.has(key) };
}

export function ColumnChooser({ columns, visible, onChange }: ColumnChooserProps) {
  const toggle = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) {
      if (next.size <= 1) return; // keep at least 1
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  const allOn = visible.size === columns.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors",
          "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50",
          visible.size < columns.length && "border-primary/50 bg-primary/5 text-primary"
        )}>
          <Columns3 className="h-3.5 w-3.5" />
          Columnas
          {visible.size < columns.length && (
            <span className="bg-primary text-primary-foreground rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
              {visible.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="end">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground">Columnas visibles</span>
          <button
            onClick={() => {
              if (allOn) {
                const next = new Set(columns.slice(0, 3).map(c => c.key));
                onChange(next);
              } else {
                onChange(new Set(columns.map(c => c.key)));
              }
            }}
            className="text-[10px] text-primary hover:underline"
          >
            {allOn ? 'Mínimas' : 'Todas'}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
          {columns.map(c => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-[12px]"
            >
              <input
                type="checkbox"
                checked={visible.has(c.key)}
                onChange={() => toggle(c.key)}
                className="rounded border-input accent-primary"
              />
              <span className="truncate">{c.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
