import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface InlineEditCellProps {
  value: string | number | null | undefined;
  onSave: (val: string) => void;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  format?: (val: any) => string;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
  inputClassName?: string;
  min?: string;
  max?: string;
  step?: string;
}

/**
 * Global inline-edit cell.
 * - Single click → edit mode
 * - Select all text on focus
 * - Tab / Enter → save + move focus
 * - Escape → discard
 * - Click outside → save
 * - No visible border at rest; subtle border in edit mode
 */
export function InlineEditCell({
  value,
  onSave,
  type = 'text',
  options,
  placeholder,
  format,
  required,
  readOnly,
  className,
  inputClassName,
  min, max, step,
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const originalValue = useRef('');

  const startEdit = useCallback(() => {
    if (readOnly) return;
    const v = value?.toString() ?? '';
    setDraft(v);
    originalValue.current = v;
    setEditing(true);
    setInvalid(false);
  }, [value, readOnly]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (required && !trimmed) {
      // Restore original
      setDraft(originalValue.current);
      setEditing(false);
      setInvalid(false);
      return;
    }
    if (trimmed !== originalValue.current) {
      onSave(trimmed);
    }
    setEditing(false);
    setInvalid(false);
  }, [draft, required, onSave]);

  const discard = useCallback(() => {
    setDraft(originalValue.current);
    setEditing(false);
    setInvalid(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      discard();
    }
  };

  const handleBlur = () => {
    save();
  };

  // Display value
  const displayValue = format
    ? format(value)
    : type === 'select' && options
      ? options.find(o => o.value === value?.toString())?.label ?? (value?.toString() || '')
      : (value?.toString() || '');
  const isEmpty = !value && value !== 0;

  if (readOnly) {
    return (
      <span className={cn('inline-edit-cell inline-edit-readonly', isEmpty && 'text-muted-foreground', className)}>
        {displayValue || placeholder || '—'}
      </span>
    );
  }

  if (!editing) {
    return (
      <span
        className={cn(
          'inline-edit-cell inline-edit-idle',
          isEmpty && 'text-muted-foreground',
          className
        )}
        onClick={startEdit}
      >
        {displayValue || placeholder || '—'}
      </span>
    );
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as any}
        className={cn('inline-edit-input', invalid && 'inline-edit-invalid', inputClassName)}
        value={draft}
        onChange={e => { setDraft(e.target.value); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        <option value="">{placeholder || 'Seleccionar'}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as any}
      type={type}
      className={cn('inline-edit-input', invalid && 'inline-edit-invalid', inputClassName)}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step ?? (type === 'number' ? '0.01' : undefined)}
      inputMode={type === 'number' ? 'numeric' : undefined}
    />
  );
}
