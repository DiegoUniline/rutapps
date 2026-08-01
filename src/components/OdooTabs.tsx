import { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OdooTab {
  key: string;
  label: string;
  content: ReactNode;
}

interface OdooTabsProps {
  tabs: OdooTab[];
  defaultTab?: string;
  activeTab?: string;
  /** Cuando es true, las pestañas ocupan toda la altura disponible y el scroll queda en el contenido */
  fill?: boolean;
}

export function OdooTabs({ tabs, defaultTab, activeTab, fill }: OdooTabsProps) {
  const [active, setActive] = useState(activeTab ?? defaultTab ?? tabs[0]?.key);

  useEffect(() => {
    if (activeTab) setActive(activeTab);
  }, [activeTab]);

  return (
    <div className={cn(fill && "flex-1 min-h-0 flex flex-col")}>
      <div className={cn("flex border-b border-border gap-0 overflow-x-auto", fill && "shrink-0")}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={cn("odoo-tab whitespace-nowrap", active === tab.key && "odoo-tab-active")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={cn("pt-3", fill && "flex-1 min-h-0 flex flex-col")}>
        {tabs.find(t => t.key === active)?.content}
      </div>
    </div>
  );
}
