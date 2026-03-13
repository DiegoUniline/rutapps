import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, X, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooCollapsible } from '@/components/OdooCollapsible';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Producto } from '@/types';

const defaultProduct: Partial<Producto> = {
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  manejar_lotes: false, factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  pct_comision: 0, status: 'borrador', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '', contador: 0,
  contador_tarifas: 0,
};

const statusSteps = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'activo', label: 'Activo' },
  { key: 'inactivo', label: 'Inactivo' },
];

function OdooField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-odoo">{label}</label>
      {children}
    </div>
  );
}

function OdooSelect({ value, onChange, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select value={value} onChange={onChange} className="input-odoo" {...props}>
      {children}
    </select>
  );
}

export default function ProductoFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useProducto(isNew ? undefined : id);
  const saveMutation = useSaveProducto();
  const deleteMutation = useDeleteProducto();

  const { data: marcas } = useMarcas();
  const { data: proveedores } = useProveedores();
  const { data: clasificaciones } = useClasificaciones();
  const { data: listas } = useListas();
  const { data: unidades } = useUnidades();
  const { data: tasasIva } = useTasasIva();
  const { data: tasasIeps } = useTasasIeps();
  const { data: almacenes } = useAlmacenes();
  const { data: unidadesSat } = useUnidadesSat();
  const { data: tarifasDisp } = useTarifasForSelect();

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [precioMode, setPrecioMode] = useState<'unico' | 'tarifas'>('unico');

  useEffect(() => {
    if (existing) {
      setForm(existing);
      setPrecioMode((existing.contador_tarifas ?? 0) > 0 ? 'tarifas' : 'unico');
    }
  }, [existing]);

  const set = (key: keyof Producto, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    try {
      await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Producto guardado');
      navigate('/productos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Producto eliminado');
      navigate('/productos');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">
            {isNew ? 'Nuevo Producto' : form.nombre || 'Producto'}
          </h1>
        </div>
        <OdooStatusbar
          steps={statusSteps}
          current={form.status ?? 'borrador'}
          onStepClick={key => set('status', key)}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={handleSave} disabled={saveMutation.isPending} className="btn-odoo-primary">
          <Save className="h-3.5 w-3.5" /> Guardar
        </button>
        <button onClick={() => navigate('/productos')} className="btn-odoo-secondary">
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
        {!isNew && (
          <button onClick={handleDelete} className="btn-odoo-secondary text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        )}
      </div>

      {/* Form body */}
      <div className="bg-card border border-border rounded p-4">
        <OdooCollapsible title="Información General" summary={form.codigo ? `${form.codigo} — ${form.nombre}` : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <OdooField label="Código *">
              <input className="input-odoo" value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value)} />
            </OdooField>
            <OdooField label="Nombre *">
              <input className="input-odoo" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
            </OdooField>
            <OdooField label="Clave Alterna">
              <input className="input-odoo" value={form.clave_alterna ?? ''} onChange={e => set('clave_alterna', e.target.value)} />
            </OdooField>
            <OdooField label="Marca">
              <OdooSelect value={form.marca_id ?? ''} onChange={e => set('marca_id', e.target.value || null)}>
                <option value="">Seleccionar</option>
                {marcas?.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </OdooSelect>
            </OdooField>
            <OdooField label="Proveedor">
              <OdooSelect value={form.proveedor_id ?? ''} onChange={e => set('proveedor_id', e.target.value || null)}>
                <option value="">Seleccionar</option>
                {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </OdooSelect>
            </OdooField>
            <OdooField label="Clasificación">
              <OdooSelect value={form.clasificacion_id ?? ''} onChange={e => set('clasificacion_id', e.target.value || null)}>
                <option value="">Seleccionar</option>
                {clasificaciones?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </OdooSelect>
            </OdooField>
            <OdooField label="Lista">
              <OdooSelect value={form.lista_id ?? ''} onChange={e => set('lista_id', e.target.value || null)}>
                <option value="">Seleccionar</option>
                {listas?.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </OdooSelect>
            </OdooField>
          </div>
        </OdooCollapsible>

        <OdooCollapsible title="Opciones">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2.5 gap-x-6">
            {([
              ['se_puede_comprar', 'Se puede Comprar'],
              ['se_puede_vender', 'Se puede Vender'],
              ['se_puede_inventariar', 'Inventariar'],
              ['vender_sin_stock', 'Vender sin Stock'],
              ['es_combo', 'Es Combo'],
              ['manejar_lotes', 'Manejar Lotes'],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Switch checked={!!form[key]} onCheckedChange={v => set(key, v)} />
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3 max-w-sm">
            <OdooField label="Min Stock">
              <input type="number" className="input-odoo" value={form.min ?? 0} onChange={e => set('min', +e.target.value)} />
            </OdooField>
            <OdooField label="Max Stock">
              <input type="number" className="input-odoo" value={form.max ?? 0} onChange={e => set('max', +e.target.value)} />
            </OdooField>
          </div>
        </OdooCollapsible>

        {/* Tabs below */}
        <div className="mt-4">
          <OdooTabs
            tabs={[
              {
                key: 'precios',
                label: 'Precios & Tarifas',
                content: (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPrecioMode('unico')}
                        className={precioMode === 'unico' ? 'btn-odoo-primary' : 'btn-odoo-secondary'}
                      >
                        Precio Único
                      </button>
                      <button
                        onClick={() => setPrecioMode('tarifas')}
                        className={precioMode === 'tarifas' ? 'btn-odoo-primary' : 'btn-odoo-secondary'}
                      >
                        Usar Tarifas
                      </button>
                    </div>
                    {precioMode === 'unico' ? (
                      <div className="space-y-3 max-w-sm">
                        <OdooField label="Precio Principal">
                          <input
                            type="number"
                            className="input-odoo text-xl font-bold"
                            value={form.precio_principal ?? 0}
                            onChange={e => set('precio_principal', +e.target.value)}
                          />
                        </OdooField>
                        <div className="flex items-center gap-2">
                          <Switch checked={!!form.permitir_descuento} onCheckedChange={v => set('permitir_descuento', v)} />
                          <span className="text-sm">Permitir Descuento</span>
                        </div>
                        {form.permitir_descuento && (
                          <OdooField label="Monto Máximo Descuento">
                            <input type="number" className="input-odoo" value={form.monto_maximo ?? 0} onChange={e => set('monto_maximo', +e.target.value)} />
                          </OdooField>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Tarifas asignadas. Gestiona desde el módulo Tarifas.</p>
                        {tarifasDisp?.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-4">No hay tarifas disponibles.</p>
                        ) : (
                          <table className="w-full text-sm border border-border rounded overflow-hidden">
                            <thead>
                              <tr className="border-b border-table-border">
                                <th className="th-odoo text-left">Nombre</th>
                                <th className="th-odoo text-left">Tipo</th>
                                <th className="th-odoo text-center">Activa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tarifasDisp?.map(t => (
                                <tr key={t.id} className="border-b border-table-border last:border-0">
                                  <td className="py-1.5 px-3">{t.nombre}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{t.tipo}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    {t.activa ? <span className="text-xxs font-medium text-success">Sí</span> : <span className="text-xxs text-muted-foreground">No</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <button className="odoo-link" onClick={() => navigate('/tarifas')}>+ Agregar Tarifa</button>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'fiscal',
                label: 'Fiscal',
                content: (
                  <div className="space-y-3 max-w-lg">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form.tiene_iva} onCheckedChange={v => set('tiene_iva', v)} />
                      <span className="text-sm font-medium">IVA</span>
                    </div>
                    {form.tiene_iva && (
                      <OdooField label="Tasa IVA">
                        <OdooSelect value={form.tasa_iva_id ?? ''} onChange={e => set('tasa_iva_id', e.target.value || null)}>
                          <option value="">Seleccionar tasa</option>
                          {tasasIva?.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.porcentaje}%)</option>)}
                        </OdooSelect>
                      </OdooField>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form.tiene_ieps} onCheckedChange={v => set('tiene_ieps', v)} />
                      <span className="text-sm font-medium">IEPS</span>
                    </div>
                    {form.tiene_ieps && (
                      <OdooField label="Tasa IEPS">
                        <OdooSelect value={form.tasa_ieps_id ?? ''} onChange={e => set('tasa_ieps_id', e.target.value || null)}>
                          <option value="">Seleccionar tasa</option>
                          {tasasIeps?.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.porcentaje}%)</option>)}
                        </OdooSelect>
                      </OdooField>
                    )}
                    <OdooField label="Código SAT">
                      <input className="input-odoo" value={form.codigo_sat ?? ''} onChange={e => set('codigo_sat', e.target.value)} />
                    </OdooField>
                    <OdooField label="Unidad SAT">
                      <OdooSelect value={form.udem_sat_id ?? ''} onChange={e => set('udem_sat_id', e.target.value || null)}>
                        <option value="">Seleccionar</option>
                        {unidadesSat?.map(u => <option key={u.id} value={u.id}>{u.clave} - {u.nombre}</option>)}
                      </OdooSelect>
                    </OdooField>
                    <OdooField label="Cálculo de Costo">
                      <OdooSelect value={form.calculo_costo ?? 'promedio'} onChange={e => set('calculo_costo', e.target.value)}>
                        <option value="promedio">Promedio</option>
                        <option value="ultimo">Último</option>
                        <option value="estandar">Estándar</option>
                        <option value="manual">Manual</option>
                      </OdooSelect>
                    </OdooField>
                  </div>
                ),
              },
              {
                key: 'unidades',
                label: 'Unidades',
                content: (
                  <div className="space-y-3 max-w-sm">
                    <OdooField label="Unidad de Compra">
                      <OdooSelect value={form.unidad_compra_id ?? ''} onChange={e => set('unidad_compra_id', e.target.value || null)}>
                        <option value="">Seleccionar</option>
                        {unidades?.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
                      </OdooSelect>
                    </OdooField>
                    <OdooField label="Unidad de Venta">
                      <OdooSelect value={form.unidad_venta_id ?? ''} onChange={e => set('unidad_venta_id', e.target.value || null)}>
                        <option value="">Seleccionar</option>
                        {unidades?.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</option>)}
                      </OdooSelect>
                    </OdooField>
                    <OdooField label="Factor de Conversión">
                      <input type="number" step="0.01" className="input-odoo" value={form.factor_conversion ?? 1} onChange={e => set('factor_conversion', +e.target.value)} />
                    </OdooField>
                  </div>
                ),
              },
              {
                key: 'comisiones',
                label: 'Comisiones',
                content: (
                  <div className="space-y-3 max-w-sm">
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form.tiene_comision} onCheckedChange={v => set('tiene_comision', v)} />
                      <span className="text-sm font-medium">¿Maneja Comisión?</span>
                    </div>
                    {form.tiene_comision && (
                      <>
                        <OdooField label="Tipo">
                          <OdooSelect value={form.tipo_comision ?? 'porcentaje'} onChange={e => set('tipo_comision', e.target.value)}>
                            <option value="porcentaje">Porcentaje</option>
                            <option value="monto_fijo">Monto Fijo</option>
                          </OdooSelect>
                        </OdooField>
                        <OdooField label={`Valor (${form.tipo_comision === 'porcentaje' ? '%' : '$'})`}>
                          <input type="number" step="0.01" className="input-odoo" value={form.pct_comision ?? 0} onChange={e => set('pct_comision', +e.target.value)} />
                        </OdooField>
                      </>
                    )}
                  </div>
                ),
              },
              {
                key: 'almacenes',
                label: 'Almacenes',
                content: (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Almacenes donde está disponible este producto.</p>
                    {almacenes?.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">No hay almacenes configurados.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {almacenes?.map(a => (
                          <label key={a.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={form.almacenes?.includes(a.id) ?? false}
                              onChange={e => {
                                const current = form.almacenes ?? [];
                                set('almacenes', e.target.checked ? [...current, a.id] : current.filter(x => x !== a.id));
                              }}
                              className="rounded border-input"
                            />
                            {a.nombre}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
