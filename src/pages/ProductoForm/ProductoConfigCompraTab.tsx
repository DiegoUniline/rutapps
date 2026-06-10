import { OdooField } from '@/components/OdooFormField';
import ModalSelect from '@/components/ModalSelect';
import type { Producto, Proveedor } from '@/types';

interface Props {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  proveedores?: Proveedor[];
  createProveedor: (n: string) => Promise<string | undefined>;
}

const MODOS = [
  { value: 'maximo', label: 'Al máximo' },
  { value: 'medio', label: 'A la mitad' },
  { value: 'minimo', label: 'Al mínimo' },
  { value: 'cobertura', label: 'Por cobertura (días)' },
];

export function ProductoConfigCompraTab({ form, set, proveedores, createProveedor }: Props) {
  const modo = (form as any).modo_compra_sugerida || 'maximo';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
      <div>
        <div className="odoo-field-row">
          <span className="odoo-field-label">Proveedor preferido</span>
          <div className="flex-1">
            <ModalSelect
              value={(form as any).proveedor_preferido_id || ''}
              onChange={(v) => set('proveedor_preferido_id' as any, v || null)}
              options={[{ value: '', label: '— Sin proveedor —' }, ...(proveedores ?? []).map(p => ({ value: p.id, label: p.nombre }))]}
              placeholder="Selecciona proveedor"
            />
          </div>
        </div>
        <OdooField
          label="Min stock"
          value={form.min}
          type="number"
          teal
          onChange={v => set('min', +v)}
          format={v => (v ?? 0).toString()}
        />
        <OdooField
          label="Max stock"
          value={form.max}
          type="number"
          teal
          onChange={v => set('max', +v)}
          format={v => (v ?? 0).toString()}
        />
      </div>
      <div>
        <div className="odoo-field-row">
          <span className="odoo-field-label">Modo de compra sugerida</span>
          <select
            className="flex-1 bg-transparent border-b border-input text-[13px] py-1 focus:outline-none focus:border-primary"
            value={modo}
            onChange={(e) => set('modo_compra_sugerida' as any, e.target.value)}
          >
            {MODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {modo === 'cobertura' && (
          <OdooField
            label="Días de cobertura"
            value={(form as any).dias_cobertura ?? 30}
            type="number"
            teal
            onChange={v => set('dias_cobertura' as any, +v)}
            format={v => (v ?? 30).toString()}
          />
        )}
        <OdooField
          label="Tiempo entrega (días)"
          value={(form as any).lead_time_dias ?? 0}
          type="number"
          onChange={v => set('lead_time_dias' as any, +v)}
          format={v => (v ?? 0).toString()}
        />
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          Estos valores se usan en <strong>Compras Sugeridas</strong> para calcular cuánto pedir automáticamente.
        </p>
      </div>
    </div>
  );
}
