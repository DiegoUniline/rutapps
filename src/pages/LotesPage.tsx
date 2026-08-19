import { useState, Fragment } from 'react';
import { Boxes, Plus, Pencil, AlertTriangle, ChevronRight, ChevronDown, Warehouse, Truck, Search, Check, Download, ArrowUpDown, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ListPage, TABLE_CARD, SCROLL_AREA } from '@/components/layout/ListPage';
import { useManejaLotes } from '@/hooks/useManejaLotes';
import { Navigate } from 'react-router-dom';
import { fetchAllPages } from '@/lib/supabasePaginate';

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
  productos?: { nombre: string; codigo: string | null; marca_id?: string | null } | null;
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
  const manejaLotes = useManejaLotes();
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [vista, setVista] = useState<'matriz' | 'lote' | 'almacen'>('matriz');
  const [search, setSearch] = useState('');
  const [almacenFilters, setAlmacenFilters] = useState<Set<string>>(new Set()); // vacío = todos
  const toggleAlmacen = (id: string) => setAlmacenFilters(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const [stockFilter, setStockFilter] = useState<'todos' | 'con' | 'sin'>('todos');
  const [marcaFilters, setMarcaFilters] = useState<Set<string>>(new Set()); // vacío = todas
  const toggleMarca = (id: string) => setMarcaFilters(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const [sortBy, setSortBy] = useState<'producto' | 'marca' | 'lote' | 'vence'>('producto');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (k: 'producto' | 'marca' | 'lote' | 'vence') => {
    if (sortBy === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(k); setSortDir('asc'); }
  };
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

  // Marcas (para mostrar/ordenar/exportar por marca).
  const { data: marcasMap } = useQuery({
    queryKey: ['lotes-marcas', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('marcas')
        .select('id, nombre').eq('empresa_id', empresa!.id);
      if (error) throw error;
      return new Map<string, string>((data ?? []).map((m: any) => [m.id, m.nombre]));
    },
  });
  const marcaDe = (l: LoteRow) => (l.productos?.marca_id ? (marcasMap?.get(l.productos.marca_id) ?? '—') : '—');

  // Lotes existentes.
  const { data: lotes, isLoading } = useQuery({
    queryKey: ['lotes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages<LoteRow>((from, to) => (supabase.from as any)('lotes')
        .select('id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo, notas, activo, productos(nombre, codigo, marca_id)')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('fecha_caducidad', { ascending: true, nullsFirst: false })
        .range(from, to));
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
      const data = await fetchAllPages<{ lote_id: string; almacen_id: string; cantidad: number }>((from, to) =>
        (supabase.from as any)('stock_lotes')
          .select('lote_id, almacen_id, cantidad')
          .eq('empresa_id', empresa!.id)
          .range(from, to),
      );
      const total = new Map<string, number>();
      const detalle = new Map<string, AlmacenStock[]>();
      const rows: { lote_id: string; almacen_id: string; cantidad: number }[] = [];
      data.forEach(r => {
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

  // Apartado (reservado por pedidos) por lote y almacén.
  const { data: apartado } = useQuery({
    queryKey: ['stock-apartado-lotes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const data = await fetchAllPages<{ lote_id: string | null; almacen_id: string | null; cantidad: number }>((from, to) =>
        (supabase.from as any)('stock_apartado')
          .select('lote_id, almacen_id, cantidad')
          .eq('empresa_id', empresa!.id)
          .not('lote_id', 'is', null)
          .range(from, to),
      );
      const porLote = new Map<string, number>();
      const porCelda = new Map<string, number>();
      data.forEach(r => {
        if (!r.lote_id) return;
        const q = Number(r.cantidad ?? 0);
        porLote.set(r.lote_id, (porLote.get(r.lote_id) ?? 0) + q);
        if (r.almacen_id) {
          const k = `${r.lote_id}|${r.almacen_id}`;
          porCelda.set(k, (porCelda.get(k) ?? 0) + q);
        }
      });
      return { porLote, porCelda };
    },
  });
  const apartadoEn = (loteId: string, almacenId: string) => apartado?.porCelda.get(`${loteId}|${almacenId}`) ?? 0;


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

  const fmtFecha = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
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
    // Filtro por almacén(es): sólo lotes con existencia en alguno de los seleccionados.
    if (almacenFilters.size > 0) {
      const detalle = stockDetalle?.get(l.id) ?? [];
      if (!detalle.some(d => almacenFilters.has(d.almacen_id))) return false;
    }
    if (marcaFilters.size > 0 && !marcaFilters.has(l.productos?.marca_id ?? '')) return false;
    if (stockFilter !== 'todos') {
      const q = stockDe(l.id);
      if (stockFilter === 'con' && q <= 0) return false;
      if (stockFilter === 'sin' && q > 0) return false;
    }
    return true;
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'marca') return dir * (marcaDe(a).localeCompare(marcaDe(b)) || (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
    if (sortBy === 'lote') return dir * a.codigo.localeCompare(b.codigo);
    if (sortBy === 'vence') return dir * ((a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31'));
    return dir * ((a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  });

  const porAlmacenVisible = porAlmacen
    .filter(g => almacenFilters.size === 0 || almacenFilters.has(g.id))
    .map(g => ({ ...g, items: g.items.filter(it => matchSearchVenc(it.lote)) }))
    .filter(g => g.items.length > 0);

  // Matriz: columnas = almacenes/rutas con existencia en los lotes visibles.
  const matrizCols = (() => {
    const conStock = new Set<string>();
    lotesVisibles.forEach(l => (stockDetalle?.get(l.id) ?? []).forEach(d => { if (d.cantidad !== 0) conStock.add(d.almacen_id); }));
    return almacenesList.filter(a => conStock.has(a.id) && (almacenFilters.size === 0 || almacenFilters.has(a.id)));
  })();
  const cantidadEn = (loteId: string, almacenId: string) =>
    (stockDetalle?.get(loteId) ?? []).find(d => d.almacen_id === almacenId)?.cantidad ?? 0;
  const nQty = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
  // Apartado relevante de un lote: total o el de los almacenes filtrados.
  const apartadoDe = (loteId: string): number => {
    if (almacenFilters.size === 0) return apartado?.porLote.get(loteId) ?? 0;
    return Array.from(almacenFilters).reduce((s, a) => s + apartadoEn(loteId, a), 0);
  };
  const totalesCol = new Map<string, number>();
  matrizCols.forEach(c => totalesCol.set(c.id, lotesVisibles.reduce((s, l) => s + cantidadEn(l.id, c.id), 0)));
  const totalGeneral = lotesVisibles.reduce((s, l) => s + stockDe(l.id), 0);
  const totalApartado = lotesVisibles.reduce((s, l) => s + apartadoDe(l.id), 0);
  const totalDisponible = totalGeneral - totalApartado;


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

  // Exporta a Excel lo que está en pantalla (con los filtros y el orden actual).
  const exportar = async () => {
    const { exportToExcel } = await import('@/lib/exportUtils');
    const data = lotesVisibles.map(l => {
      const fisico = stockDe(l.id);
      const ap = apartadoDe(l.id);
      const row: Record<string, any> = {
        producto: l.productos?.nombre ?? '—',
        codigo_producto: l.productos?.codigo ?? '',
        marca: marcaDe(l),
        lote: l.codigo,
        caducidad: l.fecha_caducidad ?? '',
        costo: l.costo ?? 0,
        total: fisico,
        apartado: ap,
        disponible: fisico - ap,
      };
      matrizCols.forEach(c => { row[`al_${c.id}`] = cantidadEn(l.id, c.id); });
      return row;
    });
    await exportToExcel({
      fileName: `lotes-${new Date().toISOString().slice(0, 10)}`,
      title: 'Lotes y existencias',
      empresa: empresa?.nombre ?? undefined,
      columns: [
        { key: 'producto', header: 'Producto', width: 40 },
        { key: 'codigo_producto', header: 'Código', width: 14 },
        { key: 'marca', header: 'Marca', width: 20 },
        { key: 'lote', header: 'Lote', width: 16 },
        { key: 'caducidad', header: 'Caducidad', width: 14, format: 'date' },
        { key: 'costo', header: 'Costo', width: 12, format: 'currency', align: 'right' },
        ...matrizCols.map(c => ({ key: `al_${c.id}`, header: c.nombre, width: 14, format: 'number' as const, align: 'right' as const })),
        { key: 'total', header: 'Total', width: 12, format: 'number', align: 'right' },
        { key: 'apartado', header: 'Apartado', width: 12, format: 'number', align: 'right' },
        { key: 'disponible', header: 'Disponible', width: 12, format: 'number', align: 'right' },
      ],
      data,
    });
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

  if (!manejaLotes) return <Navigate to="/" replace />;

  return (
    <ListPage>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Boxes className="h-5 w-5" /> Lotes
        </h1>
        <div className="flex items-center gap-2">
          <button className="btn-odoo text-sm flex items-center gap-1" onClick={exportar} disabled={lotesVisibles.length === 0}>
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button className="btn-odoo-primary text-sm flex items-center gap-1" onClick={openNew} disabled={noHayProductos}>
            <Plus className="h-4 w-4" /> Nuevo lote
          </button>
        </div>
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

        {/* Almacenes: dropdown multi-selección (vacío = todos) */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] border transition-colors",
              almacenFilters.size > 0 ? "bg-primary/10 border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
            )}>
              <Warehouse className="h-3.5 w-3.5" />
              {almacenFilters.size === 0
                ? 'Todos los almacenes'
                : `${almacenFilters.size} almacén${almacenFilters.size !== 1 ? 'es' : ''}`}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1 max-h-80 overflow-y-auto">
            <label className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-accent cursor-pointer">
              <Checkbox
                checked={almacenFilters.size === 0}
                onCheckedChange={() => setAlmacenFilters(new Set())}
              />
              <span className="font-medium">Todos</span>
            </label>
            <div className="my-1 border-t border-border" />
            {almacenesList.map(a => {
              const on = almacenFilters.has(a.id);
              return (
                <label
                  key={a.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] hover:bg-accent cursor-pointer"
                >
                  <Checkbox checked={on} onCheckedChange={() => toggleAlmacen(a.id)} />
                  {a.tipo === 'ruta' ? <Truck className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : <Warehouse className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="truncate">{a.nombre}</span>
                </label>
              );
            })}
          </PopoverContent>
        </Popover>


        {/* Stock: segmentado */}
        <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
          {([['todos', 'Con y sin'], ['con', 'Con stock'], ['sin', 'Sin stock']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setStockFilter(v)}
              className={cn("px-2.5 py-1.5 transition-colors", stockFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>
              {l}
            </button>
          ))}
        </div>

        {/* Vencimiento: segmentado + días editables */}
        <div className="inline-flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
            {([['todos', 'Todos'], ['porvencer', 'Por vencer'], ['vencido', 'Vencidos']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVencMode(v)}
                className={cn("px-2.5 py-1.5 transition-colors", vencMode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                {l}
              </button>
            ))}
          </div>
          {vencMode === 'porvencer' && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
              ≤ <input type="number" min={0} value={vencDias} onChange={e => setVencDias(e.target.value)}
                className="input-odoo w-20 py-1.5 text-center" /> días
            </span>
          )}
        </div>
      </div>

      {/* Switch de vista */}
      <div className="flex gap-1 bg-accent/40 p-1 rounded-lg w-fit">
        <button onClick={() => setVista('matriz')}
          className={cn("px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors", vista === 'matriz' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
          Matriz
        </button>
        <button onClick={() => setVista('lote')}
          className={cn("px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors", vista === 'lote' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
          Por lote
        </button>
        <button onClick={() => setVista('almacen')}
          className={cn("px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors", vista === 'almacen' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
          Por almacén / ruta
        </button>
      </div>

      {vista === 'matriz' && (
        <div className={TABLE_CARD}>
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={6} /></div>
          ) : lotesVisibles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {(lotes?.length ?? 0) === 0 ? 'Aún no hay lotes. Crea el primero con "Nuevo lote".' : 'Ningún lote coincide con los filtros.'}
            </div>
          ) : (
            <table className="text-sm min-w-full">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left sticky left-0 z-20 bg-card min-w-[220px]">
                    <button onClick={() => toggleSort('producto')} className="inline-flex items-center gap-1 hover:text-primary">
                      Producto <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="th-odoo text-left w-40">
                    <button onClick={() => toggleSort('marca')} className="inline-flex items-center gap-1 hover:text-primary">
                      Marca <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="th-odoo text-left w-32">
                    <button onClick={() => toggleSort('lote')} className="inline-flex items-center gap-1 hover:text-primary">
                      Lote <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="th-odoo text-left w-36">
                    <button onClick={() => toggleSort('vence')} className="inline-flex items-center gap-1 hover:text-primary">
                      Vence <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  {matrizCols.map(c => (
                    <th key={c.id} className="th-odoo text-right whitespace-nowrap min-w-[110px]">
                      <span className="inline-flex items-center gap-1 justify-end">
                        {c.tipo === 'ruta' ? <Truck className="h-3 w-3 text-amber-500" /> : <Warehouse className="h-3 w-3 text-primary" />}
                        {c.nombre}
                      </span>
                    </th>
                  ))}
                  <th className="th-odoo text-right w-24 bg-muted/40">Total</th>
                  <th className="th-odoo text-right w-24">Apartado</th>
                  <th className="th-odoo text-right w-24 bg-muted/40">Disponible</th>
                  <th className="th-odoo w-12 text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {lotesVisibles.map(l => {
                  const est = estadoVencimiento(l.fecha_caducidad);
                  const fisico = stockDe(l.id);
                  const ap = apartadoDe(l.id);
                  const disp = fisico - ap;
                  return (
                    <tr key={l.id} className="border-b border-table-border hover:bg-table-hover transition-colors group">
                      <td className="py-1.5 px-3 sticky left-0 z-10 bg-card group-hover:bg-table-hover">
                        <div className="text-foreground">{l.productos?.nombre ?? '—'}</div>
                        {l.productos?.codigo && <div className="text-[11px] text-muted-foreground">{l.productos.codigo}</div>}
                      </td>
                      <td className={cn("py-1.5 px-3 font-medium", estaVencido(l.fecha_caducidad) ? 'text-destructive' : 'text-foreground')}>{l.codigo}</td>
                      <td className={cn("py-1.5 px-3 text-[12px]", est.clase)}>{est.texto}</td>
                      {matrizCols.map(c => {
                        const q = cantidadEn(l.id, c.id);
                        const apc = apartadoEn(l.id, c.id);
                        return (
                          <td key={c.id} className={cn("py-1.5 px-3 text-right tabular-nums", q === 0 ? 'text-muted-foreground/40' : q < 0 ? 'text-destructive font-medium' : 'text-foreground')}>
                            {q === 0 ? '—' : nQty(q)}
                            {apc > 0 && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400">Ap. {nQty(apc)} · Disp. {nQty(q - apc)}</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold bg-muted/30">{nQty(fisico)}</td>
                      <td className={cn("py-1.5 px-3 text-right tabular-nums", ap > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground/40')}>
                        {ap > 0 ? nQty(ap) : '—'}
                      </td>
                      <td className={cn("py-1.5 px-3 text-right tabular-nums font-semibold bg-muted/30", disp < 0 ? 'text-destructive' : disp === 0 ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
                        {nQty(disp)}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(l)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="py-2 px-3 sticky left-0 z-10 bg-muted/40 text-foreground">Total ({lotesVisibles.length} lotes)</td>
                  <td /><td />
                  {matrizCols.map(c => (
                    <td key={c.id} className="py-2 px-3 text-right tabular-nums text-foreground">{nQty(totalesCol.get(c.id) ?? 0)}</td>
                  ))}
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{nQty(totalGeneral)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{nQty(totalApartado)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-foreground">{nQty(totalDisponible)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>

          )}
        </div>
      )}

      {vista === 'lote' && (
      <div className={TABLE_CARD}>
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
    </ListPage>
  );
}
