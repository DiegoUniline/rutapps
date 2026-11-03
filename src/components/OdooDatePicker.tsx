import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseFechaTeclado } from '@/lib/parseFechaTeclado';

const ANIO_ACTUAL = new Date().getFullYear();

interface OdooDatePickerProps {
  value?: string; // ISO date string YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function OdooDatePicker({ value, onChange, placeholder = 'Seleccionar fecha', className, disabled = false }: OdooDatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + 'T12:00:00') : undefined;
  // Captura con teclado (dd/mm/aaaa) y mes visible del calendario (se mueve con los selectores).
  const [texto, setTexto] = useState('');
  const [textoInvalido, setTextoInvalido] = useState(false);
  const [mes, setMes] = useState<Date>(date ?? new Date());

  useEffect(() => {
    if (!open) return;
    setTexto(date ? format(date, 'dd/MM/yyyy') : '');
    setTextoInvalido(false);
    setMes(date ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const aplicarTexto = () => {
    if (!texto.trim()) return;
    const iso = parseFechaTeclado(texto);
    if (!iso) { setTextoInvalido(true); return; }
    onChange(iso);
    setOpen(false);
  };

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, 'yyyy-MM-dd'));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={nextOpen => { if (!disabled) setOpen(nextOpen); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-8 px-2.5 text-[13px] border-input bg-card",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {date ? format(date, "d 'de' MMM, yyyy", { locale: es }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="px-3 pt-3">
          <input
            autoFocus
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            value={texto}
            onChange={e => {
              setTexto(e.target.value);
              setTextoInvalido(false);
              const iso = parseFechaTeclado(e.target.value);
              if (iso) setMes(new Date(iso + 'T12:00:00'));
            }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarTexto(); } }}
            className={cn(
              "w-full h-8 rounded-md border bg-background px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring",
              textoInvalido ? "border-destructive" : "border-input",
            )}
            aria-label="Escribir fecha (dd/mm/aaaa)"
            aria-invalid={textoInvalido}
          />
          <p className={cn("mt-1 text-[11px]", textoInvalido ? "text-destructive" : "text-muted-foreground")}>
            {textoInvalido ? 'Fecha no válida. Usa dd/mm/aaaa.' : 'Escribe la fecha y presiona Enter, o elígela abajo.'}
          </p>
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          month={mes}
          onMonthChange={setMes}
          captionLayout="dropdown-buttons"
          fromYear={1950}
          toYear={ANIO_ACTUAL + 10}
          className={cn("p-3 pointer-events-auto")}
          classNames={{
            caption_label: "text-sm font-medium inline-flex items-center gap-1",
            caption_dropdowns: "flex justify-center gap-2",
            dropdown_month: "relative inline-flex items-center rounded-md border border-input px-2 h-7 hover:bg-accent",
            dropdown_year: "relative inline-flex items-center rounded-md border border-input px-2 h-7 hover:bg-accent",
            dropdown: "absolute inset-0 w-full cursor-pointer opacity-0",
            vhidden: "sr-only",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
