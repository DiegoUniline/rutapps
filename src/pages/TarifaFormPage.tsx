import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Trash2, Plus, Star } from 'lucide-react';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField } from '@/components/OdooFormField';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useTarifa, useSaveTarifa, useSaveTarifaLinea, useDeleteTarifaLinea, useProductosForSelect, useClasificaciones } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Tarifa, TarifaLinea, AplicaATarifa, TipoCalculoTarifa, RedondeoTarifa } from '@/types';

const APLICA_LABELS: Record<AplicaATarifa, string> = {
  todos: 'Todos los productos',
  categoria: 'Categoría',
  producto: 'Producto',
};

const CALCULO_LABELS: Record<TipoCalculoTarifa, string> = {
  margen_costo: 'Margen % sobre costo',
  descuento_precio: 'Descuento % sobre precio',
  precio_fijo: 'Precio fijo',
};

const REDONDEO_LABELS: Record<string, string> = {
  ninguno: 'Sin redondeo',
  arriba: '↑ Arriba',
  abajo: '↓ Abajo',
  cercano: '≈ Cercano',
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
  comision_pct: 0,
  base_precio: 'sin_impuestos' as 'sin_impuestos' | 'con_impuestos',
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
  const [showAddRow, setShowAddRow] = useState(false);
  const [newLinea, setNewLinea] = useState({ ...EMPTY_LINEA });
  const [editingName, setEditingName] = useState(false);

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
      setOriginalForm({ ...form });
      if (isNew) navigate(`/tarifas/${result.id}`, { replace: true });
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
      await saveLinea.mutateAsync({
        tarifa_id: id,
        aplica_a: newLinea.aplica_a,
        tipo_calculo: newLinea.tipo_calculo,
        precio: newLinea.precio,
        precio_minimo: newLinea.precio_minimo,
        descuento_max: newLinea.descuento_max,
        margen_pct: newLinea.margen_pct,
        descuento_pct: newLinea.descuento_pct,
        comision_pct: newLinea.comision_pct,
        base_precio: newLinea.base_precio,
        redondeo: newLinea.redondeo,
        notas: newLinea.notas || null,
        producto_ids: newLinea.aplica_a === 'producto' ? newLinea.producto_ids : [],
        clasificacion_ids: newLinea.aplica_a === 'categoria' ? newLinea.clasificacion_ids : [],
      } as any);
      setNewLinea({ ...EMPTY_LINEA });
      setShowAddRow(false);
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

  const getCalculoDisplay = (l: TarifaLinea) => {
    if (l.tipo_calculo === 'margen_costo') return `+${l.margen_pct}% s/costo`;
    if (l.tipo_calculo === 'descuento_precio') return `-${l.descuento_pct}% s/precio`;
    return `$ ${l.precio.toFixed(2)}`;
  };

  const getAplicaBadge = (aplica: AplicaATarifa) => {
    const styles: Record<string, string> = {
      producto: 'bg-primary/10 text-primary',
      categoria: 'bg-accent text-accent-foreground',
      todos: 'bg-muted text-muted-foreground',
    };
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[aplica]}`}>{APLICA_LABELS[aplica]}</span>;
  };

  const getValueField = () => {
    if (newLinea.tipo_calculo === 'margen_costo')
      return <input type="number" className="input-odoo text-right text-xs w-full" placeholder="%" value={newLinea.margen_pct || ''} onChange={e => setNewLinea(p => ({ ...p, margen_pct: +e.target.value }))} />;
    if (newLinea.tipo_calculo === 'descuento_precio')
      return <input type="number" className="input-odoo text-right text-xs w-full" placeholder="%" value={newLinea.descuento_pct || ''} onChange={e => setNewLinea(p => ({ ...p, descuento_pct: +e.target.value }))} />;
    return <input type="number" className="input-odoo text-right text-xs w-full" placeholder="$" value={newLinea.precio || ''} onChange={e => setNewLinea(p => ({ ...p, precio: +e.target.value }))} />;
  };

  return (
    <div className="p-4 min-h-full">
      {/* Breadcrumb + status */}
      <div className="flex items-center justify-between mb-0.5">
        <Link to="/tarifas" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Tarifas</Link>
        <div className="flex items-center gap-1">
          {['activa', 'inactiva'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => set('activa', s === 'activa')}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                (form.activa && s === 'activa') || (!form.activa && s === 'inactiva')
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {s === 'activa' ? 'Activa' : 'Inactiva'}
            </button>
          ))}
        </div>
      </div>

      {/* Header: Name + Save/Discard */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Star className="h-5 w-5 text-muted-foreground/40 shrink-0" />
        {isNew || editingName ? (
          <input
            type="text"
            value={form.nombre ?? ''}
            onChange={e => set('nombre', e.target.value)}
            onBlur={() => { if (!isNew) setEditingName(false); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder="Nombre de la tarifa"
            autoFocus
            className="text-[22px] font-bold text-foreground leading-tight bg-transparent border-b border-primary/40 focus:border-primary outline-none flex-1 min-w-[180px] max-w-md placeholder:text-muted-foreground/50"
          />
        ) : (
          <h1
            className="text-[22px] font-bold text-foreground leading-tight cursor-pointer hover:text-primary transition-colors truncate"
            onClick={() => setEditingName(true)}
          >
            {form.nombre || 'Tarifa'}
          </h1>
        )}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
          <button onClick={() => navigate('/tarifas')} className="btn-odoo-secondary">
            <X className="h-3.5 w-3.5" /> Descartar
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded px-4 pb-4 pt-3">
        {/* General info above tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 mb-4 pb-3 border-b border-border">
          <div>
            <OdooField label="Tipo" value={form.tipo} onChange={v => set('tipo', v as any)} type="select"
              options={[
                { value: 'general', label: 'General' },
                { value: 'por_cliente', label: 'Por Cliente' },
                { value: 'por_ruta', label: 'Por Ruta' },
              ]}
            />
            <OdooField label="Moneda" value={form.moneda} onChange={v => set('moneda', v)} />
          </div>
          <div>
            <OdooField label="Vigencia inicio" value={form.vigencia_inicio} onChange={v => set('vigencia_inicio', v)} placeholder="AAAA-MM-DD" />
            <OdooField label="Vigencia fin" value={form.vigencia_fin} onChange={v => set('vigencia_fin', v)} placeholder="AAAA-MM-DD" />
          </div>
        </div>

        {/* Price Rules — always visible like Odoo */}
        <OdooTabs
          tabs={[
            {
              key: 'reglas',
              label: 'Reglas de precio',
              content: isNew ? (
                <div className="text-[12px] text-muted-foreground py-4 bg-accent/30 border border-accent/50 rounded px-3">
                  💡 Guarda la tarifa primero para poder agregar reglas de precio.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-sm">
                      <thead>
                         <tr className="border-b border-table-border">
                          <th className="th-odoo text-left">Aplica a</th>
                          <th className="th-odoo text-left">Productos / Categorías</th>
                          <th className="th-odoo text-left">Cálculo</th>
                          <th className="th-odoo text-right">Valor</th>
                          <th className="th-odoo text-right">Comisión %</th>
                          <th className="th-odoo text-right">Precio mín</th>
                          <th className="th-odoo text-left">Redondeo</th>
                          <th className="th-odoo w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLineas.map(l => (
                          <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                            <td className="py-1.5 px-3">{getAplicaBadge(l.aplica_a)}</td>
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
                            <td className="py-1.5 px-3 text-xs text-muted-foreground">{CALCULO_LABELS[l.tipo_calculo]}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-odoo-teal font-semibold">{getCalculoDisplay(l)}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-xs">{(l as any).comision_pct ? `${(l as any).comision_pct}%` : '—'}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-xs">$ {l.precio_minimo.toFixed(2)}</td>
                            <td className="py-1.5 px-3 text-xs text-muted-foreground">{REDONDEO_LABELS[(l as any).redondeo] || '—'}</td>
                            <td className="py-1.5 px-3 text-center">
                              <button onClick={() => handleDeleteLinea(l.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {sortedLineas.length === 0 && !showAddRow && (
                          <tr><td colSpan={8} className="py-6 text-center text-[12px] text-muted-foreground">
                            Sin reglas de precio. Haz clic en "Agregar un precio" para empezar.
                          </td></tr>
                        )}

                        {/* ── Inline add row (Odoo-style: appears on click) ── */}
                        {showAddRow && (
                          <>
                            <tr className="bg-primary/5 border-b border-table-border">
                              <td className="py-2 px-3">
                                <select className="input-odoo text-xs w-full" value={newLinea.aplica_a}
                                  onChange={e => setNewLinea(p => ({ ...p, aplica_a: e.target.value as AplicaATarifa, producto_ids: [], clasificacion_ids: [] }))}>
                                  <option value="todos">Todos</option>
                                  <option value="categoria">Categoría</option>
                                  <option value="producto">Producto</option>
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                {newLinea.aplica_a === 'producto' && (
                                  <ChipSelect items={prodItems} selectedIds={newLinea.producto_ids}
                                    onChange={ids => setNewLinea(p => ({ ...p, producto_ids: ids }))} placeholder="+ Producto..." />
                                )}
                                {newLinea.aplica_a === 'categoria' && (
                                  <ChipSelect items={clasItems} selectedIds={newLinea.clasificacion_ids}
                                    onChange={ids => setNewLinea(p => ({ ...p, clasificacion_ids: ids }))} placeholder="+ Categoría..." />
                                )}
                                {newLinea.aplica_a === 'todos' && <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="py-2 px-3">
                                <select className="input-odoo text-xs w-full" value={newLinea.tipo_calculo}
                                  onChange={e => setNewLinea(p => ({ ...p, tipo_calculo: e.target.value as TipoCalculoTarifa }))}>
                                  <option value="margen_costo">Margen % s/costo</option>
                                  <option value="descuento_precio">Descuento % s/precio</option>
                                  <option value="precio_fijo">Precio fijo</option>
                                </select>
                              </td>
                              <td className="py-2 px-3">{getValueField()}</td>
                              <td className="py-2 px-3">
                                <input type="number" className="input-odoo text-right text-xs w-full" placeholder="%"
                                  value={newLinea.comision_pct || ''} onChange={e => setNewLinea(p => ({ ...p, comision_pct: +e.target.value }))} />
                              </td>
                              <td className="py-2 px-3">
                                <input type="number" className="input-odoo text-right text-xs w-full" placeholder="$ 0"
                                  value={newLinea.precio_minimo || ''} onChange={e => setNewLinea(p => ({ ...p, precio_minimo: +e.target.value }))} />
                              </td>
                              <td className="py-2 px-3">
                                <select className="input-odoo text-xs w-full" value={newLinea.redondeo}
                                  onChange={e => setNewLinea(p => ({ ...p, redondeo: e.target.value as RedondeoTarifa }))}>
                                  <option value="ninguno">Sin redondeo</option>
                                  <option value="arriba">↑ Arriba</option>
                                  <option value="abajo">↓ Abajo</option>
                                  <option value="cercano">≈ Cercano</option>
                                </select>
                              </td>
                              <td className="py-2 px-3"></td>
                            </tr>
                            <tr className="bg-primary/5">
                              <td colSpan={8} className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={handleAddLinea} disabled={saveLinea.isPending} className="btn-odoo-primary text-[12px] py-1 px-3">
                                    <Plus className="h-3 w-3" /> Agregar
                                  </button>
                                  <button onClick={() => { setShowAddRow(false); setNewLinea({ ...EMPTY_LINEA }); }} className="btn-odoo-secondary text-[12px] py-1 px-3">
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {!showAddRow && (
                    <button className="odoo-link" onClick={() => setShowAddRow(true)}>
                      <Plus className="h-3.5 w-3.5 inline mr-1" />Agregar un precio
                    </button>
                  )}
                </div>
              ),
            },
            {
              key: 'info',
              label: 'Otra información',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 py-2">
                  <OdooField label="Descripción" value={form.descripcion} onChange={v => set('descripcion', v)} />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
