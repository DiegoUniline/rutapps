import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface GroupedTableWrapperProps {
  groupBy: string;
  groups: { label: string; items: any[] }[];
  renderTable: (items: any[], groupLabel?: string) => React.ReactNode;
  renderSummary?: (items: any[]) => React.ReactNode;
}

export function GroupedTableWrapper({ groupBy, groups, renderTable, renderSummary }: GroupedTableWrapperProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!groupBy || groups.length <= 1) {
    return <>{renderTable(groups[0]?.items ?? [])}</>;
  }

  const toggleGroup = (label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.label} className="bg-card border border-border rounded overflow-hidden">
          <button
            onClick={() => toggleGroup(g.label)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
          >
            {collapsed.has(g.label)
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-[12px] font-semibold text-foreground">{g.label}</span>
            <span className="text-[11px] text-muted-foreground">({g.items.length})</span>
            {renderSummary && !collapsed.has(g.label) && (
              <div className="ml-auto">{renderSummary(g.items)}</div>
            )}
          </button>
          {!collapsed.has(g.label) && (
            <div className="border-t border-border">
              {renderTable(g.items, g.label)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
