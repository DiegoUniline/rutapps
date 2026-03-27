import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface GroupedTableWrapperProps {
  groupBy: string;
  groups: { label: string; items: any[]; subGroups?: { label: string; items: any[] }[] }[];
  renderTable: (items: any[], groupLabel?: string) => React.ReactNode;
  renderSummary?: (items: any[]) => React.ReactNode;
}

export function GroupedTableWrapper({ groupBy, groups, renderTable, renderSummary }: GroupedTableWrapperProps) {
  // Start ALL groups collapsed by default
  const allLabels = useMemo(() => {
    const labels: string[] = [];
    for (const g of groups) {
      labels.push(g.label);
      if (g.subGroups) {
        for (const sg of g.subGroups) {
          labels.push(`${g.label}__${sg.label}`);
        }
      }
    }
    return labels;
  }, [groups]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!groupBy || groups.length <= 1) {
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

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.label} className="bg-card border border-border rounded overflow-hidden">
          <button
            onClick={() => toggleGroup(g.label)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
          >
            {isExpanded(g.label)
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-[12px] font-semibold text-foreground">{g.label}</span>
            <span className="text-[11px] text-muted-foreground">({g.items.length})</span>
            {renderSummary && (
              <div className="ml-auto">{renderSummary(g.items)}</div>
            )}
          </button>
          {isExpanded(g.label) && (
            <div className="border-t border-border">
              {g.subGroups && g.subGroups.length > 0 ? (
                <div className="pl-4">
                  {g.subGroups.map(sg => {
                    const subKey = `${g.label}__${sg.label}`;
                    return (
                      <div key={sg.label} className="border-b border-border last:border-b-0">
                        <button
                          onClick={() => toggleGroup(subKey)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                        >
                          {isExpanded(subKey)
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          }
                          <span className="text-[11px] font-medium text-foreground">{sg.label}</span>
                          <span className="text-[10px] text-muted-foreground">({sg.items.length})</span>
                          {renderSummary && (
                            <div className="ml-auto">{renderSummary(sg.items)}</div>
                          )}
                        </button>
                        {isExpanded(subKey) && (
                          <div className="border-t border-border">
                            {renderTable(sg.items, sg.label)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                renderTable(g.items, g.label)
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
