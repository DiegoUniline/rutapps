import { useState, useEffect, useMemo } from 'react';
import { Star, X, Trash2, Plus } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import { useSaveTarifaLinea, useDeleteTarifaLinea, useSaveTarifa, useAllListasPrecios, useClasificaciones, useSaveListaPrecio } from '@/hooks/useData';
import { toast } from 'sonner';
import type { Producto, TipoCalculoTarifa } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

interface PreciosTabProps {
  form: Partial<Producto>;
  tarifaLineas: unknown[];
  tarifasDisp: unknown[];
  productoId?: string;
  isNew: boolean;
  navigate: (path: string) => void;
}

export function PreciosTab({ form, tarifaLineas, tarifasDisp, productoId, isNew, navigate }: PreciosTabProps) {
  const saveLinea = useSaveTarifaLinea();
  const deleteLineaMut = useDeleteTarifaLinea();
  const saveTarifaMut = useSaveTarifa();
  const { data: allListas } = useAllListasPrecios();
  const { data: clasificaciones } = useClasificaciones();
  const saveListaMut = useSaveListaPrecio();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<Record<string, unknown>>({});
  const [newRule, setNewRule] = useState({
    aplica_a: 'producto' as 'producto' | 'categoria' | 'todos',
    clasificacion_ids: [] as string[],
    tarifa_id: '',
    lista_precio_id: '',
    tipo_calculo: 'precio_fijo' as TipoCalculoTarifa,
    precio: 0,
    margen_pct: 0,
    descuento_pct: 0,
    precio_minimo: 0,
  });

  const listasForTarifa = useMemo(() => {
    if (!newRule.tarifa_id) return allListas ?? [];
    return (allListas ?? []).filter((l: any) => l.tarifa_id === newRule.tarifa_id);
  }, [allListas, newRule.tarifa_id]);

  useEffect(() => {
    if (newRule.tarifa_id) {
      const principal = listasForTarifa.find((l: any) => l.es_principal);
      setNewRule(p => ({ ...p, lista_precio_id: (principal as any)?.id ?? (listasForTarifa[0] as any)?.id ?? '' }));
    }
  }, [newRule.tarifa_id, listasForTarifa]);

  const handleCreateTarifa = async (name: string) => {
    try {
      const res = await saveTarifaMut.mutateAsync({ nombre: name, tipo: 'general', activa: true } as any);
      qc.invalidateQueries({ queryKey: ['tarifas-select'] });
      return res.id;
    } catch { return undefined; }
  };

  const handleCreateLista = async (name: string) => {
    let tarifaId = newRule.tarifa_id;
    if (!tarifaId) {
      try {
        const res = await saveTarifaMut.mutateAsync({ nombre: name, tipo: 'general', activa: true } as any);
        qc.invalidateQueries({ queryKey: ['tarifas-select'] });
        tarifaId = res.id;
      } catch { return undefined; }
    }
    try {
      const res = await saveListaMut.mutateAsync({ tarifa_id: tarifaId, nombre: name, es_principal: false });
      qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
      return res.id;
    } catch { return undefined; }
  };

  const applyRedondeo = (precio: number, redondeo: string) => {
    if (!redondeo || redondeo === 'ninguno') return precio;
    if (redondeo === 'arriba') return Math.ceil(precio);
    if (redondeo === 'abajo') return Math.floor(precio);
    return Math.round(precio);
  };

  const calcLabel = (l: any) => l.tipo_calculo === 'margen_costo' ? `+${l.margen_pct}% s/costo` : l.tipo_calculo === 'descuento_precio' ? `-${l.descuento_pct}% s/precio` : 'Precio fijo';

  const handleSaveRule = async () => {
    if (!newRule.lista_precio_id) { toast.error('Selecciona una lista de precios'); return; }
    if (newRule.aplica_a === 'categoria' && newRule.clasificacion_ids.length === 0) { toast.error('Selecciona al menos una categoría'); return; }

    const existing = (tarifaLineas ?? []) as any[];
    const listaId = newRule.lista_precio_id || null;
    const duplicate = existing.find((l: any) => {
      if (l.tarifas?.id !== newRule.tarifa_id) return false;
      const existLista = l.lista_precios?.id ?? l.lista_precio_id ?? null;
      if (existLista !== listaId) return false;
      if (newRule.aplica_a === 'producto' && l.aplica_a === 'producto' && (l.producto_ids ?? []).includes(productoId)) return true;
      if (newRule.aplica_a === 'categoria' && l.aplica_a === 'categoria') {
        const overlap = newRule.clasificacion_ids.some((cid: string) => (l.clasificacion_ids ?? []).includes(cid));
        if (overlap) return true;
      }
      if (newRule.aplica_a === 'todos' && l.aplica_a === 'todos') return true;
      return false;
    });
    if (duplicate) { toast.error('Ya existe una regla con la misma tarifa, lista y alcance.'); return; }

    try {
      await saveLinea.mutateAsync({
        tarifa_id: newRule.tarifa_id, lista_precio_id: newRule.lista_precio_id || null,
        aplica_a: newRule.aplica_a, tipo_calculo: newRule.tipo_calculo,
        precio: newRule.precio, margen_pct: newRule.margen_pct, descuento_pct: newRule.descuento_pct,
        precio_minimo: newRule.precio_minimo,
        producto_ids: newRule.aplica_a === 'producto' ? [productoId!] : [],
        clasificacion_ids: newRule.aplica_a === 'categoria' ? newRule.clasificacion_ids : [],
      } as any);
      toast.success('Precio agregado');
      setShowModal(false);
      setNewRule({ aplica_a: 'producto', clasificacion_ids: [], tarifa_id: '', lista_precio_id: '', tipo_calculo: 'precio_fijo', precio: 0, margen_pct: 0, descuento_pct: 0, precio_minimo: 0 });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteRule = async (lineaId: string) => {
    try { await deleteLineaMut.mutateAsync(lineaId); toast.success('Precio eliminado'); } catch (err: any) { toast.error(err.message); }
  };

  const startEdit = (linea: any, col: string) => {
    setEditingId(linea.id);
    setEditingCol(col);
    setEditVal({
      tipo_calculo: linea.tipo_calculo, precio: linea.precio, margen_pct: linea.margen_pct,
      descuento_pct: linea.descuento_pct, precio_minimo: linea.precio_minimo,
      comision_pct: linea.comision_pct ?? 0, redondeo: linea.redondeo ?? 'ninguno',
      base_precio: linea.base_precio ?? 'sin_impuestos',
    });
  };

  const saveEdit = async (lineaId: string) => {
    try {
      await saveLinea.mutateAsync({ id: lineaId, ...editVal } as any);
      setEditingId(null); setEditingCol(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const allLineas = (tarifaLineas ?? []) as any[];
  const grouped = new Map<string, { nombre: string; rules: any[] }>();
  allLineas.forEach((tl: any) => {
    if (!tl.tarifas) return;
    const tid = tl.tarifas.id;
    if (!grouped.has(tid)) grouped.set(tid, { nombre: tl.tarifas.nombre, rules: [] });
    grouped.get(tid)!.rules.push(tl);
  });

  const aplica_label = (l: any) => {
    if (l.aplica_a === 'producto') return 'Este producto';
    if (l.aplica_a === 'categoria') {
      const names = (l.clasificacion_ids ?? []).map((cid: string) => {
        const c = (clasificaciones ?? []).find((cl: any) => cl.id === cid);
        return (c as any)?.nombre ?? cid.slice(0, 6);
      });
      return names.length ? names.join(', ') : 'Categoría';
    }
    return 'Todos';
  };

  function renderModal() {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
        <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-[600px]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-[15px] font-semibold">Crear regla de precio</h3>
            <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-x-8">
              <div className="odoo-field-row">
                <span className="odoo-field-label">Aplica a</span>
                <select className="input-odoo py-1 text-[13px]" value={newRule.aplica_a}
                  onChange={e => {
                    const val = e.target.value as 'producto' | 'categoria' | 'todos';
                    setNewRule(p => ({ ...p, aplica_a: val, clasificacion_ids: val === 'categoria' && form.clasificacion_id ? [form.clasificacion_id] : [] }));
                  }}>
                  <option value="producto">Este producto</option>
                  <option value="categoria">Categoría</option>
                  <option value="todos">Todos los productos</option>
                </select>
              </div>
              <div className="odoo-field-row">
                <span className="odoo-field-label">Precio mínimo</span>
                <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.precio_minimo}
                  onChange={e => setNewRule(p => ({ ...p, precio_minimo: +e.target.value }))} />
              </div>
            </div>
            {newRule.aplica_a === 'producto' && (
              <div className="odoo-field-row"><span className="odoo-field-label">Producto</span><span className="text-[13px] font-medium">{form.nombre ?? '—'}</span></div>
            )}
            {newRule.aplica_a === 'categoria' && (
              <div className="odoo-field-row">
                <span className="odoo-field-label">Categorías</span>
                <div className="flex flex-wrap gap-1.5">
                  {(clasificaciones ?? []).map((c: any) => {
                    const selected = newRule.clasificacion_ids.includes(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => setNewRule(p => ({ ...p, clasificacion_ids: selected ? p.clasificacion_ids.filter(id => id !== c.id) : [...p.clasificacion_ids, c.id] }))}
                        className={`text-[12px] px-2 py-0.5 rounded-full border transition-colors ${selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/50'}`}>
                        {c.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-8">
              <div className="odoo-field-row">
                <span className="odoo-field-label">Tipo de precio</span>
                <div className="flex flex-col gap-1.5 text-[13px]">
                  {(['descuento_precio', 'margen_costo', 'precio_fijo'] as TipoCalculoTarifa[]).map(t => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="tipo_calc" checked={newRule.tipo_calculo === t} onChange={() => setNewRule(p => ({ ...p, tipo_calculo: t }))} className="h-3.5 w-3.5" />
                      {t === 'descuento_precio' ? 'Descuento' : t === 'margen_costo' ? 'Fórmula' : 'Precio fijo'}
                    </label>
                  ))}
                </div>
              </div>
              <div className="odoo-field-row">
                <span className="odoo-field-label">Lista de precios</span>
                <SearchableSelect
                  options={(allListas ?? []).map((l: any) => ({ value: l.id, label: `${l.es_principal ? '★ ' : ''}${l.nombre}` }))}
                  value={newRule.lista_precio_id}
                  onChange={val => { const lista = (allListas ?? []).find((l: any) => l.id === val); setNewRule(p => ({ ...p, lista_precio_id: val, tarifa_id: (lista as any)?.tarifa_id ?? '' })); }}
                  placeholder="Buscar lista..."
                  onCreateNew={handleCreateLista}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8">
              {newRule.tipo_calculo === 'precio_fijo' && newRule.aplica_a === 'producto' && (
                <div className="odoo-field-row"><span className="odoo-field-label">Precio fijo</span>
                  <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.precio} onChange={e => setNewRule(p => ({ ...p, precio: +e.target.value }))} /></div>
              )}
              {newRule.tipo_calculo === 'margen_costo' && (
                <div className="odoo-field-row"><span className="odoo-field-label">Margen %</span>
                  <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.margen_pct} onChange={e => setNewRule(p => ({ ...p, margen_pct: +e.target.value }))} /></div>
              )}
              {newRule.tipo_calculo === 'descuento_precio' && (
                <div className="odoo-field-row"><span className="odoo-field-label">Descuento %</span>
                  <input type="number" className="input-odoo py-1 text-[13px] w-28" value={newRule.descuento_pct} onChange={e => setNewRule(p => ({ ...p, descuento_pct: +e.target.value }))} /></div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
            <button onClick={handleSaveRule} disabled={saveLinea.isPending} className="btn-odoo-primary">Guardar y cerrar</button>
            <button onClick={() => setShowModal(false)} className="btn-odoo-secondary">Descartar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([tarifaId, { nombre, rules }]) => (
        <div key={tarifaId}>
          <div className="flex items-center gap-4 mb-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground"
              onClick={() => navigate(`/productos/${productoId}/tarifas/${tarifaId}`)}>{nombre}</h4>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Costo: <strong className="text-foreground">${(form.costo ?? 0).toFixed(2)}</strong></span>
              {form.tiene_iva && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">IVA {form.iva_pct ?? 16}%</span>}
              {form.tiene_ieps && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">IEPS {form.ieps_pct ?? 0}%</span>}
              {!form.tiene_iva && !form.tiene_ieps && <span>Sin impuestos</span>}
            </div>
          </div>
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left">Aplica</th>
                  <th className="th-odoo text-left">Lista</th>
                  <th className="th-odoo text-left">Tipo</th>
                  <th className="th-odoo text-right">Valor</th>
                  <th className="th-odoo text-center">Redondeo</th>
                  <th className="th-odoo text-center">Base</th>
                  <th className="th-odoo text-right">Precio s/imp</th>
                  <th className="th-odoo text-right">Precio c/imp</th>
                  <th className="th-odoo text-right">Ganancia $</th>
                  <th className="th-odoo text-right">Ganancia %</th>
                  <th className="th-odoo text-right">Comisión %</th>
                  <th className="th-odoo w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((linea: any) => {
                  const isEditing = editingId === linea.id;
                  const currentVals = isEditing ? editVal : linea;
                  const costo = form.costo ?? 0;
                  const ivaPct = form.tiene_iva ? (form.iva_pct ?? 16) : 0;
                  const iepsPct = form.tiene_ieps ? (form.ieps_pct ?? 0) : 0;
                  const taxMult = 1 + (ivaPct + iepsPct) / 100;
                  const basePrecio = ((isEditing ? (editVal.base_precio ?? linea.base_precio) : linea.base_precio) ?? 'sin_impuestos') as string;
                  const redondeoVal = ((isEditing ? (editVal.redondeo ?? linea.redondeo) : linea.redondeo) ?? 'ninguno') as string;
                  const redondeoLabel = ({ arriba: '⬆ Arriba', abajo: '⬇ Abajo', cercano: '↕ Cercano', ninguno: '— Ninguno' } as Record<string, string>)[redondeoVal] ?? '— Ninguno';
                  const baseLabel = basePrecio === 'con_impuestos' ? 'Con imp.' : 'Sin imp.';

                  const srcLinea = isEditing ? { ...linea, ...editVal } : linea;
                  const pr = form.precio_principal ?? 0;
                  let rawSinImp = 0;
                  if (srcLinea.tipo_calculo === 'margen_costo') rawSinImp = Math.max(costo * (1 + ((srcLinea.margen_pct as number) ?? 0) / 100), (srcLinea.precio_minimo as number) ?? 0);
                  else if (srcLinea.tipo_calculo === 'descuento_precio') rawSinImp = Math.max(pr * (1 - ((srcLinea.descuento_pct as number) ?? 0) / 100), (srcLinea.precio_minimo as number) ?? 0);
                  else rawSinImp = Math.max((srcLinea.precio as number) ?? 0, (srcLinea.precio_minimo as number) ?? 0);

                  let precioSinImp: number, precioConImp: number;
                  if (basePrecio === 'con_impuestos') {
                    precioConImp = applyRedondeo(rawSinImp * taxMult, srcLinea.redondeo as string ?? 'ninguno');
                    precioSinImp = precioConImp / taxMult;
                  } else {
                    precioSinImp = applyRedondeo(rawSinImp, srcLinea.redondeo as string ?? 'ninguno');
                    precioConImp = precioSinImp * taxMult;
                  }

                  const ganancia = precioSinImp - costo;
                  const ganPct = costo > 0 ? (ganancia / costo) * 100 : 0;
                  const listaName = linea.lista_precios?.nombre;
                  const esPrincipal = linea.lista_precios?.es_principal;

                  const cellClick = (col: string) => (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (editingId === linea.id && editingCol === col) return;
                    if (editingId && editingId !== linea.id) saveEdit(editingId);
                    startEdit(linea, col);
                  };

                  const handleBlur = () => { setTimeout(() => saveEdit(linea.id), 150); };

                  return (
                    <tr key={linea.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                      <td className="py-1.5 px-3 cursor-pointer" onClick={() => navigate(`/productos/${productoId}/tarifas/${tarifaId}`)}>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${linea.aplica_a === 'producto' ? 'bg-primary/10 text-primary' : linea.aplica_a === 'categoria' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>{aplica_label(linea)}</span>
                      </td>
                      <td className="py-1.5 px-3 text-xs cursor-pointer" onClick={() => navigate(`/productos/${productoId}/tarifas/${tarifaId}`)}>
                        {listaName ? <span className="flex items-center gap-1">{esPrincipal && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}{listaName}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 px-3 text-xs" onClick={cellClick('tipo')}>
                        {isEditing && editingCol === 'tipo' ? (
                          <select autoFocus className="input-odoo py-0.5 text-[12px] w-full" value={currentVals.tipo_calculo as string}
                            onChange={e => setEditVal(p => ({ ...p, tipo_calculo: e.target.value }))} onBlur={handleBlur}>
                            <option value="precio_fijo">Precio fijo</option><option value="margen_costo">Fórmula (margen)</option><option value="descuento_precio">Descuento</option>
                          </select>
                        ) : <span className="inline-edit-idle text-muted-foreground">{calcLabel(isEditing ? { ...linea, ...editVal } : linea)}</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right" onClick={cellClick('valor')}>
                        {isEditing && editingCol === 'valor' ? (
                          <input autoFocus type="number" className="input-odoo py-0.5 text-[12px] w-20 text-right"
                            value={(currentVals.tipo_calculo === 'precio_fijo' ? currentVals.precio : currentVals.tipo_calculo === 'margen_costo' ? currentVals.margen_pct : currentVals.descuento_pct) as number}
                            onChange={e => { const v = +e.target.value; setEditVal(p => ({ ...p, ...(p.tipo_calculo === 'precio_fijo' ? { precio: v } : p.tipo_calculo === 'margen_costo' ? { margen_pct: v } : { descuento_pct: v }) })); }}
                            onBlur={handleBlur} onKeyDown={e => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') { setEditingId(null); setEditingCol(null); } }} />
                        ) : (
                          <span className="inline-edit-idle font-mono text-muted-foreground">
                            {linea.tipo_calculo === 'precio_fijo' ? `$ ${(linea.precio ?? 0).toFixed(2)}` : linea.tipo_calculo === 'margen_costo' ? `${linea.margen_pct}%` : `${linea.descuento_pct}%`}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center text-xs" onClick={cellClick('redondeo')}>
                        {isEditing && editingCol === 'redondeo' ? (
                          <select autoFocus className="input-odoo py-0.5 text-[12px] w-full" value={(currentVals.redondeo as string) ?? 'ninguno'}
                            onChange={e => setEditVal(p => ({ ...p, redondeo: e.target.value }))} onBlur={handleBlur}>
                            <option value="ninguno">Ninguno</option><option value="arriba">Arriba</option><option value="abajo">Abajo</option><option value="cercano">Cercano</option>
                          </select>
                        ) : <span className="inline-edit-idle text-muted-foreground">{redondeoLabel}</span>}
                      </td>
                      <td className="py-1.5 px-3 text-center" onClick={cellClick('base')}>
                        {isEditing && editingCol === 'base' ? (
                          <select autoFocus className="input-odoo py-0.5 text-[12px] w-full" value={(currentVals.base_precio as string) ?? 'sin_impuestos'}
                            onChange={e => setEditVal(p => ({ ...p, base_precio: e.target.value }))} onBlur={handleBlur}>
                            <option value="sin_impuestos">Sin impuestos</option><option value="con_impuestos">Con impuestos</option>
                          </select>
                        ) : <span className={`inline-edit-idle text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary`}>{baseLabel}</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-foreground">$ {precioSinImp.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-primary">$ {precioConImp.toFixed(2)}</td>
                      <td className={`py-1.5 px-3 text-right font-mono font-semibold ${ganancia >= 0 ? 'text-green-600' : 'text-destructive'}`}>$ {ganancia.toFixed(2)}</td>
                      <td className={`py-1.5 px-3 text-right font-mono font-semibold ${ganPct >= 0 ? 'text-green-600' : 'text-destructive'}`}>{ganPct.toFixed(1)}%</td>
                      <td className="py-1.5 px-3 text-right" onClick={cellClick('comision')}>
                        {isEditing && editingCol === 'comision' ? (
                          <input autoFocus type="number" className="input-odoo py-0.5 text-[12px] w-16 text-right" value={(currentVals.comision_pct as number) || ''}
                            onChange={e => setEditVal(p => ({ ...p, comision_pct: +e.target.value }))} onBlur={handleBlur}
                            onKeyDown={e => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') { setEditingId(null); setEditingCol(null); } }} />
                        ) : <span className="inline-edit-idle font-mono text-xs text-primary">{linea.comision_pct ? `${linea.comision_pct}%` : '—'}</span>}
                      </td>
                      <td className="py-1.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleDeleteRule(linea.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {grouped.size === 0 && <p className="text-sm text-muted-foreground py-2">Sin reglas de precio aplicables a este producto.</p>}
      {!isNew && (
        <button className="odoo-link" onClick={() => { setNewRule(p => ({ ...p, precio_minimo: form.costo ?? 0 })); setShowModal(true); }}>Agregar un precio</button>
      )}
      {renderModal()}
    </div>
  );
}
