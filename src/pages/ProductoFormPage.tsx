import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Trash2, Star, Camera } from 'lucide-react';
import { calcTax } from '@/lib/taxUtils';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection, OdooBadge } from '@/components/OdooFormField';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect, useTarifaLineasForProducto, useSaveTarifaLinea, useDeleteTarifaLinea } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Producto, TipoCalculoTarifa } from '@/types';


/* ── Precios Tab Component ── */
function PreciosTab({ form, set, tarifaLineas, tarifasDisp, productoId, isNew, navigate }: {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  tarifaLineas: any;
  tarifasDisp: any;
  productoId?: string;
  isNew: boolean;
  navigate: (path: string) => void;
}) {
  const saveLinea = useSaveTarifaLinea();
  const deleteLineaMut = useDeleteTarifaLinea();
  const [showModal, setShowModal] = useState(false);
  const [newRule, setNewRule] = useState({
    tarifa_id: '',
    tipo_calculo: 'precio_fijo' as TipoCalculoTarifa,
    precio: 0,
    margen_pct: 0,
    descuento_pct: 0,
    precio_minimo: 0,
  });

  const calcPrice = (linea: any) => {
    const c = form.costo ?? 0, pr = form.precio_principal ?? 0;
    if (linea.tipo_calculo === 'margen_costo') return Math.max(c * (1 + (linea.margen_pct ?? 0) / 100), linea.precio_minimo ?? 0);
    if (linea.tipo_calculo === 'descuento_precio') return Math.max(pr * (1 - (linea.descuento_pct ?? 0) / 100), linea.precio_minimo ?? 0);
    return Math.max(linea.precio ?? 0, linea.precio_minimo ?? 0);
  };

  const handleSaveRule = async () => {
    if (!newRule.tarifa_id) { toast.error('Selecciona una lista de precios'); return; }
    try {
      await saveLinea.mutateAsync({
        tarifa_id: newRule.tarifa_id,
        aplica_a: 'producto',
        tipo_calculo: newRule.tipo_calculo,
        precio: newRule.precio,
        margen_pct: newRule.margen_pct,
        descuento_pct: newRule.descuento_pct,
        precio_minimo: newRule.precio_minimo,
        producto_ids: [productoId!],
        clasificacion_ids: [],
      } as any);
      toast.success('Precio agregado');
      setShowModal(false);
      setNewRule({ tarifa_id: '', tipo_calculo: 'precio_fijo', precio: 0, margen_pct: 0, descuento_pct: 0, precio_minimo: 0 });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteRule = async (lineaId: string) => {
    try { await deleteLineaMut.mutateAsync(lineaId); toast.success('Precio eliminado'); } catch (err: any) { toast.error(err.message); }
  };

  const byTarifa = new Map<string, { nombre: string; activa: boolean; linea: any }>();
  const priorityOrder: Record<string, number> = { producto: 0, categoria: 1, todos: 2 };
  (tarifaLineas ?? []).forEach((tl: any) => {
    if (!tl.tarifas) return;
    const tarifaId = tl.tarifas.id;
    const ex = byTarifa.get(tarifaId);
    const p = priorityOrder[tl.aplica_a] ?? 99;
    if (!ex || p < priorityOrder[ex.linea.aplica_a]) {
      byTarifa.set(tarifaId, { nombre: tl.tarifas.nombre, activa: tl.tarifas.activa, linea: tl });
    }
  });
  const entries = Array.from(byTarifa.entries());
  const calcLabel = (l: any) => l.tipo_calculo === 'margen_costo' ? `+${l.margen_pct}% s/costo` : l.tipo_calculo === 'descuento_precio' ? `-${l.descuento_pct}% s/precio` : 'Precio fijo';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Lista de precios</th>
              <th className="th-odoo text-left">Tipo</th>
              <th className="th-odoo text-right">Costo</th>
              <th className="th-odoo text-right">Precio</th>
              <th className="th-odoo text-right">Ganancia $</th>
              <th className="th-odoo text-right">Ganancia %</th>
              <th className="th-odoo w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([tarifaId, { nombre, linea }]) => {
              const precio = calcPrice(linea);
              const costo = form.costo ?? 0;
              const ganancia = precio - costo;
              const ganPct = costo > 0 ? (ganancia / costo) * 100 : 0;
              return (
                <tr key={tarifaId} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                  <td className="py-1.5 px-3 font-medium cursor-pointer hover:text-primary" onClick={() => navigate(`/tarifas/${tarifaId}`)}>{nombre}</td>
                  <td className="py-1.5 px-3 text-xs text-muted-foreground">{calcLabel(linea)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">$ {costo.toFixed(2)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-odoo-teal font-semibold">$ {precio.toFixed(2)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold ${ganancia >= 0 ? 'text-green-600' : 'text-destructive'}`}>$ {ganancia.toFixed(2)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold ${ganPct >= 0 ? 'text-green-600' : 'text-destructive'}`}>{ganPct.toFixed(1)}%</td>
                  <td className="py-1.5 px-3 text-center">
                    {linea.aplica_a === 'producto' && (
                      <button onClick={() => handleDeleteRule(linea.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr><td colSpan={7} className="py-3 px-3 text-[12px] text-muted-foreground">Sin precios configurados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!isNew && (
        <button className="odoo-link" onClick={() => setShowModal(true)}>
          Agregar un precio
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-[600px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[15px] font-semibold">Crear Regla de lista de precios</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Row 1: Producto + Precio mínimo */}
              <div className="grid grid-cols-2 gap-x-8">
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Producto</span>
                  <span className="text-[13px] font-medium">{form.nombre ?? '—'}</span>
                </div>
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Precio mínimo</span>
                  <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.precio_minimo}
                    onChange={e => setNewRule(p => ({ ...p, precio_minimo: +e.target.value }))} />
                </div>
              </div>

              {/* Row 2: Tipo de precio + Lista de precios */}
              <div className="grid grid-cols-2 gap-x-8">
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Tipo de precio</span>
                  <div className="flex flex-col gap-1.5 text-[13px]">
                    {(['descuento_precio', 'margen_costo', 'precio_fijo'] as TipoCalculoTarifa[]).map(t => (
                      <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="tipo_calc" checked={newRule.tipo_calculo === t}
                          onChange={() => setNewRule(p => ({ ...p, tipo_calculo: t }))} className="h-3.5 w-3.5" />
                        {t === 'descuento_precio' ? 'Descuento' : t === 'margen_costo' ? 'Fórmula' : 'Precio fijo'}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="odoo-field-row">
                  <span className="odoo-field-label">Lista de precios</span>
                  <select className="input-odoo py-1 text-[13px] w-full" value={newRule.tarifa_id}
                    onChange={e => setNewRule(p => ({ ...p, tarifa_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {tarifasDisp?.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Dynamic field based on type */}
              <div className="grid grid-cols-2 gap-x-8">
                {newRule.tipo_calculo === 'precio_fijo' && (
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">Precio fijo</span>
                    <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.precio}
                      onChange={e => setNewRule(p => ({ ...p, precio: +e.target.value }))} />
                  </div>
                )}
                {newRule.tipo_calculo === 'margen_costo' && (
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">Margen %</span>
                    <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.margen_pct}
                      onChange={e => setNewRule(p => ({ ...p, margen_pct: +e.target.value }))} />
                  </div>
                )}
                {newRule.tipo_calculo === 'descuento_precio' && (
                  <div className="odoo-field-row">
                    <span className="odoo-field-label">Descuento %</span>
                    <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.descuento_pct}
                      onChange={e => setNewRule(p => ({ ...p, descuento_pct: +e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="mt-3 bg-accent/30 border border-accent/50 rounded px-3 py-2 text-[12px] text-muted-foreground">
                Para precios con fórmula o fijos, el precio original no aparece en las órdenes de venta ni en el pago.
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
              <button onClick={handleSaveRule} disabled={saveLinea.isPending} className="btn-odoo-primary">
                Guardar y cerrar
              </button>
              <button onClick={() => setShowModal(false)} className="btn-odoo-secondary">
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const defaultProduct: Partial<Producto> = {
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  manejar_lotes: false, factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  pct_comision: 0, status: 'borrador', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '', contador: 0,
  contador_tarifas: 0,
  iva_pct: 16, ieps_pct: 0, costo_incluye_impuestos: false,
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

  const [form, setForm] = useState<Partial<Producto>>(defaultProduct);
  const [originalForm, setOriginalForm] = useState<Partial<Producto>>(defaultProduct);
  const [starred, setStarred] = useState(false);

  const { data: tarifaLineas } = useTarifaLineasForProducto(isNew ? undefined : id, form.clasificacion_id);

  useEffect(() => {
    if (existing) { setForm(existing); setOriginalForm(existing); }
  }, [existing]);

  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(originalForm);

  const set = (key: keyof Producto, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Producto guardado');
      setOriginalForm({ ...form });
      if (isNew && result?.id) {
        navigate(`/productos/${result.id}`, { replace: true });
      }
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
    <div className="p-4 min-h-full">
      {/* Breadcrumb */}
      <div className="mb-0.5">
        <Link to="/productos" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Producto</Link>
      </div>

      {/* Star + Title row + image */}
      <div className="flex items-start gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform">
              <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
            </button>
            <h1 className="text-[22px] font-bold text-foreground leading-tight">
              {isNew ? 'Nuevo Producto' : form.nombre || 'Producto'}
            </h1>
          </div>

          {/* Module checkboxes */}
          <div className="odoo-module-checks mb-2">
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
        </div>

        {/* Image */}
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

      {/* Action buttons + statusbar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
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
        <div className="ml-auto">
          <OdooStatusbar
            steps={statusSteps}
            current={form.status ?? 'borrador'}
            onStepClick={key => set('status', key)}
          />
        </div>
      </div>

      {/* Form body — tabs contain everything like Odoo */}
      <div className="bg-card border border-border rounded px-4 pb-4 pt-1">
        <OdooTabs
          tabs={[
            {
              key: 'general',
              label: 'Información General',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  {/* Left column */}
                  <div>
                    <OdooField label="Código" value={form.codigo} help onChange={v => set('codigo', v)} alwaysEdit={isNew} />
                    <OdooField label="Clave Alterna" value={form.clave_alterna} onChange={v => set('clave_alterna', v)} />
                    <OdooField label="Marca" value={form.marca_id} type="select"
                      options={marcas?.map(m => ({ value: m.id, label: m.nombre })) ?? []}
                      onChange={v => set('marca_id', v || null)}
                      format={() => findName(marcas, form.marca_id ?? undefined)}
                    />
                    <OdooField label="Clasificación" value={form.clasificacion_id} type="select"
                      options={clasificaciones?.map(c => ({ value: c.id, label: c.nombre })) ?? []}
                      onChange={v => set('clasificacion_id', v || null)}
                      format={() => findName(clasificaciones, form.clasificacion_id ?? undefined)}
                    />
                    <OdooField label="Cálculo Costo" value={form.calculo_costo} type="select" help
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
                    <OdooField label="Min Stock" value={form.min} type="number" teal
                      onChange={v => set('min', +v)} format={v => (v ?? 0).toString()} />
                    <OdooField label="Max Stock" value={form.max} type="number" teal
                      onChange={v => set('max', +v)} format={v => (v ?? 0).toString()} />
                  </div>
                  {/* Right column */}
                  <div>
                    <OdooField label="Precio de venta" value={form.precio_principal} type="number" teal help
                      onChange={v => set('precio_principal', +v)}
                      format={v => `$ ${(v ?? 0).toFixed(2)}`}
                    />
                    <OdooField label="Costo" value={form.costo} type="number" teal help
                      onChange={v => set('costo', +v)}
                      format={v => `$ ${(v ?? 0).toFixed(2)}`}
                    />
                    <OdooField label="Proveedor" value={form.proveedor_id} type="select"
                      options={proveedores?.map(p => ({ value: p.id, label: p.nombre })) ?? []}
                      onChange={v => set('proveedor_id', v || null)}
                      format={() => findName(proveedores, form.proveedor_id ?? undefined)}
                    />
                    <OdooField label="Lista" value={form.lista_id} type="select"
                      options={listas?.map(l => ({ value: l.id, label: l.nombre })) ?? []}
                      onChange={v => set('lista_id', v || null)}
                      format={() => findName(listas, form.lista_id ?? undefined)}
                    />
                    <OdooField label="Unid. Compra" value={form.unidad_compra_id} type="select"
                      options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
                      onChange={v => set('unidad_compra_id', v || null)}
                      format={() => findUnit(unidades, form.unidad_compra_id ?? undefined)}
                    />
                    <OdooField label="Unid. Venta" value={form.unidad_venta_id} type="select"
                      options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
                      onChange={v => set('unidad_venta_id', v || null)}
                      format={() => findUnit(unidades, form.unidad_venta_id ?? undefined)}
                    />
                    <OdooField label="Factor Conv." value={form.factor_conversion} type="number" teal
                      onChange={v => set('factor_conversion', +v)} format={v => (v ?? 1).toString()} />
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Vender sin Stock</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.vender_sin_stock} onChange={e => set('vender_sin_stock', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Manejar Lotes</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.manejar_lotes} onChange={e => set('manejar_lotes', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'precios',
              label: 'Precios',
              content: <PreciosTab
                form={form}
                set={set}
                tarifaLineas={tarifaLineas}
                tarifasDisp={tarifasDisp}
                productoId={id}
                isNew={isNew}
                navigate={navigate}
              />,
            },
            {
              key: 'fiscal',
              label: 'Fiscal',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  <div>
                    <OdooField label="Código SAT" value={form.codigo_sat} help onChange={v => set('codigo_sat', v)} />
                    <OdooField label="Unidad SAT" value={form.udem_sat_id} type="select"
                      options={unidadesSat?.map(u => ({ value: u.id, label: `${u.clave} - ${u.nombre}` })) ?? []}
                      onChange={v => set('udem_sat_id', v || null)}
                      format={() => findSat(unidadesSat, form.udem_sat_id ?? undefined)}
                    />
                  </div>
                  <div>
                    <OdooField label="IVA %" value={(form as any).iva_pct ?? 16} type="number" teal
                      onChange={v => set('iva_pct' as any, +v)}
                      format={v => `${v ?? 16}%`}
                    />
                    <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
                      {[0, 8, 16].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => set('iva_pct' as any, rate)}
                          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                            (form as any).iva_pct === rate
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>
                    <OdooField label="IEPS %" value={(form as any).ieps_pct ?? 0} type="number" teal
                      onChange={v => set('ieps_pct' as any, +v)}
                      format={v => `${v ?? 0}%`}
                    />
                    <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
                      {[0, 8, 25, 53].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => set('ieps_pct' as any, rate)}
                          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                            (form as any).ieps_pct === rate
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Costo incluye impuestos</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!(form as any).costo_incluye_impuestos} onChange={e => set('costo_incluye_impuestos' as any, e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                    {(form as any).costo_incluye_impuestos && (form.costo ?? 0) > 0 && (
                      <div className="ml-[140px] text-xs text-muted-foreground bg-secondary/50 rounded p-2 mb-2">
                        {(() => {
                          const t = calcTax({ precio: form.costo ?? 0, iva_pct: form.iva_pct ?? 16, ieps_pct: form.ieps_pct ?? 0, incluye_impuestos: true });
                          return <>Costo neto: <strong>$ {t.precio_neto.toFixed(2)}</strong> + IEPS: $ {t.ieps_monto.toFixed(2)} + IVA: $ {t.iva_monto.toFixed(2)}</>;
                        })()}
                      </div>
                    )}
                    <div className="mt-2 bg-accent/30 border border-accent/50 rounded px-3 py-2 text-[11px] text-muted-foreground">
                      💡 El IVA se calcula sobre el precio + IEPS (estándar fiscal mexicano).
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'comisiones',
              label: 'Comisiones',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  <div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Maneja Comisión</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.tiene_comision} onChange={e => set('tiene_comision', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                    {form.tiene_comision && (
                      <>
                        <OdooField label="Tipo Comisión" value={form.tipo_comision} type="select"
                          options={[{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'monto_fijo', label: 'Monto Fijo' }]}
                          onChange={v => set('tipo_comision', v)}
                          format={() => comisionLabels[form.tipo_comision ?? 'porcentaje'] ?? ''} />
                        <OdooField label={`Valor (${form.tipo_comision === 'porcentaje' ? '%' : '$'})`}
                          value={form.pct_comision} type="number" teal onChange={v => set('pct_comision', +v)}
                          format={v => (v ?? 0).toString()} />
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
                        <input type="checkbox" checked={form.almacenes?.includes(a.id) ?? false}
                          onChange={e => { const c = form.almacenes ?? []; set('almacenes', e.target.checked ? [...c, a.id] : c.filter(x => x !== a.id)); }} />
                        {a.nombre}
                      </label>
                    ))
                  )}
                </div>
              ),
            },
          ]}
        />

        {/* NOTAS INTERNAS — below tabs like Odoo */}
        <div className="mt-4 border-t border-border pt-3">
          <OdooSection title="NOTAS INTERNAS">
            <textarea className="odoo-textarea" placeholder="Esta nota es solo para fines internos." rows={3} />
          </OdooSection>
        </div>
      </div>
    </div>
  );
}
