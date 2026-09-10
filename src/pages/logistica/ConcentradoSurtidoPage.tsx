import { Fragment, useEffect, useMemo, useState } from 'react';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, AlertTriangle, ShoppingCart, Calendar as CalendarIcon, CheckCircle2, Loader2, FileDown, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProveedores, useAlmacenes } from '@/hooks/useData';
import { fmtMoney } from '@/lib/currency';
import { todayLocal, weekStartLocal, weekEndLocal } from '@/lib/utils';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import PedidosTabs from '@/components/PedidosTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EntityMultiSelect } from '@/components/reportes/EntityMultiSelect';
import { useVendedoresForFilter } from '@/hooks/useFilterOptions';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';


function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function ConcentradoSurtidoPage() {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const { data: proveedores } = useProveedores();

  const today = todayLocal();
  const [desde, setDesde] = useState(weekStartLocal());
  const [hasta, setHasta] = useState(weekEndLocal());
  const [generando, setGenerando] = useState(false);
  const [fechaField, setFechaField] = useState<'fecha' | 'fecha_entrega'>('fecha');

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'confirmado', label: 'Confirmado / Por surtir' },
    { value: 'entregado', label: 'Surtido / Entregado' },
    { value: 'facturado', label: 'Facturado' },
    { value: 'cancelado', label: 'Cancelado' },
  ];
  const [statusFilter, setStatusFilter] = useState<string[]>(['confirmado']);
  const toggleStatus = (v: string) => {
    setStatusFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };
  const [viewMode, setViewMode] = useState<'pedidos' | 'productos'>('pedidos');
  const [pedidoPage, setPedidoPage] = useState(0);
  const [pedidoPageSize, setPedidoPageSize] = useState(50);
  const [expandedPedidoId, setExpandedPedidoId] = useState<string | null>(null);

  // Filtros nuevos: tipo (pedido/venta_directa) y vendedor (multi)
  const TIPO_OPTIONS: { value: string; label: string }[] = [
    { value: 'pedido', label: 'Solo pedidos' },
    { value: 'venta_directa', label: 'Solo ventas directas' },
    { value: 'todos', label: 'Todos' },
  ];
  const [tipoFilter, setTipoFilter] = useState<'pedido' | 'venta_directa' | 'todos'>('pedido');
  const [vendedorFilter, setVendedorFilter] = useState<string[]>([]);
  const { data: vendedoresList = [], isLoading: loadingVendedores } = useVendedoresForFilter();

  // Almacenes desde los que se surtirá (multi). Default: "Almacén General" si existe.
  // La consulta principal espera a resolver este default para evitar la doble carga inicial
  // (primero sin almacén y enseguida otra vez con AlmGeneral).
  const { data: almacenesList = [], isLoading: loadingAlmacenes } = useAlmacenes();
  const [almacenFilter, setAlmacenFilter] = useState<string[]>([]);
  const [almacenInit, setAlmacenInit] = useState(false);
  useEffect(() => {
    if (almacenInit || loadingAlmacenes) return;
    if (almacenesList.length === 0) {
      setAlmacenInit(true);
      return;
    }
    const general = almacenesList.find(a => /general/i.test(a.nombre || ''));
    setAlmacenFilter(general ? [general.id] : [almacenesList[0].id]);
    setAlmacenInit(true);
  }, [almacenesList, almacenInit, loadingAlmacenes]);
  const almacenesKey = almacenFilter.slice().sort().join(',');

  // Agrupador
  type GroupKey = 'none' | 'vendedor' | 'cliente' | 'estado' | 'estado_surtido';
  const [groupBy, setGroupBy] = useState<GroupKey>('none');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) => setOpenGroups(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const vendedoresKey = vendedorFilter.slice().sort().join(',');
  const statuses = statusFilter.length > 0
    ? statusFilter
    : ['confirmado', 'entregado', 'facturado'];

  // Vista principal: sólo la página de pedidos. No calcula el concentrado global de productos.
  const {
    data: pedidoData,
    isLoading: isLoadingPedidos,
    isFetching: isFetchingPedidos,
    refetch: refetchPedidos,
  } = useQuery({
    queryKey: ['concentrado-pedidos-v3', empresa?.id, desde, hasta, statusFilter.join(','), fechaField, tipoFilter, vendedoresKey, pedidoPage, pedidoPageSize],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: previous => previous,
    queryFn: async () => {
      const { data: payload, error } = await (supabase as any).rpc('fn_logistica_concentrado_pedidos_v3', {
        p_empresa_id: empresa!.id,
        p_fecha_desde: desde || null,
        p_fecha_hasta: hasta || null,
        p_fecha_field: fechaField,
        p_statuses: statuses,
        p_tipo: tipoFilter,
        p_vendedor_ids: vendedorFilter.length > 0 ? vendedorFilter : null,
        p_page_size: pedidoPageSize,
        p_offset: pedidoPageSize === 0 ? 0 : pedidoPage * pedidoPageSize,
      });
      if (error) throw error;
      return {
        pedidos: (Array.isArray(payload?.pedidos) ? payload.pedidos : []).map((r: any) => ({
          ...r,
          total: Number(r.total ?? 0),
          requerido: Number(r.requerido ?? 0),
          entregado: Number(r.entregado ?? 0),
          pendiente: Number(r.pendiente ?? 0),
        })) as PedidoRow[],
        pedidosCount: Number(payload?.pedidos_count ?? 0),
      };
    },
  });

  // Concentrado global: sólo se ejecuta al entrar a "Por producto" o cuando una
  // acción (Excel/PDF/Generar compras) realmente necesita esos datos.
  const {
    data: productoData,
    isLoading: isLoadingProductos,
    isFetching: isFetchingProductos,
    refetch: refetchProductos,
  } = useQuery({
    queryKey: ['concentrado-productos-lazy-v2', empresa?.id, desde, hasta, statusFilter.join(','), fechaField, tipoFilter, vendedoresKey, almacenesKey],
    enabled: !!empresa?.id && almacenInit && viewMode === 'productos',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: payload, error } = await (supabase as any).rpc('fn_logistica_concentrado_surtido_v2', {
        p_empresa_id: empresa!.id,
        p_fecha_desde: desde || null,
        p_fecha_hasta: hasta || null,
        p_fecha_field: fechaField,
        p_statuses: statuses,
        p_tipo: tipoFilter,
        p_vendedor_ids: vendedorFilter.length > 0 ? vendedorFilter : null,
        p_almacen_ids: almacenFilter.length > 0 ? almacenFilter : null,
        p_pedido_page_size: 1,
        p_pedido_offset: 0,
      });
      if (error) throw error;
      return {
        rows: (Array.isArray(payload?.rows) ? payload.rows : []).map((r: any) => ({
          ...r,
          requerido: Number(r.requerido ?? 0),
          entregado: Number(r.entregado ?? 0),
          pendiente: Number(r.pendiente ?? 0),
          stock: Number(r.stock ?? 0),
          faltante: Number(r.faltante ?? 0),
          costo: Number(r.costo ?? 0),
        })) as Row[],
        productosCount: Number(payload?.productos_count ?? 0),
        conFaltante: Number(payload?.con_faltante ?? 0),
        costoFaltante: Number(payload?.costo_faltante ?? 0),
      };
    },
  });

  useEffect(() => {
    setPedidoPage(0);
    setOpenGroups(new Set());
    setExpandedPedidoId(null);
  }, [desde, hasta, fechaField, statusFilter, tipoFilter, vendedoresKey]);

  const pedidoTotalCount = pedidoData?.pedidosCount ?? 0;
  const pedidoShowAll = pedidoPageSize === 0;
  const pedidoTotalPages = pedidoShowAll ? 1 : Math.max(1, Math.ceil(pedidoTotalCount / pedidoPageSize));
  const pedidoPageStart = pedidoTotalCount === 0 ? 0 : pedidoShowAll ? 1 : pedidoPage * pedidoPageSize + 1;
  const pedidoPageEnd = pedidoShowAll ? pedidoTotalCount : Math.min((pedidoPage + 1) * pedidoPageSize, pedidoTotalCount);
  const goPedidoPage = (nextPage: number) => {
    setOpenGroups(new Set());
    setExpandedPedidoId(null);
    setPedidoPage(Math.min(Math.max(nextPage, 0), Math.max(pedidoTotalPages - 1, 0)));
  };

  const rows = productoData?.rows ?? [];
  const faltantes = useMemo(() => rows.filter(r => r.faltante > 0), [rows]);

  const ensureProductosData = async () => {
    if (productoData) return productoData;
    if (!almacenInit) throw new Error('Todavía se están cargando los almacenes. Intenta de nuevo en un momento.');
    const result = await refetchProductos();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('No se pudo calcular el concentrado de productos.');
    return result.data;
  };

  const totales = useMemo(() => ({
    pedidos: pedidoData?.pedidosCount ?? 0,
    productos: productoData?.productosCount,
    conFaltante: productoData?.conFaltante,
    costoFaltante: productoData?.costoFaltante,
  }), [pedidoData?.pedidosCount, productoData]);

  // ── Export ───────────────────────────────────────────────────
  const exportColumns: ExportColumn[] = [
    { key: 'codigo', header: 'Código', width: 16 },
    { key: 'nombre', header: 'Producto', width: 38 },
    { key: 'requerido', header: 'Requerido', format: 'number', align: 'right', width: 12 },
    { key: 'entregado', header: 'Entregado', format: 'number', align: 'right', width: 12 },
    { key: 'pendiente', header: 'A surtir', format: 'number', align: 'right', width: 12 },
    { key: 'stock', header: 'Stock', format: 'number', align: 'right', width: 12 },
    { key: 'faltante', header: 'Faltante', format: 'number', align: 'right', width: 12 },
    { key: 'costo_faltante', header: 'Costo faltante', format: 'currency', align: 'right', width: 16 },
    { key: 'proveedor', header: 'Proveedor', width: 22 },
  ];

  const buildExportRows = (sourceRows: Row[]) => sourceRows.map(r => {
    const prov = proveedores?.find(p => p.id === r.proveedor_preferido_id);
    return {
      codigo: r.codigo,
      nombre: r.nombre,
      requerido: r.requerido,
      entregado: r.entregado,
      pendiente: r.pendiente,
      stock: r.stock,
      faltante: r.faltante,
      costo_faltante: r.faltante * r.costo,
      proveedor: prov?.nombre ?? (r.proveedor_preferido_id ? '—' : 'Sin proveedor'),
    };
  });

  const buildExportOpts = (sourceRows: Row[]) => ({
    fileName: `concentrado-a-surtir_${desde}_${hasta}`,
    title: 'Concentrado a surtir',
    subtitle: `${sourceRows.length} producto(s) · ${sourceRows.filter(r => r.faltante > 0).length} con faltante`,
    columns: exportColumns,
    data: buildExportRows(sourceRows),
    empresa: empresa?.nombre ?? '',
    empresaInfo: empresa ? { nombre: empresa.nombre ?? '', rfc: (empresa as any).rfc ?? null, email: (empresa as any).email ?? null, logo_url: (empresa as any).logo_url ?? null } : undefined,
    dateRange: { from: desde, to: hasta },
    currencyCode: (empresa as any)?.moneda ?? 'MXN',
  });

  const handleExportExcel = async () => {
    try {
      const source = await ensureProductosData();
      if (source.rows.length === 0) { toast.error('Nada que exportar'); return; }
      exportToExcel(buildExportOpts(source.rows));
    } catch (err: any) { toast.error(err?.message || 'Error al exportar Excel'); }
  };
  const handleExportPdf = async () => {
    try {
      const source = await ensureProductosData();
      if (source.rows.length === 0) { toast.error('Nada que exportar'); return; }
      await exportToPDF(buildExportOpts(source.rows));
    } catch (err: any) { toast.error(err?.message || 'Error al exportar PDF'); }
  };

  const generarCompras = async () => {
    if (!empresa?.id) return;
    setGenerando(true);
    try {
      const source = await ensureProductosData();
      const faltantesActuales = source.rows.filter(r => r.faltante > 0);
      if (faltantesActuales.length === 0) { toast.error('No hay productos con faltante'); return; }
      // Agrupar por proveedor preferido
      const grupos = new Map<string, Row[]>();
      for (const f of faltantesActuales) {
        const k = f.proveedor_preferido_id ?? '__sin__';
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(f);
      }
      if (grupos.has('__sin__') && grupos.size === 1) {
        toast.error('Asigna un proveedor preferido a estos productos primero.');
        setGenerando(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const creados: string[] = [];
      const sinProv: string[] = [];

      for (const [provId, items] of grupos) {
        if (provId === '__sin__') { sinProv.push(...items.map(i => i.nombre)); continue; }
        const subtotal = items.reduce((s, r) => s + r.faltante * r.costo, 0);
        const { data: compra, error: e1 } = await supabase.from('compras').insert({
          empresa_id: empresa.id,
          proveedor_id: provId,
          fecha: new Date().toISOString().slice(0, 10),
          status: 'borrador',
          condicion_pago: 'contado',
          subtotal,
          iva_total: 0,
          total: subtotal,
          saldo_pendiente: subtotal,
          notas: `Faltantes para entregas ${desde} a ${hasta}`,
          created_by: user?.id,
        } as any).select('id').single();
        if (e1) throw e1;
        const cls = items.map(r => ({
          compra_id: compra.id,
          producto_id: r.producto_id,
          cantidad: r.faltante,
          precio_unitario: r.costo,
          subtotal: r.faltante * r.costo,
          total: r.faltante * r.costo,
        }));
        const { error: e2 } = await supabase.from('compra_lineas').insert(cls as any);
        if (e2) throw e2;
        creados.push(compra.id);
      }

      if (creados.length === 1) {
        toast.success('Compra borrador creada');
        navigate(`/almacen/compras/${creados[0]}`);
      } else if (creados.length > 1) {
        toast.success(`${creados.length} compras borrador creadas`);
        navigate('/almacen/compras');
      }
      if (sinProv.length > 0) {
        toast.warning(`${sinProv.length} producto(s) sin proveedor preferido: ${sinProv.slice(0, 3).join(', ')}${sinProv.length > 3 ? '…' : ''}`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar compras');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="p-4 min-h-full space-y-4">
      <PedidosTabs />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Concentrado a surtir
          </h1>
          <p className="text-xs text-muted-foreground">
            Pedidos levantados/a entregar en el rango, con lo ya surtido y lo pendiente.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Filtrar por</Label>
          <div className="flex gap-1 bg-muted/30 border border-border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setFechaField('fecha')}
              className={`text-xs px-2.5 py-1 rounded ${fechaField === 'fecha' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/60'}`}
            >
              Fecha levantamiento
            </button>
            <button
              type="button"
              onClick={() => setFechaField('fecha_entrega')}
              className={`text-xs px-2.5 py-1 rounded ${fechaField === 'fecha_entrega' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/60'}`}
            >
              Fecha entrega
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Rango de fechas</Label>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { const t = todayLocal(); setDesde(t); setHasta(t); }}>Hoy</Button>
          <Button size="sm" variant="outline" onClick={() => { const t = addDays(todayLocal(), 1); setDesde(t); setHasta(t); }}>Mañana</Button>
          <Button size="sm" variant="outline" onClick={() => { const t = todayLocal(); setDesde(t); setHasta(addDays(t, 6)); }}>7 días</Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => viewMode === 'productos' ? refetchProductos() : refetchPedidos()}>Refrescar</Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={isFetchingProductos || !almacenInit}>
            {isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={isFetchingProductos || !almacenInit}>
            {isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF
          </Button>
          <Button size="sm" onClick={generarCompras} disabled={generando || isFetchingProductos || !almacenInit} className="bg-primary text-primary-foreground">
            {generando || isFetchingProductos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            Generar compras{productoData ? ` (${faltantes.length})` : ''}
          </Button>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-xs">Estado del pedido</Label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(opt => {
              const active = statusFilter.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:bg-muted/40'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {statusFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter([])}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted/40"
              >
                Limpiar
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {statusFilter.length === 0
              ? 'Mostrando: Confirmado, Entregado y Facturado (por defecto).'
              : `Filtrando por ${statusFilter.length} estado(s).`}
          </p>
        </div>

        {/* Fila 2: Tipo + Vendedor + Agrupar */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-border">
          <div className="space-y-1 pt-2">
            <Label className="text-xs">Tipo de documento</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIPO_OPTIONS.map(opt => {
                const active = tipoFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipoFilter(opt.value as any)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="pt-1">
            <EntityMultiSelect
              label="Vendedor"
              placeholder="Todos los vendedores"
              loading={loadingVendedores}
              options={vendedoresList.map(v => ({ id: v.id, label: v.nombre || '—' }))}
              value={vendedorFilter}
              onChange={setVendedorFilter}
            />
          </div>
          <div className="pt-1">
            <EntityMultiSelect
              label="Almacén (surtir desde)"
              placeholder="Todos los almacenes"
              options={almacenesList.map(a => ({ id: a.id, label: a.nombre || '—' }))}
              value={almacenFilter}
              onChange={setAlmacenFilter}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {almacenFilter.length === 0
                ? 'Sin almacén: stock total de todos los almacenes.'
                : `Stock sumado de ${almacenFilter.length} almacén(es).`}
            </p>
          </div>

          <div className="space-y-1 pt-2">
            <Label className="text-xs">Agrupar por</Label>
            <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupKey); setOpenGroups(new Set()); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin agrupar</SelectItem>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="estado">Estado del pedido</SelectItem>
                <SelectItem value="estado_surtido">Estado de surtido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI label="Pedidos en rango" value={totales.pedidos} />
        <KPI label="Productos a surtir" value={totales.productos ?? '—'} />
        <KPI label="Con faltante" value={totales.conFaltante ?? '—'} highlight={(totales.conFaltante ?? 0) > 0} />
        <KPI label="Costo del faltante" value={totales.costoFaltante == null ? '—' : fmtMoney(totales.costoFaltante)} />
      </div>

      {/* Aviso */}
      {productoData && !isFetchingProductos && faltantes.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Atención:</strong> {faltantes.length} producto(s) no alcanzan a cubrirse con el stock actual.
            Usa <em>Generar compras</em> para crear órdenes borrador agrupadas por proveedor preferido.
          </div>
        </div>
      )}
      {productoData && !isFetchingProductos && rows.length > 0 && faltantes.length === 0 && (
        <div className="bg-success/10 border border-success/30 text-success rounded-lg p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4" /> Hay stock suficiente para cubrir todos los pedidos del rango.
        </div>
      )}

      {/* Toggle vista */}
      <div className="flex items-center gap-1 bg-muted/30 border border-border rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setViewMode('pedidos')}
          className={`text-xs px-3 py-1.5 rounded-md transition ${
            viewMode === 'pedidos' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/60'
          }`}
        >
          Por pedido
        </button>
        <button
          type="button"
          onClick={() => setViewMode('productos')}
          className={`text-xs px-3 py-1.5 rounded-md transition ${
            viewMode === 'productos' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted/60'
          }`}
        >
          {isFetchingProductos && viewMode === 'productos' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}Por producto
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {viewMode === 'pedidos' ? (
            (() => {
              const pedidos = pedidoData?.pedidos ?? [];
              const surtidoLabel: Record<PedidoRow['surtido_status'], string> = {
                surtido: 'Surtido completo',
                parcial: 'Surtido parcial',
                pendiente: 'Sin surtir',
                sin_lineas: 'Sin líneas',
              };
              const keyOf = (p: PedidoRow): string => {
                if (groupBy === 'vendedor') return p.vendedor || '— Sin vendedor —';
                if (groupBy === 'cliente') return p.cliente || '— Sin cliente —';
                if (groupBy === 'estado') return p.status || '—';
                if (groupBy === 'estado_surtido') return surtidoLabel[p.surtido_status];
                return '';
              };
              const grouped = new Map<string, PedidoRow[]>();
              for (const p of pedidos) {
                const k = keyOf(p);
                if (!grouped.has(k)) grouped.set(k, []);
                grouped.get(k)!.push(p);
              }
              const groups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
              const colSpan = 10;
              const renderRow = (p: PedidoRow) => {
                const badge = {
                  surtido:   { label: 'Surtido completo', cls: 'bg-success/15 text-success border-success/30' },
                  parcial:   { label: 'Surtido parcial',  cls: 'bg-warning/15 text-warning border-warning/30' },
                  pendiente: { label: 'Sin surtir',       cls: 'bg-destructive/15 text-destructive border-destructive/30' },
                  sin_lineas:{ label: 'Sin líneas',       cls: 'bg-muted text-muted-foreground border-border' },
                }[p.surtido_status];
                const isExpanded = expandedPedidoId === p.id;
                return (
                  <Fragment key={p.id}>
                  <tr className="hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedPedidoId(isExpanded ? null : p.id)}>
                    <td className="px-3 py-2 text-xs">{p.fecha_entrega ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1">{isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{p.folio ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{p.cliente}</td>
                    <td className="px-3 py-2 text-xs">{p.vendedor}</td>
                    <td className="px-3 py-2 text-xs capitalize">{p.tipo === 'venta_directa' ? 'Venta directa' : (p.tipo ?? 'pedido')}</td>
                    <td className="px-3 py-2 text-xs capitalize">{p.status}</td>
                    <td className="px-3 py-2 text-right">{p.requerido}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{p.entregado || '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${p.pendiente > 0 ? 'text-destructive' : ''}`}>{p.pendiente}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-muted/25">
                      <td colSpan={10} className="p-0">
                        <ConcentradoPedidoProductos pedidoId={p.id} onOpen={() => navigate(`/ventas/${p.id}`)} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              };
              return (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Fecha entrega</th>
                      <th className="text-left px-3 py-2">Folio</th>
                      <th className="text-left px-3 py-2">Cliente</th>
                      <th className="text-left px-3 py-2">Vendedor</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-left px-3 py-2">Estado pedido</th>
                      <th className="text-right px-3 py-2">Requerido</th>
                      <th className="text-right px-3 py-2">Surtido</th>
                      <th className="text-right px-3 py-2">Falta surtir</th>
                      <th className="text-left px-3 py-2">Estado surtido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingPedidos && (
                      <tr><td colSpan={colSpan} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
                    )}
                    {!isLoadingPedidos && pedidos.length === 0 && (
                      <tr><td colSpan={colSpan} className="text-center py-8 text-muted-foreground">Sin pedidos en este rango con los filtros seleccionados.</td></tr>
                    )}
                    {!isLoadingPedidos && groupBy === 'none' && pedidos.map(renderRow)}
                    {!isLoadingPedidos && groupBy !== 'none' && groups.map(([label, items]) => {
                      const open = openGroups.has(label);
                      const totReq = items.reduce((s, p) => s + p.requerido, 0);
                      const totEnt = items.reduce((s, p) => s + p.entregado, 0);
                      const totPend = items.reduce((s, p) => s + p.pendiente, 0);
                      return (
                        <Fragment key={`g-${label}`}>
                          <tr className="bg-muted/60 cursor-pointer" onClick={() => toggleGroup(label)}>
                            <td colSpan={6} className="px-3 py-2 text-xs font-semibold">
                              <span className="inline-flex items-center gap-1">
                                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                {label} <span className="text-muted-foreground font-normal">({items.length})</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-semibold">{totReq}</td>
                            <td className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{totEnt}</td>
                            <td className={`px-3 py-2 text-right text-xs font-semibold ${totPend > 0 ? 'text-destructive' : ''}`}>{totPend}</td>
                            <td className="px-3 py-2" />
                          </tr>
                          {open && items.map(renderRow)}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Requerido</th>
                  <th className="text-right px-3 py-2">Ya surtido</th>
                  <th className="text-right px-3 py-2">Falta surtir</th>
                  <th className="text-right px-3 py-2">Stock actual</th>
                  <th className="text-right px-3 py-2">Faltante compra</th>
                  <th className="text-left px-3 py-2">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingProductos && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
                )}
                {!isLoadingProductos && rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin productos pendientes a surtir en este rango.</td></tr>
                )}
                {rows.map(r => {
                  const prov = proveedores?.find(p => p.id === r.proveedor_preferido_id);
                  const tieneFaltante = r.faltante > 0;
                  return (
                    <tr key={r.producto_id} className={tieneFaltante ? 'bg-destructive/5' : 'hover:bg-muted/20'}>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.codigo}</td>
                      <td className="px-3 py-2 font-medium">{r.nombre}</td>
                      <td className="px-3 py-2 text-right">{r.requerido}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.entregado || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.pendiente}</td>
                      <td className={`px-3 py-2 text-right ${r.stock < r.pendiente ? 'text-destructive font-semibold' : ''}`}>{r.stock}</td>
                      <td className="px-3 py-2 text-right">
                        {tieneFaltante ? (
                          <Badge variant="destructive" className="font-mono">{r.faltante}</Badge>
                        ) : (
                          <span className="text-success">✓</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {prov?.nombre ?? (r.proveedor_preferido_id ? '—' : <span className="text-destructive/80">Sin proveedor</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {viewMode === 'pedidos' && pedidoTotalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card rounded-lg px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {pedidoPageStart}-{pedidoPageEnd} de {pedidoTotalCount} pedido{pedidoTotalCount === 1 ? '' : 's'}
              {isFetchingPedidos && !isLoadingPedidos ? ' · Actualizando…' : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Ver</span>
              <Select value={String(pedidoPageSize)} onValueChange={(value) => { setPedidoPageSize(Number(value)); setPedidoPage(0); setOpenGroups(new Set()); setExpandedPedidoId(null); }}>
                <SelectTrigger className="h-7 w-[92px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="0">Todo</SelectItem>
                </SelectContent>
              </Select>
              {pedidoShowAll && <span className="text-[10px] text-amber-600">Puede tardar más</span>}
            </div>
          </div>
          {!pedidoShowAll ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pedidoPage <= 0 || isFetchingPedidos} onClick={() => goPedidoPage(pedidoPage - 1)}>Anterior</Button>
              <span className="text-xs text-muted-foreground tabular-nums">Página {pedidoPage + 1} de {pedidoTotalPages}</span>
              <Button variant="outline" size="sm" disabled={pedidoPage + 1 >= pedidoTotalPages || isFetchingPedidos} onClick={() => goPedidoPage(pedidoPage + 1)}>Siguiente</Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Todos los pedidos</span>
          )}
        </div>
      )}
    </div>
  );
}


function ConcentradoPedidoProductos({ pedidoId, onOpen }: { pedidoId: string; onOpen: () => void }) {
  const { data: lineas = [], isLoading, isError } = useQuery({
    queryKey: ['concentrado-pedido-productos', pedidoId],
    enabled: !!pedidoId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [ventaRes, entregaRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('producto_id, cantidad, productos(codigo, nombre)')
          .eq('venta_id', pedidoId),
        supabase
          .from('entrega_lineas')
          .select('producto_id, cantidad_entregada, entregas!inner(pedido_id, status)')
          .eq('entregas.pedido_id', pedidoId)
          .in('entregas.status', ['surtido', 'cargado', 'hecho'] as any),
      ]);
      if (ventaRes.error) throw ventaRes.error;
      if (entregaRes.error) throw entregaRes.error;

      const map = new Map<string, { producto_id: string; codigo: string; nombre: string; requerido: number; surtido: number }>();
      for (const l of (ventaRes.data ?? []) as any[]) {
        if (!l.producto_id) continue;
        const current = map.get(l.producto_id) ?? {
          producto_id: l.producto_id,
          codigo: l.productos?.codigo ?? '—',
          nombre: l.productos?.nombre ?? '—',
          requerido: 0,
          surtido: 0,
        };
        current.requerido += Number(l.cantidad ?? 0);
        map.set(l.producto_id, current);
      }
      for (const l of (entregaRes.data ?? []) as any[]) {
        if (!l.producto_id) continue;
        const current = map.get(l.producto_id);
        if (current) current.surtido += Number(l.cantidad_entregada ?? 0);
      }
      return Array.from(map.values()).map(l => ({ ...l, pendiente: Math.max(0, l.requerido - l.surtido) }));
    },
  });

  return (
    <div className="px-6 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Productos del pedido</span>
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Abrir pedido</Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando productos…</div>
      ) : isError ? (
        <p className="py-3 text-xs text-destructive">No se pudieron cargar los productos.</p>
      ) : lineas.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">Sin productos.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr><th className="text-left px-3 py-2">Código</th><th className="text-left px-3 py-2">Producto</th><th className="text-right px-3 py-2">Requerido</th><th className="text-right px-3 py-2">Surtido</th><th className="text-right px-3 py-2">Pendiente</th></tr>
            </thead>
            <tbody>
              {lineas.map((l: any) => (
                <tr key={l.producto_id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{l.codigo}</td>
                  <td className="px-3 py-2 font-medium">{l.nombre}</td>
                  <td className="px-3 py-2 text-right">{l.requerido}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{l.surtido}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.pendiente > 0 ? 'text-destructive' : ''}`}>{l.pendiente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Row {
  producto_id: string;
  codigo: string;
  nombre: string;
  requerido: number;
  entregado: number;
  pendiente: number;
  stock: number;
  faltante: number;
  costo: number;
  proveedor_preferido_id: string | null;
}

interface PedidoRow {
  id: string;
  folio: string | null;
  fecha_entrega: string | null;
  status: string;
  tipo: string | null;
  cliente: string;
  vendedor_id: string | null;
  vendedor: string;
  total: number;
  requerido: number;
  entregado: number;
  pendiente: number;
  surtido_status: 'surtido' | 'parcial' | 'pendiente' | 'sin_lineas';
}

function KPI({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg p-3 ${highlight ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
