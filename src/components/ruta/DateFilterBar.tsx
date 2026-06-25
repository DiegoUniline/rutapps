import { DateRangePicker } from '@/components/shared/DateRangePicker';

interface Props {
  desde: string;
  hasta: string;
  onDesdeChange: (v: string) => void;
  onHastaChange: (v: string) => void;
}

export default function DateFilterBar({ desde, hasta, onDesdeChange, onHastaChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-card/80 rounded-xl px-3 py-2 border border-border">
      <DateRangePicker
        from={desde}
        to={hasta}
        onChange={(f, t) => { onDesdeChange(f); onHastaChange(t); }}
      />
    </div>
  );
}
