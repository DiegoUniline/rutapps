import { useState, useEffect } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Save, X, Trash2, Plus, Star, Layers, Crown, Search, Download, Link2, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { OdooTabs } from '@/components/OdooTabs';
import { OdooField } from '@/components/OdooFormField';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import SearchableSelect from '@/components/SearchableSelect';
import { useTarifa, useSaveTarifa, useSaveTarifaLinea, useDeleteTarifaLinea, useProductosForSelect, useClasificaciones, useListasPrecioByTarifa, useSaveListaPrecio, useDeleteListaPrecio } from '@/hooks/useData';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { Tarifa, TarifaLinea, AplicaATarifa, TipoCalculoTarifa, RedondeoTarifa } from '@/types';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { useAuth } from '@/contexts/AuthContext';

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
  lista_precio_id: '' as string,
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

/* ── Listas de Precios Tab ─────────────────────────── */
function ListasPrecioTab({ tarifaId, isNew }: { tarifaId?: string; isNew: boolean }) {
  const { data: listas } = useListasPrecioByTarifa(isNew ? undefined : tarifaId);
  const saveLista = useSaveListaPrecio();
  const deleteLista = useDeleteListaPrecio();
  const qcTab = useQueryClient();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (isNew) return <div className="text-[12px] text-muted-foreground py-4 bg-accent/30 border border-accent/50 rounded px-3">💡 Guarda la tarifa primero para poder agregar listas de precios.</div>;

  const invalidateListas = () => {
    qcTab.invalidateQueries({ queryKey: ['lista_precios', tarifaId] });
    qcTab.invalidateQueries({ queryKey: ['lista_precios_all'] });
  };

  const handleAdd = async () => {
    if (!newName.trim() || !tarifaId) return;
    try {
      await saveLista.mutateAsync({ tarifa_id: tarifaId, nombre: newName.trim(), es_principal: (listas ?? []).length === 0 });
      setNewName(''); setAdding(false); invalidateListas();
      toast.success('Lista creada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSetPrincipal = async (listaId: string) => {
    if (!tarifaId) return;
    try {
      await saveLista.mutateAsync({ id: listaId, tarifa_id: tarifaId, nombre: (listas ?? []).find(l => l.id === listaId)?.nombre ?? '', es_principal: true });
      invalidateListas(); toast.success('Lista marcada como principal');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRename = async (listaId: string) => {
    if (!editName.trim() || !tarifaId) return;
    try {
      await saveLista.mutateAsync({ id: listaId, tarifa_id: tarifaId, nombre: editName.trim() });
      setEditId(null); invalidateListas();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (listaId: string) => {
    if (!confirm('¿Eliminar esta lista y todos sus precios?')) return;
    try { await deleteLista.mutateAsync(listaId); invalidateListas(); toast.success('Lista eliminada'); } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Nombre</th>
              <th className="th-odoo text-center w-24">Principal</th>
              <th className="th-odoo w-16"></th>
            </tr>
          </thead>
          <tbody>
            {(listas ?? []).map(l => (
              <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                <td className="py-1.5 px-3 cursor-pointer" onClick={() => { setEditId(l.id); setEditName(l.nombre); }}>
                  {editId === l.id ? (
                    <input autoFocus className="inline-edit-input" value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRename(l.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(l.id); if (e.key === 'Escape') setEditId(null); }} />
                  ) : (
                    <span className="font-medium">{l.nombre}</span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-center">
                  {l.es_principal ? (
                    <Crown className="h-4 w-4 text-primary mx-auto" />
                  ) : (
                    <button onClick={() => handleSetPrincipal(l.id)} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
                      Hacer principal
                    </button>
                  )}
                </td>
                <td className="py-1.5 px-3 text-center">
                  {!l.es_principal && (
                    <button onClick={() => handleDelete(l.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(listas ?? []).length === 0 && !adding && (
              <tr><td colSpan={3} className="py-6 text-center text-[12px] text-muted-foreground">Sin listas de precios. Crea una para empezar.</td></tr>
            )}
            {adding && (
              <tr className="bg-primary/5">
                <td className="py-2 px-3" colSpan={2}>
                  <input autoFocus className="inline-edit-input w-full" placeholder="Nombre de la lista (ej. Precio Público)" value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }} />
                </td>
                <td className="py-2 px-3 text-center">
                  <button onClick={handleAdd} disabled={saveLista.isPending} className="btn-odoo-primary text-[11px] py-0.5 px-2"><Plus className="h-3 w-3" /></button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && (
        <button className="odoo-link" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 inline mr-1" />Agregar lista de precios
        </button>
      )}
    </div>
  );
}

/* ── Precios Preview Tab ─────────────────────────── */
function PreciosPreviewTab({ tarifaId, tarifaNombre, listasPrecio = [] }: { tarifaId?: string; tarifaNombre: string; listasPrecio?: Array<{ id: string; nombre: string; share_token?: string; share_activo?: boolean }> }) {
  const [search, setSearch] = useState('');
  const { fmt: fmtCur } = useCurrency();
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  const { data: productos } = useQuery({
    queryKey: ['precios_preview_tarifa', tarifaId, empresaId],
    enabled: !!tarifaId && !!empresaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: lineas } = await supabase.from('tarifa_lineas')
        .select('*')
        .eq('tarifa_id', tarifaId!);

      const { data: prods } = await supabase.from('productos')
        .select('id, codigo, nombre, costo, precio_principal, clasificacion_id, status, tiene_iva, tiene_ieps, iva_pct, ieps_pct, ieps_tipo')
        .eq('empresa_id', empresaId!)
        .eq('status', 'activo')
        .order('nombre');

      if (!prods || !lineas) return [];

      // Convert DB lineas to TarifaLineaRule format for the resolver
      const rules: TarifaLineaRule[] = lineas
        .filter((l: any) => !l.lista_precio_id)
        .map((l: any) => ({
          aplica_a: l.aplica_a,
          producto_ids: l.producto_ids ?? [],
          clasificacion_ids: l.clasificacion_ids ?? [],
          tipo_calculo: l.tipo_calculo,
          precio: l.precio ?? 0,
          precio_minimo: l.precio_minimo,
          margen_pct: l.margen_pct,
          descuento_pct: l.descuento_pct,
          redondeo: l.redondeo ?? 'ninguno',
          base_precio: l.base_precio ?? 'sin_impuestos',
          lista_precio_id: null,
        }));

      const r2 = (v: number) => Math.round(v * 100) / 100;

      return prods.map(p => {
        const producto: ProductForPricing = {
          id: p.id,
          precio_principal: p.precio_principal,
          costo: p.costo,
          clasificacion_id: p.clasificacion_id,
          tiene_iva: p.tiene_iva,
          iva_pct: p.iva_pct,
          tiene_ieps: p.tiene_ieps,
          ieps_pct: p.ieps_pct,
          ieps_tipo: p.ieps_tipo,
        };

        const pricing = resolveProductPricing(rules, producto);
        if (!pricing.appliedRule) return null;

        const rule = pricing.appliedRule;
        const basePrecio = rule.base_precio ?? 'sin_impuestos';
        const iepsPct = p.tiene_ieps ? (p.ieps_pct ?? 0) : 0;
        const ivaPct = p.tiene_iva ? (p.iva_pct ?? 0) : 0;

        // Derive display values from the resolver
        const precioNeto = pricing.unitPrice;
        const montoIeps = r2(precioNeto * iepsPct / 100);
        const montoIva = r2((precioNeto + montoIeps) * ivaPct / 100);
        const precioConImpSinRedondeo = r2(precioNeto + montoIeps + montoIva);
        const precioFinal = pricing.displayPrice;
        const ganancia = r2(precioNeto - p.costo);

        // Raw rule price for display
        const precioRegla = pricing.rawDisplayPrice != null
          ? r2(basePrecio === 'con_impuestos' ? pricing.rawUnitPrice * ((1 + iepsPct / 100) * (1 + ivaPct / 100)) : pricing.rawUnitPrice)
          : precioNeto;

        // Costo con impuestos
        const costoIeps = r2(p.costo * iepsPct / 100);
        const costoIva = r2((p.costo + costoIeps) * ivaPct / 100);
        const costoConImp = r2(p.costo + costoIeps + costoIva);

        // Regla label
        let reglaLabel = 'Fijo';
        if (rule.tipo_calculo === 'margen_costo') reglaLabel = `+${rule.margen_pct}%`;
        else if (rule.tipo_calculo === 'descuento_precio') reglaLabel = `-${rule.descuento_pct}%`;

        return {
          ...p,
          precio_regla: r2(pricing.rawUnitPrice * (basePrecio === 'con_impuestos' ? (1 + iepsPct / 100) * (1 + ivaPct / 100) : 1)),
          precio_neto: precioNeto,
          monto_ieps: montoIeps,
          monto_iva: montoIva,
          precio_con_imp_sin_redondeo: precioConImpSinRedondeo,
          precio_final: precioFinal,
          ganancia,
          costo_con_imp: costoConImp,
          regla: reglaLabel,
          redondeo_tipo: rule.redondeo ?? 'ninguno',
          comision_pct: (rule as any).comision_pct ?? 0,
          base_precio: basePrecio,
        };
      }).filter(Boolean);
    },
  });

  if (!tarifaId) return <p className="text-[12px] text-muted-foreground py-4">Guarda la tarifa primero.</p>;

  const filtered = (productos ?? []).filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  

  const exportColumns = [
    { key: 'codigo', header: 'Código', width: 10, format: 'text' as const },
    { key: 'nombre', header: 'Producto', width: 24, format: 'text' as const },
    { key: 'costo', header: 'Costo', width: 10, format: 'currency' as const, align: 'right' as const },
    { key: 'regla', header: 'Regla', width: 8, format: 'text' as const },
    { key: 'precio_regla', header: 'Precio Regla', width: 11, format: 'currency' as const, align: 'right' as const },
    { key: 'precio_neto', header: 'Precio Neto', width: 11, format: 'currency' as const, align: 'right' as const },
    { key: 'monto_ieps', header: 'IEPS', width: 9, format: 'currency' as const, align: 'right' as const },
    { key: 'monto_iva', header: 'IVA', width: 9, format: 'currency' as const, align: 'right' as const },
    { key: 'precio_final', header: 'Precio Final', width: 12, format: 'currency' as const, align: 'right' as const },
    { key: 'ganancia', header: 'Ganancia', width: 10, format: 'currency' as const, align: 'right' as const },
    { key: 'margen', header: 'Margen %', width: 9, format: 'percent' as const, align: 'right' as const },
  ];

  const exportData = filtered.map(p => ({
    ...p,
    margen: p.costo > 0 ? (p.ganancia / p.costo) * 100 : 0,
  }));

  const handleExportExcel = () => {
    exportToExcel({
      fileName: `Precios_${tarifaNombre}`,
      title: `Lista de Precios — ${tarifaNombre}`,
      subtitle: '',
      columns: exportColumns,
      data: exportData,
    });
  };

  const handleExportPDF = () => {
    exportToPDF({
      fileName: `Precios_${tarifaNombre}`,
      title: `Lista de Precios — ${tarifaNombre}`,
      subtitle: '',
      columns: exportColumns,
      data: exportData,
    });
  };

  const conImp = filtered.filter(p => p.base_precio === 'con_impuestos');
  const sinImp = filtered.filter(p => p.base_precio !== 'con_impuestos');

  const fmt = (v: number) => fmtCur(v);

  const renderGroup = (items: typeof filtered, isConImp: boolean) => {
    if (items.length === 0) return null;
    const rows = items.slice(0, 200);
    return (
      <div className="border border-border rounded overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-semibold flex items-center gap-2 bg-primary/5 text-foreground">
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-semibold">
            {isConImp ? 'C/Impuestos' : 'S/Impuestos'}
          </span>
          <span>{items.length} productos</span>
          <span className="ml-2 font-normal text-[10px]">
            {isConImp
              ? 'Costo → +Impuestos → Costo c/imp → Regla → Precio Venta → Redondeo → Precio Final'
              : 'Costo → Regla → Precio Neto → +Impuestos → Redondeo → Precio Final'}
          </span>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            {isConImp ? (
              <tr className="border-b border-border bg-card">
                <th className="th-odoo text-left">Código</th>
                <th className="th-odoo text-left">Producto</th>
                <th className="th-odoo text-right">Costo</th>
                <th className="th-odoo text-right border-l border-border">IEPS</th>
                <th className="th-odoo text-right">IVA</th>
                <th className="th-odoo text-right border-l border-border">Costo c/imp</th>
                <th className="th-odoo text-center border-l border-border">Regla</th>
                <th className="th-odoo text-right">Precio Venta</th>
                <th className="th-odoo text-center border-l border-border">Redondeo</th>
                <th className="th-odoo text-right font-bold bg-primary/5 border-l border-border">Precio Final</th>
                <th className="th-odoo text-right border-l border-border">Ganancia</th>
                <th className="th-odoo text-right">Margen</th>
              </tr>
            ) : (
              <tr className="border-b border-border bg-card">
                <th className="th-odoo text-left">Código</th>
                <th className="th-odoo text-left">Producto</th>
                <th className="th-odoo text-right">Costo</th>
                <th className="th-odoo text-center border-l border-border">Regla</th>
                <th className="th-odoo text-right">Precio Neto</th>
                <th className="th-odoo text-right border-l border-border">IEPS</th>
                <th className="th-odoo text-right">IVA</th>
                <th className="th-odoo text-right border-l border-border">Subtotal</th>
                <th className="th-odoo text-center border-l border-border">Redondeo</th>
                <th className="th-odoo text-right font-bold bg-primary/5 border-l border-border">Precio Final</th>
                <th className="th-odoo text-right border-l border-border">Ganancia</th>
                <th className="th-odoo text-right">Margen</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map(p => {
              const margen = p.costo > 0 ? (p.ganancia / p.costo) * 100 : 0;
              const costoIeps = Math.round(p.costo * (p.tiene_ieps ? (p.ieps_pct ?? 0) : 0) / 100 * 100) / 100;
              const costoIva = Math.round((p.costo + costoIeps) * (p.tiene_iva ? (p.iva_pct ?? 0) : 0) / 100 * 100) / 100;

              return isConImp ? (
                <tr key={p.id} className="border-b border-border/40 hover:bg-card/50">
                  <td className="py-1.5 px-3 font-mono text-muted-foreground">{p.codigo}</td>
                  <td className="py-1.5 px-3 text-foreground">{p.nombre}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{fmt(p.costo)}</td>
                  <td className="py-1.5 px-3 text-right font-mono border-l border-border/40 text-muted-foreground">{costoIeps > 0 ? fmt(costoIeps) : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{costoIva > 0 ? fmt(costoIva) : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono border-l border-border/40 text-foreground">{fmt(p.costo_con_imp)}</td>
                  <td className="py-1.5 px-3 text-center border-l border-border/40">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{p.regla}</span>
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-foreground font-semibold">{fmt(p.precio_regla)}</td>
                  <td className="py-1.5 px-3 text-center border-l border-border/40 text-[10px] text-muted-foreground">{p.redondeo_tipo === 'ninguno' ? '—' : p.redondeo_tipo}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-primary border-l border-border/40 bg-primary/5">{fmt(p.precio_final)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold border-l border-border/40 ${p.ganancia >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(p.ganancia)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold ${margen >= 0 ? 'text-green-600' : 'text-destructive'}`}>{margen.toFixed(1)}%</td>
                </tr>
              ) : (
                <tr key={p.id} className="border-b border-border/40 hover:bg-card/50">
                  <td className="py-1.5 px-3 font-mono text-muted-foreground">{p.codigo}</td>
                  <td className="py-1.5 px-3 text-foreground">{p.nombre}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{fmt(p.costo)}</td>
                  <td className="py-1.5 px-3 text-center border-l border-border/40">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{p.regla}</span>
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-foreground font-semibold">{fmt(p.precio_neto)}</td>
                  <td className="py-1.5 px-3 text-right font-mono border-l border-border/40 text-muted-foreground">{p.monto_ieps > 0 ? fmt(p.monto_ieps) : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">{p.monto_iva > 0 ? fmt(p.monto_iva) : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono border-l border-border/40 text-muted-foreground">{fmt(p.precio_con_imp_sin_redondeo)}</td>
                  <td className="py-1.5 px-3 text-center border-l border-border/40 text-[10px] text-muted-foreground">{p.redondeo_tipo === 'ninguno' ? '—' : p.redondeo_tipo}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-primary border-l border-border/40 bg-primary/5">{fmt(p.precio_final)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold border-l border-border/40 ${p.ganancia >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(p.ganancia)}</td>
                  <td className={`py-1.5 px-3 text-right font-mono font-semibold ${margen >= 0 ? 'text-green-600' : 'text-destructive'}`}>{margen.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length > 200 && <p className="text-[11px] text-muted-foreground px-3 py-2">Mostrando 200 de {items.length}.</p>}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full bg-background rounded-md pl-8 pr-3 py-1.5 text-[12px] border border-input text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[11px] text-muted-foreground">{filtered.length} productos</span>
        <div className="ml-auto flex items-center gap-2">
          {(() => {
            const compartibles = listasPrecio.filter(l => l.share_activo && l.share_token);
            if (compartibles.length === 0) return null;
            const openCatalog = (token: string) => window.open(`${window.location.origin}/catalogo/${token}`, '_blank');
            const copyLink = (token: string) => {
              navigator.clipboard.writeText(`${window.location.origin}/catalogo/${token}`);
              toast.success('Link copiado');
            };
            if (compartibles.length === 1) {
              const l = compartibles[0];
              return (
                <>
                  <button
                    type="button"
                    onClick={() => copyLink(l.share_token!)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-input bg-background hover:bg-accent text-[12px] text-foreground"
                    title="Copiar link público"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() => openCatalog(l.share_token!)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-input bg-background hover:bg-accent text-[12px] text-foreground"
                    title="Abrir catálogo público"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver catálogo
                  </button>
                </>
              );
            }
            return (
              <select
                onChange={(e) => { if (e.target.value) { openCatalog(e.target.value); e.currentTarget.value = ''; } }}
                className="px-2.5 py-1.5 rounded-md border border-input bg-background text-[12px] text-foreground"
                defaultValue=""
              >
                <option value="" disabled>Ver catálogo público…</option>
                {compartibles.map(l => (<option key={l.id} value={l.share_token}>{l.nombre}</option>))}
              </select>
            );
          })()}
          <ExportButton onExcel={handleExportExcel} onPDF={handleExportPDF} />
        </div>
      </div>
      <div className="space-y-4">
        {renderGroup(conImp, true)}
        {renderGroup(sinImp, false)}
        {filtered.length === 0 && (
          <div className="text-center py-6 text-muted-foreground border border-border rounded">Sin productos</div>
        )}
      </div>
    </div>
  );
}

export default function TarifaFormPage() {
  const { fmt } = useCurrency();
  const { id, productoId } = useParams();
  const [searchParams] = useSearchParams();
  const listaDisplayName = searchParams.get('lista');
  const navigate = useNavigate();
  const backUrl = productoId ? `/productos/${productoId}` : '/listas-precio';
  const backLabel = productoId ? 'Producto' : 'Listas de Precios';
  const isNew = id === 'nueva';
  const { data: existing, refetch } = useTarifa(isNew ? undefined : id);
  const saveMutation = useSaveTarifa();
  const saveLinea = useSaveTarifaLinea();
  const deleteLinea = useDeleteTarifaLinea();
  const { data: productosDisp } = useProductosForSelect();
  const { data: clasificaciones } = useClasificaciones();
  const { data: listasPrecios } = useListasPrecioByTarifa(isNew ? undefined : id);
  const saveListaPrecio = useSaveListaPrecio();
  const qc = useQueryClient();

  // Map for lista display
  const listaMap = new Map((listasPrecios ?? []).map(l => [l.id, l.nombre]));
  const listaOptions = (listasPrecios ?? []).map(l => ({ value: l.id, label: `${l.nombre}${l.es_principal ? ' ★' : ''}` }));

  // Quick-create lista de precios
  const handleCreateLista = async (name: string): Promise<string | undefined> => {
    if (!id) return undefined;
    try {
      const sb = (await import('@/lib/supabase')).supabase;
      const { data: { user: authUser } } = await sb.auth.getUser();
      const { data: profile } = await sb.from('profiles').select('empresa_id').eq('user_id', authUser?.id ?? '').maybeSingle();
      if (!profile?.empresa_id) { toast.error('Sin empresa'); return undefined; }
      const result = await saveListaPrecio.mutateAsync({ tarifa_id: id, nombre: name, es_principal: (listasPrecios ?? []).length === 0 });
      qc.invalidateQueries({ queryKey: ['lista_precios', id] });
      qc.invalidateQueries({ queryKey: ['lista_precios_all'] });
      toast.success(`Lista "${name}" creada`);
      return result.id;
    } catch (err: any) { toast.error(err.message); return undefined; }
  };

  const [form, setForm] = useState<Partial<Tarifa>>({
    nombre: '', descripcion: '', tipo: 'general', moneda: 'MXN', activa: true,
  });
  const [originalForm, setOriginalForm] = useState<Partial<Tarifa>>({});
  const [showAddRow, setShowAddRow] = useState(false);
  const [newLinea, setNewLinea] = useState({ ...EMPTY_LINEA });
  const [editingName, setEditingName] = useState(false);
  const [editingLineaId, setEditingLineaId] = useState<string | null>(null);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editLinea, setEditLinea] = useState({ ...EMPTY_LINEA });

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
      toast.success('Lista guardada');
      setOriginalForm({ ...form });
      if (isNew) {
        const newPath = productoId ? `/productos/${productoId}/tarifas/${result.id}` : `/tarifas/${result.id}`;
        navigate(newPath, { replace: true });
      }
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
    // Duplicate validation
    if (!validateNoDuplicates(newLinea.aplica_a, newLinea.producto_ids, newLinea.clasificacion_ids)) return;
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
        lista_precio_id: newLinea.lista_precio_id || null,
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

  const startEditLinea = (l: TarifaLinea, col: string) => {
    // If switching to a different line, save the previous one first
    if (editingLineaId && editingLineaId !== l.id) {
      handleSaveEditLinea();
    }
    if (editingLineaId === l.id && editingCol === col) return;
    if (editingLineaId !== l.id) {
      setEditLinea({
        producto_ids: l.producto_ids ?? [],
        clasificacion_ids: l.clasificacion_ids ?? [],
        aplica_a: l.aplica_a,
        tipo_calculo: l.tipo_calculo,
        precio: l.precio,
        precio_minimo: l.precio_minimo,
        descuento_max: (l as any).descuento_max ?? 0,
        margen_pct: l.margen_pct,
        descuento_pct: l.descuento_pct,
        comision_pct: (l as any).comision_pct ?? 0,
        base_precio: (l as any).base_precio ?? 'sin_impuestos',
        redondeo: (l as any).redondeo ?? 'ninguno',
        notas: (l as any).notas ?? '',
        lista_precio_id: (l as any).lista_precio_id ?? '',
      });
    }
    setEditingLineaId(l.id);
    setEditingCol(col);
  };

  const handleSaveEditLinea = async () => {
    if (!editingLineaId) return;
    // Duplicate validation (exclude current line)
    if (!validateNoDuplicates(editLinea.aplica_a, editLinea.producto_ids, editLinea.clasificacion_ids, editingLineaId)) return;
    try {
      await saveLinea.mutateAsync({
        id: editingLineaId,
        tarifa_id: id,
        aplica_a: editLinea.aplica_a,
        tipo_calculo: editLinea.tipo_calculo,
        precio: editLinea.precio,
        precio_minimo: editLinea.precio_minimo,
        descuento_max: editLinea.descuento_max,
        margen_pct: editLinea.margen_pct,
        descuento_pct: editLinea.descuento_pct,
        comision_pct: editLinea.comision_pct,
        base_precio: editLinea.base_precio,
        redondeo: editLinea.redondeo,
        notas: editLinea.notas || null,
        lista_precio_id: editLinea.lista_precio_id || null,
        producto_ids: editLinea.aplica_a === 'producto' ? editLinea.producto_ids : [],
        clasificacion_ids: editLinea.aplica_a === 'categoria' ? editLinea.clasificacion_ids : [],
      } as any);
      setEditingLineaId(null);
      setEditingCol(null);
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const lineas = (existing?.tarifa_lineas ?? []) as TarifaLinea[];
  const sortedLineas = [...lineas].sort((a, b) => {
    const order: Record<string, number> = { producto: 0, categoria: 1, todos: 2 };
    return (order[a.aplica_a] ?? 2) - (order[b.aplica_a] ?? 2);
  });

  // ── Used IDs tracking (for duplicate prevention) ──
  const usedCatIds = new Set<string>();
  const usedProdIds = new Set<string>();
  lineas.forEach(l => {
    if (l.aplica_a === 'categoria') l.clasificacion_ids.forEach(id => usedCatIds.add(id));
    if (l.aplica_a === 'producto') l.producto_ids.forEach(id => usedProdIds.add(id));
  });

  // Available items (excluding already used, but include current editing line's items)
  const getAvailableClas = (currentIds: string[]) =>
    clasItems.filter(c => !usedCatIds.has(c.id) || currentIds.includes(c.id));
  const getAvailableProds = (currentIds: string[]) =>
    prodItems.filter(p => !usedProdIds.has(p.id) || currentIds.includes(p.id));

  // Validation helper
  const validateNoDuplicates = (aplica_a: string, prodIds: string[], clasIds: string[], excludeLineaId?: string) => {
    const otherLineas = lineas.filter(l => l.id !== excludeLineaId);
    if (aplica_a === 'categoria') {
      const otherCatIds = new Set<string>();
      otherLineas.forEach(l => { if (l.aplica_a === 'categoria') l.clasificacion_ids.forEach(id => otherCatIds.add(id)); });
      const dupes = clasIds.filter(id => otherCatIds.has(id));
      if (dupes.length > 0) {
        const names = dupes.map(id => clasMap.get(id) ?? id).join(', ');
        toast.error(`Categoría(s) ya en otra regla: ${names}`);
        return false;
      }
    }
    if (aplica_a === 'producto') {
      const otherProdIds = new Set<string>();
      otherLineas.forEach(l => { if (l.aplica_a === 'producto') l.producto_ids.forEach(id => otherProdIds.add(id)); });
      const dupes = prodIds.filter(id => otherProdIds.has(id));
      if (dupes.length > 0) {
        const names = dupes.map(id => prodMap.get(id) ?? id).join(', ');
        toast.error(`Producto(s) ya en otra regla: ${names}`);
        return false;
      }
    }
    return true;
  };

  // ── Load all categories button ──
  const [loadingAllCats, setLoadingAllCats] = useState(false);
  const handleLoadAllCategories = async () => {
    if (!id || isNew || !clasificaciones) return;
    const unusedCats = clasificaciones.filter(c => !usedCatIds.has(c.id));
    if (unusedCats.length === 0) { toast.info('Todas las categorías ya tienen regla'); return; }
    setLoadingAllCats(true);
    try {
      for (const cat of unusedCats) {
        await saveLinea.mutateAsync({
          tarifa_id: id,
          aplica_a: 'categoria',
          tipo_calculo: 'margen_costo',
          precio: 0, precio_minimo: 0, descuento_max: 0, margen_pct: 0, descuento_pct: 0,
          producto_ids: [],
          clasificacion_ids: [cat.id],
        } as any);
      }
      refetch();
      toast.success(`${unusedCats.length} categorías agregadas`);
    } catch (err: any) { toast.error(err.message); }
    setLoadingAllCats(false);
  };

  // ── Load all products button ──
  const [loadingAllProds, setLoadingAllProds] = useState(false);
  const handleLoadAllProducts = async () => {
    if (!id || isNew || !productosDisp) return;
    const unusedProds = productosDisp.filter(p => !usedProdIds.has(p.id));
    if (unusedProds.length === 0) { toast.info('Todos los productos ya tienen regla'); return; }
    if (!window.confirm(`Se agregarán ${unusedProds.length} reglas (una por producto). ¿Continuar?`)) return;
    setLoadingAllProds(true);
    try {
      for (const prod of unusedProds) {
        await saveLinea.mutateAsync({
          tarifa_id: id,
          aplica_a: 'producto',
          tipo_calculo: 'margen_costo',
          precio: 0, precio_minimo: 0, descuento_max: 0, margen_pct: 0, descuento_pct: 0,
          producto_ids: [prod.id],
          clasificacion_ids: [],
        } as any);
      }
      refetch();
      toast.success(`${unusedProds.length} productos agregados`);
    } catch (err: any) { toast.error(err.message); }
    setLoadingAllProds(false);
  };

  const getCalculoDisplay = (l: TarifaLinea) => {
    if (l.tipo_calculo === 'margen_costo') return `+${l.margen_pct}% s/costo`;
    if (l.tipo_calculo === 'descuento_precio') return `-${l.descuento_pct}% s/precio`;
    return fmt(l.precio ?? 0);
  };

  const getAplicaBadge = (aplica: AplicaATarifa) => {
    const styles: Record<string, string> = {
      producto: 'bg-primary/10 text-primary',
      categoria: 'bg-accent text-accent-foreground',
      todos: 'bg-primary/10 text-primary',
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
        <Link to={backUrl} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">{backLabel}</Link>
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
            placeholder="Nombre de la lista de precios"
            autoFocus
            className="text-[22px] font-bold text-foreground leading-tight bg-transparent border-b border-primary/40 focus:border-primary outline-none flex-1 min-w-[180px] max-w-md placeholder:text-muted-foreground/50"
          />
        ) : (
          <h1
            className="text-[22px] font-bold text-foreground leading-tight cursor-pointer hover:text-primary transition-colors truncate"
            onClick={() => setEditingName(true)}
          >
            {listaDisplayName || form.nombre || 'Lista de Precios'}
          </h1>
        )}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button onClick={handleSave} disabled={saveMutation.isPending || !isDirty} className={isDirty ? "btn-odoo-primary" : "btn-odoo-secondary opacity-60 cursor-not-allowed"}>
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
          <button onClick={() => navigate(backUrl)} className="btn-odoo-secondary">
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
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Vigencia inicio</label>
              <OdooDatePicker value={form.vigencia_inicio} onChange={v => set('vigencia_inicio', v)} placeholder="Seleccionar fecha" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Vigencia fin</label>
              <OdooDatePicker value={form.vigencia_fin} onChange={v => set('vigencia_fin', v)} placeholder="Seleccionar fecha" />
            </div>
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
                          <th className="th-odoo text-left">Base</th>
                          <th className="th-odoo text-right">Valor</th>
                          <th className="th-odoo text-right">Comisión %</th>
                          <th className="th-odoo text-right">Precio mín</th>
                          <th className="th-odoo text-left">Redondeo</th>
                          <th className="th-odoo w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLineas.map(l => {
                          const isEditing = editingLineaId === l.id;
                          const ec = (col: string) => isEditing && editingCol === col;
                          const cellClick = (col: string) => (e: React.MouseEvent) => { e.stopPropagation(); startEditLinea(l, col); };
                          const blurSave = () => { handleSaveEditLinea(); };
                          return (
                          <tr key={l.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                            {/* Aplica a */}
                            <td className="py-1.5 px-3 cursor-pointer" onClick={cellClick('aplica_a')}>
                              {ec('aplica_a') ? (
                                <select autoFocus className="input-odoo text-xs w-full" value={editLinea.aplica_a}
                                  onBlur={blurSave}
                                  onChange={e => { setEditLinea(p => ({ ...p, aplica_a: e.target.value as AplicaATarifa, producto_ids: [], clasificacion_ids: [] })); }}>
                                  <option value="todos">Todos</option>
                                  <option value="categoria">Categoría</option>
                                  <option value="producto">Producto</option>
                                </select>
                              ) : getAplicaBadge(l.aplica_a)}
                            </td>
                            {/* Productos / Categorías */}
                            <td className="py-1.5 px-3 cursor-pointer" onClick={cellClick('items')}>
                              {ec('items') ? (
                                <div onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) blurSave(); }}>
                                  {editLinea.aplica_a === 'producto' && (
                                    <ChipSelect items={getAvailableProds(editLinea.producto_ids)} selectedIds={editLinea.producto_ids}
                                      onChange={ids => setEditLinea(p => ({ ...p, producto_ids: ids }))} placeholder="+ Producto..." />
                                  )}
                                  {editLinea.aplica_a === 'categoria' && (
                                    <ChipSelect items={getAvailableClas(editLinea.clasificacion_ids)} selectedIds={editLinea.clasificacion_ids}
                                      onChange={ids => setEditLinea(p => ({ ...p, clasificacion_ids: ids }))} placeholder="+ Categoría..." />
                                  )}
                                  {editLinea.aplica_a === 'todos' && <span className="text-xs text-muted-foreground">—</span>}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {l.aplica_a === 'producto' && l.producto_ids.map(pid => (
                                    <span key={pid} className="odoo-badge text-[11px]">{prodMap.get(pid) ?? pid}</span>
                                  ))}
                                  {l.aplica_a === 'categoria' && l.clasificacion_ids.map(cid => (
                                    <span key={cid} className="odoo-badge text-[11px]">{clasMap.get(cid) ?? cid}</span>
                                  ))}
                                  {l.aplica_a === 'todos' && <span className="text-xs text-muted-foreground">Todos</span>}
                                </div>
                              )}
                            </td>
                            {/* Cálculo */}
                            <td className="py-1.5 px-3 cursor-pointer" onClick={cellClick('tipo_calculo')}>
                              {ec('tipo_calculo') ? (
                                <select autoFocus className="input-odoo text-xs w-full" value={editLinea.tipo_calculo}
                                  onBlur={blurSave}
                                  onChange={e => setEditLinea(p => ({ ...p, tipo_calculo: e.target.value as TipoCalculoTarifa }))}>
                                  <option value="margen_costo">Margen % s/costo</option>
                                  <option value="descuento_precio">Descuento % s/precio</option>
                                  <option value="precio_fijo">Precio fijo</option>
                                </select>
                              ) : <span className="text-xs text-muted-foreground">{CALCULO_LABELS[l.tipo_calculo]}</span>}
                            </td>
                            {/* Base */}
                            <td className="py-1.5 px-3 cursor-pointer" onClick={cellClick('base_precio')}>
                              {ec('base_precio') ? (
                                <select autoFocus className="input-odoo text-xs w-full" value={editLinea.base_precio}
                                  onBlur={blurSave}
                                  onChange={e => setEditLinea(p => ({ ...p, base_precio: e.target.value as any }))}>
                                  <option value="sin_impuestos">Sin impuestos</option>
                                  <option value="con_impuestos">Con impuestos</option>
                                </select>
                              ) : <span className="text-xs text-muted-foreground">{(l as any).base_precio === 'con_impuestos' ? 'Con imp.' : 'Sin imp.'}</span>}
                            </td>
                            {/* Valor */}
                            <td className="py-1.5 px-3 text-right cursor-pointer" onClick={cellClick('valor')}>
                              {ec('valor') ? (
                                editLinea.tipo_calculo === 'margen_costo'
                                  ? <input autoFocus type="number" className="input-odoo text-right text-xs w-full" value={editLinea.margen_pct || ''} onBlur={blurSave} onChange={e => setEditLinea(p => ({ ...p, margen_pct: +e.target.value }))} />
                                  : editLinea.tipo_calculo === 'descuento_precio'
                                  ? <input autoFocus type="number" className="input-odoo text-right text-xs w-full" value={editLinea.descuento_pct || ''} onBlur={blurSave} onChange={e => setEditLinea(p => ({ ...p, descuento_pct: +e.target.value }))} />
                                  : <input autoFocus type="number" className="input-odoo text-right text-xs w-full" value={editLinea.precio || ''} onBlur={blurSave} onChange={e => setEditLinea(p => ({ ...p, precio: +e.target.value }))} />
                              ) : <span className="font-mono text-odoo-teal font-semibold">{getCalculoDisplay(l)}</span>}
                            </td>
                            {/* Comisión */}
                            <td className="py-1.5 px-3 text-right cursor-pointer" onClick={cellClick('comision')}>
                              {ec('comision') ? (
                                <input autoFocus type="number" className="input-odoo text-right text-xs w-full" value={editLinea.comision_pct || ''} onBlur={blurSave} onChange={e => setEditLinea(p => ({ ...p, comision_pct: +e.target.value }))} />
                              ) : <span className="font-mono text-xs">{(l as any).comision_pct ? `${(l as any).comision_pct}%` : '—'}</span>}
                            </td>
                            {/* Precio mín */}
                            <td className="py-1.5 px-3 text-right cursor-pointer" onClick={cellClick('precio_min')}>
                              {ec('precio_min') ? (
                                <input autoFocus type="number" className="input-odoo text-right text-xs w-full" value={editLinea.precio_minimo || ''} onBlur={blurSave} onChange={e => setEditLinea(p => ({ ...p, precio_minimo: +e.target.value }))} />
                              ) : <span className="font-mono text-xs">{fmt(l.precio_minimo)}</span>}
                            </td>
                            {/* Redondeo */}
                            <td className="py-1.5 px-3 cursor-pointer" onClick={cellClick('redondeo')}>
                              {ec('redondeo') ? (
                                <select autoFocus className="input-odoo text-xs w-full" value={editLinea.redondeo}
                                  onBlur={blurSave}
                                  onChange={e => setEditLinea(p => ({ ...p, redondeo: e.target.value as RedondeoTarifa }))}>
                                  <option value="ninguno">Sin redondeo</option>
                                  <option value="arriba">↑ Arriba</option>
                                  <option value="abajo">↓ Abajo</option>
                                  <option value="cercano">≈ Cercano</option>
                                </select>
                              ) : <span className="text-xs text-muted-foreground">{REDONDEO_LABELS[(l as any).redondeo] || '—'}</span>}
                            </td>
                            {/* Delete */}
                            <td className="py-1.5 px-3 text-center">
                              <button onClick={() => handleDeleteLinea(l.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                        {sortedLineas.length === 0 && !showAddRow && (
                          <tr><td colSpan={10} className="py-6 text-center text-[12px] text-muted-foreground">
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
                                  <ChipSelect items={getAvailableProds(newLinea.producto_ids)} selectedIds={newLinea.producto_ids}
                                    onChange={ids => setNewLinea(p => ({ ...p, producto_ids: ids }))} placeholder="+ Producto..." />
                                )}
                                {newLinea.aplica_a === 'categoria' && (
                                  <ChipSelect items={getAvailableClas(newLinea.clasificacion_ids)} selectedIds={newLinea.clasificacion_ids}
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
                                <select className="input-odoo text-xs w-full" value={newLinea.base_precio}
                                  onChange={e => setNewLinea(p => ({ ...p, base_precio: e.target.value as any }))}>
                                  <option value="sin_impuestos">Sin impuestos</option>
                                  <option value="con_impuestos">Con impuestos</option>
                                </select>
                              </td>
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
                              <td colSpan={10} className="py-2 px-3">
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
                    <div className="flex items-center gap-3">
                      <button className="odoo-link" onClick={() => setShowAddRow(true)}>
                        <Plus className="h-3.5 w-3.5 inline mr-1" />Agregar un precio
                      </button>
                      <button
                        className="odoo-link"
                        onClick={handleLoadAllCategories}
                        disabled={loadingAllCats}
                      >
                        <Layers className="h-3.5 w-3.5 inline mr-1" />
                        {loadingAllCats ? 'Cargando...' : 'Cargar todas las categorías'}
                      </button>
                      <button
                        className="odoo-link"
                        onClick={handleLoadAllProducts}
                        disabled={loadingAllProds}
                      >
                        <Plus className="h-3.5 w-3.5 inline mr-1" />
                        {loadingAllProds ? 'Cargando...' : 'Cargar todos los productos'}
                      </button>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'precios',
              label: 'Vista Precios',
              content: <PreciosPreviewTab tarifaId={id} tarifaNombre={form.nombre || 'Tarifa'} listasPrecio={listasPrecios ?? []} />,
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
