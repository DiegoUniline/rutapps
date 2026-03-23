import { OdooField } from '@/components/OdooFormField';
import KardexTab from '@/components/KardexTab';
import { ProveedoresTab } from '@/components/producto/ProveedoresTab';
import type { Producto, Almacen, Proveedor } from '@/types';

interface AlmacenesTabProps {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  almacenes?: Almacen[];
}

export function AlmacenesTabContent({ form, set, almacenes }: AlmacenesTabProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={() => set('almacenes', almacenes?.map(a => a.id) ?? [])} className="text-[12px] text-primary hover:underline">Seleccionar todos</button>
        <button type="button" onClick={() => set('almacenes', [])} className="text-[12px] text-muted-foreground hover:underline">Ninguno</button>
      </div>
      {almacenes?.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-4">No hay almacenes configurados.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {almacenes?.map(a => (
            <label key={a.id} className="odoo-module-check">
              <input type="checkbox" checked={form.almacenes?.includes(a.id) ?? false}
                onChange={e => { const c = form.almacenes ?? []; set('almacenes', e.target.checked ? [...c, a.id] : c.filter(x => x !== a.id)); }} />
              {a.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface InventarioTabProps {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
}

export function InventarioTabContent({ form, set }: InventarioTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
      <div>
        <OdooField label="Min stock" value={form.min} type="number" teal onChange={v => set('min', +v)} format={v => (v ?? 0).toString()} />
        <OdooField label="Max stock" value={form.max} type="number" teal onChange={v => set('max', +v)} format={v => (v ?? 0).toString()} />
      </div>
      <div>
        <div className="odoo-field-row"><span className="odoo-field-label">Vender sin stock</span><label className="flex items-center gap-2 cursor-pointer pt-[2px]"><input type="checkbox" checked={!!form.vender_sin_stock} onChange={e => set('vender_sin_stock', e.target.checked)} className="rounded border-input h-3.5 w-3.5" /></label></div>
        <div className="odoo-field-row"><span className="odoo-field-label">Manejar lotes</span><label className="flex items-center gap-2 cursor-pointer pt-[2px]"><input type="checkbox" checked={!!form.manejar_lotes} onChange={e => set('manejar_lotes', e.target.checked)} className="rounded border-input h-3.5 w-3.5" /></label></div>
      </div>
    </div>
  );
}

interface ProveedoresWrapperProps {
  productoId?: string;
  isNew: boolean;
  proveedores: Proveedor[];
  prodProveedores: any[];
  saveProvMut: any;
  deleteProvMut: any;
  createProveedor: (n: string) => Promise<string | undefined>;
}

export function ProveedoresTabWrapper({ productoId, isNew, proveedores, prodProveedores, saveProvMut, deleteProvMut, createProveedor }: ProveedoresWrapperProps) {
  return (
    <ProveedoresTab productoId={productoId} isNew={isNew} proveedores={proveedores} prodProveedores={prodProveedores}
      onSave={saveProvMut.mutateAsync} onDelete={deleteProvMut.mutateAsync} saving={saveProvMut.isPending} onCreateProveedor={createProveedor} />
  );
}

export function KardexTabWrapper({ productoId, isNew }: { productoId?: string; isNew: boolean }) {
  return <KardexTab productoId={productoId} isNew={isNew} />;
}
