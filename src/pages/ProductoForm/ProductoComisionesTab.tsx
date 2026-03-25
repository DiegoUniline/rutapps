import { Star } from 'lucide-react';
import { OdooField } from '@/components/OdooFormField';
import type { Producto } from '@/types';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  tarifaLineas?: any[];
}

const comisionLabels: Record<string, string> = { porcentaje: 'Porcentaje', monto_fijo: 'Monto Fijo' };

export function ProductoComisionesTab({ form, set, tarifaLineas }: Props) {
  const { symbol: s, fmt } = useCurrency();
  return (
    <div className="space-y-3">
      <div className="odoo-field-row">
        <span className="odoo-field-label">Maneja comisión</span>
        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
          <input type="checkbox" checked={!!form.tiene_comision} onChange={e => set('tiene_comision', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
        </label>
      </div>
      {form.tiene_comision && (
        (form as any).usa_listas_precio ? (
          <ComisionFromListas form={form} tarifaLineas={tarifaLineas} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
            <div>
              <OdooField label="Tipo comisión" value={form.tipo_comision} type="select"
                options={[{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'monto_fijo', label: 'Monto Fijo' }]}
                onChange={v => set('tipo_comision', v)} format={() => comisionLabels[form.tipo_comision ?? 'porcentaje'] ?? ''} />
              <OdooField label={`Valor (${form.tipo_comision === 'porcentaje' ? '%' : '$'})`}
                value={form.pct_comision} type="number" teal onChange={v => set('pct_comision', +v)} format={v => (v ?? 0).toString()} />
            </div>
          </div>
        )
      )}
    </div>
  );
}

function ComisionFromListas({ form, tarifaLineas }: { form: Partial<Producto>; tarifaLineas?: any[] }) {
  const lineasConComision = (tarifaLineas ?? []).filter((l: any) => (l as any).comision_pct > 0);
  if (lineasConComision.length === 0) return (
    <>
      <div className="text-[12px] text-muted-foreground bg-accent/30 border border-accent/50 rounded px-3 py-2">💡 La comisión se calcula automáticamente desde las reglas de las listas de precios.</div>
      <p className="text-[12px] text-muted-foreground">No hay reglas con comisión configurada para este producto.</p>
    </>
  );
  return (
    <>
      <div className="text-[12px] text-muted-foreground bg-accent/30 border border-accent/50 rounded px-3 py-2">💡 La comisión se calcula automáticamente desde las reglas de las listas de precios.</div>
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-table-border">
            <th className="th-odoo text-left">Lista</th><th className="th-odoo text-left">Tipo precio</th>
            <th className="th-odoo text-right">Precio</th><th className="th-odoo text-right">% Comisión</th><th className="th-odoo text-right">Comisión $</th>
          </tr></thead>
          <tbody>
            {lineasConComision.map((l: any) => {
              const costo = form.costo ?? 0, pr = form.precio_principal ?? 0;
              let precio = l.precio ?? 0;
              if (l.tipo_calculo === 'margen_costo') precio = Math.max(costo * (1 + (l.margen_pct ?? 0) / 100), l.precio_minimo ?? 0);
              else if (l.tipo_calculo === 'descuento_precio') precio = Math.max(pr * (1 - (l.descuento_pct ?? 0) / 100), l.precio_minimo ?? 0);
              else precio = Math.max(l.precio ?? 0, l.precio_minimo ?? 0);
              const comisionMonto = (precio * (l.comision_pct ?? 0)) / 100;
              const tipoLabel = l.tipo_calculo === 'precio_fijo' ? `Fijo ${s}${(l.precio ?? 0).toFixed(2)}` : l.tipo_calculo === 'margen_costo' ? `Margen ${l.margen_pct}%` : `Desc. ${l.descuento_pct}%`;
              return (
                <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                  <td className="py-1.5 px-3 text-xs"><span className="flex items-center gap-1">{l.lista_precios?.es_principal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}{l.lista_precios?.nombre ?? l.tarifas?.nombre ?? '—'}</span></td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground">{tipoLabel}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">{fmt(precio)}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold text-primary">{l.comision_pct}%</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold text-green-600">{fmt(comisionMonto)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
