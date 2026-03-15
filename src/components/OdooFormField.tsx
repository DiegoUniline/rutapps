import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';

// ===== Inline editable field (single click → edit) =====

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
  required?: boolean;
}

export function OdooField({
  label, value, onChange, type = 'text', options, placeholder,
  help, teal, format, readOnly, alwaysEdit, required,
}: OdooFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const originalValue = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isEdit = alwaysEdit || editing;

  const startEdit = useCallback(() => {
    if (readOnly) return;
    const v = value?.toString() ?? '';
    setDraft(v);
    originalValue.current = v;
    setEditing(true);
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
      setEditing(false);
      return;
    }
    if (trimmed !== originalValue.current) {
      onChange(trimmed);
    }
    setEditing(false);
  }, [draft, required, onChange]);

  const discard = useCallback(() => {
    setEditing(false);
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

  const displayValue = format
    ? format(value)
    : type === 'select' && options
      ? options.find(o => o.value === value?.toString())?.label ?? (value?.toString() || '')
      : (value?.toString() || '');
  const isEmpty = !value && value !== 0;

  // For select fields: single click → open searchable dropdown immediately
  if (type === 'select' && options) {
    return (
      <div className="odoo-field-row">
        <span className="odoo-field-label">
          {label}
          {help && <HelpCircle className="h-3 w-3 odoo-help-icon" />}
        </span>
        {readOnly ? (
          <span className={cn("inline-edit-cell inline-edit-readonly", isEmpty && "text-muted-foreground", teal && !isEmpty && "odoo-field-value-teal")}>
            {displayValue || '—'}
          </span>
        ) : isEdit ? (
          <div className="odoo-field-editing">
            <SearchableSelect
              options={options}
              value={value?.toString() ?? ''}
              onChange={(val) => {
                onChange(val);
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
              placeholder={placeholder || 'Buscar...'}
              autoOpen
            />
          </div>
        ) : (
          <span
            className={cn(
              "inline-edit-cell inline-edit-idle",
              isEmpty && "text-muted-foreground",
              teal && !isEmpty && "odoo-field-value-teal"
            )}
            onClick={startEdit}
          >
            {displayValue || placeholder || '—'}
          </span>
        )}
      </div>
    );
  }

  // Text / Number fields (unchanged logic)
  return (
    <div className="odoo-field-row">
      <span className="odoo-field-label">
        {label}
        {help && <HelpCircle className="h-3 w-3 odoo-help-icon" />}
      </span>
      {readOnly ? (
        <span className={cn("inline-edit-cell inline-edit-readonly", isEmpty && "text-muted-foreground", teal && !isEmpty && "odoo-field-value-teal")}>
          {displayValue || '—'}
        </span>
      ) : isEdit && !alwaysEdit ? (
        <div className="odoo-field-editing">
          <input
            ref={inputRef}
            type={type}
            className="inline-edit-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            step={type === 'number' ? '0.01' : undefined}
            inputMode={type === 'number' ? 'numeric' : undefined}
          />
        </div>
      ) : alwaysEdit ? (
        <div className="odoo-field-editing">
          <input
            type={type}
            className="inline-edit-input"
            value={value?.toString() ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            step={type === 'number' ? '0.01' : undefined}
            inputMode={type === 'number' ? 'numeric' : undefined}
          />
        </div>
      ) : (
        <span
          className={cn(
            "inline-edit-cell inline-edit-idle",
            isEmpty && "text-muted-foreground",
            teal && !isEmpty && "odoo-field-value-teal"
          )}
          onClick={startEdit}
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
