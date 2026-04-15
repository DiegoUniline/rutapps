import { useState, useCallback } from 'react';
import KardexUbicacionModal from '@/components/KardexUbicacionModal';
import HelpButton from '@/components/HelpButton';
import VideoHelpButton from '@/components/VideoHelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, Truck, Package, Search, TrendingUp, DollarSign, ChevronRight, ArrowLeft, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, fmtDate, fmtNum } from '@/lib/utils';
import { exportToExcel, type ExportColumn } from '@/lib/exportUtils';
import { useCurrency } from '@/hooks/useCurrency';

type ViewMode = 'resumen' | 'almacen' | 'rutas';

function useInventarioData() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['inventario-dashboard', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;

      // Products with warehouse stock
      const { data: productos } = await supabase
        .from('productos')
        .select('id, codigo, nombre, cantidad, costo, precio_principal, status, unidades:unidad_venta_id(abreviatura)')
        .eq('empresa_id', eid)
        .eq('status', 'activo')
        .order('nombre');

      // Almacenes
      const { data: almacenes } = await supabase
        .from('almacenes')
        .select('id, nombre, tipo')
        .eq('empresa_id', eid)
        .eq('activo', true)
        .order('nombre');

      // Per-warehouse stock
      const { data: stockAlmacenData } = await supabase
        .from('stock_almacen')
        .select('almacen_id, producto_id, cantidad')
        .eq('empresa_id', eid);

      // Build stock_almacen map: almacen_id -> producto_id -> cantidad
      const stockAlmacenMap: Record<string, Record<string, number>> = {};
      for (const sa of (stockAlmacenData ?? [])) {
        if (!stockAlmacenMap[sa.almacen_id]) stockAlmacenMap[sa.almacen_id] = {};
        stockAlmacenMap[sa.almacen_id][sa.producto_id] = sa.cantidad;
      }
      const hasWarehouseStock = (stockAlmacenData?.length ?? 0) > 0;

      const getStockByTipo = (productoId: string, tipo: 'almacen' | 'ruta') => {
        return (almacenes ?? [])
          .filter(a => ((a as any).tipo ?? 'almacen') === tipo)
          .reduce((sum, alm) => sum + (stockAlmacenMap[alm.id]?.[productoId] ?? 0), 0);
      };
      const getTotalStockEnUbicaciones = (productoId: string) => {
        if (!hasWarehouseStock) {
          return (productos ?? []).find(p => p.id === productoId)?.cantidad ?? 0;
        }
        return (almacenes ?? []).reduce((sum, alm) => sum + (stockAlmacenMap[alm.id]?.[productoId] ?? 0), 0);
      };

      // Build "Rutas activas" cards from almacenes tipo ruta
      const cargaDetails: any[] = [];
      for (const alm of (almacenes ?? [])) {
        const almStock = stockAlmacenMap[alm.id] ?? {};
        let totalUnidades = 0, valorCosto = 0, valorVenta = 0;
        const lineasDetalle: any[] = [];
        for (const [prodId, qty] of Object.entries(almStock)) {
          if ((qty as number) === 0) continue;
          totalUnidades += qty as number;
          const prod = (productos ?? []).find(p => p.id === prodId);
          valorCosto += (qty as number) * (prod?.costo ?? 0);
          valorVenta += (qty as number) * (prod?.precio_principal ?? 0);
          lineasDetalle.push({
            producto_id: prodId,
            codigo: prod?.codigo ?? '',
            nombre: prod?.nombre ?? '',
            cargado: qty,
            entregado: 0,
            devuelto: 0,
            abordo: qty,
            costo: prod?.costo ?? 0,
            precio: prod?.precio_principal ?? 0,
          });
        }
        if (totalUnidades > 0) {
          cargaDetails.push({
            id: `alm-${alm.id}`,
            origen: (alm as any).tipo === 'ruta' ? 'ruta' : 'almacen',
            vendedor: alm.nombre,
            vendedor_id: null,
            repartidor: null,
            almacen: alm.nombre,
            fecha: null,
            status: 'activo',
            totalUnidades,
            valorCosto,
            valorVenta,
            lineas: lineasDetalle.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)),
          });
        }
      }

      // Products with enriched data — all stock comes from stock_almacen only
      const productosEnriquecidos = (productos ?? []).map(p => {
        const stockAlmacen = getTotalStockEnUbicaciones(p.id);
        const stockTotal = stockAlmacen;
        const stockTipoAlmacen = hasWarehouseStock ? getStockByTipo(p.id, 'almacen') : stockAlmacen;
        const stockTipoRuta = hasWarehouseStock ? getStockByTipo(p.id, 'ruta') : 0;
        return {
          ...p,
          stockAlmacen,
          stockRuta: 0,
          stockTotal,
          stockTipoAlmacen,
          stockTipoRuta,
          valorCostoAlmacen: stockAlmacen * (p.costo ?? 0),
          valorVentaAlmacen: stockAlmacen * (p.precio_principal ?? 0),
          valorCostoTotal: stockTotal * (p.costo ?? 0),
          valorVentaTotal: stockTotal * (p.precio_principal ?? 0),
        };
      });

      // Totals
      const totales = productosEnriquecidos.reduce((acc, p) => ({
        stockAlmacen: acc.stockAlmacen + p.stockAlmacen,
        stockRuta: acc.stockRuta + p.stockRuta,
        stockTotal: acc.stockTotal + p.stockTotal,
        stockTipoAlmacen: acc.stockTipoAlmacen + p.stockTipoAlmacen,
        stockTipoRuta: acc.stockTipoRuta + p.stockTipoRuta,
        valorCostoAlmacen: acc.valorCostoAlmacen + p.valorCostoAlmacen,
        valorVentaAlmacen: acc.valorVentaAlmacen + p.valorVentaAlmacen,
        valorCostoTotal: acc.valorCostoTotal + p.valorCostoTotal,
        valorVentaTotal: acc.valorVentaTotal + p.valorVentaTotal,
        valorCostoTipoAlmacen: acc.valorCostoTipoAlmacen + p.stockTipoAlmacen * (p.costo ?? 0),
        valorCostoTipoRuta: acc.valorCostoTipoRuta + p.stockTipoRuta * (p.costo ?? 0),
        valorVentaTipoAlmacen: acc.valorVentaTipoAlmacen + p.stockTipoAlmacen * (p.precio_principal ?? 0),
        valorVentaTipoRuta: acc.valorVentaTipoRuta + p.stockTipoRuta * (p.precio_principal ?? 0),
      }), { stockAlmacen: 0, stockRuta: 0, stockTotal: 0, stockTipoAlmacen: 0, stockTipoRuta: 0, valorCostoAlmacen: 0, valorVentaAlmacen: 0, valorCostoTotal: 0, valorVentaTotal: 0, valorCostoTipoAlmacen: 0, valorCostoTipoRuta: 0, valorVentaTipoAlmacen: 0, valorVentaTipoRuta: 0 });

      return {
        productos: productosEnriquecidos,
        cargas: cargaDetails,
        totales,
        almacenes: almacenes ?? [],
        stockAlmacenMap,
      };
    },
  });
}

export default function InventarioPage() {
  const { data, isLoading } = useInventarioData();
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [view, setView] = useState<ViewMode>('resumen');
  const [search, setSearch] = useState('');
  const [selectedRuta, setSelectedRuta] = useState<any>(null);
  const [kardex, setKardex] = useState<{ productoId: string; productoNombre: string; ubicacionId: string; ubicacionNombre: string; ubicacionTipo: 'almacen' | 'camion'; stock: number } | null>(null);

  const filteredProducts = data?.productos.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportExcel = useCallback(() => {
    if (!data || !filteredProducts) return;

    if (view === 'resumen') {
      const columns: ExportColumn[] = [
        { key: 'codigo', header: 'Código', width: 14 },
        { key: 'nombre', header: 'Producto', width: 30 },
        { key: 'unidad', header: 'Ud.', width: 6 },
        { key: 'stockTotal', header: 'Stock Total', format: 'number', width: 12 },
        { key: 'valorCostoTotal', header: 'Valor costo', format: 'currency', width: 16 },
        { key: 'valorVentaTotal', header: 'Proyección', format: 'currency', width: 16 },
      ];
      const rows = filteredProducts.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        unidad: (p.unidades as any)?.abreviatura ?? 'pz',
        stockTotal: p.stockTotal,
        valorCostoTotal: p.valorCostoTotal,
        valorVentaTotal: p.valorVentaTotal,
      }));
      exportToExcel({
        fileName: 'Inventario_Stock_Total',
        title: 'Inventario — Stock Total',
        empresa: empresa?.nombre,
        columns,
        data: rows,
        totals: {
          stockTotal: data.totales.stockTotal,
          valorCostoTotal: data.totales.valorCostoTotal,
          valorVentaTotal: data.totales.valorVentaTotal,
        },
      });
    } else if (view === 'almacen') {
      const ubicaciones = (data.almacenes ?? []).map(a => ({
        id: a.id,
        nombre: a.nombre,
        tipo: ((a as any).tipo ?? 'almacen') as string,
      }));
      const columns: ExportColumn[] = [
        { key: 'codigo', header: 'Código', width: 14 },
        { key: 'nombre', header: 'Producto', width: 30 },
        ...ubicaciones.map(u => ({
          key: `ubic_${u.id}`,
          header: `${u.nombre} (${u.tipo === 'ruta' ? 'Ruta' : 'Almacén'})`,
          format: 'number' as const,
          width: 14,
        })),
        { key: 'total', header: 'Total', format: 'number' as const, width: 12 },
        { key: 'costo', header: 'Costo unit.', format: 'currency' as const, width: 14 },
        { key: 'valorTotal', header: 'Valor total', format: 'currency' as const, width: 16 },
      ];
      const rows = filteredProducts.map(p => {
        const row: Record<string, any> = { codigo: p.codigo, nombre: p.nombre };
        let total = 0;
        for (const u of ubicaciones) {
          const qty = data.stockAlmacenMap[u.id]?.[p.id] ?? 0;
          row[`ubic_${u.id}`] = qty;
          total += qty;
        }
        row.total = total;
        row.costo = p.costo ?? 0;
        row.valorTotal = total * (p.costo ?? 0);
        return row;
      });
      const totals: Record<string, number> = {};
      for (const u of ubicaciones) {
        totals[`ubic_${u.id}`] = filteredProducts.reduce((s, p) => s + (data.stockAlmacenMap[u.id]?.[p.id] ?? 0), 0);
      }
      totals.total = filteredProducts.reduce((s, p) => s + ubicaciones.reduce((ss, u) => ss + (data.stockAlmacenMap[u.id]?.[p.id] ?? 0), 0), 0);
      totals.valorTotal = filteredProducts.reduce((s, p) => {
        const t = ubicaciones.reduce((ss, u) => ss + (data.stockAlmacenMap[u.id]?.[p.id] ?? 0), 0);
        return s + t * (p.costo ?? 0);
      }, 0);
      exportToExcel({
        fileName: 'Inventario_Por_Ubicacion',
        title: 'Inventario — Por Ubicación',
        empresa: empresa?.nombre,
        columns,
        data: rows,
        totals,
      });
    }
  }, [data, filteredProducts, view, empresa]);

  const tabs: { key: ViewMode; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Stock Total', icon: Package },
    { key: 'almacen', label: 'Ubicaciones', icon: Warehouse },
    { key: 'rutas', label: 'Rutas activas', icon: Truck },
  ];

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Warehouse className="h-5 w-5" /> Inventario
        <HelpButton title={HELP.inventario.title} sections={HELP.inventario.sections} />
        <VideoHelpButton module="inventario" />
      </h1>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={Warehouse} label="Almacenes" value={`${fmtNum(data.totales.stockTipoAlmacen)} uds`} sub={`Costo: $ ${fmt(data.totales.valorCostoTipoAlmacen)}`} color="text-primary" />
          <SummaryCard icon={Truck} label="Rutas" value={`${fmtNum(data.totales.stockTipoRuta)} uds`} sub={`Costo: $ ${fmt(data.totales.valorCostoTipoRuta)}`} color="text-warning" />
          <SummaryCard icon={DollarSign} label="Valor total (costo)" value={`$ ${fmt(data.totales.valorCostoTotal)}`} sub={`${fmtNum(data.totales.stockTotal)} unidades totales`} color="text-success" />
          <SummaryCard icon={TrendingUp} label="Proyección ventas" value={`$ ${fmt(data.totales.valorVentaTotal)}`} sub={`Margen: $ ${fmt(data.totales.valorVentaTotal - data.totales.valorCostoTotal)}`} color="text-accent-foreground" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
                view === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {(view === 'resumen' || view === 'almacen') && data && (
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg border font-medium transition-colors mb-1"
            style={{ backgroundColor: '#217346', borderColor: '#1a5c38', color: '#fff' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a5c38')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#217346')}
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        )}
      </div>

      {/* Search */}
      {view !== 'rutas' && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar producto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Resumen view */}
      {view === 'resumen' && data && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Código</TableHead>
                <TableHead className="text-[11px]">Producto</TableHead>
                <TableHead className="text-[11px] text-center">Ud.</TableHead>
                <TableHead className="text-[11px] text-center font-bold">Stock Total</TableHead>
                <TableHead className="text-[11px] text-right">Valor costo</TableHead>
                <TableHead className="text-[11px] text-right">Proyección</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
                  <TableCell className="text-[12px] font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-center text-[11px] text-muted-foreground">{(p.unidades as any)?.abreviatura ?? 'pz'}</TableCell>
                  <TableCell className="text-center font-bold">{fmtNum(p.stockTotal)}</TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.valorCostoTotal)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">$ {fmt(p.valorVentaTotal)}</TableCell>
                </TableRow>
              ))}
              {filteredProducts && filteredProducts.length > 0 && (
                <TableRow className="bg-card font-bold">
                  <TableCell colSpan={3}>Totales</TableCell>
                  <TableCell className="text-center">{fmtNum(data.totales.stockTotal)}</TableCell>
                  <TableCell className="text-right">$ {fmt(data.totales.valorCostoTotal)}</TableCell>
                  <TableCell className="text-right text-success">$ {fmt(data.totales.valorVentaTotal)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Almacen view */}
      {view === 'almacen' && data && (() => {
        // Only almacenes (includes tipo almacen and tipo ruta)
        const ubicaciones = (data.almacenes ?? []).map(a => ({
          id: a.id,
          nombre: a.nombre,
          tipo: ((a as any).tipo ?? 'almacen') as 'almacen' | 'ruta',
          icon: ((a as any).tipo === 'ruta' ? Truck : Warehouse) as typeof Warehouse,
          getStock: (prodId: string) => data.stockAlmacenMap[a.id]?.[prodId] ?? 0,
        }));

        return (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] sticky left-0 bg-card z-10">Código</TableHead>
                <TableHead className="text-[11px] sticky left-[70px] bg-card z-10">Producto</TableHead>
                {ubicaciones.map(u => (
                  <TableHead key={u.id} className="text-[11px] text-center whitespace-nowrap">
                    <u.icon className={cn("h-3 w-3 inline mr-0.5", u.tipo === 'ruta' ? "text-warning" : "text-primary")} />
                    {u.nombre}
                    <span className={cn("ml-1 text-[9px] px-1 py-0.5 rounded", u.tipo === 'ruta' ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary")}>
                      {u.tipo === 'ruta' ? 'Ruta' : 'Almacén'}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-[11px] text-center font-bold">Total</TableHead>
                <TableHead className="text-[11px] text-right">Costo unit.</TableHead>
                <TableHead className="text-[11px] text-right">Valor total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => {
                const totalUbic = ubicaciones.reduce((s, u) => s + u.getStock(p.id), 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground sticky left-0 bg-card">{p.codigo}</TableCell>
                    <TableCell className="text-[12px] font-medium sticky left-[70px] bg-card">{p.nombre}</TableCell>
                    {ubicaciones.map(u => {
                      const qty = u.getStock(p.id);
                      return (
                        <TableCell key={u.id} className={cn("text-center font-medium relative group/cell", qty <= 0 ? "text-muted-foreground" : u.tipo === 'ruta' ? "text-warning" : "")}>
                          {qty !== 0 ? <span className={cn(qty < 0 && "text-destructive")}>{fmtNum(qty)}</span> : '—'}
                          <button
                              onClick={() => setKardex({
                                productoId: p.id,
                                productoNombre: p.nombre,
                                ubicacionId: u.id,
                                ubicacionNombre: u.nombre,
                                ubicacionTipo: u.tipo === 'ruta' ? 'camion' : 'almacen',
                                stock: qty,
                              })}
                              className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition-opacity text-[11px] hover:bg-accent rounded p-0.5"
                              title="Ver kardex de ubicación"
                            >
                              📋
                            </button>
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn("text-center font-bold", totalUbic <= 0 ? "text-destructive" : "")}>
                      {fmtNum(totalUbic)}
                    </TableCell>
                    <TableCell className="text-right text-[12px]">$ {fmt(p.costo ?? 0)}</TableCell>
                    <TableCell className="text-right text-[12px]">$ {fmt(totalUbic * (p.costo ?? 0))}</TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts && filteredProducts.length > 0 && (
                <TableRow className="bg-card font-bold">
                  <TableCell colSpan={2} className="sticky left-0 bg-card">Totales</TableCell>
                  {ubicaciones.map(u => {
                    const total = filteredProducts.reduce((s, p) => s + u.getStock(p.id), 0);
                    return <TableCell key={u.id} className={cn("text-center", u.tipo === 'ruta' ? "text-warning" : "")}>{fmtNum(total)}</TableCell>;
                  })}
                  <TableCell className="text-center">{fmtNum(filteredProducts.reduce((s, p) => s + ubicaciones.reduce((ss, u) => ss + u.getStock(p.id), 0), 0))}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">$ {fmt(filteredProducts.reduce((s, p) => {
                    const totalUbic = ubicaciones.reduce((ss, u) => ss + u.getStock(p.id), 0);
                    return s + totalUbic * (p.costo ?? 0);
                  }, 0))}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        );
      })()}

      {/* Rutas view */}
      {view === 'rutas' && data && !selectedRuta && (
        <div className="space-y-3">
          {data.cargas.filter(c => c.totalUnidades !== 0 && c.origen === 'ruta').length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No hay rutas activas</p>
            </div>
          )}
          {data.cargas.filter(c => c.totalUnidades !== 0 && c.origen === 'ruta').map(c => (
            <div
              key={c.id}
              className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelectedRuta(c)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    <Truck className="h-4 w-4 inline mr-1 text-warning" />
                    {c.vendedor}
                    {c.repartidor && c.repartidor !== c.vendedor && (
                      <span className="text-muted-foreground font-normal"> · Rep: {c.repartidor}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.almacen && `Almacén: ${c.almacen} · `}{fmtDate(c.fecha)} ·{' '}
                    <Badge variant="secondary" className="text-[10px] py-0">
                      {c.status === 'en_ruta' ? 'En ruta' : c.status === 'cargado' ? 'Cargado' : 'Pendiente'}
                    </Badge>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{fmtNum(c.totalUnidades)} uds abordo</p>
                    <p className="text-sm font-bold text-foreground">$ {fmt(c.valorCosto)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}

          {data.cargas.filter(c => c.totalUnidades !== 0 && c.origen === 'ruta').length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-foreground">Total en rutas</p>
                <div className="text-right">
                  <p className="text-sm font-bold">Costo: $ {fmt(data.cargas.filter(c => c.totalUnidades !== 0 && c.origen === 'ruta').reduce((s, c) => s + c.valorCosto, 0))}</p>
                  <p className="text-sm text-success font-bold">Proyección: $ {fmt(data.cargas.filter(c => c.totalUnidades !== 0 && c.origen === 'ruta').reduce((s, c) => s + c.valorVenta, 0))}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ruta detail view */}
      {view === 'rutas' && selectedRuta && (
        <RutaDetail ruta={selectedRuta} onBack={() => setSelectedRuta(null)} />
      )}

      {kardex && (
        <KardexUbicacionModal
          open={!!kardex}
          onClose={() => setKardex(null)}
          productoId={kardex.productoId}
          productoNombre={kardex.productoNombre}
          ubicacionId={kardex.ubicacionId}
          ubicacionNombre={kardex.ubicacionNombre}
          ubicacionTipo={kardex.ubicacionTipo}
          stockActual={kardex.stock}
        />
      )}
    </div>
  );
}

function RutaDetail({ ruta, onBack }: { ruta: any; onBack: () => void }) {
  const { fmt } = useCurrency();
  const lineas: any[] = ruta.lineas ?? [];
  const totalCargado = lineas.reduce((s: number, l: any) => s + l.cargado, 0);
  const totalEntregado = lineas.reduce((s: number, l: any) => s + l.entregado, 0);
  const totalDevuelto = lineas.reduce((s: number, l: any) => s + l.devuelto, 0);
  const totalAbordo = lineas.reduce((s: number, l: any) => s + l.abordo, 0);
  const totalValorCosto = lineas.reduce((s: number, l: any) => s + l.abordo * l.costo, 0);
  const totalValorVenta = lineas.reduce((s: number, l: any) => s + l.abordo * l.precio, 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Volver a rutas
      </Button>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-foreground flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> {ruta.vendedor}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {ruta.almacen && `Almacén: ${ruta.almacen} · `}{fmtDate(ruta.fecha)} ·{' '}
              <Badge variant="secondary" className="text-[10px] py-0">
                {ruta.status === 'en_ruta' ? 'En ruta' : ruta.status === 'cargado' ? 'Cargado' : 'Pendiente'}
              </Badge>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cargado</p>
            <p className="text-lg font-bold text-foreground">{fmtNum(totalCargado)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entregado</p>
            <p className="text-lg font-bold text-success">{fmtNum(totalEntregado)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Devuelto</p>
            <p className="text-lg font-bold text-warning">{fmtNum(totalDevuelto)}</p>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <p className="text-[10px] text-primary uppercase tracking-wide font-medium">Abordo</p>
            <p className="text-lg font-bold text-primary">{fmtNum(totalAbordo)}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Código</TableHead>
              <TableHead className="text-[11px]">Producto</TableHead>
              <TableHead className="text-[11px] text-center">Cargado</TableHead>
              <TableHead className="text-[11px] text-center">Entregado</TableHead>
              <TableHead className="text-[11px] text-center">Devuelto</TableHead>
              <TableHead className="text-[11px] text-center font-bold">Abordo</TableHead>
              <TableHead className="text-[11px] text-right">Valor costo</TableHead>
              <TableHead className="text-[11px] text-right">Valor venta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sin productos en esta ruta
                </TableCell>
              </TableRow>
            )}
            {lineas.map((l: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{l.codigo}</TableCell>
                <TableCell className="text-[12px] font-medium">{l.nombre}</TableCell>
                 <TableCell className="text-center">{fmtNum(l.cargado)}</TableCell>
                <TableCell className={cn("text-center", l.entregado > 0 ? "text-success font-medium" : "text-muted-foreground")}>
                  {fmtNum(l.entregado)}
                </TableCell>
                <TableCell className={cn("text-center", l.devuelto > 0 ? "text-warning font-medium" : "text-muted-foreground")}>
                  {fmtNum(l.devuelto)}
                </TableCell>
                <TableCell className="text-center font-bold text-primary">{fmtNum(l.abordo)}</TableCell>
                <TableCell className="text-right text-[12px]">$ {fmt(l.abordo * l.costo)}</TableCell>
                <TableCell className="text-right text-[12px] text-success">$ {fmt(l.abordo * l.precio)}</TableCell>
              </TableRow>
            ))}
            {lineas.length > 0 && (
              <TableRow className="bg-card font-bold">
                <TableCell colSpan={2}>Totales</TableCell>
                 <TableCell className="text-center">{fmtNum(totalCargado)}</TableCell>
                <TableCell className="text-center text-success">{fmtNum(totalEntregado)}</TableCell>
                <TableCell className="text-center text-warning">{fmtNum(totalDevuelto)}</TableCell>
                <TableCell className="text-center text-primary">{fmtNum(totalAbordo)}</TableCell>
                <TableCell className="text-right">$ {fmt(totalValorCosto)}</TableCell>
                <TableCell className="text-right text-success">$ {fmt(totalValorVenta)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
