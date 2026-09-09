import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Download, History, RefreshCw, Search, Truck, Warehouse } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { todayInTimezone, fmtDate, fmtNum } from '@/lib/utils';
import { exportToExcel, type ExportColumn } from '@/lib/exportUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useKardexReferencias } from '@/hooks/useKardexReferencias';
import {
  filterHistoricalStockRows,
  subtractDaysYmd,
  type HistoricalLocationFilter,
  type HistoricalQuantityFilter,
  type HistoricalStockRow,
} from '@/lib/inventoryHistory';

interface StockHistorySnapshot {
  generated_at: string;
  cutoff_date: string;
  cutoff_at: string;
  timezone: string;
  method: string;
  ledger_started_at: string | null;
  metrics: {
    units: number;
    products: number;
    locations: number;
    warehouse_units: number;
    route_units: number;
    estimated_value_at_current_cost: number;
    movements_reversed: number;
  };
  rows: HistoricalStockRow[];
}

interface KardexRow {
  id: string;
  fecha_documento: string;
  registrado_at: string;
  tipo: string;
  referencia_tipo: string | null;
  referencia_id: string | null;
  notas: string | null;
  user_id: string | null;
  lote_id: string | null;
  almacen_origen_id: string | null;
  origen: string | null;
  almacen_destino_id: string | null;
  destino: string | null;
  cantidad: number;
  delta: number;
  saldo: number;
}

interface KardexSnapshot {
  timezone: string;
  from_date: string;
  to_date: string;
  producto: { id: string; codigo: string; nombre: string };
  ubicacion: { id: string; nombre: string; tipo: string; activa: boolean };
  metrics: {
    opening_stock: number;
    final_stock: number;
    current_stock: number;
    entries: number;
    exits: number;
    movements: number;
    reconciled: boolean;
  };
  rows: KardexRow[];
}

interface UntypedRpcClient {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<{
    data: T | null;
    error: { message: string } | null;
  }>;
}

const rpcClient = supabase as unknown as UntypedRpcClient;

const TYPE_LABELS: Record<string, string> = {
  entrada: 'Entrada', salida: 'Salida', transferencia: 'Transferencia',
};

const REFERENCE_LABELS: Record<string, string> = {
  ajuste: 'Ajuste', auditoria: 'Auditoría', compra: 'Compra', venta: 'Venta',
  venta_ruta: 'Venta ruta', traspaso: 'Traspaso', entrega: 'Entrega', carga: 'Carga',
  devolucion: 'Devolución', descarga: 'Descarga', cancelacion_venta: 'Cancelación venta',
  reverso_borrador: 'Vuelta a borrador', conteo: 'Conteo', manual: 'Manual', merma: 'Merma',
  compra_cancel_lote: 'Cancelación compra',
};

function normalizeSnapshot(raw: StockHistorySnapshot): StockHistorySnapshot {
  const rows = Array.isArray(raw?.rows) ? raw.rows.map(row => ({
    ...row,
    cantidad: Number(row.cantidad || 0),
    cantidad_actual: Number(row.cantidad_actual || 0),
    diferencia_actual: Number(row.diferencia_actual || 0),
    costo_actual: Number(row.costo_actual || 0),
    movimientos_posteriores: Number(row.movimientos_posteriores || 0),
  })) : [];
  const metrics = raw?.metrics ?? {} as StockHistorySnapshot['metrics'];
  return {
    ...raw,
    rows,
    metrics: {
      units: Number(metrics.units || 0),
      products: Number(metrics.products || 0),
      locations: Number(metrics.locations || 0),
      warehouse_units: Number(metrics.warehouse_units || 0),
      route_units: Number(metrics.route_units || 0),
      estimated_value_at_current_cost: Number(metrics.estimated_value_at_current_cost || 0),
      movements_reversed: Number(metrics.movements_reversed || 0),
    },
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('fn_inventory_') || message.includes('schema cache')) {
    return 'Falta instalar la migración SQL de Stock a la fecha en Supabase.';
  }
  return message || 'No se pudo reconstruir el inventario histórico.';
}

function uniqueOptions(rows: HistoricalStockRow[], idKey: 'categoria_id' | 'marca_id' | 'proveedor_id', labelKey: 'categoria' | 'marca' | 'proveedor') {
  const map = new Map<string, string>();
  rows.forEach(row => {
    const id = row[idKey];
    const label = row[labelKey];
    if (id && label) map.set(id, label);
  });
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
}

export default function InventarioStockFechaTab() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [locationType, setLocationType] = useState<HistoricalLocationFilter>('todas');
  const [quantity, setQuantity] = useState<HistoricalQuantityFilter>('todos');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [selected, setSelected] = useState<HistoricalStockRow | null>(null);

  const query = useQuery<StockHistorySnapshot>({
    queryKey: ['inventory-stock-at-date', empresa?.id, date],
    enabled: !!empresa?.id && !!date,
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<StockHistorySnapshot>('fn_inventory_stock_at_date', {
        p_empresa_id: empresa!.id,
        p_fecha: date,
      });
      if (error) throw error;
      if (!data) throw new Error('La consulta no devolvió información.');
      return normalizeSnapshot(data);
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const categories = useMemo(() => uniqueOptions(rows, 'categoria_id', 'categoria'), [rows]);
  const brands = useMemo(() => uniqueOptions(rows, 'marca_id', 'marca'), [rows]);
  const suppliers = useMemo(() => uniqueOptions(rows, 'proveedor_id', 'proveedor'), [rows]);
  const filtered = useMemo(() => filterHistoricalStockRows(rows, {
    search, locationType, quantity,
    categoryId: categoryId || undefined,
    brandId: brandId || undefined,
    supplierId: supplierId || undefined,
  }), [rows, search, locationType, quantity, categoryId, brandId, supplierId]);

  const exportRows = () => {
    const columns: ExportColumn[] = [
      { key: 'codigo', header: 'Código', width: 14 },
      { key: 'producto', header: 'Producto', width: 30 },
      { key: 'categoria', header: 'Categoría', width: 20 },
      { key: 'marca', header: 'Marca', width: 20 },
      { key: 'proveedor', header: 'Proveedor', width: 24 },
      { key: 'almacen', header: 'Ubicación', width: 24 },
      { key: 'tipo', header: 'Tipo', width: 12 },
      { key: 'cantidad', header: `Stock al ${date}`, format: 'number', width: 14 },
      { key: 'actual', header: 'Stock actual', format: 'number', width: 14 },
      { key: 'diferencia', header: 'Cambio desde corte', format: 'number', width: 16 },
      { key: 'valor', header: 'Valor a costo actual', format: 'currency', width: 18 },
    ];
    exportToExcel({
      fileName: `Inventario_Stock_al_${date}`,
      title: `Inventario — Stock al ${date}`,
      empresa: empresa?.nombre,
      columns,
      data: filtered.map(row => ({
        codigo: row.codigo, producto: row.producto, categoria: row.categoria ?? '',
        marca: row.marca ?? '', proveedor: row.proveedor ?? '', almacen: row.almacen,
        tipo: row.ubicacion_tipo === 'ruta' ? 'Ruta' : 'Almacén', cantidad: row.cantidad,
        actual: row.cantidad_actual, diferencia: row.diferencia_actual,
        valor: row.cantidad * row.costo_actual,
      })),
      totals: {
        cantidad: filtered.reduce((sum, row) => sum + row.cantidad, 0),
        actual: filtered.reduce((sum, row) => sum + row.cantidad_actual, 0),
        diferencia: filtered.reduce((sum, row) => sum + row.diferencia_actual, 0),
        valor: filtered.reduce((sum, row) => sum + row.cantidad * row.costo_actual, 0),
      },
    });
  };

  const clearFilters = () => {
    setSearch(''); setLocationType('todas'); setQuantity('todos');
    setCategoryId(''); setBrandId(''); setSupplierId('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Existencia al cierre de</label>
            <Input type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="mt-1 h-9 w-[165px] bg-background" />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Buscar</label>
            <div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Producto, código, ubicación, marca…" className="h-9 pl-9 bg-background" /></div>
          </div>
          <Button variant="outline" className="h-9" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-1.5 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Actualizar</Button>
          <Button variant="outline" className="h-9" onClick={exportRows} disabled={!filtered.length}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Segmented value={locationType} onChange={value => setLocationType(value as HistoricalLocationFilter)} options={[['todas', 'Todas'], ['almacenes', 'Almacenes'], ['rutas', 'Rutas']]} />
          <Segmented value={quantity} onChange={value => setQuantity(value as HistoricalQuantityFilter)} options={[['todos', 'Todo stock'], ['con_stock', 'Con stock'], ['sin_stock', 'En cero'], ['negativos', 'Negativos']]} />
          <FilterSelect value={categoryId} onChange={setCategoryId} label="Todas las categorías" options={categories} />
          <FilterSelect value={brandId} onChange={setBrandId} label="Todas las marcas" options={brands} />
          <FilterSelect value={supplierId} onChange={setSupplierId} label="Todos los proveedores" options={suppliers} />
          {(search || locationType !== 'todas' || quantity !== 'todos' || categoryId || brandId || supplierId) && <button onClick={clearFilters} className="px-2 text-xs font-medium text-primary hover:underline">Limpiar filtros</button>}
        </div>
      </div>

      {query.isLoading && <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Reconstruyendo existencias al {fmtDate(date)}…</div>}
      {query.isError && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-600"><p className="font-bold">No se pudo calcular el stock a la fecha</p><p className="mt-1">{errorMessage(query.error)}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>Reintentar</Button></div>}

      {query.data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric icon={CalendarClock} label={`Unidades al ${fmtDate(date)}`} value={fmtNum(query.data.metrics.units)} />
          <Metric icon={Warehouse} label="En almacenes" value={fmtNum(query.data.metrics.warehouse_units)} />
          <Metric icon={Truck} label="En rutas" value={fmtNum(query.data.metrics.route_units)} />
          <Metric icon={History} label="Productos con stock" value={fmtNum(query.data.metrics.products)} />
          <Metric icon={Warehouse} label="Ubicaciones" value={fmtNum(query.data.metrics.locations)} />
          <Metric icon={History} label="Valor a costo actual" value={fmt(query.data.metrics.estimated_value_at_current_cost)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{filtered.length} renglones · reconstrucción al cierre en {query.data.timezone}</span>
          <span>Valor histórico estimado usando el costo actual del producto</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1180px] text-xs">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Categoría / marca</th><th className="px-3 py-2 text-left">Ubicación</th><th className="px-3 py-2 text-center">Estado</th><th className="px-3 py-2 text-right">Stock al corte</th><th className="px-3 py-2 text-right">Stock actual</th><th className="px-3 py-2 text-right">Cambio</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-center">Explicación</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={`${row.producto_id}-${row.almacen_id}`} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                  <td className="px-3 py-2"><p className="font-semibold">{row.producto}</p><p className="text-[10px] text-muted-foreground">{row.codigo} · {row.unidad || 'PZA'}</p></td>
                  <td className="px-3 py-2"><p>{row.categoria || 'Sin categoría'}</p><p className="text-[10px] text-muted-foreground">{row.marca || 'Sin marca'}{row.proveedor ? ` · ${row.proveedor}` : ''}</p></td>
                  <td className="px-3 py-2"><p className="font-medium">{row.almacen}</p><p className="text-[10px] text-muted-foreground">{row.ubicacion_tipo === 'ruta' ? 'Ruta' : 'Almacén'}{!row.ubicacion_activa ? ' · Inactiva' : ''}</p></td>
                  <td className="px-3 py-2 text-center">{row.cantidad < 0 ? <Badge variant="destructive">Negativo</Badge> : row.cantidad === 0 ? <Badge variant="secondary">En cero</Badge> : <Badge className="bg-green-600 text-white">Con stock</Badge>}</td>
                  <td className={`px-3 py-2 text-right text-base font-black tabular-nums ${row.cantidad < 0 ? 'text-destructive' : ''}`}>{fmtNum(row.cantidad)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(row.cantidad_actual)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.diferencia_actual < 0 ? 'text-destructive' : row.diferencia_actual > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>{row.diferencia_actual > 0 ? '+' : ''}{fmtNum(row.diferencia_actual)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(row.cantidad * row.costo_actual)}</td>
                  <td className="px-3 py-2 text-center"><Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setSelected(row)}><History className="mr-1.5 h-3.5 w-3.5" />Ver Kardex</Button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">No hay existencias que coincidan con los filtros.</td></tr>}
            </tbody>
            {!!filtered.length && <tfoot className="sticky bottom-0 bg-card font-bold shadow-[0_-1px_0_hsl(var(--border))]"><tr><td colSpan={4} className="px-3 py-2">Totales visibles</td><td className="px-3 py-2 text-right">{fmtNum(filtered.reduce((sum, row) => sum + row.cantidad, 0))}</td><td className="px-3 py-2 text-right">{fmtNum(filtered.reduce((sum, row) => sum + row.cantidad_actual, 0))}</td><td className="px-3 py-2 text-right">{fmtNum(filtered.reduce((sum, row) => sum + row.diferencia_actual, 0))}</td><td className="px-3 py-2 text-right">{fmt(filtered.reduce((sum, row) => sum + row.cantidad * row.costo_actual, 0))}</td><td /></tr></tfoot>}
          </table>
        </div>
      </>}

      <HistoricalKardexDialog row={selected} cutoffDate={date} today={today} onClose={() => setSelected(null)} />
    </div>
  );
}

function HistoricalKardexDialog({ row, cutoffDate, today, onClose }: { row: HistoricalStockRow | null; cutoffDate: string; today: string; onClose: () => void }) {
  const { empresa } = useAuth();
  const [fromDate, setFromDate] = useState(subtractDaysYmd(cutoffDate, 30));
  useEffect(() => setFromDate(subtractDaysYmd(cutoffDate, 30)), [cutoffDate, row?.producto_id, row?.almacen_id]);
  const effectiveFrom = fromDate > cutoffDate ? cutoffDate : fromDate;
  const query = useQuery<KardexSnapshot>({
    queryKey: ['inventory-kardex-at-date', empresa?.id, row?.producto_id, row?.almacen_id, effectiveFrom, cutoffDate],
    enabled: !!empresa?.id && !!row,
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc<KardexSnapshot>('fn_inventory_kardex_at_date', {
        p_empresa_id: empresa!.id, p_producto_id: row!.producto_id, p_almacen_id: row!.almacen_id,
        p_fecha_desde: effectiveFrom, p_fecha_hasta: cutoffDate,
      });
      if (error) throw error;
      if (!data) throw new Error('El Kardex no devolvió información.');
      return {
        ...data,
        rows: (data.rows ?? []).map(item => ({ ...item, cantidad: Number(item.cantidad || 0), delta: Number(item.delta || 0), saldo: Number(item.saldo || 0) })),
        metrics: {
          opening_stock: Number(data.metrics.opening_stock || 0),
          final_stock: Number(data.metrics.final_stock || 0),
          current_stock: Number(data.metrics.current_stock || 0),
          entries: Number(data.metrics.entries || 0),
          exits: Number(data.metrics.exits || 0),
          movements: Number(data.metrics.movements || 0),
          reconciled: Boolean(data.metrics.reconciled),
        },
      };
    },
  });
  const referenceRows = useMemo(() => (query.data?.rows ?? []).map(item => ({ ...item, created_at: item.registrado_at, fecha: item.fecha_documento, producto_id: row?.producto_id })), [query.data?.rows, row?.producto_id]);
  const { data: references } = useKardexReferencias(referenceRows);

  return <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
    <DialogContent className="flex h-[92dvh] w-[96vw] max-w-[96vw] flex-col p-0">
      <DialogHeader className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><DialogTitle>Kardex histórico — {row?.producto}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{row?.codigo} · {row?.almacen} · existencia al {fmtDate(cutoffDate)}</p></div>
          {query.data?.metrics.reconciled ? <Badge className="bg-green-600 text-white"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Kardex conciliado</Badge> : query.data ? <Badge variant="destructive"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Revisar descuadre</Badge> : null}
        </div>
      </DialogHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div><label className="block text-[10px] font-bold uppercase text-muted-foreground">Mostrar movimientos desde</label><Input type="date" value={effectiveFrom} max={cutoffDate < today ? cutoffDate : today} onChange={event => setFromDate(event.target.value)} className="mt-1 h-9 w-[165px] bg-background" /></div>
          <div className="pb-2 text-xs text-muted-foreground">El saldo inicial se calcula antes del primer día y nunca comienza falsamente en cero.</div>
          <Button variant="outline" className="ml-auto h-9" onClick={() => query.refetch()}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
        </div>
        {query.isLoading && <div className="py-20 text-center text-sm text-muted-foreground">Reconstruyendo Kardex…</div>}
        {query.isError && <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600">{errorMessage(query.error)}</div>}
        {query.data && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <SmallMetric label="Saldo inicial" value={fmtNum(query.data.metrics.opening_stock)} />
            <SmallMetric label="Entradas" value={`+${fmtNum(query.data.metrics.entries)}`} tone="green" />
            <SmallMetric label="Salidas" value={`−${fmtNum(query.data.metrics.exits)}`} tone="red" />
            <SmallMetric label={`Stock al ${fmtDate(cutoffDate)}`} value={fmtNum(query.data.metrics.final_stock)} />
            <SmallMetric label="Stock actual" value={fmtNum(query.data.metrics.current_stock)} />
            <SmallMetric label="Movimientos" value={fmtNum(query.data.metrics.movements)} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1280px] text-xs">
              <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-[10px] uppercase text-muted-foreground"><th className="px-3 py-2 text-left">Registrado</th><th className="px-3 py-2 text-left">Fecha documento</th><th className="px-3 py-2 text-left">Movimiento</th><th className="px-3 py-2 text-left">Referencia</th><th className="px-3 py-2 text-left">Origen</th><th className="px-3 py-2 text-left">Destino</th><th className="px-3 py-2 text-left">Usuario</th><th className="px-3 py-2 text-right">Entrada</th><th className="px-3 py-2 text-right">Salida</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-left">Notas</th></tr></thead>
              <tbody>
                <tr className="border-b border-border bg-primary/[0.035]"><td className="px-3 py-2 font-bold" colSpan={9}>Saldo al inicio del {fmtDate(effectiveFrom)}</td><td className="px-3 py-2 text-right font-black">{fmtNum(query.data.metrics.opening_stock)}</td><td /></tr>
                {query.data.rows.map(item => {
                  const user = item.user_id ? references?.usuarios?.[item.user_id] : null;
                  const lot = item.lote_id ? references?.lotes?.[item.lote_id] : null;
                  return <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30"><td className="px-3 py-2 whitespace-nowrap">{new Date(item.registrado_at).toLocaleString('es-MX', { timeZone: query.data.timezone, dateStyle: 'short', timeStyle: 'short' })}</td><td className="px-3 py-2 whitespace-nowrap">{fmtDate(item.fecha_documento)}</td><td className="px-3 py-2 font-semibold">{TYPE_LABELS[item.tipo] || item.tipo}</td><td className="px-3 py-2">{REFERENCE_LABELS[item.referencia_tipo || ''] || item.referencia_tipo || '—'}{item.referencia_id ? <p className="font-mono text-[9px] text-muted-foreground">{item.referencia_id.slice(0, 8)}</p> : null}</td><td className="px-3 py-2">{item.origen || '—'}</td><td className="px-3 py-2">{item.destino || '—'}</td><td className="px-3 py-2">{user || (item.user_id ? `ID ${item.user_id.slice(0, 8)}` : 'Sistema')}{lot ? <p className="text-[9px] text-muted-foreground">Lote {lot.codigo}</p> : null}</td><td className="px-3 py-2 text-right font-bold text-green-600">{item.delta > 0 ? `+${fmtNum(item.delta)}` : ''}</td><td className="px-3 py-2 text-right font-bold text-destructive">{item.delta < 0 ? fmtNum(Math.abs(item.delta)) : ''}</td><td className={`px-3 py-2 text-right font-black ${item.saldo < 0 ? 'text-destructive' : ''}`}>{fmtNum(item.saldo)}</td><td className="max-w-[260px] px-3 py-2 text-muted-foreground"><span className="line-clamp-2">{item.notas || '—'}</span></td></tr>;
                })}
                {!query.data.rows.length && <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">No hubo movimientos en este rango. El saldo inicial y final permanecen iguales.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm ${query.data.metrics.reconciled ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}><span>Saldo inicial + entradas − salidas</span><strong>{fmtNum(query.data.metrics.opening_stock)} + {fmtNum(query.data.metrics.entries)} − {fmtNum(query.data.metrics.exits)} = {fmtNum(query.data.metrics.final_stock)}</strong></div>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Warehouse; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div><p className="mt-1 text-lg font-black tabular-nums">{value}</p></div>;
}

function SmallMetric({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-base font-black ${tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-destructive' : ''}`}>{value}</p></div>;
}

function Segmented({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <div className="inline-flex overflow-hidden rounded-md border border-border bg-background">{options.map(([key, label]) => <button key={key} onClick={() => onChange(key)} className={`px-3 py-2 text-[11px] font-medium ${value === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{label}</button>)}</div>;
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: [string, string][] }) {
  return <select value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-[11px]"><option value="">{label}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>;
}
