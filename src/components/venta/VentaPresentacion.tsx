import { useState } from 'react';
import { usePresentaciones, type ProductoPresentacion } from '@/hooks/usePresentaciones';
import { presentationSummary } from '@/lib/ventaPresentacion';
import type { VentaLinea } from '@/types';

export type ChangePresentation = (idx: number, presentation: ProductoPresentacion | null) => Promise<void>;

export function VentaPresentacion({ line, unit = 'unidades' }: { line: Partial<VentaLinea>; unit?: string }) {
  const summary = presentationSummary(line, unit);
  return summary ? <div className="mt-1 text-[11px] font-medium text-primary whitespace-normal">{summary}</div> : null;
}

export function VentaPresentacionEditor({ line, idx, unit, disabled, onChange, onUpdateLine }: {
  line: Partial<VentaLinea>;
  idx: number;
  unit: string;
  disabled: boolean;
  onChange: ChangePresentation;
  onUpdateLine: (idx: number, field: string, value: unknown) => void;
}) {
  const { data, isLoading, error, refetch } = usePresentaciones(line.producto_id);
  const [busy, setBusy] = useState(false);
  const active = (data ?? []).filter(p => p.activo && Number(p.factor_base) > 0);
  if (!line.producto_id) return null;
  if (isLoading) return <div className="text-[11px] text-muted-foreground mt-1">Cargando presentaciones…</div>;
  if (error) return <button type="button" className="text-[11px] text-destructive mt-1" onClick={() => refetch()}>No se pudieron cargar las presentaciones. Reintentar</button>;
  if (!active.length && !line.presentacion_nombre) return null;
  return <div className="mt-1.5 space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[11px] text-muted-foreground">
        Presentación
        <select aria-label="Presentación" className="ml-1 rounded border border-input bg-background px-2 py-1 text-xs max-w-full" value={line.presentacion_id ?? ''} disabled={disabled || busy} onChange={async e => {
          const presentation = active.find(p => p.id === e.target.value) ?? null;
          setBusy(true);
          try { await onChange(idx, presentation); } finally { setBusy(false); }
        }}>
          <option value="">Unidad base ({unit})</option>
          {line.presentacion_id && !active.some(p => p.id === line.presentacion_id) && <option value={line.presentacion_id} disabled>{line.presentacion_nombre} (inactiva)</option>}
          {active.map(p => <option key={p.id} value={p.id}>{p.nombre} · {Number(p.factor_base)} {unit}</option>)}
        </select>
      </label>
      {line.presentacion_nombre && <label className="text-[11px] text-muted-foreground">Paquetes
        <input aria-label="Cantidad de paquetes" type="number" inputMode="decimal" min="0" step="0.001" disabled={disabled || busy} className="ml-1 w-20 rounded border border-input bg-background px-2 py-1 text-xs" value={line.paquetes ?? ''} onFocus={e => e.target.select()} onChange={e => onUpdateLine(idx, 'paquetes', e.target.value)} />
      </label>}
    </div>
    <VentaPresentacion line={line} unit={unit} />
  </div>;
}
