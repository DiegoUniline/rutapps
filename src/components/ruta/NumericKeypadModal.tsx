import { useState, useEffect } from 'react';
import { X, Delete, Check } from 'lucide-react';

interface Props {
  open: boolean;
  initialValue?: number;
  title?: string;
  subtitle?: string;
  allowDecimal?: boolean;
  maxValue?: number;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

const KEYS = ['1','2','3','4','5','6','7','8','9'];

/**
 * Large POS-style numeric keypad designed for fast cantidad / monto entry.
 */
export default function NumericKeypadModal({ open, initialValue = 0, title = 'Cantidad', subtitle, allowDecimal = false, maxValue, onClose, onConfirm }: Props) {
  const [value, setValue] = useState<string>('');

  useEffect(() => {
    if (open) setValue(initialValue && initialValue > 0 ? String(initialValue) : '');
  }, [open, initialValue]);

  if (!open) return null;

  const press = (k: string) => {
    setValue(prev => {
      if (k === '.') {
        if (!allowDecimal || prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const next = prev === '0' ? k : prev + k;
      // Avoid silly long strings
      if (next.length > 9) return prev;
      return next;
    });
  };

  const back = () => setValue(prev => prev.slice(0, -1));
  const clear = () => setValue('');

  const num = parseFloat(value || '0') || 0;
  const exceedsMax = typeof maxValue === 'number' && num > maxValue;

  const confirm = () => {
    if (num <= 0) { onClose(); return; }
    if (exceedsMax) return;
    onConfirm(num);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-card rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-200 safe-area-bottom"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Display */}
        <div className="px-5 pb-3">
          <div className={`rounded-2xl px-4 py-5 ${exceedsMax ? 'bg-destructive/10' : 'bg-accent/50'}`}>
            <p className={`text-right text-[44px] leading-none font-bold tabular-nums ${exceedsMax ? 'text-destructive' : 'text-foreground'}`}>
              {value || '0'}
            </p>
            {exceedsMax && (
              <p className="text-right text-[11px] text-destructive font-medium mt-1">Máximo disponible: {maxValue}</p>
            )}
            {typeof maxValue === 'number' && !exceedsMax && (
              <p className="text-right text-[10px] text-muted-foreground mt-1">Máx: {maxValue}</p>
            )}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {KEYS.map(k => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-2xl bg-accent/60 active:bg-accent active:scale-95 transition-all text-[24px] font-bold text-foreground"
            >
              {k}
            </button>
          ))}
          <button
            onClick={() => allowDecimal ? press('.') : clear()}
            className="h-14 rounded-2xl bg-accent/40 active:bg-accent active:scale-95 transition-all text-[18px] font-bold text-muted-foreground"
          >
            {allowDecimal ? '.' : 'C'}
          </button>
          <button
            onClick={() => press('0')}
            className="h-14 rounded-2xl bg-accent/60 active:bg-accent active:scale-95 transition-all text-[24px] font-bold text-foreground"
          >
            0
          </button>
          <button
            onClick={back}
            className="h-14 rounded-2xl bg-accent/40 active:bg-accent active:scale-95 transition-all flex items-center justify-center text-muted-foreground"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        {/* Confirm */}
        <div className="px-4 pb-4">
          <button
            onClick={confirm}
            disabled={exceedsMax || num <= 0}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100 shadow-lg shadow-primary/20"
          >
            <Check className="h-5 w-5" />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
