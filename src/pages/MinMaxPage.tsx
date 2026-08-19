import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save, Copy, ListChecks, Search } from 'lucide-react';
import { useAlmacenes, useProductos } from '@/hooks/useData';
import { useMinMaxConfigMap, useStockMatriz, useGuardarMinMaxBulk, cellKey, type MinMaxRow } from '@/hooks/useMinMaxMatriz';
import MinMaxMatrixTable, { type CeldaValor } from '@/components/minmax/MinMaxMatrixTable';
import CopiarConfigDialog from '@/components/minmax/CopiarConfigDialog';
import AsignarValoresDialog from '@/components/minmax/AsignarValoresDialog';

const PAGE_SIZE = 50;
type EstadoFiltro = 'todos' | 'sin_config' | 'bajo_min' | 'sobre_max';

export default function MinMaxPage() {
  const { data: almacenes = [] } = useAlmacenes();
  const { data: productos = [], isLoading } = useProductos(undefined, 'activo');
  const { data: config = {} } = useMinMaxConfigMap();
  const { data: stock = {} } = useStockMatriz();
  const guardar = useGuardarMinMaxBulk();

  const [pending, setPending] = useState<Record<string, CeldaValor>>({});
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState('');
  const [marca, setMarca] = useState('todas');
  const [categoria, setCategoria] = useState('todas');
  const [proveedor, setProveedor] = useState('todos');
  const [estado, setEstado] = useState<EstadoFiltro>('todos');
  const [page, setPage] = useState(1);
  const [copiarOpen, setCopiarOpen] = useState(false);
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [almacenCtx, setAlmacenCtx] = useState<string | undefined>();

  const valor = (productoId: string, almacenId: string): CeldaValor => {
    const k = cellKey(productoId, almacenId);
    if (pending[k]) return pending[k];
    const c = config[k];
    return { min: c?.stock_minimo ?? null, max: c?.stock_maximo ?? null };
  };
  const esModificada = (p: string, a: string) => !!pending[cellKey(p, a)];

  const opciones = useMemo(() => {
    const marcas = new Map<string, string>(), cats = new Map<string, string>(), provs = new Map<string, string>();
    for (const p of productos as any[]) {
      if (p.marca_id) marcas.set(p.marca_id, p.marcas?.nombre ?? '—');
      if (p.clasificacion_id) cats.set(p.clasificacion_id, p.clasificaciones?.nombre ?? '—');
      if (p.proveedor_preferido_id) provs.set(p.proveedor_preferido_id, p.proveedores?.nombre ?? '—');
    }
    return { marcas: [...marcas], cats: [...cats], provs: [...provs] };
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (productos as any[]).filter(p => {
      if (q && !(`${p.codigo ?? ''} ${p.nombre ?? ''} ${p.formula ?? ''}`.toLowerCase().includes(q))) return false;
      if (marca !== 'todas' && p.marca_id !== marca) return false;
      if (categoria !== 'todas' && p.clasificacion_id !== categoria) return false;
      if (proveedor !== 'todos' && p.proveedor_preferido_id !== proveedor) return false;
      if (estado === 'sin_config') return almacenes.every(a => { const v = valor(p.id, a.id); return v.min == null && v.max == null; });
      if (estado === 'bajo_min') return almacenes.some(a => { const v = valor(p.id, a.id); const s = stock[cellKey(p.id, a.id)]; return v.min != null && s != null && s < v.min; });
      if (estado === 'sobre_max') return almacenes.some(a => { const v = valor(p.id, a.id); const s = stock[cellKey(p.id, a.id)]; return v.max != null && v.max > 0 && s != null && s > v.max; });
      return true;
    });
  }, [productos, buscar, marca, categoria, proveedor, estado, almacenes, config, pending, stock]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const visibles = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE).map(p => ({
    id: p.id, codigo: p.codigo, nombre: p.nombre, unidad: p.unidades_venta?.abreviatura ?? null,
  }));

  const setCelda = (productoId: string, almacenId: string, campo: 'min' | 'max', v: number | null) => {
    const k = cellKey(productoId, almacenId);
    setPending(prev => {
      const actual = prev[k] ?? valor(productoId, almacenId);
      return { ...prev, [k]: { ...actual, [campo]: v } };
    });
  };

  const objetivo = () => (seleccion.size > 0 ? filtrados.filter(p => seleccion.has(p.id)) : filtrados);

  const aplicarCopia = (origen: string, destinos: string[], soloSel: boolean) => {
    const lista = soloSel && seleccion.size > 0 ? filtrados.filter(p => seleccion.has(p.id)) : filtrados;
    setPending(prev => {
      const next = { ...prev };
      for (const p of lista) {
        const src = valor(p.id, origen);
        for (const d of destinos) next[cellKey(p.id, d)] = { ...src };
      }
      return next;
    });
    toast.success(`Configuración copiada a ${destinos.length} almacén(es). Revisa y guarda los cambios.`);
  };

  const aplicarValores = (almacenIds: string[], min: number | null, max: number | null, soloSel: boolean) => {
    const lista = soloSel && seleccion.size > 0 ? filtrados.filter(p => seleccion.has(p.id)) : filtrados;
    setPending(prev => {
      const next = { ...prev };
      for (const p of lista) for (const a of almacenIds) {
        const actual = next[cellKey(p.id, a)] ?? valor(p.id, a);
        next[cellKey(p.id, a)] = { min: min ?? actual.min, max: max ?? actual.max };
      }
      return next;
    });
    toast.success('Valores aplicados. Revisa y guarda los cambios.');
  };

  const limpiarColumna = (almacenId: string) => {
    const lista = objetivo();
    setPending(prev => {
      const next = { ...prev };
      for (const p of lista) next[cellKey(p.id, almacenId)] = { min: null, max: null };
      return next;
    });
    toast.success('Máximos y mínimos limpiados. Guarda los cambios para aplicarlos.');
  };

  const onColumnAction = (almacenId: string, accion: 'copiar' | 'asignar' | 'limpiar') => {
    setAlmacenCtx(almacenId);
    if (accion === 'copiar') setCopiarOpen(true);
    else if (accion === 'asignar') setAsignarOpen(true);
    else limpiarColumna(almacenId);
  };

  const onGuardar = async () => {
    const rows: MinMaxRow[] = [];
    for (const [k, v] of Object.entries(pending)) {
      const [producto_id, almacen_id] = k.split('|');
      if (v.min != null && v.min < 0) { toast.error('El mínimo no puede ser negativo'); return; }
      if (v.max != null && v.max < 0) { toast.error('El máximo no puede ser negativo'); return; }
      if (v.min != null && v.max != null && v.max > 0 && v.max < v.min) { toast.error('Hay celdas con máximo menor al mínimo'); return; }
      rows.push({ producto_id, almacen_id, stock_minimo: v.min, stock_maximo: v.max });
    }
    if (rows.length === 0) { toast.info('No hay cambios pendientes'); return; }
    await guardar.mutateAsync(rows);
    setPending({});
    toast.success(`${rows.length} configuraciones guardadas`);
  };

  const cambios = Object.keys(pending).length;

  return (
    <div className="p-4 lg:p-6 bg-background min-h-[100dvh] space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Máximos y mínimos</h1>
          <p className="text-[12px] text-muted-foreground">Configura los niveles de inventario de todos tus productos por almacén.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-odoo flex items-center gap-1.5" onClick={() => { setAlmacenCtx(undefined); setAsignarOpen(true); }}>
            <ListChecks className="h-3.5 w-3.5" /> Asignar valores
          </button>
          <button className="btn-odoo flex items-center gap-1.5" onClick={() => { setAlmacenCtx(undefined); setCopiarOpen(true); }}>
            <Copy className="h-3.5 w-3.5" /> Copiar desde almacén
          </button>
          <button className="btn-odoo-primary flex items-center gap-1.5" onClick={onGuardar} disabled={guardar.isPending || cambios === 0}>
            <Save className="h-3.5 w-3.5" /> Guardar cambios{cambios > 0 ? ` (${cambios})` : ''}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input-odoo pl-7 w-64" placeholder="Buscar producto, código o código de barras..." value={buscar} onChange={e => { setBuscar(e.target.value); setPage(1); }} />
        </div>
        <select className="input-odoo" value={categoria} onChange={e => { setCategoria(e.target.value); setPage(1); }}>
          <option value="todas">Todas las categorías</option>
          {opciones.cats.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className="input-odoo" value={marca} onChange={e => { setMarca(e.target.value); setPage(1); }}>
          <option value="todas">Todas las marcas</option>
          {opciones.marcas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className="input-odoo" value={proveedor} onChange={e => { setProveedor(e.target.value); setPage(1); }}>
          <option value="todos">Todos los proveedores</option>
          {opciones.provs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className="input-odoo" value={estado} onChange={e => { setEstado(e.target.value as EstadoFiltro); setPage(1); }}>
          <option value="todos">Todos</option>
          <option value="sin_config">Sin configuración</option>
          <option value="bajo_min">Debajo del mínimo</option>
          <option value="sobre_max">Encima del máximo</option>
        </select>
        {seleccion.size > 0 && (
          <span className="text-[12px] text-muted-foreground">{seleccion.size} seleccionados · <button className="underline" onClick={() => setSeleccion(new Set())}>limpiar</button></span>
        )}
      </div>

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground py-6">Cargando productos...</p>
      ) : (
        <MinMaxMatrixTable
          productos={visibles}
          almacenes={almacenes as any}
          valor={valor}
          esModificada={esModificada}
          stock={stock}
          seleccion={seleccion}
          onToggle={id => setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onToggleTodos={checked => setSeleccion(prev => {
            const n = new Set(prev);
            visibles.forEach(p => (checked ? n.add(p.id) : n.delete(p.id)));
            return n;
          })}
          onChange={setCelda}
          onColumnAction={onColumnAction}
        />
      )}

      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>{filtrados.length} productos · página {pageSafe} de {totalPages}</span>
        <div className="flex gap-2">
          <button className="btn-odoo" disabled={pageSafe <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <button className="btn-odoo" disabled={pageSafe >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      </div>

      <CopiarConfigDialog
        open={copiarOpen} onOpenChange={setCopiarOpen} almacenes={almacenes as any}
        origenInicial={almacenCtx} soloSeleccionados={seleccion.size} onConfirm={aplicarCopia}
      />
      <AsignarValoresDialog
        open={asignarOpen} onOpenChange={setAsignarOpen} almacenes={almacenes as any}
        almacenInicial={almacenCtx} seleccionados={seleccion.size} totalFiltrados={filtrados.length} onConfirm={aplicarValores}
      />
    </div>
  );
}
