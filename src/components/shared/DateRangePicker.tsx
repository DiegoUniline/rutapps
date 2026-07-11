import * as React from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  formatDateDMY,
  normalizeDateISO,
  parseDMY,
} from '@/lib/date-format';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';


export interface DateRangePickerProps {
  /** ISO yyyy-mm-dd */
  from?: string;
  /** ISO yyyy-mm-dd */
  to?: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  placeholder?: string;
}

type Preset = { label: string; getRange: () => { from: Date; to: Date } };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const PRESETS: Preset[] = [
  { label: 'Hoy', getRange: () => { const t = startOfDay(new Date()); return { from: t, to: t }; } },
  { label: 'Ayer', getRange: () => { const y = addDays(startOfDay(new Date()), -1); return { from: y, to: y }; } },
  { label: 'Últimos 7 días', getRange: () => { const t = startOfDay(new Date()); return { from: addDays(t, -6), to: t }; } },
  { label: 'Últimos 30 días', getRange: () => { const t = startOfDay(new Date()); return { from: addDays(t, -29), to: t }; } },
  { label: 'Este mes', getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: new Date(n.getFullYear(), n.getMonth() + 1, 0) }; } },
  { label: 'Mes pasado', getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth() - 1, 1), to: new Date(n.getFullYear(), n.getMonth(), 0) }; } },
  { label: 'Este año', getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), 0, 1), to: new Date(n.getFullYear(), 11, 31) }; } },
];

function isoToDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  placeholder = 'Seleccionar rango',
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const initialRange: DateRange | undefined = React.useMemo(() => {
    const f = isoToDate(from);
    const t = isoToDate(to);
    if (!f && !t) return undefined;
    return { from: f, to: t };
  }, [from, to]);

  const isMobile = useIsMobile();
  const [draft, setDraft] = React.useState<DateRange | undefined>(initialRange);

  const [fromText, setFromText] = React.useState(from ? formatDateDMY(from) : '');
  const [toText, setToText] = React.useState(to ? formatDateDMY(to) : '');

  React.useEffect(() => {
    if (open) {
      setDraft(initialRange);
      setFromText(from ? formatDateDMY(from) : '');
      setToText(to ? formatDateDMY(to) : '');
    }
  }, [open, initialRange, from, to]);

  const buttonLabel = React.useMemo(() => {
    if (from && to) return `${formatDateDMY(from)} → ${formatDateDMY(to)}`;
    if (from) return `${formatDateDMY(from)} →`;
    if (to) return `→ ${formatDateDMY(to)}`;
    return placeholder;
  }, [from, to, placeholder]);

  const handlePreset = (p: Preset) => {
    const r = p.getRange();
    setDraft({ from: r.from, to: r.to });
    setFromText(formatDateDMY(r.from));
    setToText(formatDateDMY(r.to));
  };

  const handleSelectRange = (r: DateRange | undefined) => {
    setDraft(r);
    setFromText(r?.from ? formatDateDMY(r.from) : '');
    setToText(r?.to ? formatDateDMY(r.to) : '');
  };

  const handleApply = () => {
    const f = draft?.from ? normalizeDateISO(draft.from) : '';
    const t = draft?.to ? normalizeDateISO(draft.to) : (draft?.from ? normalizeDateISO(draft.from) : '');
    onChange(f, t);
    setOpen(false);
  };

  const handleClearDraft = () => {
    setDraft(undefined);
    setFromText('');
    setToText('');
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
  };

  const onFromTextBlur = () => {
    const d = parseDMY(fromText);
    if (d) setDraft(prev => ({ from: d, to: prev?.to }));
  };
  const onToTextBlur = () => {
    const d = parseDMY(toText);
    if (d) setDraft(prev => ({ from: prev?.from, to: d }));
  };

  const hasValue = !!(from || to);

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="default" size="sm" className="h-9 gap-2 font-normal bg-primary text-primary-foreground hover:bg-primary/90">
            <CalendarIcon className="h-4 w-4" />
            <span>{buttonLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-[560px] p-0 pointer-events-auto max-h-[85vh] overflow-hidden" align="start" collisionPadding={8}>
          <div className="flex flex-col sm:flex-row max-h-[85vh]">
            {/* Presets */}
            <div className="flex sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-border p-2 sm:min-w-[140px] overflow-x-auto sm:overflow-x-visible shrink-0">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Calendar + footer */}
            <div className="flex flex-col pointer-events-auto flex-1 min-h-0 overflow-hidden">
              <div className="overflow-y-auto flex-1">
              <DayPicker
                mode="range"
                numberOfMonths={isMobile ? 1 : 2}

                locale={es}
                weekStartsOn={1}
                selected={draft}
                onSelect={handleSelectRange}
                defaultMonth={draft?.from ?? new Date()}
                showOutsideDays
                className="p-3 pointer-events-auto"
                classNames={{
                  months: 'flex flex-col sm:flex-row gap-4',
                  month: 'space-y-3',
                  caption: 'flex justify-center pt-1 relative items-center',
                  caption_label: 'text-sm font-medium capitalize',
                  nav: 'space-x-1 flex items-center',
                  nav_button: cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100'),
                  nav_button_previous: 'absolute left-1',
                  nav_button_next: 'absolute right-1',
                  table: 'w-full border-collapse',
                  head_row: 'flex',
                  head_cell: 'text-muted-foreground rounded-md w-9 sm:w-10 font-normal text-[0.75rem]',
                  row: 'flex w-full mt-1',
                  cell: 'h-9 w-9 sm:h-10 sm:w-10 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
                  day: cn(buttonVariants({ variant: 'ghost' }), 'h-9 w-9 sm:h-10 sm:w-10 p-0 font-normal tabular-nums aria-selected:opacity-100'),
                  day_range_start: 'day-range-start !bg-primary !text-primary-foreground rounded-l-md',
                  day_range_end: 'day-range-end !bg-primary !text-primary-foreground rounded-r-md',
                  day_range_middle: 'aria-selected:bg-primary/15 aria-selected:text-foreground',
                  day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  day_today: 'bg-foreground text-background hover:bg-foreground hover:text-background',
                  day_outside: 'text-muted-foreground opacity-50',
                  day_disabled: 'text-muted-foreground opacity-40',
                  day_hidden: 'invisible',
                }}
                components={{
                  IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                  IconRight: () => <ChevronRight className="h-4 w-4" />,
                }}
              />
              </div>
              <div className="border-t border-border p-3 flex flex-wrap items-center gap-2 bg-background shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Inicio</label>
                  <Input
                    value={fromText}
                    onChange={e => setFromText(e.target.value)}
                    onBlur={onFromTextBlur}
                    placeholder="dd/mm/aaaa"
                    className="h-8 w-[110px] text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Fin</label>
                  <Input
                    value={toText}
                    onChange={e => setToText(e.target.value)}
                    onBlur={onToTextBlur}
                    placeholder="dd/mm/aaaa"
                    className="h-8 w-[110px] text-sm"
                  />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleClearDraft}>Limpiar</Button>
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleApply}>Aplicar</Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>

      </Popover>
      {hasValue && (
        <button
          type="button"
          onClick={handleClearAll}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Limpiar rango"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default DateRangePicker;
