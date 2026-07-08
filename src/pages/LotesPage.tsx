import { useState, Fragment } from 'react';
import { Boxes, Plus, Pencil, AlertTriangle, ChevronRight, ChevronDown, Warehouse, Truck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { TableSkeleton } from '@/components/TableSkeleton';
import { cn } from '@/lib/utils';

interface AlmacenStock { almacen_id: string; nombre: string; tipo: string; cantidad: number; }

interface LoteRow {
  id: string;
  producto_id: string;
  codigo: string;
  fecha_caducidad: string | null;
  fecha_fabricacion: string | null;
  costo: number | null;
  notas: string | null;
  activo: boolean;
  productos?: { nombre: string; codigo: string | null } | null;
}

interface EditState {
  id?: string;
  producto_id: string;
  codigo: string;
  fecha_caducidad: string;
  fecha_fabricacion: string;
  costo: string;
  notas: string;
}

const emptyEdit: EditState = { producto_id: '', codigo: '', fecha_caducidad: '', fecha_fabricacion: '', costo: '', notas: '' };

export default function LotesPage() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [vista, setVista] = useState<'lote' | 'almacen'>('lote');
  const [search, setSearch] = useState('');
  const [almacenFilters, setAlmacenFilters] = useState<Set<string>>(new Set()); // vacío = todos
  const toggleAlmacen = (id: string) => setAlmacenFilters(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const [stockFilter, setStockFilter] = useState<'todos' | 'con' | 'sin'>('todos');
  const [vencMode, setVencMode] = useState<'todos' | 'porvencer' | 'vencido'>('todos');
  const [vencDias, setVencDias] = useState('30'); // umbral editable de "por vencer"
  const toggleExpand = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Productos que manejan lote (para el selector).
  const { data: productos } = useQuery({
    queryKey: ['lotes-productos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('productos')
        .select('id, nombre, codigo')
        .eq('empresa_id', empresa!.id)
        .eq('maneja_lote', true)
        .eq('status', 'activo')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string; codigo: string | null }[];
    },
  });

  // Lotes existentes.
  const { data: lotes, isLoading } = useQuery({
    queryKey: ['lotes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('lotes')
        .select('id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo, notas, activo, productos(nombre, codigo)')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('fecha_caducidad', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  // Almacenes (para nombrar dónde está cada lote — incluye rutas).
  const { data: almacenesMap } = useQuery({
    queryKey: ['lotes-almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('almacenes')
        .select('id, nombre, tipo')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const m = new Map<string, { nombre: string; tipo: string }>();
      (data ?? []).forEach((a: any) => m.set(a.id, { nombre: a.nombre, tipo: (a as any).tipo ?? 'almacen' }));
      return m;
    },
  });

  // Stock por lote: total + desglose por almacén/ruta.
  const { data: stock } = useQuery({
    queryKey: ['stock-lotes', empresa?.id, almacenesMap?.size ?? 0],
    enabled: !!empresa?.id && !!almacenesMap,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('stock_lotes')
        .select('lote_id, almacen_id, cantidad')
        .eq('empresa_id', empresa!.id);
      if (error) throw error;
      const total = new Map<string, number>();
      const detalle = new Map<string, AlmacenStock[]>();
      const rows: { lote_id: string; almacen_id: string; cantidad: number }[] = [];
      (data ?? []).forEach((r: any) => {
        const q = Number(r.cantidad ?? 0);
        total.set(r.lote_id, (total.get(r.lote_id) ?? 0) + q);
        if (q !== 0) {
          const info = almacenesMap?.get(r.almacen_id);
          const arr = detalle.get(r.lote_id) ?? [];
          arr.push({ almacen_id: r.almacen_id, nombre: info?.nombre ?? 'Almacén', tipo: info?.tipo ?? 'almacen', cantidad: q });
          detalle.set(r.lote_id, arr);
          rows.push({ lote_id: r.lote_id, almacen_id: r.almacen_id, cantidad: q });
        }
      });
      return { total, detalle, rows };
    },
  });
  const stockPorLote = stock?.total;
  const stockDetalle = stock?.detalle;

  // Agrupación POR ALMACÉN/RUTA: almacen_id -> lotes que tiene dentro.
  const porAlmacen = (() => {
    const lotesById = new Map((lotes ?? []).map(l => [l.id, l]));
    const grupos = new Map<string, { nombre: string; tipo: string; items: { lote: LoteRow; cantidad: number }[] }>();
    (stock?.rows ?? []).forEach(r => {
      const lote = lotesById.get(r.lote_id);
      if (!lote) return;
      const info = almacenesMap?.get(r.almacen_id);
      const g = grupos.get(r.almacen_id) ?? { nombre: info?.nombre ?? 'Almacén', tipo: info?.tipo ?? 'almacen', items: [] };
      g.items.push({ lote, cantidad: r.cantidad });
      grupos.set(r.almacen_id, g);
    });
    return Array.from(grupos.entries()).map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === 'almacen' ? -1 : 1));
  })();

  const fmtFecha = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const estaVencido = (d: string | null) => !!d && new Date(d + 'T00:00:00') < hoy;
  const DIAS_POR_VENCER = 30; // umbral "próximo a vencer"

  // Días para vencer (negativo = ya venció). null si el lote no tiene caducidad.
  const diasParaVencer = (d: string | null): number | null => {
    if (!d) return null;
    return Math.round((new Date(d + 'T00:00:00').getTime() - hoy.getTime()) / 86400000);
  };
  // { texto, clase } para pintar el estado de caducidad.
  const estadoVencimiento = (d: string | null) => {
    const dias = diasParaVencer(d);
    if (dias === null) return { texto: 'Sin caducidad', clase: 'text-muted-foreground' };
    if (dias < 0) return { texto: `Vencido hace ${Math.abs(dias)} día(s)`, clase: 'text-destructive font-medium' };
    if (dias === 0) return { texto: 'Vence hoy', clase: 'text-destructive font-medium' };
    if (dias <= DIAS_POR_VENCER) return { texto: `Faltan ${dias} día(s)`, clase: 'text-amber-600 dark:text-amber-400 font-medium' };
    return { texto: `Faltan ${dias} día(s)`, clase: 'text-emerald-600 dark:text-emerald-400' };
  };

  // Lista de almacenes para el filtro (almacenes primero, rutas después).
  const almacenesList = Array.from((almacenesMap ?? new Map()).entries())
    .map(([id, a]: any) => ({ id, nombre: a.nombre, tipo: a.tipo }))
    .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === 'almacen' ? -1 : 1));

  // Stock relevante de un lote: total, o el del almacén filtrado.
  const stockDe = (loteId: string): number => {
    if (almacenFilters.size === 0) return stockPorLote?.get(loteId) ?? 0;
    return (stockDetalle?.get(loteId) ?? []).filter(d => almacenFilters.has(d.almacen_id)).reduce((s, d) => s + d.cantidad, 0);
  };

  // Predicado búsqueda + vencimiento (reutilizado en ambas vistas).
  const vencDiasNum = Number(vencDias) || 0;
  const matchSearchVenc = (l: LoteRow): boolean => {
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!(l.codigo.toLowerCase().includes(s) || (l.productos?.nombre ?? '').toLowerCase().includes(s) || (l.productos?.codigo ?? '').toLowerCase().includes(s))) return false;
    }
    if (vencMode !== 'todos') {
      const dias = diasParaVencer(l.fecha_caducidad);
      if (vencMode === 'vencido' && !(dias !== null && dias < 0)) return false;
      if (vencMode === 'porvencer' && !(dias !== null && dias >= 0 && dias <= vencDiasNum)) return false;
    }
    return true;
  };

  const lotesVisibles = (lotes ?? []).filter(l => {
    if (!matchSearchVenc(l)) return false;
    if (stockFilter !== 'todos') {
      const q = stockDe(l.id);
      if (stockFilter === 'con' && q <= 0) return false;
      if (stockFilter === 'sin' && q > 0) return false;
    }
    return true;
  });

  const porAlmacenVisible = porAlmacen
    .filter(g => almacenFilters.size === 0 || almacenFilters.has(g.id))
    .map(g => ({ ...g, items: g.items.filter(it => matchSearchVenc(it.lote)) }))
    .filter(g => g.items.length > 0);

  const openNew = () => setEdit({ ...emptyEdit });
  const openEdit = (l: LoteRow) => setEdit({
    id: l.id,
    producto_id: l.producto_id,
    codigo: l.codigo,
    fecha_caducidad: l.fecha_caducidad ?? '',
    fecha_fabricacion: l.fecha_fabricacion ?? '',
    costo: l.costo != null ? String(l.costo) : '',
    notas: l.notas ?? '',
  });

  const handleSave = async () => {
    if (!edit || !empresa?.id) return;
    if (!edit.producto_id) { toast.error('Elige el producto'); return; }
    if (!edit.codigo.trim()) { toast.error('El código de lote es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresa.id,
        producto_id: edit.producto_id,
        codigo: edit.codigo.trim(),
        fecha_caducidad: edit.fecha_caducidad || null,
        fecha_fabricacion: edit.fecha_fabricacion || null,
        costo: edit.costo.trim() ? Number(edit.costo) : null,
        notas: edit.notas.trim() || null,
      };
      if (edit.id) {
        const { error } = await (supabase.from as any)('lotes').update(payload).eq('id', edit.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)('lotes').insert(payload);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['lotes'] });
      toast.success('Lote guardado');
      setEdit(null);
    } catch (err: any) {
      // Choque de código + caducidad repetido para el mismo producto.
      if (String(err?.message ?? '').includes('uq_lote')) {
        toast.error('Ya existe un lote con ese código y caducidad para este producto');
      } else {
        toast.error(err?.message ?? 'Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  };

  const noHayProductos = (productos?.length ?? 0) === 0;
  const resumen = (lotes ?? []).reduce((a, l) => {
    const dias = diasParaVencer(l.fecha_caducidad);
    if (dias !== null) {
      if (dias < 0) a.vencidos++;
      else if (dias <= DIAS_POR_VENCER) a.porVencer++;
    }
    return a;
  }, { vencidos: 0, porVencer: 0 });

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Lotes
        </h1>
        <button className="btn-odoo-primary text-sm flex items-center gap-1" onClick={openNew} disabled={noHayProductos}>
          <Plus className="h-4 w-4" /> Nuevo lote
        </button>
      </div>

      {noHayProductos && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-[13px] text-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>Aún no hay productos marcados como <strong>"Maneja por lote"</strong>. Ve a un producto → pestaña General → activa el interruptor, y luego crea sus lotes aquí.</span>
        </div>
      )}

      {(resumen.vencidos > 0 || resumen.porVencer > 0) && (
        <div className="flex flex-wrap gap-2">
          {resumen.vencidos > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-[13px] text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" /> {resumen.vencidos} lote(s) vencido(s)
            </span>
          )}
          {resumen.porVencer > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[13px] text-amber-700 dark:text-amber-400 font-medium">
              <AlertTriangle className="h-4 w-4" /> {resumen.porVencer} por vencer (≤ {DIAS_POR_VENCER} días)
            </span>
          )}
        </div>
      )}

      {/* Filtros — todo en una barra */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por producto o código de lote…"
            className="input-odoo w-full pl-8"
          />
        </div>

        {/* Almacenes: botones multi-selección (vacío = todos) */}
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => setAlmacenFilters(new Set())}
            className={cn("px-2.5 py-1 rounded-md text-[12px] border transition-colors",
              almacenFilters.size === 0 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
            Todos
          </button>
          {almacenesList.map(a => {
            const on = almacenFilters.has(a.id);
            return (
              <button key={a.id} onClick={() => toggleAlmacen(a.id)}
                className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] border transition-colors",
                  on ? "bg-primary/10 border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary/40")}>
                {a.tipo === 'ruta' ? <Truck className="h-3 w-3 text-amber-500" /> : <Warehouse className="h-3 w-3 text-primary" />}
                {a.nombre}
              </button>
            );
          })}
        </div>

        {/* Stock: segmentado */}
        <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
          {([['todos', 'Con y sin'], ['con', 'Con stock'], ['sin', 'Sin stock']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setStockFilter(v)}
              className={cn("px-2.5 py-1 transition-colors", stockFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>
              {l}
            </button>
          ))}
        </div>

        {/* Vencimiento: segmentado + días editables */}
        <div className="inline-flex items-center gap-1">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
            {([['todos', 'Todos'], ['porvencer', 'Por vencer'], ['vencido', 'Vencidos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVencMode(v)}
                className={cn("px-2.5 py-1 transition-colors", vencMode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                {l}
              </button>
            ))}
          </div>
          {vencMode === 'porvencer' && (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              ≤ <input type="number" min={0} value={vencDias} onChange={e => setVencDias(e.target.value)}
                className="input-odoo w-14 py-1 text-center" /> días
            </span>
          )}
        </div>
      </div>

      {/* Switch de vista */}
      <div className="flex gap-1 bg-accent/40 p-1 rounded-lg w-fit">
        <button onClick={() => setVista('lote')}
          className={cn("px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors", vista === 'lote' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
          Por lote
        </button>
        <button onClick={() => setVista('almacen')}
          className={cn("px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors", vista === 'almacen' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
          Por almacén / ruta
        </button>
      </div>

      {vista === 'lote' && (
      <div className="bg-card border border-border rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo w-8"></th>
                <th className="th-odoo text-left">Producto</th>
                <th className="th-odoo text-left w-32">Código lote</th>
                <th className="th-odoo text-left w-32">Caducidad</th>
                <th className="th-odoo text-left w-40">Vence</th>
                <th className="th-odoo text-left w-28">Fabricación</th>
                <th className="th-odoo text-right w-24">Costo</th>
                <th className="th-odoo text-right w-28">Stock{almacenFilters.size > 0 ? ' (filtrado)' : ''}</th>
                <th className="th-odoo w-16 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lotesVisibles.map(l => {
                const total = stockDe(l.id);
                const detalle = stockDetalle?.get(l.id) ?? [];
                const isOpen = expanded.has(l.id);
                const est = estadoVencimiento(l.fecha_caducidad);
                return (
                  <Fragment key={l.id}>
                    <tr className={cn("border-b border-table-border hover:bg-table-hover transition-colors group", isOpen && "bg-table-hover/50")}>
                      <td className="py-1.5 px-2 text-center">
                        {detalle.length > 0 ? (
                          <button onClick={() => toggleExpand(l.id)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Ver dónde está">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="text-foreground">{l.productos?.nombre ?? '—'}</div>
                        {l.productos?.codigo && <div className="text-[11px] text-muted-foreground">{l.productos.codigo}</div>}
                      </td>
                      <td className="py-1.5 px-3 font-medium text-foreground">{l.codigo}</td>
                      <td className={cn("py-1.5 px-3", estaVencido(l.fecha_caducidad) && "text-destructive font-medium")}>
                        {fmtFecha(l.fecha_caducidad)}
                      </td>
                      <td className={cn("py-1.5 px-3 text-[12px]", est.clase)}>{est.texto}</td>
                      <td className="py-1.5 px-3 text-muted-foreground">{fmtFecha(l.fecha_fabricacion)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{l.costo != null ? fmt(l.costo) : '—'}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-medium">
                        {total.toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(l)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isOpen && detalle.length > 0 && (
                      <tr className="bg-muted/30 border-b border-table-border">
                        <td></td>
                        <td colSpan={8} className="px-3 py-2">
                          <div className="text-[11px] text-muted-foreground uppercase font-semibold mb-1">Dónde está este lote</div>
                          <div className="flex flex-wrap gap-2">
                            {detalle.sort((a, b) => b.cantidad - a.cantidad).map(d => (
                              <span key={d.almacen_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-[12px]">
                                {d.tipo === 'ruta' ? <Truck className="h-3 w-3 text-amber-500" /> : <Warehouse className="h-3 w-3 text-primary" />}
                                <span className="text-foreground">{d.nombre}</span>
                                <span className="font-semibold tabular-nums">{d.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {lotesVisibles.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {(lotes?.length ?? 0) === 0 ? 'Aún no hay lotes. Crea el primero con "Nuevo lote".' : 'Ningún lote coincide con los filtros.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      )}

      {vista === 'almacen' && (
        <div className="space-y-3">
          {porAlmacenVisible.length === 0 ? (
            <div className="bg-card border border-border rounded p-8 text-center text-muted-foreground text-sm">
              {porAlmacen.length === 0 ? 'Todavía no hay stock por lote en ningún almacén. Entrará al recibir compras o al asignar lotes.' : 'Ningún lote coincide con los filtros.'}
            </div>
          ) : porAlmacenVisible.map(alm => {
            const totalAlm = alm.items.reduce((s, it) => s + it.cantidad, 0);
            return (
              <div key={alm.id} className="bg-card border border-border rounded overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                  {alm.tipo === 'ruta' ? <Truck className="h-4 w-4 text-amber-500" /> : <Warehouse className="h-4 w-4 text-primary" />}
                  <span className="font-semibold text-foreground">{alm.nombre}</span>
                  <span className="text-[11px] text-muted-foreground">{alm.tipo === 'ruta' ? 'Ruta' : 'Almacén'}</span>
                  <span className="ml-auto text-[12px] text-muted-foreground">Total: <strong className="text-foreground tabular-nums">{totalAlm.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</strong></span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-table-border">
                      <th className="th-odoo text-left">Producto</th>
                      <th className="th-odoo text-left w-32">Lote</th>
                      <th className="th-odoo text-left w-40">Vence</th>
                      <th className="th-odoo text-right w-24">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* FEFO: lo que caduca primero, arriba */}
                    {alm.items.slice().sort((a, b) => {
                      const da = a.lote.fecha_caducidad ?? '9999-12-31';
                      const db = b.lote.fecha_caducidad ?? '9999-12-31';
                      return da.localeCompare(db);
                    }).map(({ lote, cantidad }) => {
                      const est = estadoVencimiento(lote.fecha_caducidad);
                      return (
                        <tr key={lote.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                          <td className="py-1.5 px-3 text-foreground">{lote.productos?.nombre ?? '—'}</td>
                          <td className={cn("py-1.5 px-3 font-medium", estaVencido(lote.fecha_caducidad) ? 'text-destructive' : 'text-foreground')}>{lote.codigo}</td>
                          <td className={cn("py-1.5 px-3 text-[12px]", est.clase)}>{est.texto}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-medium">{cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !saving && setEdit(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Boxes className="h-4 w-4" /> {edit.id ? 'Editar lote' : 'Nuevo lote'}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label-odoo">Producto *</label>
                <select className="input-odoo w-full" value={edit.producto_id} disabled={!!edit.id}
                  onChange={e => setEdit({ ...edit, producto_id: e.target.value })}>
                  <option value="">Selecciona un producto…</option>
                  {(productos ?? []).map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-odoo">Código de lote *</label>
                <input className="input-odoo w-full" value={edit.codigo}
                  onChange={e => setEdit({ ...edit, codigo: e.target.value })} placeholder="Ej. L-2026-014" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-odoo">Caducidad</label>
                  <input type="date" className="input-odoo w-full" value={edit.fecha_caducidad}
                    onChange={e => setEdit({ ...edit, fecha_caducidad: e.target.value })} />
                </div>
                <div>
                  <label className="label-odoo">Fabricación</label>
                  <input type="date" className="input-odoo w-full" value={edit.fecha_fabricacion}
                    onChange={e => setEdit({ ...edit, fecha_fabricacion: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label-odoo">Costo por unidad</label>
                <input type="number" step="0.0001" min="0" className="input-odoo w-full" value={edit.costo}
                  onChange={e => setEdit({ ...edit, costo: e.target.value })} placeholder="Opcional" />
              </div>
              <div>
                <label className="label-odoo">Notas</label>
                <input className="input-odoo w-full" value={edit.notas}
                  onChange={e => setEdit({ ...edit, notas: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              <button onClick={() => setEdit(null)} className="btn-odoo text-sm" disabled={saving}>Cancelar</button>
              <button onClick={handleSave} className="btn-odoo-primary text-sm" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
