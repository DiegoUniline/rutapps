import { OdooField } from '@/components/OdooFormField';
import SearchableSelect from '@/components/SearchableSelect';
import type { Producto, Marca, Proveedor, Clasificacion, Lista, Unidad, UnidadSat } from '@/types';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  setForm: (fn: (prev: Partial<Producto>) => Partial<Producto>) => void;
  marcas?: Marca[];
  clasificaciones?: Clasificacion[];
  listas?: Lista[];
  unidades?: Unidad[];
  unidadesSat?: UnidadSat[];
  createMarca: (n: string) => Promise<string | undefined>;
  createClasificacion: (n: string) => Promise<string | undefined>;
  createUnidad: (n: string) => Promise<string | undefined>;
  createLista: (n: string) => Promise<string | undefined>;
}

const findName = (list: { id: string; nombre: string }[] | undefined, id: string | undefined) =>
  list?.find(i => i.id === id)?.nombre ?? '';
const findUnit = (list: { id: string; nombre: string; abreviatura?: string }[] | undefined, id: string | undefined) => {
  const u = list?.find(i => i.id === id);
  return u ? `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` : '';
};

const costLabels: Record<string, string> = { promedio: 'Promedio', ultimo: 'Último costo de compra', estandar: 'Estándar', manual: 'Manual', ultimo_compra: 'Último costo (compra directa)', ultimo_proveedor: 'Último costo del proveedor principal' };

export function ProductoGeneralFields({ form, set, setForm, marcas, clasificaciones, listas, unidades, unidadesSat, createMarca, createClasificacion, createUnidad, createLista }: Props) {
  const { fmt, symbol } = useCurrency();
  const isNew = !form.id;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 mb-4 pb-4 border-b border-border">
      <div>
        <OdooField label="Código" value={form.codigo} help onChange={v => set('codigo', v)} alwaysEdit={isNew} />
        <OdooField label="Clave alterna" value={form.clave_alterna} onChange={v => set('clave_alterna', v)} />
        <OdooField label="Marca" value={form.marca_id} type="select" options={marcas?.map(m => ({ value: m.id, label: m.nombre })) ?? []} onChange={v => set('marca_id', v || null)} format={() => findName(marcas, form.marca_id ?? undefined)} onCreateNew={createMarca} />
        <OdooField label="Categoría" value={form.clasificacion_id} type="select" options={clasificaciones?.map(c => ({ value: c.id, label: c.nombre })) ?? []} onChange={v => set('clasificacion_id', v || null)} format={() => findName(clasificaciones, form.clasificacion_id ?? undefined)} onCreateNew={createClasificacion} />
        <OdooField label="Unid. venta" value={form.unidad_venta_id} type="select" options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []} onChange={v => set('unidad_venta_id', v || null)} format={() => findUnit(unidades, form.unidad_venta_id ?? undefined)} onCreateNew={createUnidad} />
        <OdooField label="Unid. compra" value={form.unidad_compra_id} type="select" options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []} onChange={v => set('unidad_compra_id', v || null)} format={() => findUnit(unidades, form.unidad_compra_id ?? undefined)} onCreateNew={createUnidad} />
        <OdooField label="Factor conversión" value={form.factor_conversion} type="number" onChange={v => set('factor_conversion', Number(v) || 1)} format={() => String(form.factor_conversion ?? 1)} />
        <div className="odoo-field-row">
          <span className="odoo-field-label">Producto a granel</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => set('es_granel', !form.es_granel)}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.es_granel ? 'bg-primary' : 'bg-border'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.es_granel ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            {form.es_granel && (
              <select value={form.unidad_granel ?? 'kg'} onChange={e => set('unidad_granel', e.target.value)}
                className="text-[12px] border border-border rounded px-2 py-0.5 bg-card text-foreground">
                <option value="kg">Kilogramo (kg)</option>
                <option value="g">Gramo (g)</option>
                <option value="litro">Litro (L)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="pieza">Pieza (fraccionada)</option>
              </select>
            )}
          </div>
        </div>
      </div>
      <div>
        <div className="odoo-field-row">
          <span className="odoo-field-label">Modo de precio</span>
          <div className="flex items-center gap-1">
            {['directo', 'listas'].map(mode => (
              <button key={mode} type="button" onClick={() => setForm(f => ({ ...f, usa_listas_precio: mode === 'listas' }))}
                className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${((form as any).usa_listas_precio ? 'listas' : 'directo') === mode ? 'bg-primary text-primary-foreground border-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                {mode === 'directo' ? 'Precio directo' : 'Listas de precio'}
              </button>
            ))}
          </div>
        </div>
        {!(form as any).usa_listas_precio && (
          <OdooField label="Precio de venta" value={form.precio_principal} type="number" teal help onChange={v => set('precio_principal', +v)} format={v => `${symbol} ${(v ?? 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
        )}
        <OdooField label="Costo" value={form.costo} type="number" teal help onChange={v => set('costo', +v)} format={v => `${symbol} ${(v ?? 0).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
        <OdooField label="Cálculo costo" value={form.calculo_costo} type="select" help
          options={[{ value: 'manual', label: 'Manual' }, { value: 'ultimo', label: 'Último costo de compra' }, { value: 'ultimo_proveedor', label: 'Último costo del proveedor principal' }, { value: 'promedio', label: 'Promedio' }, { value: 'estandar', label: 'Estándar' }, { value: 'ultimo_compra', label: 'Último costo (compra directa)' }]}
          onChange={v => set('calculo_costo', v)} format={() => costLabels[form.calculo_costo ?? 'promedio'] ?? ''} />
        <OdooField label="Lista de precios" value={form.lista_id} type="select" options={listas?.map(l => ({ value: l.id, label: l.nombre })) ?? []} onChange={v => set('lista_id', v || null)} format={() => findName(listas, form.lista_id ?? undefined)} onCreateNew={createLista} />
        <OdooField label="Stock mínimo" value={form.min ?? 0} type="number" onChange={v => setForm(f => ({ ...f, min: Number(v) }))} placeholder="0" />
        <OdooField label="Stock máximo" value={form.max ?? 0} type="number" onChange={v => setForm(f => ({ ...f, max: Number(v) }))} placeholder="0" />
      </div>
    </div>
  );
}
