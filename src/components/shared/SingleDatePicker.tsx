import * as React from 'react';
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDateDMY, normalizeDateISO, parseDMY } from '@/lib/date-format';

export interface SingleDatePickerProps {
  /** ISO yyyy-mm-dd */
  value?: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  /** disables the X clear button */
  required?: boolean;
  /** show preset shortcuts column */
  showPresets?: boolean;
  /** id for label association */
  id?: string;
  disabled?: boolean;
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const PRESETS: { label: string; get: () => Date }[] = [
  { label: 'Hoy', get: () => startOfDay(new Date()) },
  { label: 'Ayer', get: () => addDays(startOfDay(new Date()), -1) },
  { label: 'Hace 7 días', get: () => addDays(startOfDay(new Date()), -7) },
  { label: 'Hace 30 días', get: () => addDays(startOfDay(new Date()), -30) },
  { label: 'Primer día del mes', get: () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); } },
  { label: 'Último día del mes', get: () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 0); } },
];

function isoToDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function SingleDatePicker({
  value,
  onChange,
  className,
  placeholder = 'Seleccionar fecha',
  required,
  showPresets = true,
  id,
  disabled,
}: SingleDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date | undefined>(isoToDate(value));
  const [text, setText] = React.useState(value ? formatDateDMY(value) : '');

  React.useEffect(() => {
    if (open) {
      setDraft(isoToDate(value));
      setText(value ? formatDateDMY(value) : '');
    }
  }, [open, value]);

  const buttonLabel = value ? formatDateDMY(value) : placeholder;

  const handlePreset = (d: Date) => {
    setDraft(d);
    setText(formatDateDMY(d));
  };

  const handleSelect = (d: Date | undefined) => {
    setDraft(d);
    setText(d ? formatDateDMY(d) : '');
  };

  const handleApply = () => {
    onChange(draft ? normalizeDateISO(draft) : '');
    setOpen(false);
  };

  const handleTextBlur = () => {
    const d = parseDMY(text);
    if (d) setDraft(d);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="default"
            size="sm"
            disabled={disabled}
            className={cn(
              'h-9 gap-2 font-normal bg-primary text-primary-foreground hover:bg-primary/90',
              !value && 'opacity-90'
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>{buttonLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="flex">
            {showPresets && (
              <div className="flex flex-col gap-1 border-r border-border p-2 min-w-[160px]">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.get())}
                    className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col pointer-events-auto">
              <DayPicker
                mode="single"
                locale={es}
                weekStartsOn={1}
                selected={draft}
                onSelect={handleSelect}
                defaultMonth={draft ?? new Date()}
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
                  head_cell: 'text-muted-foreground rounded-md w-10 font-normal text-[0.75rem]',
                  row: 'flex w-full mt-1',
                  cell: 'h-10 w-10 text-center text-sm p-0 relative',
                  day: cn(buttonVariants({ variant: 'ghost' }), 'h-10 w-10 p-0 font-normal tabular-nums aria-selected:opacity-100'),
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
              <div className="border-t border-border p-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Fecha</label>
                  <Input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onBlur={handleTextBlur}
                    placeholder="dd/mm/aaaa"
                    className="h-8 w-[120px] text-sm"
                  />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleApply}>Aplicar</Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {!required && value && !disabled && (
        <button
          type="button"
          onClick={handleClearAll}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Limpiar fecha"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default SingleDatePicker;
