import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CalendarClock,
  CircleDollarSign, Clock3, Download, History, PackageCheck,
  Layers3, ShieldAlert, ShoppingCart, Tags, TrendingUp, Truck, Warehouse,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { cn, fmtNum } from '@/lib/utils';
import { exportToExcel } from '@/lib/exportUtils';
import {
  analyzeInventoryProduct, getAbcClasses, getExpirationHealth,
  type ExpirationHealth, type InventoryHealth,
} from '@/lib/inventoryIntelligence';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProductoLink } from '@/components/links/EntityLinks';

export type IntelligenceProduct = {
  id: string;
  codigo: string;
  nombre: string;
  cantidad: number | null;
  costo: number | null;
  precio_principal: number | null;
  status: string | null;
  dias_cobertura: number | null;
  lead_time_dias: number | null;
  min: number | null;
  max: number | null;
  maneja_lote: boolean;
  created_at: string;
  clasificacion_id: string | null;
  marca_id: string | null;
  proveedor_preferido_id: string | null;
  categoryName: string;
  brandName: string;
  providerName: string;
  stockTotal: number;
};

export type IntelligenceStockRow = { almacen_id: string; producto_id: string; cantidad: number };
export type IntelligenceWarehouse = { id: string; nombre: string; tipo: string | null };

type Sale = { id: string; fecha: string };
type SaleLine = { venta_id: string; producto_id: string | null; cantidad: number; total: number | null };
type Movement = {
  id: string; fecha: string; created_at: string; tipo: 'entrada' | 'salida' | 'transferencia'; cantidad: number;
  producto_id: string | null; lote_id: string | null; referencia_tipo: string | null; referencia_id: string | null;
  almacen_origen_id: string | null; almacen_destino_id: string | null; notas: string | null;
};
type Lot = { id: string; producto_id: string; codigo: string; fecha_caducidad: string | null; fecha_fabricacion: string | null; costo: number | null; activo: boolean; created_at: string };
type LotStock = { lote_id: string; producto_id: string; almacen_id: string; cantidad: number };
type ProductSales = { producto_id: string; sold_units: number; revenue: number; last_sale_at: string | null };
type LastInbound = { producto_id: string; last_inbound_at: string };
type MovementTrend = { fecha: string; tipo: Movement['tipo']; cantidad: number };
type IntelligenceLotStock = LotStock & Pick<Lot, 'codigo' | 'fecha_caducidad' | 'fecha_fabricacion' | 'costo' | 'created_at'>;
type IntelligenceHistory = {
  productSales: ProductSales[];
  lastInbound: LastInbound[];
  movementTrend: MovementTrend[];
  movements: Movement[];
  movementCount: number;
  movementTypeCounts: Partial<Record<Movement['tipo'], number>>;
  lotStock: IntelligenceLotStock[];
  source: 'database' | 'fallback';
};
type DashboardTab = 'resumen' | 'capital' | 'dimensiones' | 'caducidades' | 'movimientos' | 'reabasto' | 'abc';
type DimensionMode = 'categoryName' | 'brandName' | 'providerName';
type DimensionGroup = {
  name: string;
  productCount: number;
  stockUnits: number;
  capital: number;
  stoppedCapital: number;
  noMovementProducts: number;
  revenue: number;
  criticalProducts: number;
};

const MAX_HISTORY_DAYS = 365;
const HEALTH_COLORS: Record<InventoryHealth, string> = {
  agotado: '#DC2626', critico: '#F97316', reorden: '#F59E0B', saludable: '#10B981', lento: '#8B5CF6', detenido: '#64748B',
};
const HEALTH_LABELS: Record<InventoryHealth, string> = {
  agotado: 'Agotado con demanda', critico: 'Quiebre < 7 días', reorden: 'Reorden', saludable: 'Saludable', lento: 'Rotación lenta', detenido: 'Capital detenido',
};
const EXPIRATION_LABELS: Record<ExpirationHealth, string> = {
  vencido: 'Vencido', critico: '0–7 días', proximo: '8–30 días', vigilancia: '31–90 días', vigente: 'Más de 90 días', sin_fecha: 'Sin fecha',
};
const EXPIRATION_COLORS: Record<ExpirationHealth, string> = {
  vencido: '#DC2626', critico: '#F97316', proximo: '#F59E0B', vigilancia: '#EAB308', vigente: '#10B981', sin_fecha: '#94A3B8',
};
const DIMENSION_CONFIG: Record<DimensionMode, { label: string; singular: string; icon: React.ElementType }> = {
  categoryName: { label: 'Categorías', singular: 'Categoría', icon: Layers3 },
  brandName: { label: 'Marcas', singular: 'Marca', icon: Tags },
  providerName: { label: 'Proveedores', singular: 'Proveedor', icon: Truck },
};

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};
const formatDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX') : '—';
const shortMoney = (value: number) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
const getMovementReferenceRoute = (type: string | null, id: string | null) => {
  if (!type || !id) return null;
  if (['venta', 'venta_ruta', 'cancelacion_venta', 'reverso_borrador'].includes(type)) return `/ventas/${id}`;
  if (type === 'compra') return `/almacen/compras/${id}`;
  if (type === 'traspaso') return `/almacen/traspasos/${id}`;
  if (type === 'entrega') return `/entregas/${id}`;
  if (type === 'auditoria') return `/almacen/auditorias/${id}/resultados`;
  return null;
};

function normalizeSnapshot(value: unknown): IntelligenceHistory {
  const snapshot = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    productSales: (Array.isArray(snapshot.sales_by_product) ? snapshot.sales_by_product : []) as ProductSales[],
    lastInbound: (Array.isArray(snapshot.last_inbound) ? snapshot.last_inbound : []) as LastInbound[],
    movementTrend: (Array.isArray(snapshot.movement_trend) ? snapshot.movement_trend : []) as MovementTrend[],
    movements: (Array.isArray(snapshot.recent_movements) ? snapshot.recent_movements : []) as Movement[],
    movementCount: Number(snapshot.movement_count || 0),
    movementTypeCounts: (snapshot.movement_type_counts && typeof snapshot.movement_type_counts === 'object'
      ? snapshot.movement_type_counts
      : {}) as Partial<Record<Movement['tipo'], number>>,
    lotStock: (Array.isArray(snapshot.lot_stock) ? snapshot.lot_stock : []) as IntelligenceLotStock[],
    source: 'database',
  };
}

async function loadLegacySnapshot(empresaId: string, windowDays: number): Promise<IntelligenceHistory> {
  const historyCutoff = isoDaysAgo(MAX_HISTORY_DAYS);
  const windowCutoff = isoDaysAgo(windowDays);
  const [sales, movements, lots, lotStock] = await Promise.all([
    fetchAllPages<Sale>((from, to) => supabase.from('ventas').select('id,fecha').eq('empresa_id', empresaId).neq('status', 'cancelado').gte('fecha', historyCutoff).range(from, to)),
    fetchAllPages<Movement>((from, to) => supabase.from('movimientos_inventario')
      .select('id,fecha,created_at,tipo,cantidad,producto_id,lote_id,referencia_tipo,referencia_id,almacen_origen_id,almacen_destino_id,notas')
      .eq('empresa_id', empresaId).gte('fecha', historyCutoff).order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages<Lot>((from, to) => supabase.from('lotes')
      .select('id,producto_id,codigo,fecha_caducidad,fecha_fabricacion,costo,activo,created_at')
      .eq('empresa_id', empresaId).eq('activo', true).range(from, to)),
    fetchAllPages<LotStock>((from, to) => supabase.from('stock_lotes')
      .select('lote_id,producto_id,almacen_id,cantidad').eq('empresa_id', empresaId).gt('cantidad', 0).range(from, to)),
  ]);

  const saleDate = new Map(sales.map(sale => [sale.id, sale.fecha]));
  const lines: Array<SaleLine & { fecha: string }> = [];
  const chunks: string[][] = [];
  for (let index = 0; index < sales.length; index += 200) chunks.push(sales.slice(index, index + 200).map(sale => sale.id));

  // Respaldo temporal: procesa hasta ocho bloques simultáneos en vez de uno por uno.
  for (let index = 0; index < chunks.length; index += 8) {
    const batch = await Promise.all(chunks.slice(index, index + 8).map(ids => fetchAllPages<SaleLine>((from, to) => supabase.from('venta_lineas')
      .select('venta_id,producto_id,cantidad,total').in('venta_id', ids).range(from, to))));
    batch.flat().forEach(line => {
      const fecha = saleDate.get(line.venta_id);
      if (fecha) lines.push({ ...line, fecha });
    });
  }

  const salesStats = new Map<string, ProductSales>();
  lines.forEach(line => {
    if (!line.producto_id) return;
    const row = salesStats.get(line.producto_id) || { producto_id: line.producto_id, sold_units: 0, revenue: 0, last_sale_at: null };
    if (!row.last_sale_at || line.fecha > row.last_sale_at) row.last_sale_at = line.fecha;
    if (line.fecha >= windowCutoff) {
      row.sold_units += Number(line.cantidad || 0);
      row.revenue += Number(line.total || 0);
    }
    salesStats.set(line.producto_id, row);
  });

  const inbound = new Map<string, string>();
  movements.forEach(movement => {
    if (!movement.producto_id || movement.tipo !== 'entrada') return;
    const prior = inbound.get(movement.producto_id);
    if (!prior || movement.fecha > prior) inbound.set(movement.producto_id, movement.fecha);
  });

  const currentMovements = movements.filter(movement => movement.fecha >= windowCutoff);
  const bucketDays = windowDays > 90 ? 7 : 1;
  const trend = new Map<string, MovementTrend>();
  currentMovements.forEach(movement => {
    const date = new Date(`${movement.fecha}T00:00:00Z`);
    if (bucketDays === 7) date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const fecha = date.toISOString().slice(0, 10);
    const key = `${fecha}-${movement.tipo}`;
    const row = trend.get(key) || { fecha, tipo: movement.tipo, cantidad: 0 };
    row.cantidad += Math.abs(Number(movement.cantidad || 0));
    trend.set(key, row);
  });

  const counts: Partial<Record<Movement['tipo'], number>> = {};
  currentMovements.forEach(movement => { counts[movement.tipo] = (counts[movement.tipo] || 0) + 1; });
  const lotMap = new Map(lots.map(lot => [lot.id, lot]));

  return {
    productSales: [...salesStats.values()],
    lastInbound: [...inbound].map(([producto_id, last_inbound_at]) => ({ producto_id, last_inbound_at })),
    movementTrend: [...trend.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    movements: currentMovements.slice(0, 500),
    movementCount: currentMovements.length,
    movementTypeCounts: counts,
    lotStock: lotStock.flatMap(stock => {
      const lot = lotMap.get(stock.lote_id);
      return lot ? [{ ...stock, codigo: lot.codigo, fecha_caducidad: lot.fecha_caducidad, fecha_fabricacion: lot.fecha_fabricacion, costo: lot.costo, created_at: lot.created_at }] : [];
    }),
    source: 'fallback',
  };
}

function useIntelligenceHistory(windowDays: number) {
  const { empresa } = useAuth();
  return useQuery<IntelligenceHistory>({
    queryKey: ['inventory-intelligence-history-v2', empresa?.id, windowDays],
    enabled: Boolean(empresa?.id),
    staleTime: 5 * 60 * 1000,
    placeholderData: previous => previous,
    queryFn: async () => {
      const empresaId = empresa!.id;
      // La RPC es nueva y aún no está en los tipos generados de Supabase.
      // Llamar con .call(supabase, …): supabase.rpc usa `this` internamente
      // (this.rest) y rompe si se invoca el método suelto.
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string } | null }>;
      const { data, error } = await rpc.call(supabase, 'fn_inventory_intelligence_snapshot', {
        p_empresa_id: empresaId,
        p_window_days: windowDays,
      });
      if (!error && data) return normalizeSnapshot(data);
      // PGRST202/42883: función no desplegada. 57014: statement timeout (la
      // versión sin SECURITY DEFINER excede el límite por RLS por fila). En
      // esos casos se usa el cálculo legacy en cliente.
      if (error && !['PGRST202', '42883', '57014'].includes(error.code || '')) throw error;
      return loadLegacySnapshot(empresaId, windowDays);
    },
  });
}

export default function InventarioInteligenciaTab({
  productos, stockRows, warehouses, search,
}: {
  productos: IntelligenceProduct[];
  stockRows: IntelligenceStockRow[];
  warehouses: IntelligenceWarehouse[];
  search: string;
}) {
  const { fmt } = useCurrency();
  const [windowDays, setWindowDays] = useState(60);
  const history = useIntelligenceHistory(windowDays);
  const [tab, setTab] = useState<DashboardTab>('resumen');
  const [healthFilter, setHealthFilter] = useState<'todos' | InventoryHealth>('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [brandFilter, setBrandFilter] = useState('todos');
  const [providerFilter, setProviderFilter] = useState('todos');
  const [dimensionMode, setDimensionMode] = useState<DimensionMode>('categoryName');
  const [expirationStatus, setExpirationStatus] = useState<'todos' | 'riesgo' | ExpirationHealth>('todos');
  const [expirationFrom, setExpirationFrom] = useState('');
  const [expirationTo, setExpirationTo] = useState('');

  const productMap = useMemo(() => new Map(productos.map(product => [product.id, product])), [productos]);
  const warehouseMap = useMemo(() => new Map(warehouses.map(warehouse => [warehouse.id, warehouse])), [warehouses]);

  const analytics = useMemo(() => {
    const sales = new Map((history.data?.productSales || []).map(row => [row.producto_id, row]));
    const lastInbound = new Map((history.data?.lastInbound || []).map(row => [row.producto_id, row.last_inbound_at]));

    return productos.map(product => {
      const productSales = sales.get(product.id);
      const soldUnits = Number(productSales?.sold_units || 0);
      const lastSaleAt = productSales?.last_sale_at || null;
      const lastInboundAt = lastInbound.get(product.id) || null;
      return {
        ...product,
        soldUnits,
        revenue: Number(productSales?.revenue || 0),
        lastSaleAt,
        lastInboundAt,
        ...analyzeInventoryProduct({
        id: product.id,
        stock: product.stockTotal,
        cost: Number(product.costo || 0),
        price: Number(product.precio_principal || 0),
        soldUnits,
        windowDays,
        targetCoverageDays: Number(product.dias_cobertura || 14),
        leadTimeDays: Number(product.lead_time_dias || 0),
        minimumStock: product.min,
        createdAt: product.created_at,
        lastSaleAt,
        lastInboundAt,
      }),
      };
    });
  }, [productos, history.data, windowDays]);

  const abc = useMemo(() => getAbcClasses(analytics), [analytics]);
  const normalizedSearch = search.trim().toLowerCase();
  const dimensionOptions = useMemo(() => ({
    categories: [...new Set(analytics.map(product => product.categoryName))].sort((a, b) => a.localeCompare(b, 'es')),
    brands: [...new Set(analytics.map(product => product.brandName))].sort((a, b) => a.localeCompare(b, 'es')),
    providers: [...new Set(analytics.map(product => product.providerName))].sort((a, b) => a.localeCompare(b, 'es')),
  }), [analytics]);
  const filtered = useMemo(() => analytics.filter(product => {
    const matchesSearch = !normalizedSearch
      || product.nombre.toLowerCase().includes(normalizedSearch)
      || product.codigo.toLowerCase().includes(normalizedSearch);
    return matchesSearch
      && (healthFilter === 'todos' || product.health === healthFilter)
      && (categoryFilter === 'todos' || product.categoryName === categoryFilter)
      && (brandFilter === 'todos' || product.brandName === brandFilter)
      && (providerFilter === 'todos' || product.providerName === providerFilter);
  }), [analytics, normalizedSearch, healthFilter, categoryFilter, brandFilter, providerFilter]);
  const filteredProductIds = useMemo(() => new Set(filtered.map(product => product.id)), [filtered]);
  const facetedProductIds = useMemo(() => new Set(analytics.filter(product =>
    (healthFilter === 'todos' || product.health === healthFilter)
    && (categoryFilter === 'todos' || product.categoryName === categoryFilter)
    && (brandFilter === 'todos' || product.brandName === brandFilter)
    && (providerFilter === 'todos' || product.providerName === providerFilter)
  ).map(product => product.id)), [analytics, healthFilter, categoryFilter, brandFilter, providerFilter]);
  const hasProductFilters = Boolean(normalizedSearch) || healthFilter !== 'todos' || categoryFilter !== 'todos' || brandFilter !== 'todos' || providerFilter !== 'todos';

  const dimensionGroups = useMemo(() => {
    const build = (key: DimensionMode) => {
      const groups = new Map<string, DimensionGroup>();
      filtered.forEach(product => {
        const name = product[key];
        const group = groups.get(name) || { name, productCount: 0, stockUnits: 0, capital: 0, stoppedCapital: 0, noMovementProducts: 0, revenue: 0, criticalProducts: 0 };
        group.productCount += 1;
        group.stockUnits += Math.max(0, Number(product.stockTotal || 0));
        group.capital += product.inventoryValue;
        group.revenue += product.revenue;
        if (product.health === 'detenido') {
          group.stoppedCapital += product.inventoryValue;
          group.noMovementProducts += 1;
        }
        if (['agotado', 'critico', 'reorden'].includes(product.health)) group.criticalProducts += 1;
        groups.set(name, group);
      });
      return [...groups.values()].sort((a, b) => b.capital - a.capital);
    };
    return {
      categoryName: build('categoryName'),
      brandName: build('brandName'),
      providerName: build('providerName'),
    };
  }, [filtered]);
  const activeDimensionGroups = dimensionGroups[dimensionMode];

  const lotRows = useMemo(() => {
    return (history.data?.lotStock || []).map(stock => {
      const product = productMap.get(stock.producto_id);
      const warehouse = warehouseMap.get(stock.almacen_id);
      if (!product) return null;
      const expiration = getExpirationHealth(stock.fecha_caducidad);
      return {
        id: `${stock.lote_id}-${stock.almacen_id}`,
        lotId: stock.lote_id,
        lotCode: stock.codigo,
        productId: product.id,
        productCode: product.codigo,
        productName: product.nombre,
        warehouse: warehouse?.nombre || 'Almacén',
        quantity: Number(stock.cantidad || 0),
        expirationDate: stock.fecha_caducidad,
        manufactureDate: stock.fecha_fabricacion,
        value: Number(stock.cantidad || 0) * Number(stock.costo ?? product.costo ?? 0),
        ...expiration,
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [history.data, productMap, warehouseMap]);

  const searchedLots = useMemo(() => lotRows.filter(row => {
    const matchesText = !normalizedSearch || row.productName.toLowerCase().includes(normalizedSearch) || row.productCode.toLowerCase().includes(normalizedSearch) || row.lotCode.toLowerCase().includes(normalizedSearch);
    return matchesText && facetedProductIds.has(row.productId);
  }), [lotRows, normalizedSearch, facetedProductIds]);

  const visibleLots = useMemo(() => searchedLots.filter(row => {
    if (expirationStatus === 'riesgo' && !['vencido', 'critico', 'proximo'].includes(row.health)) return false;
    if (expirationStatus !== 'todos' && expirationStatus !== 'riesgo' && row.health !== expirationStatus) return false;
    if (expirationFrom && (!row.expirationDate || row.expirationDate < expirationFrom)) return false;
    if (expirationTo && (!row.expirationDate || row.expirationDate > expirationTo)) return false;
    return true;
  }).sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)), [searchedLots, expirationStatus, expirationFrom, expirationTo]);

  const totals = useMemo(() => {
    const positive = analytics.filter(product => product.stockTotal > 0);
    const inventoryValue = positive.reduce((sum, product) => sum + product.inventoryValue, 0);
    const potentialValue = positive.reduce((sum, product) => sum + product.potentialValue, 0);
    const stoppedCapital = positive.filter(product => product.health === 'detenido').reduce((sum, product) => sum + product.inventoryValue, 0);
    const expiryRisk = lotRows.filter(row => ['vencido', 'critico', 'proximo'].includes(row.health)).reduce((sum, row) => sum + row.value, 0);
    const criticalProducts = analytics.filter(product => ['agotado', 'critico', 'reorden'].includes(product.health)).length;
    return { inventoryValue, potentialValue, potentialMargin: Math.max(potentialValue - inventoryValue, 0), stoppedCapital, expiryRisk, criticalProducts };
  }, [analytics, lotRows]);

  const healthData = useMemo(() => (Object.keys(HEALTH_LABELS) as InventoryHealth[]).map(health => ({
    health, name: HEALTH_LABELS[health], products: analytics.filter(product => product.health === health).length,
    value: analytics.filter(product => product.health === health).reduce((sum, product) => sum + product.inventoryValue, 0),
  })).filter(row => row.products > 0), [analytics]);

  const expirationData = useMemo(() => (Object.keys(EXPIRATION_LABELS) as ExpirationHealth[]).map(health => ({
    health, name: EXPIRATION_LABELS[health], lots: lotRows.filter(row => row.health === health).length,
    value: lotRows.filter(row => row.health === health).reduce((sum, row) => sum + row.value, 0),
  })).filter(row => row.lots > 0), [lotRows]);

  const warehouseCapital = useMemo(() => warehouses.map(warehouse => ({
    name: warehouse.nombre,
    value: stockRows.filter(row => row.almacen_id === warehouse.id).reduce((sum, row) => {
      const product = productMap.get(row.producto_id);
      return sum + Math.max(0, Number(row.cantidad || 0)) * Number(product?.costo || 0);
    }, 0),
  })).filter(row => row.value > 0).sort((a, b) => b.value - a.value), [warehouses, stockRows, productMap]);

  const movementTrend = useMemo(() => {
    const buckets = new Map<string, { date: string; entradas: number; salidas: number; transferencias: number }>();
    (history.data?.movementTrend || []).forEach(row => {
      const key = row.fecha.slice(0, 10);
      const bucket = buckets.get(key) || { date: key, entradas: 0, salidas: 0, transferencias: 0 };
      const quantity = Math.abs(Number(row.cantidad || 0));
      if (row.tipo === 'entrada') bucket.entradas += quantity;
      else if (row.tipo === 'salida') bucket.salidas += quantity;
      else bucket.transferencias += quantity;
      buckets.set(key, bucket);
    });
    return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ ...row, label: formatDate(row.date) }));
  }, [history.data]);

  const recentMovements = useMemo(() => (history.data?.movements || []).filter(movement => {
    if (!movement.producto_id) return !hasProductFilters;
    return filteredProductIds.has(movement.producto_id);
  }), [history.data, hasProductFilters, filteredProductIds]);

  const topStopped = useMemo(() => filtered.filter(product => product.stockTotal > 0 && ['detenido', 'lento'].includes(product.health)).sort((a, b) => b.inventoryValue - a.inventoryValue), [filtered]);
  const restock = useMemo(() => filtered.filter(product => ['agotado', 'critico', 'reorden'].includes(product.health)).sort((a, b) => (a.coverageDays ?? -1) - (b.coverageDays ?? -1)), [filtered]);
  const expiryRisks = useMemo(() => searchedLots.filter(row => row.health !== 'vigente').sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)), [searchedLots]);

  const lotCoverageDifference = useMemo(() => {
    const lotQty = new Map<string, number>();
    lotRows.forEach(row => lotQty.set(row.productId, (lotQty.get(row.productId) || 0) + row.quantity));
    return analytics.filter(product => product.maneja_lote && Math.abs(product.stockTotal - (lotQty.get(product.id) || 0)) > 0.001).length;
  }, [analytics, lotRows]);
  const productsWithoutCost = analytics.filter(product => product.stockTotal > 0 && Number(product.costo || 0) <= 0).length;
  const lotsWithoutExpiration = lotRows.filter(row => row.health === 'sin_fecha').length;

  const exportAnalysis = async () => exportToExcel({
    fileName: `inteligencia-inventario-${new Date().toISOString().slice(0, 10)}`,
    title: 'Inteligencia de inventario',
    subtitle: `Velocidad calculada con ${windowDays} días`,
    columns: [
      { key: 'codigo', header: 'Código', width: 16 }, { key: 'nombre', header: 'Producto', width: 38 },
      { key: 'stock', header: 'Stock', format: 'number' }, { key: 'capital', header: 'Capital', format: 'currency' },
      { key: 'vendido', header: `Vendido ${windowDays}d`, format: 'number' }, { key: 'cobertura', header: 'Cobertura días', format: 'number' },
      { key: 'ultimaVenta', header: 'Última venta', format: 'date' }, { key: 'diasSinVenta', header: 'Días sin venta', format: 'number' },
      { key: 'estado', header: 'Diagnóstico', width: 22 },
    ],
    data: filtered.map(product => ({
      codigo: product.codigo, nombre: product.nombre, stock: product.stockTotal, capital: product.inventoryValue,
      vendido: product.soldUnits, cobertura: product.coverageDays == null ? null : Math.round(product.coverageDays),
      ultimaVenta: product.lastSaleAt, diasSinVenta: product.daysWithoutSale, estado: HEALTH_LABELS[product.health],
    })),
  });

  const cards = [
    { label: 'Capital en inventario', value: fmt(totals.inventoryValue), detail: `${analytics.filter(p => p.stockTotal > 0).length} productos con existencia`, icon: CircleDollarSign, color: 'text-primary', target: 'capital' as DashboardTab },
    { label: 'Capital detenido', value: fmt(totals.stoppedCapital), detail: `${totals.inventoryValue > 0 ? ((totals.stoppedCapital / totals.inventoryValue) * 100).toFixed(1) : 0}% del inventario`, icon: Clock3, color: 'text-slate-600', target: 'capital' as DashboardTab },
    { label: 'Riesgo por caducidad', value: fmt(totals.expiryRisk), detail: `${lotRows.filter(row => ['vencido', 'critico', 'proximo'].includes(row.health)).length} lotes ≤ 30 días`, icon: CalendarClock, color: 'text-destructive', target: 'caducidades' as DashboardTab },
    { label: 'Requieren acción', value: String(totals.criticalProducts), detail: 'agotados, quiebre o reorden', icon: ShieldAlert, color: 'text-amber-600', target: 'reabasto' as DashboardTab },
    { label: 'Venta potencial', value: fmt(totals.potentialValue), detail: `margen potencial ${fmt(totals.potentialMargin)}`, icon: TrendingUp, color: 'text-emerald-600', target: 'capital' as DashboardTab },
    { label: `Movimientos ${windowDays}d`, value: fmtNum(history.data?.movementCount || 0), detail: `${fmtNum(Number(history.data?.movementTypeCounts.entrada || 0))} entradas · ${fmtNum(Number(history.data?.movementTypeCounts.salida || 0))} salidas`, icon: History, color: 'text-blue-600', target: 'movimientos' as DashboardTab },
  ];

  if (history.isLoading) return <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">Leyendo ventas, movimientos y lotes…</div>;
  if (history.error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{history.error instanceof Error ? history.error.message : 'No se pudo calcular la inteligencia de inventario'}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold">Diagnóstico calculado con información real</p>
          <p className="text-xs text-muted-foreground">Las ventas determinan velocidad y cobertura; el kardex explica movimientos; stock_lotes determina caducidades. Esta vista es sólo lectura.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="inventory-window">Periodo de análisis</label>
          <select id="inventory-window" value={windowDays} onChange={event => setWindowDays(Number(event.target.value))} className="h-9 rounded-md border bg-background px-3 text-sm">
            {[30, 60, 90, 180, 365].map(days => <option key={days} value={days}>Últimos {days} días</option>)}
          </select>
          <select aria-label="Filtrar por diagnóstico" value={healthFilter} onChange={event => setHealthFilter(event.target.value as typeof healthFilter)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todos los diagnósticos</option>
            {(Object.keys(HEALTH_LABELS) as InventoryHealth[]).map(health => <option key={health} value={health}>{HEALTH_LABELS[health]}</option>)}
          </select>
          <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todas las categorías</option>
            {dimensionOptions.categories.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select aria-label="Filtrar por marca" value={brandFilter} onChange={event => setBrandFilter(event.target.value)} className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todas las marcas</option>
            {dimensionOptions.brands.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select aria-label="Filtrar por proveedor" value={providerFilter} onChange={event => setProviderFilter(event.target.value)} className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todos los proveedores</option>
            {dimensionOptions.providers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {(healthFilter !== 'todos' || categoryFilter !== 'todos' || brandFilter !== 'todos' || providerFilter !== 'todos') && <Button variant="ghost" size="sm" onClick={() => { setHealthFilter('todos'); setCategoryFilter('todos'); setBrandFilter('todos'); setProviderFilter('todos'); }}>Limpiar filtros</Button>}
          {history.isFetching && !history.isLoading && <span className="text-xs text-muted-foreground">Actualizando…</span>}
          <Button variant="outline" size="sm" onClick={exportAnalysis}><Download className="mr-1 h-4 w-4" /> Exportar análisis</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {cards.map(card => <button key={card.label} onClick={() => setTab(card.target)} className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between"><card.icon className={cn('h-5 w-5', card.color)} /><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></div>
          <div className="mt-3 text-xl font-black tracking-tight xl:text-2xl">{card.value}</div>
          <div className="mt-1 text-[11px] font-semibold">{card.label}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">{card.detail}</div>
        </button>)}
      </div>

      <Tabs value={tab} onValueChange={value => setTab(value as DashboardTab)} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="resumen">Resumen ejecutivo</TabsTrigger>
          <TabsTrigger value="capital">Capital y rotación</TabsTrigger>
          <TabsTrigger value="dimensiones">Categoría · marca · proveedor</TabsTrigger>
          <TabsTrigger value="caducidades">Caducidades {expiryRisks.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5">{expiryRisks.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="reabasto">Reabasto {restock.length > 0 && <Badge className="ml-1 h-5 bg-amber-500 px-1.5">{restock.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="abc">ABC</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Flujo de inventario" subtitle={`Unidades movidas · ${windowDays} días`}>
              <ResponsiveContainer width="100%" height={270}><AreaChart data={movementTrend} margin={{ left: -20, right: 8 }}>
                <defs><linearGradient id="inbound" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient><linearGradient id="outbound" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3}/><stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={28}/><YAxis tick={{ fontSize: 10 }}/><ChartTooltip/><Legend/>
                <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#10B981" fill="url(#inbound)"/><Area type="monotone" dataKey="salidas" name="Salidas" stroke="#4F46E5" fill="url(#outbound)"/>
              </AreaChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Capital por diagnóstico" subtitle="Dónde está concentrado el dinero">
              <ResponsiveContainer width="100%" height={270}><PieChart><Pie data={healthData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>{healthData.map(row => <Cell key={row.health} fill={HEALTH_COLORS[row.health]}/>)}</Pie><ChartTooltip formatter={(value: number) => fmt(value)}/><Legend wrapperStyle={{ fontSize: 10 }}/></PieChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Capital por ubicación" subtitle="Almacenes y rutas con mayor inversión">
              <ResponsiveContainer width="100%" height={270}><BarChart data={warehouseCapital.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={shortMoney} tick={{ fontSize: 10 }}/><YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }}/><ChartTooltip formatter={(value: number) => fmt(value)}/><Bar dataKey="value" name="Capital" fill="#4F46E5" radius={[0, 5, 5, 0]}/></BarChart></ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Dinero que requiere atención</CardTitle></CardHeader><CardContent><CompactRiskTable rows={topStopped.slice(0, 8)} fmt={fmt}/></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Caducidades más urgentes</CardTitle></CardHeader><CardContent><CompactExpiryTable rows={expiryRisks.slice(0, 8)} fmt={fmt}/></CardContent></Card>
          </div>
          {lotCoverageDifference > 0 && <button onClick={() => setTab('caducidades')} className="flex w-full items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-bold">Hay {lotCoverageDifference} productos con diferencia entre stock general y stock por lote.</p><p className="text-xs">Revísalos antes de confiar en FEFO o en el monto por caducidad.</p></div></button>}
          {(productsWithoutCost > 0 || lotsWithoutExpiration > 0) && <div className="grid gap-3 lg:grid-cols-2">
            {productsWithoutCost > 0 && <button onClick={() => setTab('capital')} className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-950"><CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-bold">{productsWithoutCost} productos con existencia no tienen costo.</p><p className="text-xs">El capital total está subestimado hasta capturar esos costos.</p></div></button>}
            {lotsWithoutExpiration > 0 && <button onClick={() => { setExpirationStatus('sin_fecha'); setTab('caducidades'); }} className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-950"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-bold">{lotsWithoutExpiration} lotes con existencia no tienen caducidad.</p><p className="text-xs">No pueden entrar al semáforo FEFO hasta completar su fecha.</p></div></button>}
          </div>}
        </TabsContent>

        <TabsContent value="capital" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Distribución de capital" subtitle="Saludable, lento, detenido y riesgo"><ResponsiveContainer width="100%" height={280}><BarChart data={healthData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 10 }}/><YAxis tickFormatter={shortMoney} tick={{ fontSize: 10 }}/><ChartTooltip formatter={(value: number) => fmt(value)}/><Bar dataKey="value" name="Capital" radius={[6, 6, 0, 0]}>{healthData.map(row => <Cell key={row.health} fill={HEALTH_COLORS[row.health]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
            <Card><CardHeader><CardTitle className="text-base">Lectura ejecutiva</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
              <Insight icon={CircleDollarSign} title="Inversión actual" text={`${fmt(totals.inventoryValue)} valuado al costo; venta potencial ${fmt(totals.potentialValue)}.`}/>
              <Insight icon={Clock3} title="Dinero inmóvil" text={`${fmt(totals.stoppedCapital)} no muestra venta reciente dentro de la evidencia disponible.`}/>
              <Insight icon={TrendingUp} title="Margen potencial" text={`${fmt(totals.potentialMargin)} antes de descuentos, impuestos, mermas y gastos.`}/>
              <Insight icon={PackageCheck} title="Criterio" text="Capital detenido exige stock, cero ventas en el periodo y al menos 90 días desde la última evidencia disponible."/>
            </CardContent></Card>
          </div>
          <DataTable headers={[
            { label: 'Producto' }, { label: 'Stock', align: 'right' }, { label: 'Capital', align: 'right' },
            { label: `Vendido ${windowDays}d`, align: 'right' }, { label: 'Cobertura', align: 'center' },
            { label: 'Última venta', align: 'center' }, { label: 'Parado desde', align: 'center' }, { label: 'Diagnóstico', align: 'center' },
          ]} empty="No hay productos para mostrar.">
            {filtered.slice().sort((a, b) => b.inventoryValue - a.inventoryValue).map(product => <TableRow key={product.id}>
              <TableCell><ProductoCell product={product}/></TableCell><TableCell className="text-right tabular-nums">{fmtNum(product.stockTotal)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmt(product.inventoryValue)}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(product.soldUnits)}</TableCell><TableCell className="text-center tabular-nums">{product.coverageDays == null ? 'Sin demanda' : `${Math.round(product.coverageDays)} d`}</TableCell><TableCell className="text-center tabular-nums">{formatDate(product.lastSaleAt)}</TableCell><TableCell className="text-center tabular-nums">{product.health === 'detenido' ? `${product.idleDays} días` : '—'}</TableCell><TableCell className="text-center"><HealthBadge health={product.health}/></TableCell>
            </TableRow>)}
          </DataTable>
        </TabsContent>

        <TabsContent value="dimensiones" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(DIMENSION_CONFIG) as DimensionMode[]).map(mode => {
              const config = DIMENSION_CONFIG[mode];
              const rows = dimensionGroups[mode];
              const capital = rows.reduce((sum, row) => sum + row.capital, 0);
              const stopped = rows.reduce((sum, row) => sum + row.stoppedCapital, 0);
              return <button key={mode} onClick={() => setDimensionMode(mode)} className={cn('rounded-xl border bg-card p-4 text-left transition hover:border-primary/50', dimensionMode === mode && 'border-primary ring-2 ring-primary/15')}>
                <div className="flex items-center justify-between"><config.icon className="h-5 w-5 text-primary"/><Badge variant="outline">{rows.length}</Badge></div>
                <p className="mt-3 font-bold">{config.label}</p>
                <p className="mt-1 text-sm font-black">{fmt(capital)}</p>
                <p className="text-xs text-muted-foreground">Detenido: {fmt(stopped)}</p>
              </button>;
            })}
          </div>

          {dimensionMode === 'providerName' && <p className="text-xs text-muted-foreground">
            El análisis por proveedor utiliza el proveedor preferido de cada producto para evitar duplicar existencias y capital cuando un artículo tiene varias opciones de compra.
          </p>}

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title={`Capital por ${DIMENSION_CONFIG[dimensionMode].singular.toLowerCase()}`} subtitle="Capital total frente al capital sin movimiento">
              <ResponsiveContainer width="100%" height={Math.max(300, Math.min(520, activeDimensionGroups.slice(0, 12).length * 38))}>
                <BarChart data={activeDimensionGroups.slice(0, 12)} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={shortMoney} tick={{ fontSize: 10 }}/><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }}/>
                  <ChartTooltip formatter={(value: number) => fmt(value)}/><Legend/><Bar dataKey="capital" name="Capital total" fill="#4F46E5" radius={[0, 5, 5, 0]}/><Bar dataKey="stoppedCapital" name="Capital detenido" fill="#DC2626" radius={[0, 5, 5, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <Card><CardHeader><CardTitle className="text-base">Lectura del filtro actual</CardTitle></CardHeader><CardContent className="space-y-3">
              <Insight icon={Layers3} title="Productos analizados" text={`${fmtNum(filtered.length)} productos coinciden con la búsqueda y filtros activos.`}/>
              <Insight icon={Clock3} title="Sin movimiento" text={`${fmtNum(activeDimensionGroups.reduce((sum, row) => sum + row.noMovementProducts, 0))} productos tienen capital detenido por 90 días o más.`}/>
              <Insight icon={ShieldAlert} title="Requieren acción" text={`${fmtNum(activeDimensionGroups.reduce((sum, row) => sum + row.criticalProducts, 0))} productos están agotados, críticos o en punto de reorden.`}/>
            </CardContent></Card>
          </div>

          <DataTable headers={[
            { label: DIMENSION_CONFIG[dimensionMode].singular }, { label: 'Productos', align: 'right' }, { label: 'Unidades', align: 'right' },
            { label: 'Capital', align: 'right' }, { label: 'Capital detenido', align: 'right' }, { label: 'Sin movimiento', align: 'center' },
            { label: `Ingresos ${windowDays}d`, align: 'right' }, { label: 'Requieren acción', align: 'center' },
          ]} empty="No hay información para los filtros seleccionados.">
            {activeDimensionGroups.map(row => <TableRow key={row.name}>
              <TableCell className="font-semibold">{row.name}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(row.productCount)}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(row.stockUnits)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmt(row.capital)}</TableCell><TableCell className="text-right font-semibold text-destructive tabular-nums">{fmt(row.stoppedCapital)}</TableCell><TableCell className="text-center tabular-nums">{fmtNum(row.noMovementProducts)}</TableCell><TableCell className="text-right tabular-nums">{fmt(row.revenue)}</TableCell><TableCell className="text-center tabular-nums">{fmtNum(row.criticalProducts)}</TableCell>
            </TableRow>)}
          </DataTable>
        </TabsContent>

        <TabsContent value="caducidades" className="space-y-4">
          {lotRows.length === 0 ? <EmptyState icon={Boxes} title="No hay existencia registrada por lote" description="Los productos sin manejo de lotes siguen analizándose en Capital y Reabasto."/> : <>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Lotes por vencimiento" subtitle="Sólo lotes con existencia"><ResponsiveContainer width="100%" height={270}><PieChart><Pie data={expirationData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>{expirationData.map(row => <Cell key={row.health} fill={EXPIRATION_COLORS[row.health]}/>)}</Pie><ChartTooltip formatter={(value: number) => fmt(value)}/><Legend wrapperStyle={{ fontSize: 10 }}/></PieChart></ResponsiveContainer></ChartCard>
              <Card><CardHeader><CardTitle className="text-base">Semáforo FEFO</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{expirationData.map(row => <div key={row.health} className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: EXPIRATION_COLORS[row.health] }}/>{row.name}</div><div className="mt-2 text-xl font-black">{row.lots}</div><div className="text-xs text-muted-foreground">{fmt(row.value)}</div></div>)}</CardContent></Card>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-end">
              <div className="space-y-1">
                <label htmlFor="expiration-status" className="text-xs font-medium text-muted-foreground">Estado</label>
                <select id="expiration-status" value={expirationStatus} onChange={event => setExpirationStatus(event.target.value as typeof expirationStatus)} className="block h-9 min-w-44 rounded-md border bg-background px-3 text-sm">
                  <option value="todos">Todos los lotes</option>
                  <option value="riesgo">Vencidos o ≤ 30 días</option>
                  <option value="vencido">Sólo vencidos</option>
                  <option value="critico">De 0 a 7 días</option>
                  <option value="proximo">De 8 a 30 días</option>
                  <option value="vigilancia">De 31 a 90 días</option>
                  <option value="vigente">Más de 90 días</option>
                  <option value="sin_fecha">Sin fecha de caducidad</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="expiration-from" className="text-xs font-medium text-muted-foreground">Caduca desde</label>
                <input id="expiration-from" type="date" value={expirationFrom} onChange={event => setExpirationFrom(event.target.value)} className="block h-9 rounded-md border bg-background px-3 text-sm"/>
              </div>
              <div className="space-y-1">
                <label htmlFor="expiration-to" className="text-xs font-medium text-muted-foreground">Caduca hasta</label>
                <input id="expiration-to" type="date" value={expirationTo} onChange={event => setExpirationTo(event.target.value)} min={expirationFrom || undefined} className="block h-9 rounded-md border bg-background px-3 text-sm"/>
              </div>
              <div className="flex items-center gap-2 lg:ml-auto">
                <span className="text-xs text-muted-foreground">{fmtNum(visibleLots.length)} lotes · {fmt(visibleLots.reduce((sum, row) => sum + row.value, 0))}</span>
                {(expirationStatus !== 'todos' || expirationFrom || expirationTo) && <Button variant="ghost" size="sm" onClick={() => { setExpirationStatus('todos'); setExpirationFrom(''); setExpirationTo(''); }}>Limpiar</Button>}
              </div>
            </div>
            <DataTable headers={[
              { label: 'Caducidad', align: 'center' }, { label: 'Estado', align: 'center' }, { label: 'Producto / lote' },
              { label: 'Ubicación', align: 'center' }, { label: 'Existencia', align: 'right' }, { label: 'Capital en riesgo', align: 'right' },
            ]} empty="No hay lotes que coincidan con la búsqueda.">
              {visibleLots.map(row => <TableRow key={row.id} className={row.health === 'vencido' ? 'bg-destructive/5' : ''}><TableCell className="text-center font-semibold tabular-nums">{formatDate(row.expirationDate)}</TableCell><TableCell className="text-center"><ExpirationBadge health={row.health} days={row.days}/></TableCell><TableCell><ProductoLink id={row.productId}>{row.productName}</ProductoLink><div className="text-[11px] text-muted-foreground">{row.productCode} · Lote {row.lotCode}</div></TableCell><TableCell className="text-center">{row.warehouse}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(row.quantity)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmt(row.value)}</TableCell></TableRow>)}
            </DataTable>
          </>}
        </TabsContent>

        <TabsContent value="movimientos" className="space-y-4">
          <ChartCard title="Entradas y salidas" subtitle={`${windowDays} días · transferencias no alteran el total de la empresa`}><ResponsiveContainer width="100%" height={300}><AreaChart data={movementTrend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24}/><YAxis tick={{ fontSize: 10 }}/><ChartTooltip/><Legend/><Area dataKey="entradas" name="Entradas" stroke="#10B981" fill="#10B98122"/><Area dataKey="salidas" name="Salidas" stroke="#4F46E5" fill="#4F46E522"/><Area dataKey="transferencias" name="Transferencias" stroke="#F59E0B" fill="#F59E0B18"/></AreaChart></ResponsiveContainer></ChartCard>
          <DataTable headers={[
            { label: 'Fecha', align: 'center' }, { label: 'Tipo', align: 'center' }, { label: 'Producto' },
            { label: 'Cantidad', align: 'right' }, { label: 'Origen', align: 'center' }, { label: 'Destino', align: 'center' }, { label: 'Referencia / nota' },
          ]} empty="No hay movimientos en este periodo.">
            {recentMovements.slice(0, 500).map(movement => {
              const product = movement.producto_id ? productMap.get(movement.producto_id) : null;
              const referenceRoute = getMovementReferenceRoute(movement.referencia_tipo, movement.referencia_id);
              return <TableRow key={movement.id}><TableCell className="text-center tabular-nums">{formatDate(movement.fecha)}<div className="text-[10px] text-muted-foreground">{new Date(movement.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div></TableCell><TableCell className="text-center"><MovementBadge type={movement.tipo}/></TableCell><TableCell>{product ? <ProductoCell product={product}/> : 'Sin producto'}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmtNum(Math.abs(Number(movement.cantidad || 0)))}</TableCell><TableCell className="text-center">{movement.almacen_origen_id ? warehouseMap.get(movement.almacen_origen_id)?.nombre || 'Almacén' : 'Externo'}</TableCell><TableCell className="text-center">{movement.almacen_destino_id ? warehouseMap.get(movement.almacen_destino_id)?.nombre || 'Almacén' : 'Externo'}</TableCell><TableCell>{referenceRoute ? <Link to={referenceRoute} className="text-xs font-medium text-primary hover:underline">{movement.referencia_tipo}</Link> : <span className="text-xs font-medium">{movement.referencia_tipo || 'Movimiento manual'}</span>}{movement.notas && <div className="max-w-xs truncate text-[10px] text-muted-foreground">{movement.notas}</div>}</TableCell></TableRow>;
            })}
          </DataTable>
          {(history.data?.movementCount || 0) > 500 && <p className="text-center text-xs text-muted-foreground">Se muestran los 500 movimientos más recientes de {fmtNum(history.data?.movementCount || 0)}. Usa la exportación o el Kardex para el detalle completo.</p>}
        </TabsContent>

        <TabsContent value="reabasto" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(Object.keys(HEALTH_LABELS) as InventoryHealth[]).filter(health => ['agotado', 'critico', 'reorden', 'saludable'].includes(health)).map(health => <Card key={health}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{HEALTH_LABELS[health]}</div><div className="mt-2 text-2xl font-black" style={{ color: HEALTH_COLORS[health] }}>{analytics.filter(product => product.health === health).length}</div></CardContent></Card>)}
          </div>
          <DataTable headers={[
            { label: 'Prioridad', align: 'center' }, { label: 'Producto' }, { label: 'Stock', align: 'right' },
            { label: 'Venta/día', align: 'right' }, { label: 'Cobertura', align: 'center' }, { label: 'Punto reorden', align: 'right' },
            { label: 'Compra sugerida', align: 'right', className: 'min-w-[140px]' }, { label: 'Acción', align: 'center', className: 'min-w-[130px]' },
          ]} empty="No hay productos que requieran reabasto.">
            {restock.map(product => <TableRow key={product.id}><TableCell className="text-center"><HealthBadge health={product.health}/></TableCell><TableCell><ProductoCell product={product}/></TableCell><TableCell className="text-right tabular-nums">{fmtNum(product.stockTotal)}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(Math.round(product.avgDaily * 100) / 100)}</TableCell><TableCell className="text-center tabular-nums">{product.coverageDays == null ? '—' : `${Math.floor(product.coverageDays)} d`}</TableCell><TableCell className="text-right tabular-nums">{fmtNum(Math.ceil(product.reorderPoint))}</TableCell><TableCell className="min-w-[140px] text-right font-black text-primary tabular-nums">{fmtNum(product.suggestedPurchase)}</TableCell><TableCell className="min-w-[130px] text-center"><Link to="/almacen/compras/nuevo"><Button size="sm" variant="outline" disabled={product.suggestedPurchase <= 0}><ShoppingCart className="mr-1 h-3.5 w-3.5"/>Comprar</Button></Link></TableCell></TableRow>)}
          </DataTable>
        </TabsContent>

        <TabsContent value="abc" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 text-sm"><b>A</b> concentra aproximadamente el primer 80% de ingresos, <b>B</b> el siguiente 15% y <b>C</b> el restante. El producto que cruza cada umbral conserva la clase que ayudó a completar.</div>
          <DataTable headers={[
            { label: 'Clase', align: 'center' }, { label: 'Producto' }, { label: `Unidades ${windowDays}d`, align: 'right' },
            { label: `Ingresos ${windowDays}d`, align: 'right' }, { label: '% acumulado', align: 'right' },
            { label: 'Stock', align: 'right' }, { label: 'Capital', align: 'right' }, { label: 'Diagnóstico', align: 'center' },
          ]} empty="No hay ventas suficientes para clasificar.">
            {abc.filter(product => {
              const matchesSearch = !normalizedSearch || product.nombre.toLowerCase().includes(normalizedSearch) || product.codigo.toLowerCase().includes(normalizedSearch);
              return matchesSearch
                && (healthFilter === 'todos' || product.health === healthFilter)
                && (categoryFilter === 'todos' || product.categoryName === categoryFilter)
                && (brandFilter === 'todos' || product.brandName === brandFilter)
                && (providerFilter === 'todos' || product.providerName === providerFilter);
            }).map(product => <TableRow key={product.id}><TableCell className="text-center"><Badge className={cn(product.abcClass === 'A' && 'bg-emerald-600', product.abcClass === 'B' && 'bg-amber-500', product.abcClass === 'C' && 'bg-slate-500')}>{product.abcClass}</Badge></TableCell><TableCell><ProductoCell product={product}/></TableCell><TableCell className="text-right tabular-nums">{fmtNum(product.soldUnits)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmt(product.revenue)}</TableCell><TableCell className="text-right tabular-nums">{(product.cumulativePct * 100).toFixed(1)}%</TableCell><TableCell className="text-right tabular-nums">{fmtNum(product.stockTotal)}</TableCell><TableCell className="text-right tabular-nums">{fmt(product.inventoryValue)}</TableCell><TableCell className="text-center"><HealthBadge health={product.health}/></TableCell></TableRow>)}
          </DataTable>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle><p className="text-xs text-muted-foreground">{subtitle}</p></CardHeader><CardContent className="px-2 pb-3">{children}</CardContent></Card>;
}

function Insight({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return <div className="flex gap-3 rounded-lg border bg-muted/20 p-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><div><p className="font-semibold">{title}</p><p className="text-xs leading-5 text-muted-foreground">{text}</p></div></div>;
}

type DataTableHeader = { label: string; align?: 'left' | 'center' | 'right'; className?: string };

function DataTable({ headers, children, empty }: { headers: DataTableHeader[]; children: React.ReactNode; empty: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="rounded-xl border bg-card max-md:overflow-x-auto md:overflow-visible"><table className="w-full caption-bottom text-sm"><TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_hsl(var(--border))]"><TableRow>{headers.map(header => <TableHead key={header.label} className={cn('whitespace-nowrap bg-card text-[11px]', header.align === 'center' && 'text-center', header.align === 'right' && 'text-right', header.className)}>{header.label}</TableHead>)}</TableRow></TableHeader><TableBody>{hasRows ? children : <TableRow><TableCell colSpan={headers.length} className="py-12 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow>}</TableBody></table></div>;
}

function ProductoCell({ product }: { product: Pick<IntelligenceProduct, 'id' | 'codigo' | 'nombre'> }) {
  return <div className="min-w-[180px]"><ProductoLink id={product.id}>{product.nombre}</ProductoLink><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span>{product.codigo}</span><Link to={`/almacen/kardex?prod=${product.id}`} className="inline-flex items-center gap-1 text-primary hover:underline"><History className="h-3 w-3"/>Kardex</Link></div></div>;
}

function HealthBadge({ health }: { health: InventoryHealth }) {
  return <Badge variant="outline" className="whitespace-nowrap" style={{ borderColor: `${HEALTH_COLORS[health]}66`, color: HEALTH_COLORS[health], background: `${HEALTH_COLORS[health]}12` }}>{HEALTH_LABELS[health]}</Badge>;
}

function ExpirationBadge({ health, days }: { health: ExpirationHealth; days: number | null }) {
  const detail = health === 'vencido' && days !== null ? `${Math.abs(days)} d vencido` : days === null ? EXPIRATION_LABELS[health] : `${days} días`;
  return <Badge variant="outline" className="whitespace-nowrap" style={{ borderColor: `${EXPIRATION_COLORS[health]}66`, color: EXPIRATION_COLORS[health], background: `${EXPIRATION_COLORS[health]}12` }}>{detail}</Badge>;
}

function MovementBadge({ type }: { type: Movement['tipo'] }) {
  if (type === 'entrada') return <Badge className="bg-emerald-600"><ArrowDownRight className="mr-1 h-3 w-3"/>Entrada</Badge>;
  if (type === 'salida') return <Badge className="bg-indigo-600"><ArrowUpRight className="mr-1 h-3 w-3"/>Salida</Badge>;
  return <Badge className="bg-amber-500"><Warehouse className="mr-1 h-3 w-3"/>Transferencia</Badge>;
}

function CompactRiskTable({ rows, fmt }: { rows: Array<ReturnType<typeof analyzeInventoryProduct> & IntelligenceProduct & { soldUnits: number; lastSaleAt: string | null }>; fmt: (value: number) => string }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No hay capital lento o detenido.</p>;
  return <div className="space-y-2">{rows.map(product => <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><ProductoLink id={product.id}>{product.nombre}</ProductoLink><p className="truncate text-[10px] text-muted-foreground">{product.lastSaleAt ? `Última venta ${formatDate(product.lastSaleAt)}` : `Sin venta · ${product.idleDays} días de evidencia`}</p></div><div className="text-right"><p className="font-bold">{fmt(product.inventoryValue)}</p><HealthBadge health={product.health}/></div></div>)}</div>;
}

function CompactExpiryTable({ rows, fmt }: { rows: Array<{ id: string; productId: string; productName: string; lotCode: string; expirationDate: string | null; health: ExpirationHealth; days: number | null; value: number }>; fmt: (value: number) => string }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No hay caducidades pendientes.</p>;
  return <div className="space-y-2">{rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><ProductoLink id={row.productId}>{row.productName}</ProductoLink><p className="text-[10px] text-muted-foreground">Lote {row.lotCode} · {formatDate(row.expirationDate)}</p></div><div className="text-right"><p className="font-bold">{fmt(row.value)}</p><ExpirationBadge health={row.health} days={row.days}/></div></div>)}</div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return <div className="rounded-xl border bg-card px-6 py-16 text-center"><Icon className="mx-auto h-10 w-10 text-muted-foreground/40"/><h3 className="mt-3 font-bold">{title}</h3><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{description}</p></div>;
}
