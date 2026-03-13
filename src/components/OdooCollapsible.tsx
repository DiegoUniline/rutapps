import { useState, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OdooCollapsibleProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function OdooCollapsible({ title, summary, defaultOpen = true, children }: OdooCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        {title}
        {!open && summary && (
          <span className="text-xs font-normal text-muted-foreground ml-2">{summary}</span>
        )}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
