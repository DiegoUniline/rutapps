import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface OdooDatePickerProps {
  value?: string; // ISO date string YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function OdooDatePicker({ value, onChange, placeholder = 'Seleccionar fecha', className }: OdooDatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + 'T12:00:00') : undefined;

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, 'yyyy-MM-dd'));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
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
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={date || new Date()}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
