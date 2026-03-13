import { useState, useRef, useEffect, ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ===== Inline editable field (read mode → click → edit mode) =====

interface OdooFieldProps {
  label: string;
  value: string | number | undefined | null;
  onChange: (val: string) => void;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: boolean;
  teal?: boolean;
  format?: (val: any) => string;
  readOnly?: boolean;
  alwaysEdit?: boolean;
}

export function OdooField({
  label, value, onChange, type = 'text', options, placeholder,
  help, teal, format, readOnly, alwaysEdit,
}: OdooFieldProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const isEdit = alwaysEdit || editing;
  const displayValue = format
    ? format(value)
    : type === 'select' && options
      ? options.find(o => o.value === value?.toString())?.label ?? (value?.toString() || '')
      : (value?.toString() || '');
  const isEmpty = !value && value !== 0;

  const handleBlur = () => {
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setEditing(false);
    }
  };

  return (
    <div className="odoo-field-row">
      <span className="odoo-field-label">
        {label}
        {help && <HelpCircle className="h-3 w-3 odoo-help-icon" />}
      </span>
      {readOnly ? (
        <span className={cn("odoo-field-value", isEmpty && "odoo-field-value-empty", teal && !isEmpty && "odoo-field-value-teal")}>
          {displayValue || '—'}
        </span>
      ) : isEdit ? (
        <div className="odoo-field-editing">
          {type === 'select' && options ? (
            <select
              ref={inputRef as any}
              className="input-odoo py-1 text-[13px]"
              value={value?.toString() ?? ''}
              onChange={e => onChange(e.target.value)}
              onBlur={handleBlur}
            >
              <option value="">{placeholder || 'Seleccionar'}</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              ref={inputRef as any}
              type={type}
              className="input-odoo py-1 text-[13px]"
              value={value?.toString() ?? ''}
              onChange={e => onChange(type === 'number' ? e.target.value : e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              step={type === 'number' ? '0.01' : undefined}
            />
          )}
        </div>
      ) : (
        <span
          className={cn(
            "odoo-field-value",
            isEmpty && "odoo-field-value-empty",
            teal && "odoo-field-value-teal"
          )}
          onClick={() => setEditing(true)}
        >
          {displayValue || placeholder || '—'}
        </span>
      )}
    </div>
  );
}

// ===== Section divider =====
interface OdooSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function OdooSection({ title, defaultOpen = true, children }: OdooSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="odoo-section-divider">
      <button
        onClick={() => setOpen(!open)}
        className="odoo-section-title w-full text-left"
      >
        <span className={cn("transition-transform inline-block", open ? "rotate-90" : "")}>›</span>
        {title}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

// ===== Badge pill =====
interface OdooBadgeProps {
  label: string;
  onRemove?: () => void;
}

export function OdooBadge({ label, onRemove }: OdooBadgeProps) {
  return (
    <span className="odoo-badge">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="odoo-badge-remove">×</button>
      )}
    </span>
  );
}
