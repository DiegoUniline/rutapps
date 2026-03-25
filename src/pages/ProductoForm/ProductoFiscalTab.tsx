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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
      <div>
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
          <span className="odoo-field-label">Tipo IEPS</span>
          <div className="flex gap-2 pt-[2px]">
            {(['porcentaje', 'cuota'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('ieps_tipo', t)}
                className={`text-[11px] px-3 py-1 rounded border transition-colors ${(form.ieps_tipo || 'porcentaje') === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                {t === 'porcentaje' ? '% Porcentaje' : '$ Cuota fija'}
              </button>
            ))}
          </div>
        </div>
        <OdooField label={(form.ieps_tipo || 'porcentaje') === 'cuota' ? 'IEPS cuota $' : 'IEPS %'} value={form.ieps_pct ?? 0} type="number" teal onChange={v => set('ieps_pct', +v)} format={v => (form.ieps_tipo || 'porcentaje') === 'cuota' ? `$ ${v ?? 0}` : `${v ?? 0}%`} />
        {(form.ieps_tipo || 'porcentaje') === 'porcentaje' && (
          <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
            {[0, 8, 25, 53].map(rate => (
              <button key={rate} type="button" onClick={() => set('ieps_pct', rate)}
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
              return <>Costo neto: <strong>$ {t.precio_neto.toFixed(2)}</strong> + IEPS: $ {t.ieps_monto.toFixed(2)} + IVA: $ {t.iva_monto.toFixed(2)}</>;
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
