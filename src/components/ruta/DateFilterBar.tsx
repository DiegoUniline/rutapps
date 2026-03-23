import { CalendarDays } from 'lucide-react';

interface Props {
  desde: string;
  hasta: string;
  onDesdeChange: (v: string) => void;
  onHastaChange: (v: string) => void;
}

export default function DateFilterBar({ desde, hasta, onDesdeChange, onHastaChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-card/80 rounded-xl px-3 py-2 border border-border">
      <CalendarDays className="h-4 w-4 text-primary shrink-0" />
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <input
          type="date"
          value={desde}
          onChange={e => onDesdeChange(e.target.value)}
          className="bg-accent/60 rounded-lg px-2 py-1.5 text-[12px] text-foreground border-0 focus:outline-none focus:ring-1.5 focus:ring-primary/40 w-[120px]"
        />
        <span className="text-[11px] text-muted-foreground">al</span>
        <input
          type="date"
          value={hasta}
          onChange={e => onHastaChange(e.target.value)}
          className="bg-accent/60 rounded-lg px-2 py-1.5 text-[12px] text-foreground border-0 focus:outline-none focus:ring-1.5 focus:ring-primary/40 w-[120px]"
        />
      </div>
    </div>
  );
}
