import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Trash2, Star, Camera } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection, OdooBadge } from '@/components/OdooFormField';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect, useTarifaLineasForProducto } from '@/hooks/useData';
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
  const { data: tarifaLineas } = useTarifaLineasForProducto(isNew ? undefined : id, form.clasificacion_id);

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (existing) setForm(existing);
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

  // Lookup helpers
  const findName = (list: { id: string; nombre: string }[] | undefined, id: string | undefined) =>
    list?.find(i => i.id === id)?.nombre ?? '';
  const findUnit = (list: { id: string; nombre: string; abreviatura?: string }[] | undefined, id: string | undefined) => {
    const u = list?.find(i => i.id === id);
    return u ? `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` : '';
  };
  const findSat = (list: { id: string; clave: string; nombre: string }[] | undefined, id: string | undefined) => {
    const u = list?.find(i => i.id === id);
    return u ? `${u.clave} - ${u.nombre}` : '';
  };

  const costLabels: Record<string, string> = { promedio: 'Promedio', ultimo: 'Último costo de compra', estandar: 'Estándar', manual: 'Manual', ultimo_compra: 'Último costo (compra directa)', ultimo_proveedor: 'Último costo del proveedor principal' };
  const comisionLabels: Record<string, string> = { porcentaje: 'Porcentaje', monto_fijo: 'Monto Fijo' };

  return (
    <div className="p-4">
      {/* Breadcrumb above title */}
      <div className="mb-1">
        <Link to="/productos" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          Productos /
        </Link>
      </div>

      {/* Header row: star + title + statusbar */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-3">
        <div className="flex-1 flex items-center gap-2">
          <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform">
            <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
          </button>
          <h1 className="text-[22px] font-bold text-foreground leading-tight">
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

      {/* Module checkboxes (Ventas, Compras, Inventario) */}
      <div className="odoo-module-checks mb-0">
        <label className="odoo-module-check">
          <input type="checkbox" checked={!!form.se_puede_vender} onChange={e => set('se_puede_vender', e.target.checked)} />
          Ventas
        </label>
        <label className="odoo-module-check">
          <input type="checkbox" checked={!!form.se_puede_comprar} onChange={e => set('se_puede_comprar', e.target.checked)} />
          Compras
        </label>
        <label className="odoo-module-check">
          <input type="checkbox" checked={!!form.se_puede_inventariar} onChange={e => set('se_puede_inventariar', e.target.checked)} />
          Inventario
        </label>
        <label className="odoo-module-check">
          <input type="checkbox" checked={!!form.es_combo} onChange={e => set('es_combo', e.target.checked)} />
          Combo
        </label>
      </div>

      {/* Form body */}
      <div className="bg-card border border-border rounded">
        {/* Top section: fields left, image right */}
        <div className="flex p-4 gap-6">
          {/* Left: 2-column field grid */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {/* Left column */}
              <div>
                <OdooField
                  label="Código" value={form.codigo} help
                  onChange={v => set('codigo', v)} alwaysEdit={isNew}
                />
                <OdooField
                  label="Clave Alterna" value={form.clave_alterna}
                  onChange={v => set('clave_alterna', v)}
                />
                <OdooField
                  label="Marca" value={form.marca_id} type="select"
                  options={marcas?.map(m => ({ value: m.id, label: m.nombre })) ?? []}
                  onChange={v => set('marca_id', v || null)}
                  format={() => findName(marcas, form.marca_id ?? undefined)}
                />
                <OdooField
                  label="Clasificación" value={form.clasificacion_id} type="select"
                  options={clasificaciones?.map(c => ({ value: c.id, label: c.nombre })) ?? []}
                  onChange={v => set('clasificacion_id', v || null)}
                  format={() => findName(clasificaciones, form.clasificacion_id ?? undefined)}
                />
              </div>
              {/* Right column */}
              <div>
                <OdooField
                  label="Precio" value={form.precio_principal} type="number" teal help
                  onChange={v => set('precio_principal', +v)}
                  format={v => `$ ${(v ?? 0).toFixed(2)}`}
                />
                <OdooField
                  label="Costo" value={form.costo} type="number" teal
                  onChange={v => set('costo', +v)}
                  format={v => `$ ${(v ?? 0).toFixed(2)}`}
                />
                <OdooField
                  label="Cálculo Costo" value={form.calculo_costo} type="select" help
                  options={[
                    { value: 'manual', label: 'Manual' },
                    { value: 'ultimo', label: 'Último costo de compra' },
                    { value: 'ultimo_proveedor', label: 'Último costo del proveedor principal' },
                    { value: 'promedio', label: 'Promedio' },
                    { value: 'estandar', label: 'Estándar' },
                    { value: 'ultimo_compra', label: 'Último costo (compra directa)' },
                  ]}
                  onChange={v => set('calculo_costo', v)}
                  format={() => costLabels[form.calculo_costo ?? 'promedio'] ?? ''}
                />
                <OdooField
                  label="Proveedor" value={form.proveedor_id} type="select"
                  options={proveedores?.map(p => ({ value: p.id, label: p.nombre })) ?? []}
                  onChange={v => set('proveedor_id', v || null)}
                  format={() => findName(proveedores, form.proveedor_id ?? undefined)}
                />
                <OdooField
                  label="Lista" value={form.lista_id} type="select"
                  options={listas?.map(l => ({ value: l.id, label: l.nombre })) ?? []}
                  onChange={v => set('lista_id', v || null)}
                  format={() => findName(listas, form.lista_id ?? undefined)}
                />
              </div>
            </div>

            {/* Tax badges */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[13px] font-semibold text-foreground w-[140px] shrink-0">Impuestos</span>
              <div className="flex gap-1.5 flex-wrap">
                {form.tiene_iva && (
                  <OdooBadge
                    label={`IVA ${tasasIva?.find(t => t.id === form.tasa_iva_id)?.porcentaje ?? 0}%`}
                    onRemove={() => { set('tiene_iva', false); set('tasa_iva_id', null); }}
                  />
                )}
                {form.tiene_ieps && (
                  <OdooBadge
                    label={`IEPS ${tasasIeps?.find(t => t.id === form.tasa_ieps_id)?.porcentaje ?? 0}%`}
                    onRemove={() => { set('tiene_ieps', false); set('tasa_ieps_id', null); }}
                  />
                )}
                {!form.tiene_iva && !form.tiene_ieps && (
                  <span className="text-[12px] text-muted-foreground">Sin impuestos</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Product image */}
          <div className="hidden sm:block shrink-0">
            {form.imagen_url ? (
              <img src={form.imagen_url} alt="" className="w-[120px] h-[120px] rounded object-cover border border-border" />
            ) : (
              <div className="odoo-image-placeholder">
                <Camera className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
          </div>
        </div>

        {/* Tabs below fields */}
        <div className="px-4 pb-4">
          <OdooTabs
            tabs={[
              {
                key: 'general',
                label: 'Información General',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <OdooField
                        label="Cálculo Costo" value={form.calculo_costo} type="select" help
                        options={[
                          { value: 'promedio', label: 'Promedio' },
                          { value: 'ultimo', label: 'Último' },
                          { value: 'estandar', label: 'Estándar' },
                          { value: 'manual', label: 'Manual' },
                        ]}
                        onChange={v => set('calculo_costo', v)}
                        format={() => costLabels[form.calculo_costo ?? 'promedio'] ?? ''}
                      />
                      <OdooField
                        label="Código SAT" value={form.codigo_sat} help
                        onChange={v => set('codigo_sat', v)}
                      />
                      <OdooField
                        label="Unidad SAT" value={form.udem_sat_id} type="select"
                        options={unidadesSat?.map(u => ({ value: u.id, label: `${u.clave} - ${u.nombre}` })) ?? []}
                        onChange={v => set('udem_sat_id', v || null)}
                        format={() => findSat(unidadesSat, form.udem_sat_id ?? undefined)}
                      />
                      <OdooField
                        label="Min Stock" value={form.min} type="number" teal
                        onChange={v => set('min', +v)}
                        format={v => (v ?? 0).toString()}
                      />
                      <OdooField
                        label="Max Stock" value={form.max} type="number" teal
                        onChange={v => set('max', +v)}
                        format={v => (v ?? 0).toString()}
                      />
                    </div>
                    <div>
                      <OdooField
                        label="Unid. Compra" value={form.unidad_compra_id} type="select"
                        options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
                        onChange={v => set('unidad_compra_id', v || null)}
                        format={() => findUnit(unidades, form.unidad_compra_id ?? undefined)}
                      />
                      <OdooField
                        label="Unid. Venta" value={form.unidad_venta_id} type="select"
                        options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
                        onChange={v => set('unidad_venta_id', v || null)}
                        format={() => findUnit(unidades, form.unidad_venta_id ?? undefined)}
                      />
                      <OdooField
                        label="Factor Conv." value={form.factor_conversion} type="number" teal
                        onChange={v => set('factor_conversion', +v)}
                        format={v => (v ?? 1).toString()}
                      />
                      <div className="odoo-field-row">
                        <span className="odoo-field-label">Vender sin Stock</span>
                        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                          <input
                            type="checkbox"
                            checked={!!form.vender_sin_stock}
                            onChange={e => set('vender_sin_stock', e.target.checked)}
                            className="rounded border-input h-3.5 w-3.5"
                          />
                        </label>
                      </div>
                      <div className="odoo-field-row">
                        <span className="odoo-field-label">Manejar Lotes</span>
                        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                          <input
                            type="checkbox"
                            checked={!!form.manejar_lotes}
                            onChange={e => set('manejar_lotes', e.target.checked)}
                            className="rounded border-input h-3.5 w-3.5"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'precios',
                label: 'Precios & Tarifas',
                content: (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      <div>
                        <OdooField
                          label="Precio Principal" value={form.precio_principal} type="number" teal
                          onChange={v => set('precio_principal', +v)}
                          format={v => `$ ${(v ?? 0).toFixed(2)}`}
                        />
                        <div className="odoo-field-row">
                          <span className="odoo-field-label">Permitir Desc.</span>
                          <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                            <input
                              type="checkbox"
                              checked={!!form.permitir_descuento}
                              onChange={e => set('permitir_descuento', e.target.checked)}
                              className="rounded border-input h-3.5 w-3.5"
                            />
                          </label>
                        </div>
                        {form.permitir_descuento && (
                          <OdooField
                            label="Monto Máx Desc." value={form.monto_maximo} type="number" teal
                            onChange={v => set('monto_maximo', +v)}
                            format={v => `$ ${(v ?? 0).toFixed(2)}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Tarifas table */}
                    {tarifasDisp && tarifasDisp.length > 0 && (
                      <div className="mt-3">
                        <OdooSection title="TARIFAS DISPONIBLES">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-table-border">
                                <th className="th-odoo text-left">Nombre</th>
                                <th className="th-odoo text-left">Tipo</th>
                                <th className="th-odoo text-center">Activa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tarifasDisp.map(t => (
                                <tr key={t.id} className="border-b border-table-border last:border-0 hover:bg-table-hover cursor-pointer" onClick={() => navigate(`/tarifas/${t.id}`)}>
                                  <td className="py-1.5 px-3">{t.nombre}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{t.tipo}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    {t.activa
                                      ? <span className="text-[11px] font-medium text-success">Sí</span>
                                      : <span className="text-[11px] text-muted-foreground">No</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </OdooSection>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'fiscal',
                label: 'Fiscal',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <div className="odoo-field-row">
                        <span className="odoo-field-label">IVA</span>
                        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                          <input
                            type="checkbox"
                            checked={!!form.tiene_iva}
                            onChange={e => set('tiene_iva', e.target.checked)}
                            className="rounded border-input h-3.5 w-3.5"
                          />
                        </label>
                      </div>
                      {form.tiene_iva && (
                        <OdooField
                          label="Tasa IVA" value={form.tasa_iva_id} type="select"
                          options={tasasIva?.map(t => ({ value: t.id, label: `${t.nombre} (${t.porcentaje}%)` })) ?? []}
                          onChange={v => set('tasa_iva_id', v || null)}
                          format={() => {
                            const t = tasasIva?.find(t => t.id === form.tasa_iva_id);
                            return t ? `${t.nombre} (${t.porcentaje}%)` : '';
                          }}
                        />
                      )}
                      <div className="odoo-field-row">
                        <span className="odoo-field-label">IEPS</span>
                        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                          <input
                            type="checkbox"
                            checked={!!form.tiene_ieps}
                            onChange={e => set('tiene_ieps', e.target.checked)}
                            className="rounded border-input h-3.5 w-3.5"
                          />
                        </label>
                      </div>
                      {form.tiene_ieps && (
                        <OdooField
                          label="Tasa IEPS" value={form.tasa_ieps_id} type="select"
                          options={tasasIeps?.map(t => ({ value: t.id, label: `${t.nombre} (${t.porcentaje}%)` })) ?? []}
                          onChange={v => set('tasa_ieps_id', v || null)}
                          format={() => {
                            const t = tasasIeps?.find(t => t.id === form.tasa_ieps_id);
                            return t ? `${t.nombre} (${t.porcentaje}%)` : '';
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <OdooField
                        label="Código SAT" value={form.codigo_sat}
                        onChange={v => set('codigo_sat', v)}
                      />
                      <OdooField
                        label="Unidad SAT" value={form.udem_sat_id} type="select"
                        options={unidadesSat?.map(u => ({ value: u.id, label: `${u.clave} - ${u.nombre}` })) ?? []}
                        onChange={v => set('udem_sat_id', v || null)}
                        format={() => findSat(unidadesSat, form.udem_sat_id ?? undefined)}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'comisiones',
                label: 'Comisiones',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <div>
                      <div className="odoo-field-row">
                        <span className="odoo-field-label">Maneja Comisión</span>
                        <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                          <input
                            type="checkbox"
                            checked={!!form.tiene_comision}
                            onChange={e => set('tiene_comision', e.target.checked)}
                            className="rounded border-input h-3.5 w-3.5"
                          />
                        </label>
                      </div>
                      {form.tiene_comision && (
                        <>
                          <OdooField
                            label="Tipo Comisión" value={form.tipo_comision} type="select"
                            options={[
                              { value: 'porcentaje', label: 'Porcentaje' },
                              { value: 'monto_fijo', label: 'Monto Fijo' },
                            ]}
                            onChange={v => set('tipo_comision', v)}
                            format={() => comisionLabels[form.tipo_comision ?? 'porcentaje'] ?? ''}
                          />
                          <OdooField
                            label={`Valor (${form.tipo_comision === 'porcentaje' ? '%' : '$'})`}
                            value={form.pct_comision} type="number" teal
                            onChange={v => set('pct_comision', +v)}
                            format={v => (v ?? 0).toString()}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'almacenes',
                label: 'Almacenes',
                content: (
                  <div className="space-y-1.5">
                    {almacenes?.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground py-4">No hay almacenes configurados.</p>
                    ) : (
                      almacenes?.map(a => (
                        <label key={a.id} className="odoo-module-check">
                          <input
                            type="checkbox"
                            checked={form.almacenes?.includes(a.id) ?? false}
                            onChange={e => {
                              const current = form.almacenes ?? [];
                              set('almacenes', e.target.checked ? [...current, a.id] : current.filter(x => x !== a.id));
                            }}
                          />
                          {a.nombre}
                        </label>
                      ))
                    )}
                  </div>
                ),
              },
              {
                key: 'notas',
                label: 'Notas',
                content: (
                  <div>
                    <OdooSection title="NOTAS INTERNAS">
                      <textarea
                        className="odoo-textarea"
                        placeholder="Agrega notas internas..."
                        rows={3}
                      />
                    </OdooSection>
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
