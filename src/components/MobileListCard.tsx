import { cn } from '@/lib/utils';

interface CardField {
  label: string;
  value: React.ReactNode;
  className?: string;
}

interface MobileListCardProps {
  title: string;
  subtitle?: string;
  fields: CardField[];
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  leading?: React.ReactNode;
}

export function MobileListCard({ title, subtitle, fields, badge, onClick, className, leading }: MobileListCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg p-3 space-y-2 active:bg-accent/50 transition-colors",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {leading}
          <div className="min-w-0">
            <div className="font-medium text-sm text-foreground truncate">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
          </div>
        </div>
        {badge}
      </div>
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {fields.map((f, i) => (
            <div key={i} className={cn("text-xs", f.className)}>
              <span className="text-muted-foreground">{f.label}: </span>
              <span className="text-foreground font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
