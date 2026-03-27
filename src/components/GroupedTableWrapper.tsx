import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { GroupNode } from '@/hooks/useListPreferences';

interface GroupedTableWrapperProps {
  groupBy: string;
  groups: GroupNode<any>[];
  renderTable: (items: any[], groupLabel?: string) => React.ReactNode;
  renderSummary?: (items: any[]) => React.ReactNode;
}

export function GroupedTableWrapper({ groupBy, groups, renderTable, renderSummary }: GroupedTableWrapperProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!groupBy) {
    return <div className="bg-card border border-border rounded overflow-hidden">{renderTable(groups[0]?.items ?? [])}</div>;
  }

  const toggleGroup = (label: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const isExpanded = (label: string) => expanded.has(label);

  const renderNode = (node: GroupNode<any>, prefix: string, depth: number) => {
    const key = prefix ? `${prefix}__${node.label}` : node.label;
    const open = isExpanded(key);
    const chevronSize = depth === 0 ? 'h-3.5 w-3.5' : 'h-3 w-3';
    const textSize = depth === 0 ? 'text-[12px] font-semibold' : depth === 1 ? 'text-[11px] font-medium' : 'text-[10px] font-medium';
    const countSize = depth === 0 ? 'text-[11px]' : 'text-[10px]';
    const py = depth === 0 ? 'py-2.5' : 'py-2';

    return (
      <div key={key} className={cn(depth > 0 && "border-b border-border last:border-b-0")}>
        <button
          onClick={() => toggleGroup(key)}
          className={cn("w-full flex items-center gap-2 px-3 text-left hover:bg-accent/50 transition-colors", py)}
        >
          {open
            ? <ChevronDown className={cn(chevronSize, "text-muted-foreground shrink-0")} />
            : <ChevronRight className={cn(chevronSize, "text-muted-foreground shrink-0")} />
          }
          <span className={cn(textSize, "text-foreground")}>{node.label}</span>
          <span className={cn(countSize, "text-muted-foreground")}>({node.items.length})</span>
          {renderSummary && (
            <div className="ml-auto">{renderSummary(node.items)}</div>
          )}
        </button>
        {open && (
          <div className="border-t border-border">
            {node.subGroups && node.subGroups.length > 0 ? (
              <div className="pl-4">
                {node.subGroups.map(sg => renderNode(sg, key, depth + 1))}
              </div>
            ) : (
              renderTable(node.items, node.label)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.label} className="bg-card border border-border rounded overflow-hidden">
          {renderNode(g, '', 0)}
        </div>
      ))}
    </div>
  );
}
