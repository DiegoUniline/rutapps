import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, CheckCircle2, FileSpreadsheet, Boxes, Tags } from 'lucide-react';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermisos } from '@/hooks/usePermisos';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useThumb } from '@/hooks/useThumb';
import { ImportDialog } from '@/components/ImportDialog';
import { StatusChip } from '@/components/StatusChip';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { TablePagination } from '@/components/TablePagination';
import { StickyListToolbar } from '@/components/StickyListToolbar';
import { ListPage, SCROLL_AREA } from '@/components/layout/ListPage';
import { StatusCountCards } from '@/components/StatusCountCards';
import { readStoredPageSizeFor, writeStoredPageSizeFor, type PageSizeOption } from '@/hooks/useTablePagination';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ExportButton } from '@/components/ExportButton';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { MobileProductoQuickForm } from '@/components/MobileProductoQuickForm';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { useProductosPaginated, useCargarProductosLista, PRODUCTOS_ORDEN_BD } from '@/hooks/useData';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListPreferences, groupData } from '@/hooks/useListPreferences';
import { useSortState, SortableTh } from '@/hooks/useSortableTable';
import { cn, fmtNum, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { useAllPresentaciones } from '@/hooks/usePresentaciones';
import { ProductoLink } from '@/components/links/EntityLinks';
import { getStockBreakdown } from '@/lib/stockPresentacion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { validarSinUsos } from '@/lib/registrosInactivos';
import { ColumnVisibilityMenu, type ColumnDef } from '@/components/ColumnVisibilityMenu';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';

const PRODUCTOS_COLUMNS: ExportColumn[] = [
  { key: 'codigo', header: 'Código', width: 12 },
  { key: 'nombre', header: 'Nombre', width: 30 },
  { key: 'precio_principal', header: 'Precio', format: 'currency', width: 14 },
  { key: 'costo', header: 'Costo', format: 'currency', width: 14 },
  { key: 'cantidad', header: 'Stock', format: 'number', width: 10 },
  { key: 'status', header: 'Estado', width: 10 },
];

interface CeldaCtx {
  fmt: (v: number | null | undefined) => string;
  thumb: (url: string, width: number) => string;
  presentacionesByProducto: Map<string, any[]>;
}

const siNo = (v: any) => (v === null || v === undefined ? '—' : v ? 'Sí' : 'No');
const dash = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));
const textoLargo = (v: any) => (v ? <span className="block max-w-[260px] truncate" title={String(v)}>{String(v)}</span> : '—');
const COSTO_LABEL: Record<string, string> = { promedio: 'Promedio', ultimo: 'Último costo de compra', estandar: 'Estándar', manual: 'Manual', ultimo_compra: 'Último costo (compra directa)', ultimo_proveedor: 'Último costo del proveedor principal' };
const IVA_FACTURA_LABEL: Record<string, string> = { tasa0: 'Tasa 0%', exento: 'Exento', no_objeto: 'No objeto' };
const COMPRA_SUGERIDA_LABEL: Record<string, string> = { maximo: 'Al máximo', medio: 'A la mitad', minimo: 'Al mínimo', cobertura: 'Por cobertura (días)' };

/** Todas las columnas disponibles en la tabla de productos (escritorio). */
const PRODUCTOS_TABLE_COLUMNS: (ColumnDef & {
  align?: 'left' | 'center' | 'right';
  /** Clases de la celda (por omisión texto secundario chico). */
  cellClass?: string;
  render: (p: any, ctx: CeldaCtx) => React.ReactNode;
})[] = [
  {
    key: 'imagen', label: 'Img', sub: 'Imagen', cellClass: '',
    render: (p, { thumb }) => (p.imagen_url
      ? <img src={thumb(p.imagen_url, 64)} alt="" className="h-7 w-7 rounded object-cover" />
      : <div className="h-7 w-7 rounded bg-secondary flex items-center justify-center text-xxs text-muted-foreground">—</div>),
  },
  { key: 'codigo', label: 'Código', cellClass: 'font-mono text-xs', render: p => p.codigo },
  { key: 'clave_alterna', label: 'Clave alterna', sub: 'Código de barras', cellClass: 'font-mono text-xs', render: p => dash(p.clave_alterna) },
  {
    key: 'nombre', label: 'Nombre', required: true, cellClass: 'font-medium max-w-[240px]',
    render: p => (
      <div className="flex items-center gap-1.5 truncate">
        <ProductoLink id={p.id} className="truncate">{p.nombre}</ProductoLink>
        {p.es_granel && (
          <span className="text-xxs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
            Granel
          </span>
        )}
      </div>
    ),
  },
  { key: 'nombre_venta', label: 'Nombre venta', render: p => dash(p.nombre_venta) },
  { key: 'nombre_compra', label: 'Nombre compra', render: p => dash(p.nombre_compra) },
  { key: 'nombre_ticket', label: 'Nombre ticket', render: p => dash(p.nombre_ticket) },
  { key: 'formula', label: 'Fórmula / descripción', render: p => textoLargo(p.formula) },
  { key: 'clasificacion', label: 'Categoría', render: p => p.clasificaciones?.nombre ?? '—' },
  { key: 'marca', label: 'Marca', render: p => p.marcas?.nombre ?? '—' },
  { key: 'proveedor', label: 'Proveedor', render: p => p.proveedores?.nombre ?? '—' },
  {
    key: 'lote', label: 'Lote', align: 'center', cellClass: '',
    render: p => (p.maneja_lote
      ? <span className="inline-flex items-center gap-1 text-[11px] text-primary"><Boxes className="h-3 w-3" /> Sí</span>
      : <span className="text-[11px] text-muted-foreground">—</span>),
  },
  { key: 'lista', label: 'Lista', render: p => p.listas?.nombre ?? '—' },
  { key: 'unidad_compra', label: 'U. compra', align: 'center', render: p => p.unidades_compra?.abreviatura ?? '—' },
  { key: 'unidad_venta', label: 'U. venta', align: 'center', render: p => p.unidades_venta?.abreviatura ?? '—' },
  { key: 'factor', label: 'Factor', align: 'center', cellClass: 'font-mono text-xs', render: p => p.factor_conversion ?? 1 },
  { key: 'precio', label: 'Precio', align: 'right', cellClass: 'font-medium tabular-nums', render: (p, { fmt }) => fmt(p.precio_principal) },
  { key: 'precio_sugerido_publico', label: 'Precio público', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: (p, { fmt }) => fmt(p.precio_sugerido_publico) },
  { key: 'costo', label: 'Costo', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: (p, { fmt }) => fmt((p.costo ?? 0) * (p.factor_conversion || 1)) },
  { key: 'costo_unitario', label: 'C/U', sub: 'Costo unitario', align: 'right', cellClass: 'text-muted-foreground tabular-nums font-mono text-xs', render: (p, { fmt }) => fmt(p.costo ?? 0) },
  { key: 'costo_incluye_impuestos', label: 'Costo con impuestos', align: 'center', render: p => siNo(p.costo_incluye_impuestos) },
  { key: 'calculo_costo', label: 'Cálculo costo', render: p => (p.calculo_costo ? COSTO_LABEL[p.calculo_costo] ?? p.calculo_costo : '—') },
  {
    key: 'stock', label: 'Stock', align: 'right', cellClass: 'tabular-nums',
    render: (p, { presentacionesByProducto }) => {
      const bd = getStockBreakdown(
        p.cantidad ?? 0,
        presentacionesByProducto.get(p.id),
        p.es_granel ? (p.unidad_granel || 'kg') : 'pz',
      );
      return (
        <>
          <span className={cn(
            "font-medium",
            (p.cantidad ?? 0) <= 0 ? "text-destructive" : (p.cantidad ?? 0) < (p.min ?? 0) ? "text-warning" : "text-foreground"
          )}>
            {fmtNum(p.cantidad ?? 0)}
          </span>
          {bd ? <div className="text-[10px] text-primary font-medium">{bd.texto}</div> : null}
        </>
      );
    },
  },
  { key: 'min', label: 'Mínimo', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: p => (p.min != null ? fmtNum(p.min) : '—') },
  { key: 'max', label: 'Máximo', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: p => (p.max != null ? fmtNum(p.max) : '—') },
  {
    key: 'iva', label: 'IVA', align: 'center', cellClass: '',
    render: p => (p.tiene_iva
      ? <span className="text-xxs font-medium text-success">{p.iva_pct ?? 16}%</span>
      : <span className="text-xxs text-muted-foreground">No</span>),
  },
  { key: 'cfdi_iva_sin_iva', label: 'IVA en factura', render: p => (p.cfdi_iva_sin_iva ? IVA_FACTURA_LABEL[p.cfdi_iva_sin_iva] ?? p.cfdi_iva_sin_iva : '—') },
  {
    key: 'ieps', label: 'IEPS', align: 'center',
    render: (p, { fmt }) => (p.tiene_ieps ? (p.ieps_tipo === 'cuota' ? fmt(p.ieps_pct) : `${p.ieps_pct ?? 0}%`) : 'No'),
  },
  { key: 'codigo_sat', label: 'Clave SAT', cellClass: 'font-mono text-xs', render: p => dash(p.codigo_sat) },
  { key: 'se_puede_vender', label: 'Se vende', align: 'center', render: p => siNo(p.se_puede_vender) },
  { key: 'se_puede_comprar', label: 'Se compra', align: 'center', render: p => siNo(p.se_puede_comprar) },
  { key: 'se_puede_inventariar', label: 'Inventariable', align: 'center', render: p => siNo(p.se_puede_inventariar) },
  { key: 'vender_sin_stock', label: 'Vende sin stock', align: 'center', render: p => siNo(p.vender_sin_stock) },
  { key: 'permitir_descuento', label: 'Permite descuento', align: 'center', render: p => siNo(p.permitir_descuento) },
  { key: 'monto_maximo', label: 'Descuento máx. (%)', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: p => (p.monto_maximo != null ? `${fmtNum(p.monto_maximo)}%` : '—') },
  {
    key: 'comision', label: 'Comisión', align: 'right', cellClass: 'text-muted-foreground tabular-nums',
    render: (p, { fmt }) => (p.tiene_comision ? (p.tipo_comision === 'monto_fijo' ? fmt(p.pct_comision) : `${fmtNum(p.pct_comision ?? 0)}%`) : 'No'),
  },
  { key: 'es_granel', label: 'Granel', align: 'center', render: p => (p.es_granel ? `Sí (${p.unidad_granel || 'kg'})` : 'No') },
  { key: 'es_combo', label: 'Combo', align: 'center', render: p => siNo(p.es_combo) },
  { key: 'usa_listas_precio', label: 'Precio por listas', align: 'center', render: p => siNo(p.usa_listas_precio) },
  { key: 'usa_presentaciones', label: 'Presentaciones', align: 'center', render: p => siNo(p.usa_presentaciones) },
  { key: 'modo_compra_sugerida', label: 'Compra sugerida', render: p => (p.modo_compra_sugerida ? COMPRA_SUGERIDA_LABEL[p.modo_compra_sugerida] ?? p.modo_compra_sugerida : '—') },
  { key: 'dias_cobertura', label: 'Días cobertura', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: p => dash(p.dias_cobertura) },
  { key: 'lead_time_dias', label: 'Tiempo entrega (días)', align: 'right', cellClass: 'text-muted-foreground tabular-nums', render: p => dash(p.lead_time_dias) },
  { key: 'codigo_origen', label: 'Código origen', cellClass: 'font-mono text-xs', render: p => dash(p.codigo_origen) },
  { key: 'notas', label: 'Notas', render: p => textoLargo(p.notas) },
  { key: 'created_at', label: 'Registrado', render: p => fmtDate(p.created_at) },
  { key: 'updated_at', label: 'Última modificación', render: p => fmtDate(p.updated_at) },
  { key: 'status', label: 'Status', align: 'center', cellClass: '', render: p => <StatusChip status={p.status} /> },
];

/** Por omisión se muestran TODAS; cada usuario oculta o mueve las que quiera (se guarda por usuario). */
const PRODUCTOS_DEFAULT_COLUMNS: Record<string, boolean> = PRODUCTOS_TABLE_COLUMNS.reduce((acc, col) => {
  acc[col.key] = true;
  return acc;
}, {} as Record<string, boolean>);
const PRODUCTOS_COL_BY_KEY = new Map(PRODUCTOS_TABLE_COLUMNS.map(c => [c.key, c] as const));

const DEFAULT_PAGE_SIZE: PageSizeOption = 50;
const ALL_PAGE_SIZE = 100000;



const STATIC_FILTER_OPTIONS = [
  {
    key: 'clasificacion',
    label: 'Categoría',
    options: [] as { value: string; label: string }[],
  },
  {
    key: 'marca',
    label: 'Marca',
    options: [] as { value: string; label: string }[],
  },
];

const GROUP_BY_OPTIONS = [
  { value: 'status', label: 'Estado' },
  { value: 'clasificacion', label: 'Categoría' },
  { value: 'marca', label: 'Marca' },
  { value: 'proveedor', label: 'Proveedor' },
];

function useProductoFilterOptions() {
  const { empresa } = useAuth();
  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('clasificaciones') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: marcas } = useQuery({
    queryKey: ['marcas-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('marcas') as any).select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from('proveedores') as any).select('id, nombre').eq('empresa_id', empresa!.id).neq('status', 'baja').order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });
  return { clasificaciones, marcas, proveedores };
}

const MOBILE_STEP = 50;
const ESTADOS_PRODUCTO = [
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
  { value: 'borrador', label: 'Borradores' },
];

export default function ProductosListPage() {
  const navigate = useNavigate();
  const thumb = useThumb();
  const isMobile = useIsMobile();
  const { fmt: fmtCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() => readStoredPageSizeFor('productos') ?? DEFAULT_PAGE_SIZE);
  // Teléfono: lista continua con «Cargar más» (de 50 en 50) en lugar de paginación.
  const [mobileLimit, setMobileLimit] = useState(MOBILE_STEP);
  const effectivePageSize = isMobile ? mobileLimit : (pageSize === 'all' ? ALL_PAGE_SIZE : pageSize);
  const handlePageSizeChange = (size: PageSizeOption) => {
    setPageSizeState(size);
    setPage(1);
    writeStoredPageSizeFor(size, 'productos');
  };
  const [importOpen, setImportOpen] = useState(false);
  const [mobileNewOpen, setMobileNewOpen] = useState(false);
  const { filters, groupBy, groupByLevels, setFilter, toggleFilterValue, setGroupBy, setGroupByLevel, clearFilters } = useListPreferences('productos');
  const { clasificaciones, marcas, proveedores } = useProductoFilterOptions();
  const { hasPermiso } = usePermisos();
  const canDelete = hasPermiso('productos', 'eliminar');
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const manejaLotes = !!(empresa as any)?.maneja_lotes;
  // Realtime de productos y stock: lo escucha AppLayout (useProductosRealtime).
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkActivating, setBulkActivating] = useState(false);
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false);
  const [bulkPriceMode, setBulkPriceMode] = useState(false);
  const [confirmAllPriceListsOpen, setConfirmAllPriceListsOpen] = useState(false);

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) {
      toast.error('No se pudo identificar la empresa actual');
      return;
    }
    setBulkDeleting(true);
    try {
      if (statusFilter === 'inactivo') {
        // D-044: no se borra físicamente un producto con ventas, compras, movimientos, etc.
        const enUso = await validarSinUsos('productos', ids, 'Déjalos inactivos (ya no aparecen para vender ni comprar).');
        if (enUso) { toast.error(enUso, { duration: 8000 }); return; }
        const { error } = await supabase.from('productos').delete().in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('productos').update({ status: 'inactivo' }).in('id', ids).eq('empresa_id', empresa.id);
        if (error) throw error;
      }
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} ${statusFilter === 'inactivo' ? 'eliminados' : 'dados de baja'}`);
      setSelected(new Set());
      setConfirmDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al eliminar');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkActivate = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) {
      toast.error('No se pudo identificar la empresa actual');
      return;
    }
    setBulkActivating(true);
    try {
      const { error } = await supabase.from('productos').update({ status: 'activo' }).in('id', ids).eq('empresa_id', empresa.id);
      if (error) throw error;
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} activados`);
      setSelected(new Set());
      setConfirmActivateOpen(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al activar');
    } finally {
      setBulkActivating(false);
    }
  };

  const [bulkLote, setBulkLote] = useState(false);
  const handleBulkManejaLote = async (value: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!empresa?.id) { toast.error('No se pudo identificar la empresa actual'); return; }
    setBulkLote(true);
    try {
      const { error } = await supabase.from('productos').update({ maneja_lote: value } as any).in('id', ids).eq('empresa_id', empresa.id);
      if (error) throw error;
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} ${value ? 'ahora manejan lote' : 'ya no manejan lote'}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-page'] });
      qc.invalidateQueries({ queryKey: ['productos-select'] });
      qc.invalidateQueries({ queryKey: ['pos-productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
    } catch (e: any) {
      toast.error(e?.message || 'Error al actualizar');
    } finally {
      setBulkLote(false);
    }
  };

  const invalidateProductPricing = () => {
    ['productos', 'productos-page', 'productos-select', 'pos-productos', 'productos-ajuste', 'producto'].forEach(key =>
      qc.invalidateQueries({ queryKey: [key] })
    );
  };

  const handleBulkPriceLists = async (allProducts = false) => {
    const ids = Array.from(selected);
    if (!allProducts && ids.length === 0) return;
    if (!empresa?.id) { toast.error('No se pudo identificar la empresa actual'); return; }

    setBulkPriceMode(true);
    try {
      let query: any = supabase
        .from('productos')
        .update({ usa_listas_precio: true } as any)
        .eq('empresa_id', empresa.id);
      if (!allProducts) query = query.in('id', ids);
      const { error } = await query;
      if (error) throw error;

      if (allProducts) {
        toast.success('Todos los productos ahora usan Listas de precio');
        setConfirmAllPriceListsOpen(false);
      } else {
        toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} cambiados a Listas de precio`);
        setSelected(new Set());
      }
      invalidateProductPricing();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo cambiar el modo de precio');
    } finally {
      setBulkPriceMode(false);
    }
  };

  const FILTER_OPTIONS = useMemo(() => [
    { key: 'clasificacion', label: 'Categoría', options: (clasificaciones ?? []).map(c => ({ value: c.id, label: c.nombre })) },
    { key: 'marca', label: 'Marca', options: (marcas ?? []).map(m => ({ value: m.id, label: m.nombre })) },
    { key: 'proveedor', label: 'Proveedor', options: (proveedores ?? []).map(p => ({ value: p.id, label: p.nombre })) },
    ...(manejaLotes ? [{ key: 'maneja_lote', label: 'Maneja lote', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] }] : []),
  ], [clasificaciones, marcas, proveedores, manejaLotes]);

  const statusFilter = filters.status?.length ? filters.status.join(',') : 'activo';
  const clasificacionFilter = filters.clasificacion?.length ? filters.clasificacion.join(',') : 'todos';
  const marcaFilter = filters.marca?.length ? filters.marca.join(',') : 'todos';
  const proveedorFilter = filters.proveedor?.length ? filters.proveedor.join(',') : 'todos';
  const manejaLoteFilter = filters.maneja_lote?.[0] ?? '';
  const debouncedSearch = useDebounce(search, 300);
  // Orden por columna en la consulta (ordena toda la lista); al cambiarlo vuelve a la página 1.
  const { sort, toggle: toggleSort } = useSortState('productos');
  const onSort = (key: string) => { toggleSort(key); setPage(1); setMobileLimit(MOBILE_STEP); };
  const { data: productosData, isLoading } = useProductosPaginated(debouncedSearch, statusFilter, isMobile ? 1 : page, effectivePageSize, clasificacionFilter, marcaFilter, !!groupBy, proveedorFilter, manejaLoteFilter, sort);

  const productos = productosData?.rows ?? [];
  // Fase 3: exportar trae todo lo filtrado en páginas (ya no hay «Todos» en pantalla).
  const cargarProductosLista = useCargarProductosLista();
  const exportarProductos = async (formato: 'excel' | 'pdf') => {
    try {
      const data = await cargarProductosLista({ search: debouncedSearch, statusFilter, clasificacionFilter, marcaFilter, proveedorFilter, manejaLoteFilter, sort });
      const opciones = { fileName: 'Productos', title: 'Catálogo de Productos', columns: PRODUCTOS_COLUMNS, data };
      if (formato === 'excel') await exportToExcel(opciones);
      else await exportToPDF(opciones);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo exportar el catálogo de productos');
    }
  };
  const { data: allPresentaciones } = useAllPresentaciones();
  const presentacionesByProducto = useMemo(() => {
    const map = new Map<string, any[]>();
    (allPresentaciones ?? []).forEach(p => {
      const arr = map.get(p.producto_id) ?? [];
      arr.push(p);
      map.set(p.producto_id, arr);
    });
    return map;
  }, [allPresentaciones]);
  const total = productosData?.total ?? 0;
  const from = total === 0 ? 0 : Math.min((page - 1) * effectivePageSize + 1, total);
  const to = Math.min(page * effectivePageSize, total);
  const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(total / effectivePageSize)) : 1;
  const pageData = productos;
  const allSelected = pageData.length > 0 && pageData.every(p => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pageData.map(p => p.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const fmt = (v: number | null | undefined) => v != null ? fmtCurrency(v) : '—';

  // Columnas: todas disponibles; el usuario oculta y ordena (se guarda por usuario).
  // «Lote» solo existe si la empresa maneja lotes.
  const { visible: colVisible, toggleColumn, setAll, reset, columnOrder, moveColumn, moveColumnTo, resetOrder } = useColumnPreferences('productos', PRODUCTOS_DEFAULT_COLUMNS);
  const menuColumns = useMemo(
    () => PRODUCTOS_TABLE_COLUMNS.filter(c => manejaLotes || c.key !== 'lote'),
    [manejaLotes],
  );
  const activeColumns = useMemo(
    () => columnOrder
      .map(k => PRODUCTOS_COL_BY_KEY.get(k))
      .filter((c): c is (typeof PRODUCTOS_TABLE_COLUMNS)[number] =>
        !!c && (manejaLotes || c.key !== 'lote') && (!!c.required || !!colVisible[c.key])),
    [colVisible, columnOrder, manejaLotes],
  );
  const cellCtx: CeldaCtx = { fmt, thumb, presentacionesByProducto };

  const groups = useMemo(() => groupData(pageData, groupBy, (item: any, key) => {
    if (key === 'status') return (item.status ?? 'activo').charAt(0).toUpperCase() + (item.status ?? 'activo').slice(1);
    if (key === 'clasificacion') return item.clasificaciones?.nombre ?? 'Sin categoría';
    if (key === 'marca') return item.marcas?.nombre ?? 'Sin marca';
    if (key === 'proveedor') return item.proveedores?.nombre ?? 'Sin proveedor';
    return '';
  }, groupByLevels), [pageData, groupBy, groupByLevels]);

  const renderTable = (items: any[]) => (
    <div className={cn(!groupBy && SCROLL_AREA)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-table-border">
            <th className="th-odoo w-10 text-center">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-input" />
            </th>
            {activeColumns.map(col => (
              // Columnas sin columna real en la BD (p. ej. la imagen) quedan sin orden.
              <SortableTh key={col.key} sortKey={col.key} sort={sort} onToggle={onSort} align={col.align ?? 'left'} disabled={!PRODUCTOS_ORDEN_BD[col.key]} className={cn('th-odoo whitespace-nowrap', col.key === 'imagen' && 'w-10', col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left')}>
                {col.label}
              </SortableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={activeColumns.length + 1} className="text-center py-12 text-muted-foreground text-sm">No hay productos. Crea el primero.</td>
            </tr>
          )}
          {items.map((p: any) => (
            <tr
              key={p.id}
              className={cn(
                "border-b border-table-border cursor-pointer transition-colors",
                selected.has(p.id) ? "bg-primary/5" : "hover:bg-table-hover"
              )}
              onClick={() => navigate(`/productos/${p.id}`)}
            >
              <td className="py-1.5 px-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(p.id); }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded border-input" />
              </td>
              {activeColumns.map(col => (
                <td
                  key={col.key}
                  className={cn(
                    col.key === 'imagen' ? 'py-1.5 px-2' : 'py-1.5 px-3',
                    col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : '',
                    col.cellClass ?? 'text-muted-foreground text-xs',
                  )}
                >
                  {col.render(p, cellCtx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const mobileFilterOptions = [{ key: 'status', label: 'Estado', options: ESTADOS_PRODUCTO }, ...FILTER_OPTIONS];
  const resetMobile = () => { setPage(1); setMobileLimit(MOBILE_STEP); };

  return (
    <ListPage>
      {isMobile ? (
        // Teléfono: título + «+» arriba y buscador a todo lo ancho; sin tarjetas de resumen ni pestañas
        // (el estado se elige en Filtros) para que la lista use la pantalla completa.
        <div className="shrink-0 space-y-1.5">
          <h1 className="sr-only">Productos</h1>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
          <OdooFilterBar
            search={search}
            onSearchChange={val => { setSearch(val); resetMobile(); }}
            placeholder="Buscar productos"
            filterOptions={mobileFilterOptions}
            activeFilters={filters}
            onToggleFilter={(key, val) => {
              if (key === 'status') setFilter('status', [val]); else toggleFilterValue(key, val);
              resetMobile();
            }}
            onSetFilter={(key, vals) => { setFilter(key, vals); resetMobile(); }}
            onClearFilters={() => { clearFilters(); resetMobile(); }}
          />
            </div>
            <button
              onClick={() => setMobileNewOpen(true)}
              aria-label="Nuevo producto"
              className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 shrink-0"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          {statusFilter !== 'activo' && (
            <p className="text-xs text-muted-foreground">
              Mostrando: {statusFilter.split(',').map(s => ESTADOS_PRODUCTO.find(e => e.value === s)?.label ?? s).join(', ')}
            </p>
          )}
        </div>
      ) : (<>
      <ListPage.Header title={<>Productos <HelpButton title={HELP.productos.title} sections={HELP.productos.sections} /> <VideoHelpButton module="productos" /></>} />

      <ListPage.Toolbar>
      <StatusCountCards tabla="productos" />
      <div className="flex border-b border-border gap-0 overflow-x-auto -mt-1">
        {[
          { key: 'activo', label: 'Activos' },
          { key: 'inactivo', label: 'Inactivos' },
          { key: 'borrador', label: 'Borradores' },
        ].map(tab => {
          const activeStatus = filters.status?.[0] ?? 'activo';
          return (
            <button
              key={tab.key}
              onClick={() => { setFilter('status', [tab.key]); setPage(1); setSelected(new Set()); }}
              className={cn("odoo-tab whitespace-nowrap", activeStatus === tab.key && "odoo-tab-active")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <StickyListToolbar
        left={
          <OdooFilterBar
            search={search}
            onSearchChange={val => { setSearch(val); setPage(1); }}
            placeholder="Buscar por nombre, código o fórmula..."
            filterOptions={FILTER_OPTIONS}
            activeFilters={filters}
            onToggleFilter={(key, val) => { toggleFilterValue(key, val); setPage(1); }}
            onSetFilter={(key, vals) => { setFilter(key, vals); setPage(1); }}
            onClearFilters={() => { clearFilters(); setPage(1); }}
            groupByOptions={GROUP_BY_OPTIONS}
            activeGroupBy={groupBy}
            onGroupByChange={setGroupBy}
            activeGroupByLevels={groupByLevels}
            onGroupByLevelChange={setGroupByLevel}
          />
        }
        right={
          <>
            {(total > 0 || isLoading) && !groupBy && (
              <TablePagination
                from={from} to={to} total={total} page={page} totalPages={totalPages}
                pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
                isLoading={isLoading}
              />
            )}
            {!isMobile && (
              <>
                <ColumnVisibilityMenu
                  columns={menuColumns}
                  visible={colVisible}
                  onToggle={toggleColumn}
                  onShowAll={() => setAll(true)}
                  onReset={() => { reset(); resetOrder(); }}
                  order={columnOrder}
                  onMove={moveColumn}
                  onMoveTo={moveColumnTo}
                />
                <ExportButton
                  onExcel={() => void exportarProductos('excel')}
                  onPDF={() => void exportarProductos('pdf')}
                />
                <button
                  onClick={() => setConfirmAllPriceListsOpen(true)}
                  disabled={bulkPriceMode || !empresa?.id}
                  className="btn-odoo-secondary shrink-0 gap-1"
                  title="Cambiar todos los productos de la empresa a Listas de precio"
                >
                  <Tags className="h-3.5 w-3.5" /> {bulkPriceMode ? 'Aplicando…' : 'Todos → Listas'}
                </button>
                <button onClick={() => setImportOpen(true)} className="btn-odoo-secondary shrink-0 gap-1">
                  <Upload className="h-3.5 w-3.5" /> Importar
                </button>
              </>
            )}
            <button
              onClick={() => isMobile ? setMobileNewOpen(true) : navigate('/productos/nuevo')}
              className="btn-odoo-primary shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          </>
        }
      />
      </ListPage.Toolbar>
      </>)}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} type="productos" />
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusFilter === 'inactivo' ? 'Eliminar productos' : 'Dar de baja productos'}</AlertDialogTitle>
            <AlertDialogDescription>
              {statusFilter === 'inactivo'
                ? `Se eliminarán permanentemente ${selected.size} producto${selected.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`
                : `Se marcarán como inactivos ${selected.size} producto${selected.size !== 1 ? 's' : ''}. Podrás reactivarlos cambiando el filtro de estado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Procesando…' : (statusFilter === 'inactivo' ? 'Eliminar' : 'Dar de baja')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmActivateOpen} onOpenChange={setConfirmActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivar productos</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcarán como activos {selected.size} producto{selected.size !== 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActivating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkActivating}
              onClick={(e) => { e.preventDefault(); handleBulkActivate(); }}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {bulkActivating ? 'Procesando…' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmAllPriceListsOpen} onOpenChange={setConfirmAllPriceListsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar todos a Listas de precio</AlertDialogTitle>
            <AlertDialogDescription>
              Se activará el modo <strong>Listas de precio</strong> en todos los productos de esta empresa, incluidos activos, inactivos y borradores. No se borran precios ni reglas existentes. Los productos nuevos que se importen después conservarán este modo automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPriceMode}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkPriceMode}
              onClick={(e) => { e.preventDefault(); handleBulkPriceLists(true); }}
            >
              {bulkPriceMode ? 'Aplicando…' : 'Cambiar todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MobileProductoQuickForm
        open={mobileNewOpen}
        onOpenChange={setMobileNewOpen}
        onCreated={(id) => navigate(`/productos/${id}`)}
      />


      {isLoading ? (
        <ListPage.Body className="p-4"><TableSkeleton rows={8} cols={isMobile ? 3 : 12} /></ListPage.Body>
      ) : isMobile ? (
        <ListPage.Body card={false}>
          {pageData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No hay productos. Crea el primero.</div>
          ) : (
            <div className="-mx-3 md:-mx-4 border-y border-border divide-y divide-border">
              {pageData.map((p: any) => {
                const stock = Number(p.cantidad ?? 0);
                const unidad = p.unidades_venta?.abreviatura || 'unidades';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/productos/${p.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-accent"
                  >
                    {p.imagen_url ? (
                      <img src={thumb(p.imagen_url, 96)} alt="" className="h-12 w-12 rounded-lg border border-border object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg border border-border bg-secondary flex items-center justify-center text-[10px] text-muted-foreground shrink-0">
                        {(p.nombre ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-primary truncate">{p.nombre}</p>
                      <p className="text-sm text-muted-foreground tabular-nums truncate">
                        {fmt(p.precio_principal)}{p.codigo ? <span className="text-xs"> · {p.codigo}</span> : null}
                      </p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums',
                      stock <= 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                    )}>
                      {fmtNum(stock)} {unidad}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {pageData.length < total && (
            <button
              type="button"
              onClick={() => setMobileLimit(l => l + MOBILE_STEP)}
              className="w-full my-2 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground active:bg-accent"
            >
              Cargar más ({pageData.length} de {total})
            </button>
          )}
        </ListPage.Body>
      ) : (
        <>
          <GroupedTableWrapper groupBy={groupBy} groups={groups} renderTable={renderTable} />
          {!groupBy && total > 0 && (
            <div className="flex justify-end pt-2 md:hidden">
              <TablePagination
                from={from} to={to} total={total} page={page} totalPages={totalPages}
                pageSize={pageSize} onPageSizeChange={handlePageSizeChange}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
                isLoading={isLoading}
              />
            </div>
          )}
        </>
      )}


      <BulkActionsBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        noun="producto"
        actions={[
          {
            label: 'Exportar',
            icon: FileSpreadsheet,
            onClick: () => {
              const sel = (productos ?? []).filter(p => selected.has(p.id));
              if (sel.length === 0) return;
              exportToExcel({ fileName: `Productos-seleccion-${sel.length}`, title: `Productos seleccionados (${sel.length})`, columns: PRODUCTOS_COLUMNS, data: sel });
              toast.success(`${sel.length} productos exportados`);
            },
          },
          {
            label: bulkPriceMode ? 'Aplicando…' : 'Listas de precio',
            icon: Tags,
            onClick: () => handleBulkPriceLists(false),
          },
          ...((empresa as any)?.maneja_lotes ? [
            { label: bulkLote ? 'Aplicando…' : 'Maneja lote', icon: Boxes, onClick: () => handleBulkManejaLote(true) },
            { label: 'Quitar lote', icon: Boxes, onClick: () => handleBulkManejaLote(false) },
          ] : []),
          statusFilter === 'inactivo'
            ? { label: 'Activar', icon: CheckCircle2, onClick: () => setConfirmActivateOpen(true), hidden: !canDelete }
            : { label: 'Dar de baja', icon: Trash2, variant: 'destructive', onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete },
          ...(statusFilter === 'inactivo' ? [{ label: 'Eliminar', icon: Trash2, variant: 'destructive' as const, onClick: () => setConfirmDeleteOpen(true), hidden: !canDelete }] : []),
        ]}
      />
    </ListPage>
  );
}
