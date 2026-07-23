import { OdooField } from '@/components/OdooFormField';
import { calcTax } from '@/lib/taxUtils';
import type { Producto, UnidadSat } from '@/types';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  unidadesSat?: UnidadSat[];
}

export function ProductoFiscalTab({ form, set, unidadesSat }: Props) {
  const { symbol: s } = useCurrency();
  const findSat = (list: UnidadSat[] | undefined, id: string | undefined) => {
    const u = list?.find(i => i.id === id);
    return u ? `${u.clave} - ${u.nombre}` : '';
  };

  const claveOk = !!form.codigo_sat && /^\d{8}$/.test((form.codigo_sat || '').toString().trim()) && form.codigo_sat !== '01010101';
  const unidadOk = !!form.udem_sat_id;
  const listoCfdi = claveOk && unidadOk;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border ${listoCfdi ? 'bg-primary/10 text-primary border-primary/30' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${listoCfdi ? 'bg-primary' : 'bg-destructive'}`} />
            {listoCfdi ? 'Listo para CFDI' : 'Faltan datos SAT'}
          </span>
          {!listoCfdi && (
            <span className="text-[11px] text-muted-foreground">
              {!claveOk && 'Clave SAT (8 dígitos) requerida. '}
              {!unidadOk && 'Unidad SAT requerida.'}
            </span>
          )}
        </div>
        <OdooField label="Código SAT" value={form.codigo_sat} help onChange={v => set('codigo_sat', v)} />
        <OdooField label="Unidad SAT" value={form.udem_sat_id} type="select"
          options={unidadesSat?.map(u => ({ value: u.id, label: `${u.clave} - ${u.nombre}` })) ?? []}
          onChange={v => set('udem_sat_id', v || null)} format={() => findSat(unidadesSat, form.udem_sat_id ?? undefined)} />
      </div>
      <div>
        <OdooField label="IVA %" value={form.iva_pct ?? 16} type="number" teal onChange={v => set('iva_pct', +v)} format={v => `${v ?? 16}%`} />
        <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
          {[0, 8, 16].map(rate => (
            <button key={rate} type="button" onClick={() => set('iva_pct', rate)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${form.iva_pct === rate ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{rate}%</button>
          ))}
        </div>
        <div className="odoo-field-row">
          <span className="odoo-field-label">Tiene IEPS</span>
          <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
            <input type="checkbox" checked={!!form.tiene_ieps} onChange={e => { const on = e.target.checked; set('tiene_ieps', on); if (!on) set('ieps_pct', 0); }} className="rounded border-input h-3.5 w-3.5" />
            <span className="text-[11px] text-muted-foreground">Activar impuesto especial</span>
          </label>
        </div>
        <div className="odoo-field-row">
          <span className="odoo-field-label">Tipo IEPS</span>
          <div className="flex gap-2 pt-[2px]">
            {(['porcentaje', 'cuota'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('ieps_tipo', t)}
                className={`text-[11px] px-3 py-1 rounded border transition-colors ${(form.ieps_tipo || 'porcentaje') === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {t === 'porcentaje' ? '% Porcentaje' : `${s} Cuota fija`}
              </button>
            ))}
          </div>
        </div>
        <OdooField label={(form.ieps_tipo || 'porcentaje') === 'cuota' ? 'IEPS cuota $' : 'IEPS %'} value={form.ieps_pct ?? 0} type="number" teal onChange={v => { const n = +v; set('ieps_pct', n); set('tiene_ieps', n > 0); }} format={v => (form.ieps_tipo || 'porcentaje') === 'cuota' ? `$ ${v ?? 0}` : `${v ?? 0}%`} />
        {(form.ieps_tipo || 'porcentaje') === 'porcentaje' && (
          <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
            {[0, 8, 25, 53].map(rate => (
              <button key={rate} type="button" onClick={() => { set('ieps_pct', rate); set('tiene_ieps', rate > 0); }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${form.ieps_pct === rate ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>{rate}%</button>
            ))}
          </div>
        )}
        <div className="odoo-field-row">
          <span className="odoo-field-label">Costo incluye impuestos</span>
          <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
            <input type="checkbox" checked={!!form.costo_incluye_impuestos} onChange={e => set('costo_incluye_impuestos', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
          </label>
        </div>
        {form.costo_incluye_impuestos && (form.costo ?? 0) > 0 && (
          <div className="ml-[140px] text-xs text-muted-foreground bg-secondary/50 rounded p-2 mb-2">
            {(() => {
              const t = calcTax({ precio: form.costo ?? 0, iva_pct: form.iva_pct ?? 16, ieps_pct: form.ieps_pct ?? 0, ieps_tipo: (form.ieps_tipo as any) || 'porcentaje', incluye_impuestos: true });
              return <>Costo neto: <strong>{s} {t.precio_neto.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong> + IEPS: {s} {t.ieps_monto.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} + IVA: {s} {t.iva_monto.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</>;
            })()}
          </div>
        )}
        <div className="mt-2 bg-accent/30 border border-accent/50 rounded px-3 py-2 text-[11px] text-muted-foreground">
          💡 El IVA se calcula sobre el precio + IEPS (estándar fiscal mexicano). IEPS puede ser porcentaje o cuota fija por unidad.
        </div>
      </div>
    </div>
  );
}
