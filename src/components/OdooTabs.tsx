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
}

export function OdooTabs({ tabs, defaultTab, activeTab }: OdooTabsProps) {
  const [active, setActive] = useState(activeTab ?? defaultTab ?? tabs[0]?.key);

  useEffect(() => {
    if (activeTab) setActive(activeTab);
  }, [activeTab]);

  return (
    <div>
      <div className="flex border-b border-border gap-0 overflow-x-auto">
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
      <div className="pt-3">
        {tabs.find(t => t.key === active)?.content}
      </div>
    </div>
  );
}
