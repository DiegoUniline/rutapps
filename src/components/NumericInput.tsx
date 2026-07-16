import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * NumericInput — universal numeric field for the whole app.
 *
 * Fixes the "phantom 0" bug: fields that visually show `0` but where typing
 * `1` results in `10`. The `0` is shown as *placeholder only* until the user
 * captures a real value.
 *
 * Value contract:
 *  - `null` / `undefined` → empty input, `placeholder="0"` visible.
 *  - `0`
 *      • `zeroBehavior="placeholder"` (default) → rendered empty, placeholder shows.
 *      • `zeroBehavior="select-on-focus"` → keeps "0", selects all on focus so
 *        typing "1" replaces it (never becomes "10").
 *      • `zeroBehavior="keep"` → literal "0" with no auto-select.
 *  - Any other number → rendered as-is.
 *
 * onChange emits `null` while the field is empty and a real `number` once the
 * user types a valid value. Never emits `NaN`.
 */
export type ZeroBehavior = 'placeholder' | 'select-on-focus' | 'keep';

export interface NumericInputProps {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  allowDecimals?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
  decimals?: number;
  zeroBehavior?: ZeroBehavior;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputMode?: 'numeric' | 'decimal';
}

function toDraft(
  value: number | null | undefined,
  zeroBehavior: ZeroBehavior,
): string {
  if (value === null || value === undefined) return '';
  if (value === 0 && zeroBehavior === 'placeholder') return '';
  return String(value);
}

function sanitize(raw: string, allowDecimals: boolean, allowNegative: boolean) {
  // Normalize comma to dot for decimal separator (es-MX users often type ",")
  let v = raw.replace(',', '.');
  // Strip anything that is not digit, dot or minus
  v = v.replace(/[^\d.\-]/g, '');
  // Only leading minus if allowed
  if (!allowNegative) v = v.replace(/-/g, '');
  else v = v.replace(/(?!^)-/g, '');
  // At most one dot
  if (!allowDecimals) v = v.replace(/\./g, '');
  else {
    const [head, ...rest] = v.split('.');
    if (rest.length > 0) v = head + '.' + rest.join('').replace(/\./g, '');
  }
  return v;
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      value,
      onChange,
      placeholder = '0',
      allowDecimals = true,
      allowNegative = false,
      min,
      max,
      step,
      decimals,
      zeroBehavior = 'placeholder',
      className,
      disabled,
      readOnly,
      autoFocus,
      id,
      name,
      ariaLabel,
      onBlur,
      onFocus,
      onKeyDown,
      inputMode,
    },
    ref,
  ) {
    const [draft, setDraft] = useState<string>(() => toDraft(value, zeroBehavior));
    const focusedRef = useRef(false);

    // Sync external value → internal draft when not focused.
    useEffect(() => {
      if (focusedRef.current) return;
      setDraft(toDraft(value, zeroBehavior));
    }, [value, zeroBehavior]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const clean = sanitize(e.target.value, allowDecimals, allowNegative);
        setDraft(clean);
        if (clean === '' || clean === '-' || clean === '.' || clean === '-.') {
          onChange(null);
          return;
        }
        const n = Number(clean);
        if (Number.isNaN(n)) {
          onChange(null);
          return;
        }
        onChange(n);
      },
      [allowDecimals, allowNegative, onChange],
    );

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        focusedRef.current = true;
        if (zeroBehavior === 'placeholder' && value === 0) {
          setDraft('');
        } else if (zeroBehavior === 'select-on-focus') {
          // Defer to allow the caret to settle then select all.
          requestAnimationFrame(() => {
            try {
              e.target.select();
            } catch {
              /* noop */
            }
          });
        }
        onFocus?.(e);
      },
      [value, zeroBehavior, onFocus],
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        focusedRef.current = false;
        // Clamp to min/max when a real value exists.
        if (draft !== '' && draft !== '-' && draft !== '.') {
          let n = Number(draft);
          if (!Number.isNaN(n)) {
            if (typeof min === 'number' && n < min) n = min;
            if (typeof max === 'number' && n > max) n = max;
            if (typeof decimals === 'number') {
              const f = Math.pow(10, decimals);
              n = Math.round(n * f) / f;
            }
            if (n !== Number(draft)) {
              setDraft(String(n));
              onChange(n);
            }
          } else {
            setDraft('');
            onChange(null);
          }
        } else {
          setDraft('');
        }
        // Re-sync draft to canonical value display after blur.
        setDraft((prev) => {
          if (prev === '') return toDraft(value === undefined ? null : value, zeroBehavior);
          return prev;
        });
        onBlur?.(e);
      },
      [draft, min, max, decimals, value, zeroBehavior, onBlur, onChange],
    );

    const resolvedInputMode =
      inputMode ?? (allowDecimals ? 'decimal' : 'numeric');

    return (
      <input
        ref={ref}
        id={id}
        name={name}
        aria-label={ariaLabel}
        type="text"
        inputMode={resolvedInputMode}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={draft}
        step={step as any}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    );
  },
);

export default NumericInput;
