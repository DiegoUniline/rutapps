import { useState, useEffect, useRef, ChangeEvent } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Trash2, Star, Camera, Plus, Crown } from 'lucide-react';
import KardexTab from '@/components/KardexTab';
import { calcTax } from '@/lib/taxUtils';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField, OdooSection } from '@/components/OdooFormField';
import { useProducto, useSaveProducto, useDeleteProducto, useMarcas, useProveedores, useClasificaciones, useListas, useUnidades, useTasasIva, useTasasIeps, useAlmacenes, useUnidadesSat, useTarifasForSelect, useTarifaLineasForProducto, useSaveTarifaLinea, useDeleteTarifaLinea, useProductoProveedores, useSaveProductoProveedor, useDeleteProductoProveedor, useListaPrecioLineasForProducto, useSaveListaPrecioLinea, useDeleteListaPrecioLinea, useListasPrecioByTarifa } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Producto, TipoCalculoTarifa } from '@/types';
import { supabase } from '@/lib/supabase';
import { compressPhoto } from '@/lib/imageCompressor';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

/** Quick-create a catalog item (marcas, clasificaciones, unidades, listas, proveedores) */
async function quickCreateCatalog(
  tableName: string,
  nombre: string,
  queryKey: string,
  qc: ReturnType<typeof useQueryClient>,
  extra?: Record<string, any>,
): Promise<string | undefined> {
  try {
    const { data: profile } = await supabase.from('profiles').select('empresa_id').maybeSingle();
    if (!profile?.empresa_id) { toast.error('Sin perfil de empresa'); return undefined; }
    const { data, error } = await (supabase.from as any)(tableName)
      .insert({ nombre, empresa_id: profile.empresa_id, ...extra })
      .select('id')
      .single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: [queryKey] });
    toast.success(`"${nombre}" creado`);
    return data.id as string;
  } catch (err: any) {
    toast.error(err.message);
    return undefined;
  }
}

/* ── Listas de Precios Tab Component ── */
function ListasPrecioProductoTab({ productoId, isNew, tarifasDisp }: {
  productoId?: string;
  isNew: boolean;
  tarifasDisp: any[];
}) {
  const { data: lineas, isLoading } = useListaPrecioLineasForProducto(isNew ? undefined : productoId);
  const saveMut = useSaveListaPrecioLinea();
  const deleteMut = useDeleteListaPrecioLinea();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

  // Group by tarifa
  const grouped = new Map<string, { tarifaNombre: string; items: any[] }>();
  (lineas ?? []).forEach((l: any) => {
    const lp = l.lista_precios;
    if (!lp) return;
    const tarifa = lp.tarifas;
    const tarifaId = tarifa?.id ?? 'sin-tarifa';
    const tarifaNombre = tarifa?.nombre ?? 'Sin tarifa';
    if (!grouped.has(tarifaId)) grouped.set(tarifaId, { tarifaNombre, items: [] });
    grouped.get(tarifaId)!.items.push({ ...l, listaNombre: lp.nombre, esPrincipal: lp.es_principal });
  });

  const handleSave = async (item: any) => {
    const precio = parseFloat(editPrice);
    if (isNaN(precio) || precio < 0) return;
    try {
      await saveMut.mutateAsync({ id: item.id, lista_precio_id: item.lista_precio_id, producto_id: item.producto_id, precio });
      setEditingId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMut.mutateAsync(id); toast.success('Precio eliminado'); } catch (err: any) { toast.error(err.message); }
  };

  if (isNew) return <p className="text-sm text-muted-foreground py-2">Guarda el producto primero para configurar precios por lista.</p>;

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([tarifaId, { tarifaNombre, items }]) => (
        <div key={tarifaId}>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{tarifaNombre}</h4>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left">Lista</th>
                  <th className="th-odoo text-right">Precio</th>
                  <th className="th-odoo w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                    <td className="py-1.5 px-3 font-medium">
                      {item.listaNombre}
                      {item.esPrincipal && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Principal</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono">
                      {editingId === item.id ? (
                        <input type="number" className="input-odoo py-0.5 text-[13px] w-28 text-right" autoFocus
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          onBlur={() => handleSave(item)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(item); if (e.key === 'Escape') setEditingId(null); }}
                        />
                      ) : (
                        <span className="cursor-pointer text-odoo-teal font-semibold hover:underline"
                          onClick={() => { setEditingId(item.id); setEditPrice(String(item.precio ?? 0)); }}>
                          $ {(item.precio ?? 0).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <button onClick={() => handleDelete(item.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {grouped.size === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground py-2">No hay precios por lista configurados. Agrega listas de precios desde las tarifas.</p>
      )}
    </div>
  );
}


/* ── Precios Tab Component ── */
function PreciosTab({ form, set, tarifaLineas, tarifasDisp, productoId, isNew, navigate, usaListas }: {
  form: Partial<Producto>;
  set: (key: keyof Producto, value: any) => void;
  tarifaLineas: any;
  tarifasDisp: any;
  productoId?: string;
  isNew: boolean;
  navigate: (path: string) => void;
  usaListas: boolean;
}) {
  const saveLinea = useSaveTarifaLinea();
  const deleteLineaMut = useDeleteTarifaLinea();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<any>({});
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

  const calcLabel = (l: any) => l.tipo_calculo === 'margen_costo' ? `+${l.margen_pct}% s/costo` : l.tipo_calculo === 'descuento_precio' ? `-${l.descuento_pct}% s/precio` : 'Precio fijo';

  const handleSaveRule = async () => {
    if (!newRule.tarifa_id) { toast.error('Selecciona una tarifa'); return; }
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

  const startEdit = (linea: any, col: string) => {
    setEditingId(linea.id);
    setEditingCol(col);
    setEditVal({
      tipo_calculo: linea.tipo_calculo,
      precio: linea.precio,
      margen_pct: linea.margen_pct,
      descuento_pct: linea.descuento_pct,
      precio_minimo: linea.precio_minimo,
    });
  };

  const saveEdit = async (lineaId: string) => {
    try {
      await saveLinea.mutateAsync({ id: lineaId, ...editVal } as any);
      setEditingId(null);
      setEditingCol(null);
    } catch (err: any) { toast.error(err.message); }
  };

  // Determine display based on mode
  const allLineas = (tarifaLineas ?? []) as any[];

  if (usaListas) {
    // Show ALL rules that apply, grouped by tarifa, with lista and full details
    const grouped = new Map<string, { nombre: string; rules: any[] }>();
    allLineas.forEach((tl: any) => {
      if (!tl.tarifas) return;
      const tid = tl.tarifas.id;
      if (!grouped.has(tid)) grouped.set(tid, { nombre: tl.tarifas.nombre, rules: [] });
      grouped.get(tid)!.rules.push(tl);
    });

    const aplica_label = (l: any) => l.aplica_a === 'producto' ? 'Producto' : l.aplica_a === 'categoria' ? 'Categoría' : 'Todos';

    return (
      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([tarifaId, { nombre, rules }]) => (
          <div key={tarifaId}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 cursor-pointer hover:text-foreground" onClick={() => navigate(`/tarifas/${tarifaId}`)}>{nombre}</h4>
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-table-border">
                    <th className="th-odoo text-left">Aplica</th>
                    <th className="th-odoo text-left">Lista</th>
                    <th className="th-odoo text-left">Tipo</th>
                    <th className="th-odoo text-right">Costo</th>
                    <th className="th-odoo text-right">Precio</th>
                    <th className="th-odoo text-right">Ganancia $</th>
                    <th className="th-odoo text-right">Ganancia %</th>
                    <th className="th-odoo w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((linea: any) => {
                    const precio = calcPrice(linea);
                    const costo = form.costo ?? 0;
                    const ganancia = precio - costo;
                    const ganPct = costo > 0 ? (ganancia / costo) * 100 : 0;
                    const isEd = editingId === linea.id;
                    const listaName = linea.lista_precios?.nombre;
                    const esPrincipal = linea.lista_precios?.es_principal;
                    return (
                      <tr key={linea.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                        <td className="py-1.5 px-3">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                            linea.aplica_a === 'producto' ? 'bg-primary/10 text-primary' : linea.aplica_a === 'categoria' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                          }`}>{aplica_label(linea)}</span>
                        </td>
                        <td className="py-1.5 px-3 text-xs">
                          {listaName ? (
                            <span className="flex items-center gap-1">
                              {esPrincipal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                              {listaName}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-1.5 px-3 text-xs text-muted-foreground cursor-pointer" onClick={() => startEdit(linea, 'tipo')}>
                          {isEd && editingCol === 'tipo' ? (
                            <select autoFocus className="input-odoo text-xs w-full" value={editVal.tipo_calculo}
                              onBlur={() => saveEdit(linea.id)}
                              onChange={e => setEditVal((p: any) => ({ ...p, tipo_calculo: e.target.value }))}>
                              <option value="margen_costo">Margen % s/costo</option>
                              <option value="descuento_precio">Descuento % s/precio</option>
                              <option value="precio_fijo">Precio fijo</option>
                            </select>
                          ) : calcLabel(linea)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">$ {costo.toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-right font-mono cursor-pointer" onClick={() => startEdit(linea, 'valor')}>
                          {isEd && editingCol === 'valor' ? (
                            <input autoFocus type="number" className="input-odoo text-right text-xs w-24"
                              value={editVal.tipo_calculo === 'margen_costo' ? editVal.margen_pct : editVal.tipo_calculo === 'descuento_precio' ? editVal.descuento_pct : editVal.precio}
                              onBlur={() => saveEdit(linea.id)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(linea.id); if (e.key === 'Escape') setEditingId(null); }}
                              onChange={e => {
                                const v = +e.target.value;
                                setEditVal((p: any) => ({
                                  ...p,
                                  ...(p.tipo_calculo === 'margen_costo' ? { margen_pct: v } : p.tipo_calculo === 'descuento_precio' ? { descuento_pct: v } : { precio: v }),
                                }));
                              }}
                            />
                          ) : (
                            <span className="text-odoo-teal font-semibold">$ {precio.toFixed(2)}</span>
                          )}
                        </td>
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
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {grouped.size === 0 && (
          <p className="text-sm text-muted-foreground py-2">Sin reglas de precio aplicables a este producto.</p>
        )}
        {!isNew && (
          <button className="odoo-link" onClick={() => setShowModal(true)}>
            Agregar un precio
          </button>
        )}
        {renderModal()}
      </div>
    );
  }

  // DIRECTO MODE: best rule per tarifa (original behavior)
  const byTarifa = new Map<string, { nombre: string; activa: boolean; linea: any }>();
  const priorityOrder: Record<string, number> = { producto: 0, categoria: 1, todos: 2 };
  allLineas.forEach((tl: any) => {
    if (!tl.tarifas) return;
    const tarifaId = tl.tarifas.id;
    const ex = byTarifa.get(tarifaId);
    const p = priorityOrder[tl.aplica_a] ?? 99;
    if (!ex || p < priorityOrder[ex.linea.aplica_a]) {
      byTarifa.set(tarifaId, { nombre: tl.tarifas.nombre, activa: tl.tarifas.activa, linea: tl });
    }
  });
  const entries = Array.from(byTarifa.entries());

  function renderModal() {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
        <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-[600px]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-[15px] font-semibold">Crear regla de tarifa</h3>
            <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
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
                <span className="odoo-field-label">Tarifa</span>
                <SearchableSelect
                  options={(tarifasDisp ?? []).map((t: any) => ({ value: t.id, label: t.nombre }))}
                  value={newRule.tarifa_id}
                  onChange={val => setNewRule(p => ({ ...p, tarifa_id: val }))}
                  placeholder="Buscar tarifa..."
                />
              </div>
            </div>
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
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Tarifa</th>
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
      {renderModal()}
    </div>
  );
}

/* ── Proveedores Tab Component ── */
function ProveedoresTab({ productoId, isNew, proveedores, prodProveedores, onSave, onDelete, saving, onCreateProveedor }: {
  productoId?: string;
  isNew: boolean;
  proveedores: { id: string; nombre: string }[];
  prodProveedores: any[];
  onSave: (row: any) => Promise<any>;
  onDelete: (row: { id: string; producto_id: string }) => Promise<any>;
  saving: boolean;
  onCreateProveedor?: (name: string) => Promise<string | undefined>;
}) {
  const [adding, setAdding] = useState(false);
  const [newProv, setNewProv] = useState({ proveedor_id: '', precio_compra: 0, tiempo_entrega_dias: 0 });

  const usedIds = new Set(prodProveedores.map((pp: any) => pp.proveedor_id));
  const availableProvs = proveedores.filter(p => !usedIds.has(p.id));

  const handleAdd = async () => {
    if (!newProv.proveedor_id || !productoId) return;
    try {
      await onSave({
        producto_id: productoId,
        proveedor_id: newProv.proveedor_id,
        es_principal: prodProveedores.length === 0,
        precio_compra: newProv.precio_compra,
        tiempo_entrega_dias: newProv.tiempo_entrega_dias,
      });
      setNewProv({ proveedor_id: '', precio_compra: 0, tiempo_entrega_dias: 0 });
      setAdding(false);
      toast.success('Proveedor agregado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSetPrincipal = async (pp: any) => {
    try {
      await onSave({ id: pp.id, producto_id: pp.producto_id, proveedor_id: pp.proveedor_id, es_principal: true });
      toast.success('Proveedor principal actualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemove = async (pp: any) => {
    try {
      await onDelete({ id: pp.id, producto_id: pp.producto_id });
      toast.success('Proveedor eliminado');
    } catch (err: any) { toast.error(err.message); }
  };

  if (isNew) {
    return (
      <div className="text-[12px] text-muted-foreground py-4 bg-accent/30 border border-accent/50 rounded px-3">
        💡 Guarda el producto primero para poder agregar proveedores.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Proveedor</th>
              <th className="th-odoo text-right">Precio compra</th>
              <th className="th-odoo text-right">Tiempo entrega (días)</th>
              <th className="th-odoo text-center w-20">Principal</th>
              <th className="th-odoo w-10"></th>
            </tr>
          </thead>
          <tbody>
            {prodProveedores.map((pp: any) => (
              <tr key={pp.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                <td className="py-1.5 px-3 font-medium">
                  {pp.proveedores?.nombre ?? '—'}
                  {pp.es_principal && (
                    <Crown className="inline h-3.5 w-3.5 ml-1.5 text-warning fill-warning" />
                  )}
                </td>
                <td className="py-1.5 px-3 text-right font-mono">$ {(pp.precio_compra ?? 0).toFixed(2)}</td>
                <td className="py-1.5 px-3 text-right">{pp.tiempo_entrega_dias ?? 0}</td>
                <td className="py-1.5 px-3 text-center">
                  {pp.es_principal ? (
                    <span className="text-[11px] text-primary font-medium">✓ Principal</span>
                  ) : (
                    <button
                      onClick={() => handleSetPrincipal(pp)}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Hacer principal
                    </button>
                  )}
                </td>
                <td className="py-1.5 px-3 text-center">
                  <button onClick={() => handleRemove(pp)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {prodProveedores.length === 0 && !adding && (
              <tr><td colSpan={5} className="py-3 px-3 text-[12px] text-muted-foreground">Sin proveedores asignados</td></tr>
            )}
            {adding && (
              <tr className="border-b border-table-border bg-primary/5">
                <td className="py-1.5 px-3">
                  <SearchableSelect
                    options={availableProvs.map(p => ({ value: p.id, label: p.nombre }))}
                    value={newProv.proveedor_id}
                    onChange={val => setNewProv(p => ({ ...p, proveedor_id: val }))}
                    placeholder="Buscar proveedor..."
                    onCreateNew={onCreateProveedor}
                  />
                </td>
                <td className="py-1.5 px-3">
                  <input type="number" className="input-odoo py-1 text-[13px] w-24 ml-auto block text-right" value={newProv.precio_compra}
                    onChange={e => setNewProv(p => ({ ...p, precio_compra: +e.target.value }))} />
                </td>
                <td className="py-1.5 px-3">
                  <input type="number" className="input-odoo py-1 text-[13px] w-20 ml-auto block text-right" value={newProv.tiempo_entrega_dias}
                    onChange={e => setNewProv(p => ({ ...p, tiempo_entrega_dias: +e.target.value }))} />
                </td>
                <td className="py-1.5 px-3 text-center" colSpan={2}>
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={handleAdd} disabled={!newProv.proveedor_id || saving} className="btn-odoo-primary text-[11px] py-0.5 px-2">
                      Agregar
                    </button>
                    <button onClick={() => setAdding(false)} className="btn-odoo-secondary text-[11px] py-0.5 px-2">
                      Cancelar
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && (
        <button className="odoo-link" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 inline mr-1" />Agregar proveedor
        </button>
      )}
    </div>
  );
}

const defaultProduct: Partial<Producto & { usa_listas_precio?: boolean }> = {
  codigo: '', nombre: '', clave_alterna: '', costo: 0, precio_principal: 0,
  se_puede_comprar: true, se_puede_vender: true, vender_sin_stock: false,
  se_puede_inventariar: true, es_combo: false, min: 0, max: 0,
  manejar_lotes: false, factor_conversion: 1, permitir_descuento: false,
  monto_maximo: 0, cantidad: 0, tiene_comision: false, tipo_comision: 'porcentaje',
  pct_comision: 0, status: 'borrador', almacenes: [], tiene_iva: false,
  tiene_ieps: false, calculo_costo: 'promedio', codigo_sat: '', contador: 0,
  contador_tarifas: 0,
  iva_pct: 16, ieps_pct: 0, ieps_tipo: 'porcentaje', costo_incluye_impuestos: false,
  usa_listas_precio: false,
};

const statusSteps = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'activo', label: 'Activo' },
  { key: 'inactivo', label: 'Inactivo' },
];

export default function ProductoFormPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nuevo';
  const { data: existing } = useProducto(isNew ? undefined : id);
  const saveMutation = useSaveProducto();
  const deleteMutation = useDeleteProducto();

  const createMarca = (name: string) => quickCreateCatalog('marcas', name, 'marcas', qc);
  const createClasificacion = (name: string) => quickCreateCatalog('clasificaciones', name, 'clasificaciones', qc);
  const createUnidad = (name: string) => quickCreateCatalog('unidades', name, 'unidades', qc);
  const createLista = (name: string) => quickCreateCatalog('listas', name, 'listas', qc);
  const createProveedor = (name: string) => quickCreateCatalog('proveedores', name, 'proveedores', qc);

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
  const [editingName, setEditingName] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: tarifaLineas } = useTarifaLineasForProducto(isNew ? undefined : id, form.clasificacion_id);
  const { data: prodProveedores } = useProductoProveedores(isNew ? undefined : id);
  const saveProvMut = useSaveProductoProveedor();
  const deleteProvMut = useDeleteProductoProveedor();

  // Auto-select defaults for new products: all almacenes, first unidad (Pieza), first lista (Lista General)
  useEffect(() => {
    if (!isNew) return;
    setForm(prev => {
      const updates: Partial<Producto> = {};
      if (almacenes && almacenes.length > 0 && (prev.almacenes ?? []).length === 0) {
        updates.almacenes = almacenes.map(a => a.id);
      }
      if (unidades && unidades.length > 0 && !prev.unidad_venta_id) {
        const pieza = unidades.find(u => u.nombre.toLowerCase() === 'pieza') ?? unidades[0];
        updates.unidad_venta_id = pieza.id;
        updates.unidad_compra_id = pieza.id;
      }
      if (listas && listas.length > 0 && !prev.lista_id) {
        const general = listas.find(l => l.nombre.toLowerCase().includes('general')) ?? listas[0];
        updates.lista_id = general.id;
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [isNew, almacenes, unidades, listas]);

  useEffect(() => {
    if (existing) { setForm(existing); setOriginalForm(existing); }
  }, [existing]);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresa?.id) return;
    setUploadingImage(true);
    try {
      const compressed = await compressPhoto(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const productId = id && !isNew ? id : crypto.randomUUID();
      const path = `${empresa.id}/productos/${productId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('empresa-assets').upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('empresa-assets').getPublicUrl(path);
      set('imagen_url', urlData.publicUrl + '?t=' + Date.now());
      toast.success('Imagen cargada');
    } catch (err: any) {
      toast.error('Error al subir imagen: ' + err.message);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

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
      {/* Breadcrumb + Status */}
      <div className="flex items-center justify-between mb-0.5">
        <Link to="/productos" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Producto</Link>
        <div className="flex items-center gap-1">
          {['activo', 'inactivo', 'borrador'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => set('status', s)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                form.status === s
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {s === 'activo' ? 'Activo' : s === 'inactivo' ? 'Inactivo' : 'Borrador'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Header: Name + Actions + Image ── */}
      <div className="flex items-start gap-4 mb-1">
        <div className="flex-1 min-w-0">
          {/* Row 1: Star + Name + Save/Discard/Delete */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setStarred(!starred)} className="text-warning hover:scale-110 transition-transform shrink-0">
              <Star className={`h-5 w-5 ${starred ? 'fill-warning' : ''}`} />
            </button>
            {isNew || editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={form.nombre ?? ''}
                onChange={e => set('nombre', e.target.value)}
                onBlur={() => { if (!isNew) setEditingName(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                placeholder="Nombre del producto"
                autoFocus
                className="text-[22px] font-bold text-foreground leading-tight bg-transparent border-b border-primary/40 focus:border-primary outline-none flex-1 min-w-[180px] max-w-md placeholder:text-muted-foreground/50"
              />
            ) : (
              <h1
                className="text-[22px] font-bold text-foreground leading-tight cursor-pointer hover:text-primary transition-colors truncate"
                onClick={() => setEditingName(true)}
              >
                {form.nombre || 'Producto'}
              </h1>
            )}

            {/* Action buttons inline with name */}
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
                <Save className="h-3.5 w-3.5" /> Guardar
              </button>
              <button onClick={() => navigate('/productos')} className="btn-odoo-secondary">
                <X className="h-3.5 w-3.5" /> Descartar
              </button>
              {!isNew && (
                <button onClick={handleDelete} className="btn-odoo-secondary text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Module checkboxes */}
          <div className="odoo-module-checks mt-1.5 mb-1">
            <label className="odoo-module-check">
              <input type="checkbox" checked={!!form.se_puede_vender} onChange={e => set('se_puede_vender', e.target.checked)} />
              Puede ser vendido
            </label>
            <label className="odoo-module-check">
              <input type="checkbox" checked={!!form.se_puede_comprar} onChange={e => set('se_puede_comprar', e.target.checked)} />
              Puede ser comprado
            </label>
          </div>
        </div>

        {/* Image */}
        <div className="hidden sm:block shrink-0">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {form.imagen_url ? (
            <div className="relative group cursor-pointer" onClick={() => imageInputRef.current?.click()}>
              <img src={form.imagen_url} alt="" className="w-[100px] h-[100px] rounded object-cover border border-border" />
              <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
          ) : (
            <div
              onClick={() => imageInputRef.current?.click()}
              className={`w-[100px] h-[100px] rounded border-2 border-dashed border-border flex items-center justify-center bg-muted/30 cursor-pointer hover:border-primary/40 transition-colors ${uploadingImage ? 'animate-pulse' : ''}`}
            >
              <Camera className="h-7 w-7 text-muted-foreground/40" />
            </div>
          )}
        </div>
      </div>


      <div className="bg-card border border-border rounded px-4 pb-4 pt-3">
        {/* General info fields ABOVE tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 mb-4 pb-4 border-b border-border">
          {/* Left column */}
          <div>
            <OdooField label="Código" value={form.codigo} help onChange={v => set('codigo', v)} alwaysEdit={isNew} />
            <OdooField label="Clave alterna" value={form.clave_alterna} onChange={v => set('clave_alterna', v)} />
            <OdooField label="Marca" value={form.marca_id} type="select"
              options={marcas?.map(m => ({ value: m.id, label: m.nombre })) ?? []}
              onChange={v => set('marca_id', v || null)}
              format={() => findName(marcas, form.marca_id ?? undefined)}
              onCreateNew={createMarca}
            />
            <OdooField label="Categoría" value={form.clasificacion_id} type="select"
              options={clasificaciones?.map(c => ({ value: c.id, label: c.nombre })) ?? []}
              onChange={v => set('clasificacion_id', v || null)}
              format={() => findName(clasificaciones, form.clasificacion_id ?? undefined)}
              onCreateNew={createClasificacion}
            />
            <OdooField label="Unid. venta" value={form.unidad_venta_id} type="select"
              options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
              onChange={v => set('unidad_venta_id', v || null)}
              format={() => findUnit(unidades, form.unidad_venta_id ?? undefined)}
              onCreateNew={createUnidad}
            />
            <OdooField label="Unid. compra" value={form.unidad_compra_id} type="select"
              options={unidades?.map(u => ({ value: u.id, label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ''}` })) ?? []}
              onChange={v => set('unidad_compra_id', v || null)}
              format={() => findUnit(unidades, form.unidad_compra_id ?? undefined)}
              onCreateNew={createUnidad}
            />
          </div>
          {/* Right column */}
          <div>
            <div className="odoo-field-row">
              <span className="odoo-field-label">Modo de precio</span>
              <div className="flex items-center gap-1">
                {['directo', 'listas'].map(mode => (
                  <button key={mode} type="button"
                    onClick={() => setForm(f => ({ ...f, usa_listas_precio: mode === 'listas' }))}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                      ((form as any).usa_listas_precio ? 'listas' : 'directo') === mode
                        ? 'bg-primary text-primary-foreground border-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}>
                    {mode === 'directo' ? 'Precio directo' : 'Listas de precio'}
                  </button>
                ))}
              </div>
            </div>
            {!(form as any).usa_listas_precio && (
              <OdooField label="Precio de venta" value={form.precio_principal} type="number" teal help
                onChange={v => set('precio_principal', +v)} format={v => `$ ${(v ?? 0).toFixed(2)}`} />
            )}
            <OdooField label="Costo" value={form.costo} type="number" teal help
              onChange={v => set('costo', +v)} format={v => `$ ${(v ?? 0).toFixed(2)}`} />
            <OdooField label="Cálculo costo" value={form.calculo_costo} type="select" help
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
            <OdooField label="Tarifa" value={form.lista_id} type="select"
              options={listas?.map(l => ({ value: l.id, label: l.nombre })) ?? []}
              onChange={v => set('lista_id', v || null)}
              format={() => findName(listas, form.lista_id ?? undefined)}
              onCreateNew={createLista}
            />
            <OdooField label="Stock mínimo" value={form.min ?? 0} type="number"
              onChange={v => setForm(f => ({ ...f, min: Number(v) }))} placeholder="0" />
            <OdooField label="Stock máximo" value={form.max ?? 0} type="number"
              onChange={v => setForm(f => ({ ...f, max: Number(v) }))} placeholder="0" />
          </div>
        </div>

        {/* Tabs below general info */}
        <OdooTabs
          tabs={[
            {
              key: 'precios',
              label: (form as any).usa_listas_precio ? 'Precios por Tarifa' : 'Precios por Tarifa',
              content: <PreciosTab
                  form={form}
                  set={set}
                  tarifaLineas={tarifaLineas}
                  tarifasDisp={tarifasDisp}
                  productoId={id}
                  isNew={isNew}
                  navigate={navigate}
                  usaListas={!!(form as any).usa_listas_precio}
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
                    <OdooField label="IVA %" value={form.iva_pct ?? 16} type="number" teal
                      onChange={v => set('iva_pct', +v)}
                      format={v => `${v ?? 16}%`}
                    />
                    <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
                      {[0, 8, 16].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => set('iva_pct', rate)}
                          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                            form.iva_pct === rate
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>

                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Tipo IEPS</span>
                      <div className="flex gap-2 pt-[2px]">
                        {(['porcentaje', 'cuota'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => set('ieps_tipo', t)}
                            className={`text-[11px] px-3 py-1 rounded border transition-colors ${
                              (form.ieps_tipo || 'porcentaje') === t
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:border-primary/50'
                            }`}
                          >
                            {t === 'porcentaje' ? '% Porcentaje' : '$ Cuota fija'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <OdooField
                      label={(form.ieps_tipo || 'porcentaje') === 'cuota' ? 'IEPS cuota $' : 'IEPS %'}
                      value={form.ieps_pct ?? 0}
                      type="number"
                      teal
                      onChange={v => set('ieps_pct', +v)}
                      format={v => (form.ieps_tipo || 'porcentaje') === 'cuota' ? `$ ${v ?? 0}` : `${v ?? 0}%`}
                    />
                    {(form.ieps_tipo || 'porcentaje') === 'porcentaje' && (
                      <div className="ml-[140px] -mt-1 mb-2 flex gap-2">
                        {[0, 8, 25, 53].map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => set('ieps_pct', rate)}
                            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                              form.ieps_pct === rate
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:border-primary/50'
                            }`}
                          >
                            {rate}%
                          </button>
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
              ),
            },
            {
              key: 'comisiones',
              label: 'Comisiones',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  <div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Maneja comisión</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.tiene_comision} onChange={e => set('tiene_comision', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                    {form.tiene_comision && (
                      <>
                        <OdooField label="Tipo comisión" value={form.tipo_comision} type="select"
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
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => set('almacenes', almacenes?.map(a => a.id) ?? [])}
                      className="text-[12px] text-primary hover:underline"
                    >
                      Seleccionar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => set('almacenes', [])}
                      className="text-[12px] text-muted-foreground hover:underline"
                    >
                      Ninguno
                    </button>
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
              ),
            },
            {
              key: 'inventario',
              label: 'Inventario',
              content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  <div>
                    <OdooField label="Min stock" value={form.min} type="number" teal
                      onChange={v => set('min', +v)} format={v => (v ?? 0).toString()} />
                    <OdooField label="Max stock" value={form.max} type="number" teal
                      onChange={v => set('max', +v)} format={v => (v ?? 0).toString()} />
                  </div>
                  <div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Vender sin stock</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.vender_sin_stock} onChange={e => set('vender_sin_stock', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                    <div className="odoo-field-row">
                      <span className="odoo-field-label">Manejar lotes</span>
                      <label className="flex items-center gap-2 cursor-pointer pt-[2px]">
                        <input type="checkbox" checked={!!form.manejar_lotes} onChange={e => set('manejar_lotes', e.target.checked)} className="rounded border-input h-3.5 w-3.5" />
                      </label>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'proveedores',
              label: 'Proveedores',
              content: (
                <ProveedoresTab
                  productoId={id}
                  isNew={isNew}
                  proveedores={proveedores ?? []}
                  prodProveedores={prodProveedores ?? []}
                  onSave={saveProvMut.mutateAsync}
                  onDelete={deleteProvMut.mutateAsync}
                  saving={saveProvMut.isPending}
                  onCreateProveedor={createProveedor}
                />
              ),
            },
            {
              key: 'kardex',
              label: 'Kardex',
              content: (
                <KardexTab productoId={id} isNew={isNew} />
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
