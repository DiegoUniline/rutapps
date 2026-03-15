import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Trash2, Plus, Star } from 'lucide-react';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField } from '@/components/OdooFormField';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { useTarifa, useSaveTarifa, useSaveTarifaLinea, useDeleteTarifaLinea, useProductosForSelect, useClasificaciones } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Tarifa, TarifaLinea, AplicaATarifa, TipoCalculoTarifa, RedondeoTarifa } from '@/types';

const APLICA_LABELS: Record<AplicaATarifa, string> = {
  todos: 'Todos los productos',
  categoria: 'Categoría (Clasificación)',
  producto: 'Producto específico',
};

const CALCULO_LABELS: Record<TipoCalculoTarifa, string> = {
  margen_costo: 'Margen % sobre costo',
  descuento_precio: 'Descuento % sobre precio',
  precio_fijo: 'Precio fijo',
};

const REDONDEO_LABELS: Record<string, string> = {
  ninguno: 'Sin redondeo',
  arriba: '↑ Hacia arriba',
  abajo: '↓ Hacia abajo',
  cercano: '≈ Al más cercano',
};

const EMPTY_LINEA = {
  producto_ids: [] as string[],
  clasificacion_ids: [] as string[],
  aplica_a: 'todos' as AplicaATarifa,
  tipo_calculo: 'margen_costo' as TipoCalculoTarifa,
  precio: 0,
  precio_minimo: 0,
  descuento_max: 0,
  margen_pct: 0,
  descuento_pct: 0,
  redondeo: 'ninguno' as RedondeoTarifa,
  notas: '',
};

/* ── Multi-select chips ─────────────────────────── */
function ChipSelect({ items, selectedIds, onChange, placeholder }: {
  items: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const available = items.filter(i => !selectedIds.includes(i.id));
  const selected = selectedIds.map(id => items.find(i => i.id === id)).filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {selected.map(s => (
        <span key={s.id} className="odoo-badge">
          {s.label}
          <button onClick={() => onChange(selectedIds.filter(x => x !== s.id))} className="odoo-badge-remove">×</button>
        </span>
      ))}
      {available.length > 0 && (
        <select
          className="input-odoo text-xs flex-shrink-0"
          style={{ width: selected.length > 0 ? '140px' : '100%' }}
          value=""
          onChange={e => { if (e.target.value) onChange([...selectedIds, e.target.value]); }}
        >
          <option value="">{placeholder}</option>
          {available.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      )}
    </div>
  );
}

export default function TarifaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nueva';
  const { data: existing, refetch } = useTarifa(isNew ? undefined : id);
  const saveMutation = useSaveTarifa();
  const saveLinea = useSaveTarifaLinea();
  const deleteLinea = useDeleteTarifaLinea();
  const { data: productosDisp } = useProductosForSelect();
  const { data: clasificaciones } = useClasificaciones();

  const [form, setForm] = useState<Partial<Tarifa>>({
    nombre: '', descripcion: '', tipo: 'general', moneda: 'MXN', activa: true,
  });
  const [originalForm, setOriginalForm] = useState<Partial<Tarifa>>({});
  const [newLinea, setNewLinea] = useState({ ...EMPTY_LINEA });
  const [fav, setFav] = useState(false);

  useEffect(() => { if (existing) { setForm(existing); setOriginalForm(existing); } }, [existing]);

  const isDirty = isNew || JSON.stringify(form) !== JSON.stringify(originalForm);

  const set = (key: keyof Tarifa, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  // Lookup maps
  const prodMap = new Map((productosDisp ?? []).map(p => [p.id, `${p.codigo} — ${p.nombre}`]));
  const clasMap = new Map((clasificaciones ?? []).map(c => [c.id, c.nombre]));
  const prodItems = (productosDisp ?? []).map(p => ({ id: p.id, label: `${p.codigo} — ${p.nombre}` }));
  const clasItems = (clasificaciones ?? []).map(c => ({ id: c.id, label: c.nombre }));

  const handleSave = async () => {
    if (!form.nombre) { toast.error('El nombre es obligatorio'); return; }
    try {
      const result = await saveMutation.mutateAsync(isNew ? form : { ...form, id });
      toast.success('Tarifa guardada');
      if (isNew) navigate(`/tarifas/${result.id}`);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddLinea = async () => {
    if (!id || isNew) return;
    if (newLinea.aplica_a === 'producto' && newLinea.producto_ids.length === 0) {
      toast.error('Selecciona al menos un producto'); return;
    }
    if (newLinea.aplica_a === 'categoria' && newLinea.clasificacion_ids.length === 0) {
      toast.error('Selecciona al menos una categoría'); return;
    }
    try {
      const payload: any = {
        tarifa_id: id,
        aplica_a: newLinea.aplica_a,
        tipo_calculo: newLinea.tipo_calculo,
        precio: newLinea.precio,
        precio_minimo: newLinea.precio_minimo,
        descuento_max: newLinea.descuento_max,
        margen_pct: newLinea.margen_pct,
        descuento_pct: newLinea.descuento_pct,
        redondeo: newLinea.redondeo,
        notas: newLinea.notas || null,
        producto_ids: newLinea.aplica_a === 'producto' ? newLinea.producto_ids : [],
        clasificacion_ids: newLinea.aplica_a === 'categoria' ? newLinea.clasificacion_ids : [],
      };
      await saveLinea.mutateAsync(payload);
      setNewLinea({ ...EMPTY_LINEA });
      refetch();
      toast.success('Regla agregada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteLinea = async (lineaId: string) => {
    try { await deleteLinea.mutateAsync(lineaId); refetch(); } catch (err: any) { toast.error(err.message); }
  };

  const lineas = (existing?.tarifa_lineas ?? []) as TarifaLinea[];
  const sortedLineas = [...lineas].sort((a, b) => {
    const order: Record<string, number> = { producto: 0, categoria: 1, todos: 2 };
    return (order[a.aplica_a] ?? 2) - (order[b.aplica_a] ?? 2);
  });

  const getAplicaNames = (l: TarifaLinea) => {
    if (l.aplica_a === 'producto') return l.producto_ids.map(id => prodMap.get(id) ?? id).join(', ') || '—';
    if (l.aplica_a === 'categoria') return l.clasificacion_ids.map(id => clasMap.get(id) ?? id).join(', ') || '—';
    return 'Todos';
  };

  const getCalculoDisplay = (l: TarifaLinea) => {
    if (l.tipo_calculo === 'margen_costo') return `+${l.margen_pct}% sobre costo`;
    if (l.tipo_calculo === 'descuento_precio') return `-${l.descuento_pct}% sobre precio`;
    return `$${l.precio.toFixed(2)}`;
  };

  const getPriorityBadge = (aplica: AplicaATarifa) => {
    const colors: Record<string, string> = {
      producto: 'bg-green-100 text-green-800',
      categoria: 'bg-blue-100 text-blue-800',
      todos: 'bg-gray-100 text-gray-600',
    };
    const labels: Record<string, string> = { producto: '1° Producto', categoria: '2° Categoría', todos: '3° Todos' };
    return <span className={`text-[11px] px-1.5 py-0.5 rounded ${colors[aplica]}`}>{labels[aplica]}</span>;
  };

  return (
    <div className="p-4 min-h-full">
      {/* Breadcrumb */}
      <div className="mb-1">
        <Link to="/tarifas" className="text-xs text-muted-foreground hover:text-primary">Tarifas /</Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setFav(!fav)} className="text-muted-foreground hover:text-yellow-500">
          <Star className={`h-5 w-5 ${fav ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        </button>
        <h1 className="text-[22px] font-bold text-foreground flex-1">
          {isNew ? 'Nueva Tarifa' : form.nombre || 'Tarifa'}
        </h1>
        {!isNew && (
          <OdooStatusbar
            steps={[
              { key: 'activa', label: 'Activa' },
              { key: 'inactiva', label: 'Inactiva' },
            ]}
            current={form.activa ? 'activa' : 'inactiva'}
            onStepClick={(key) => set('activa', key === 'activa')}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
          <Save className="h-3.5 w-3.5" /> Guardar
        </button>
        <button onClick={() => navigate('/tarifas')} className="btn-odoo-secondary">
          <X className="h-3.5 w-3.5" /> Descartar
        </button>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
          <OdooField label="Nombre" value={form.nombre} onChange={v => set('nombre', v)} />
          <OdooField label="Tipo" value={form.tipo} onChange={v => set('tipo', v as any)} type="select"
            options={[
              { value: 'general', label: 'General' },
              { value: 'por_cliente', label: 'Por Cliente' },
              { value: 'por_ruta', label: 'Por Ruta' },
            ]}
          />
          <OdooField label="Moneda" value={form.moneda} onChange={v => set('moneda', v)} />
          <OdooField label="Descripción" value={form.descripcion} onChange={v => set('descripcion', v)} />
          <OdooField label="Vigencia Inicio" value={form.vigencia_inicio} onChange={v => set('vigencia_inicio', v)} placeholder="AAAA-MM-DD" />
          <OdooField label="Vigencia Fin" value={form.vigencia_fin} onChange={v => set('vigencia_fin', v)} placeholder="AAAA-MM-DD" />
        </div>

        {/* Rules */}
        {!isNew && (
          <div className="mt-4">
            <OdooTabs
              tabs={[
                {
                  key: 'reglas',
                  label: 'Reglas de Precio',
                  content: (
                    <div className="space-y-2">
                      <div className="text-[11px] text-muted-foreground bg-muted/50 rounded px-3 py-2 mb-2">
                        <strong>Prioridad:</strong> Producto (1°) › Categoría (2°) › Todos (3°). Puedes seleccionar múltiples productos o categorías por regla.
                      </div>

                      <div className="overflow-x-auto border border-border rounded">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-table-border">
                              <th className="th-odoo text-left" style={{width:'90px'}}>Prioridad</th>
                              <th className="th-odoo text-left" style={{width:'120px'}}>Aplica a</th>
                              <th className="th-odoo text-left">Productos / Categorías</th>
                              <th className="th-odoo text-left" style={{width:'150px'}}>Tipo Cálculo</th>
                              <th className="th-odoo text-right" style={{width:'120px'}}>Valor</th>
                              <th className="th-odoo text-right" style={{width:'80px'}}>Precio Mín</th>
                              <th className="th-odoo text-left" style={{width:'110px'}}>Redondeo</th>
                              <th className="th-odoo text-left" style={{width:'100px'}}>Notas</th>
                              <th className="th-odoo" style={{width:'36px'}}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLineas.map(l => (
                              <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                                <td className="py-1.5 px-3">{getPriorityBadge(l.aplica_a)}</td>
                                <td className="py-1.5 px-3 text-xs">{APLICA_LABELS[l.aplica_a]}</td>
                                <td className="py-1.5 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {l.aplica_a === 'producto' && l.producto_ids.map(pid => (
                                      <span key={pid} className="odoo-badge text-[11px]">{prodMap.get(pid) ?? pid}</span>
                                    ))}
                                    {l.aplica_a === 'categoria' && l.clasificacion_ids.map(cid => (
                                      <span key={cid} className="odoo-badge text-[11px]">{clasMap.get(cid) ?? cid}</span>
                                    ))}
                                    {l.aplica_a === 'todos' && <span className="text-xs text-muted-foreground">Todos</span>}
                                  </div>
                                </td>
                                <td className="py-1.5 px-3 text-xs">{CALCULO_LABELS[l.tipo_calculo]}</td>
                                <td className="py-1.5 px-3 text-right font-mono text-odoo-teal">{getCalculoDisplay(l)}</td>
                                <td className="py-1.5 px-3 text-right font-mono">${l.precio_minimo.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-xs">{REDONDEO_LABELS[(l as any).redondeo] || 'Sin redondeo'}</td>
                                <td className="py-1.5 px-3 text-muted-foreground text-xs">{l.notas ?? '—'}</td>
                                <td className="py-1.5 px-3 text-center">
                                  <button onClick={() => handleDeleteLinea(l.id)} className="text-destructive hover:text-destructive/80">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {/* ── Add new rule row ── */}
                            <tr className="bg-table-hover">
                              <td className="py-2 px-3" colSpan={2}>
                                <select className="input-odoo text-xs" value={newLinea.aplica_a}
                                  onChange={e => setNewLinea(p => ({ ...p, aplica_a: e.target.value as AplicaATarifa, producto_ids: [], clasificacion_ids: [] }))}>
                                  <option value="todos">Todos los productos</option>
                                  <option value="categoria">Por Categoría</option>
                                  <option value="producto">Por Producto</option>
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                {newLinea.aplica_a === 'producto' && (
                                  <ChipSelect
                                    items={prodItems}
                                    selectedIds={newLinea.producto_ids}
                                    onChange={ids => setNewLinea(p => ({ ...p, producto_ids: ids }))}
                                    placeholder="+ Agregar producto..."
                                  />
                                )}
                                {newLinea.aplica_a === 'categoria' && (
                                  <ChipSelect
                                    items={clasItems}
                                    selectedIds={newLinea.clasificacion_ids}
                                    onChange={ids => setNewLinea(p => ({ ...p, clasificacion_ids: ids }))}
                                    placeholder="+ Agregar categoría..."
                                  />
                                )}
                                {newLinea.aplica_a === 'todos' && <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 px-3">
                                <select className="input-odoo text-xs" value={newLinea.tipo_calculo}
                                  onChange={e => setNewLinea(p => ({ ...p, tipo_calculo: e.target.value as TipoCalculoTarifa }))}>
                                  <option value="margen_costo">Margen % sobre costo</option>
                                  <option value="descuento_precio">Descuento % sobre precio</option>
                                  <option value="precio_fijo">Precio fijo</option>
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                {newLinea.tipo_calculo === 'margen_costo' && (
                                  <input type="number" className="input-odoo text-right text-xs" placeholder="Margen %" value={newLinea.margen_pct} onChange={e => setNewLinea(p => ({ ...p, margen_pct: +e.target.value }))} />
                                )}
                                {newLinea.tipo_calculo === 'descuento_precio' && (
                                  <input type="number" className="input-odoo text-right text-xs" placeholder="Descuento %" value={newLinea.descuento_pct} onChange={e => setNewLinea(p => ({ ...p, descuento_pct: +e.target.value }))} />
                                )}
                                {newLinea.tipo_calculo === 'precio_fijo' && (
                                  <input type="number" className="input-odoo text-right text-xs" placeholder="Precio" value={newLinea.precio} onChange={e => setNewLinea(p => ({ ...p, precio: +e.target.value }))} />
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <input type="number" className="input-odoo text-right text-xs" placeholder="Mín" value={newLinea.precio_minimo} onChange={e => setNewLinea(p => ({ ...p, precio_minimo: +e.target.value }))} />
                              </td>
                              <td className="py-2 px-3">
                                <input className="input-odoo text-xs" placeholder="Notas" value={newLinea.notas} onChange={e => setNewLinea(p => ({ ...p, notas: e.target.value }))} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <button onClick={handleAddLinea} className="text-primary hover:text-primary/80">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <button className="odoo-link" onClick={handleAddLinea}>+ Agregar una regla</button>
                    </div>
                  ),
                },
                {
                  key: 'info',
                  label: 'Otra Información',
                  content: (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 py-2">
                      <OdooField label="Activa" value={form.activa ? 'Sí' : 'No'} onChange={() => set('activa', !form.activa)} readOnly />
                      <OdooField label="Moneda" value={form.moneda} onChange={v => set('moneda', v)} readOnly />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
