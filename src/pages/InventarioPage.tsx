import { useState } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, Truck, Package, Search, TrendingUp, DollarSign, ChevronRight, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, fmtDate } from '@/lib/utils';

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
        .select('id, nombre')
        .eq('empresa_id', eid)
        .eq('activo', true)
        .order('nombre');

      // Per-warehouse stock
      const { data: stockAlmacenData } = await supabase
        .from('stock_almacen')
        .select('almacen_id, producto_id, cantidad')
        .eq('empresa_id', eid);

      // Active cargas (en_ruta) with their lines
      const { data: cargas } = await supabase
        .from('cargas')
        .select('id, vendedor_id, vendedores!cargas_vendedor_id_fkey(nombre), repartidor:repartidor_id(nombre), almacen:almacen_id(nombre), fecha, status, carga_lineas(producto_id, cantidad_cargada, cantidad_vendida, cantidad_devuelta)')
        .eq('empresa_id', eid)
        .in('status', ['en_ruta', 'pendiente'] as any)
        .order('fecha', { ascending: false });

      // Stock camión from entregas cargadas
      const { data: stockCamion } = await supabase
        .from('stock_camion')
        .select('id, vendedor_id, producto_id, cantidad_inicial, cantidad_actual, fecha, vendedores:vendedor_id(nombre)')
        .eq('empresa_id', eid)
        .gt('cantidad_actual', 0);

      // Build route stock map: producto_id -> qty on route
      // AND per-route breakdown: rutaId -> { vendedor, stockByProduct }
      const rutaStock: Record<string, number> = {};
      const cargaDetails: any[] = [];
      const rutaBreakdown: Record<string, { vendedor: string; stockByProduct: Record<string, number> }> = {};

      for (const c of (cargas ?? [])) {
        let cargaTotal = 0;
        let cargaValorCosto = 0;
        let cargaValorVenta = 0;
        const rutaKey = c.vendedor_id ?? c.id;
        const vendedorNombre = (c.vendedores as any)?.nombre ?? '—';
        if (!rutaBreakdown[rutaKey]) rutaBreakdown[rutaKey] = { vendedor: vendedorNombre, stockByProduct: {} };

        const lineasDetalle: any[] = [];
        for (const cl of (c.carga_lineas ?? [])) {
          const enRuta = cl.cantidad_cargada - cl.cantidad_vendida - cl.cantidad_devuelta;
          const qty = Math.max(0, enRuta);
          rutaStock[cl.producto_id] = (rutaStock[cl.producto_id] ?? 0) + qty;
          rutaBreakdown[rutaKey].stockByProduct[cl.producto_id] = (rutaBreakdown[rutaKey].stockByProduct[cl.producto_id] ?? 0) + qty;
          const prod = (productos ?? []).find(p => p.id === cl.producto_id);
          cargaTotal += qty;
          cargaValorCosto += qty * (prod?.costo ?? 0);
          cargaValorVenta += qty * (prod?.precio_principal ?? 0);
          lineasDetalle.push({
            producto_id: cl.producto_id,
            codigo: prod?.codigo ?? '',
            nombre: prod?.nombre ?? '',
            cargado: cl.cantidad_cargada,
            entregado: cl.cantidad_vendida,
            devuelto: cl.cantidad_devuelta,
            abordo: qty,
            costo: prod?.costo ?? 0,
            precio: prod?.precio_principal ?? 0,
          });
        }
        cargaDetails.push({
          id: c.id,
          origen: 'carga',
          vendedor: vendedorNombre,
          vendedor_id: c.vendedor_id,
          repartidor: (c.repartidor as any)?.nombre,
          almacen: (c.almacen as any)?.nombre,
          fecha: c.fecha,
          status: c.status,
          totalUnidades: cargaTotal,
          valorCosto: cargaValorCosto,
          valorVenta: cargaValorVenta,
          lineas: lineasDetalle,
        });
      }

      // Group stock_camion by vendedor
      const scByVendedor: Record<string, { vendedor: string; items: typeof stockCamion }> = {};
      for (const sc of (stockCamion ?? [])) {
        const vid = sc.vendedor_id;
        if (!scByVendedor[vid]) {
          scByVendedor[vid] = { vendedor: (sc.vendedores as any)?.nombre ?? '—', items: [] };
        }
        scByVendedor[vid].items!.push(sc);
        const qty = Math.max(0, sc.cantidad_actual);
        rutaStock[sc.producto_id] = (rutaStock[sc.producto_id] ?? 0) + qty;
        // Per-route breakdown
        if (!rutaBreakdown[vid]) rutaBreakdown[vid] = { vendedor: (sc.vendedores as any)?.nombre ?? '—', stockByProduct: {} };
        rutaBreakdown[vid].stockByProduct[sc.producto_id] = (rutaBreakdown[vid].stockByProduct[sc.producto_id] ?? 0) + qty;
      }

      // Add stock_camion groups as route cards (avoid duplicating cargas vendedores)
      const cargaVendedorIds = new Set((cargas ?? []).map(c => c.vendedor_id));
      for (const [vid, group] of Object.entries(scByVendedor)) {
        if (cargaVendedorIds.has(vid)) continue;
        let total = 0, valCosto = 0, valVenta = 0;
        const lineasDetalle: any[] = [];
        for (const sc of group.items ?? []) {
          const qty = Math.max(0, sc.cantidad_actual);
          total += qty;
          const prod = (productos ?? []).find(p => p.id === sc.producto_id);
          valCosto += qty * (prod?.costo ?? 0);
          valVenta += qty * (prod?.precio_principal ?? 0);
          lineasDetalle.push({
            producto_id: sc.producto_id,
            codigo: prod?.codigo ?? '',
            nombre: prod?.nombre ?? '',
            cargado: sc.cantidad_inicial,
            entregado: sc.cantidad_inicial - sc.cantidad_actual,
            devuelto: 0,
            abordo: qty,
            costo: prod?.costo ?? 0,
            precio: prod?.precio_principal ?? 0,
          });
        }
        cargaDetails.push({
          id: `sc-${vid}`,
          origen: 'entrega',
          vendedor: group.vendedor,
          vendedor_id: vid,
          repartidor: null,
          almacen: null,
          fecha: (group.items ?? [])[0]?.fecha,
          status: 'cargado',
          totalUnidades: total,
          valorCosto: valCosto,
          valorVenta: valVenta,
          lineas: lineasDetalle,
        });
      }

      // Build stock_almacen map: almacen_id -> producto_id -> cantidad
      const stockAlmacenMap: Record<string, Record<string, number>> = {};
      for (const sa of (stockAlmacenData ?? [])) {
        if (!stockAlmacenMap[sa.almacen_id]) stockAlmacenMap[sa.almacen_id] = {};
        stockAlmacenMap[sa.almacen_id][sa.producto_id] = sa.cantidad;
      }

      // Also include almacenes with stock as "route" cards
      for (const alm of (almacenes ?? [])) {
        const almStock = stockAlmacenMap[alm.id] ?? {};
        let totalUnidades = 0, valorCosto = 0, valorVenta = 0;
        const lineasDetalle: any[] = [];
        for (const [prodId, qty] of Object.entries(almStock)) {
          if ((qty as number) <= 0) continue;
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
            origen: 'almacen',
            vendedor: alm.nombre,
            vendedor_id: null,
            repartidor: null,
            almacen: alm.nombre,
            fecha: null,
            status: 'activo',
            totalUnidades,
            valorCosto,
            valorVenta,
            lineas: lineasDetalle,
          });
        }
      }

      // Build sorted list of routes for columns
      const rutas = Object.entries(rutaBreakdown)
        .map(([id, r]) => ({ id, vendedor: r.vendedor, stockByProduct: r.stockByProduct }))
        .sort((a, b) => a.vendedor.localeCompare(b.vendedor));

      // Products with enriched data
      const productosEnriquecidos = (productos ?? []).map(p => {
        const stockAlmacen = p.cantidad ?? 0;
        const stockRuta = rutaStock[p.id] ?? 0;
        const stockTotal = stockAlmacen + stockRuta;
        return {
          ...p,
          stockAlmacen,
          stockRuta,
          stockTotal,
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
        valorCostoAlmacen: acc.valorCostoAlmacen + p.valorCostoAlmacen,
        valorVentaAlmacen: acc.valorVentaAlmacen + p.valorVentaAlmacen,
        valorCostoTotal: acc.valorCostoTotal + p.valorCostoTotal,
        valorVentaTotal: acc.valorVentaTotal + p.valorVentaTotal,
      }), { stockAlmacen: 0, stockRuta: 0, stockTotal: 0, valorCostoAlmacen: 0, valorVentaAlmacen: 0, valorCostoTotal: 0, valorVentaTotal: 0 });

      return {
        productos: productosEnriquecidos,
        cargas: cargaDetails,
        totales,
        rutas,
        almacenes: almacenes ?? [],
        stockAlmacenMap,
      };
    },
  });
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventarioPage() {
  const { data, isLoading } = useInventarioData();
  const [view, setView] = useState<ViewMode>('resumen');
  const [search, setSearch] = useState('');
  const [selectedRuta, setSelectedRuta] = useState<any>(null);

  const filteredProducts = data?.productos.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { key: ViewMode; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Almacén General', icon: Package },
    { key: 'almacen', label: 'Ubicaciones', icon: Warehouse },
    { key: 'rutas', label: 'Rutas activas', icon: Truck },
  ];

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Warehouse className="h-5 w-5" /> Inventario
        <HelpButton title={HELP.inventario.title} sections={HELP.inventario.sections} />
      </h1>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={Warehouse} label="En almacén" value={`${data.totales.stockAlmacen} uds`} sub={`Costo: $ ${fmt(data.totales.valorCostoAlmacen)}`} color="text-primary" />
          <SummaryCard icon={Truck} label="En ruta" value={`${data.totales.stockRuta} uds`} sub={`Costo: $ ${fmt(data.totales.valorCostoTotal - data.totales.valorCostoAlmacen)}`} color="text-warning" />
          <SummaryCard icon={DollarSign} label="Valor total (costo)" value={`$ ${fmt(data.totales.valorCostoTotal)}`} sub={`${data.totales.stockTotal} unidades totales`} color="text-success" />
          <SummaryCard icon={TrendingUp} label="Proyección ventas" value={`$ ${fmt(data.totales.valorVentaTotal)}`} sub={`Margen: $ ${fmt(data.totales.valorVentaTotal - data.totales.valorCostoTotal)}`} color="text-accent-foreground" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
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
                <TableHead className="text-[11px] sticky left-0 bg-card z-10">Código</TableHead>
                <TableHead className="text-[11px] sticky left-[70px] bg-card z-10">Producto</TableHead>
                <TableHead className="text-[11px] text-center">Ud.</TableHead>
                <TableHead className="text-[11px] text-center">
                  <Warehouse className="h-3 w-3 inline mr-0.5" />Almacén
                </TableHead>
                {(data.rutas ?? []).map(r => (
                  <TableHead key={r.id} className="text-[11px] text-center whitespace-nowrap">
                    <Truck className="h-3 w-3 inline mr-0.5 text-warning" />{r.vendedor}
                  </TableHead>
                ))}
                <TableHead className="text-[11px] text-center font-bold">Total</TableHead>
                <TableHead className="text-[11px] text-right">Valor costo</TableHead>
                <TableHead className="text-[11px] text-right">Proyección</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground sticky left-0 bg-card">{p.codigo}</TableCell>
                  <TableCell className="text-[12px] font-medium sticky left-[70px] bg-card">{p.nombre}</TableCell>
                  <TableCell className="text-center text-[11px] text-muted-foreground">{(p.unidades as any)?.abreviatura ?? 'pz'}</TableCell>
                  <TableCell className="text-center">{p.stockAlmacen}</TableCell>
                  {(data.rutas ?? []).map(r => {
                    const qty = r.stockByProduct[p.id] ?? 0;
                    return (
                      <TableCell key={r.id} className={cn("text-center", qty > 0 ? "text-warning font-medium" : "text-muted-foreground")}>
                        {qty || '—'}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-bold">{p.stockTotal}</TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.valorCostoTotal)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">$ {fmt(p.valorVentaTotal)}</TableCell>
                </TableRow>
              ))}
              {filteredProducts && filteredProducts.length > 0 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="sticky left-0 bg-muted/50">Totales</TableCell>
                  <TableCell className="text-center">{data.totales.stockAlmacen}</TableCell>
                  {(data.rutas ?? []).map(r => {
                    const total = Object.values(r.stockByProduct).reduce((s, v) => s + v, 0);
                    return <TableCell key={r.id} className="text-center text-warning">{total}</TableCell>;
                  })}
                  <TableCell className="text-center">{data.totales.stockTotal}</TableCell>
                  <TableCell className="text-right">$ {fmt(data.totales.valorCostoTotal)}</TableCell>
                  <TableCell className="text-right text-success">$ {fmt(data.totales.valorVentaTotal)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Almacen view */}
      {view === 'almacen' && data && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] sticky left-0 bg-card z-10">Código</TableHead>
                <TableHead className="text-[11px] sticky left-[70px] bg-card z-10">Producto</TableHead>
                {(data.almacenes ?? []).map(a => (
                  <TableHead key={a.id} className="text-[11px] text-center whitespace-nowrap">
                    <Warehouse className="h-3 w-3 inline mr-0.5" />{a.nombre}
                  </TableHead>
                ))}
                <TableHead className="text-[11px] text-center font-bold">Total almacén</TableHead>
                <TableHead className="text-[11px] text-right">Costo unit.</TableHead>
                <TableHead className="text-[11px] text-right">Valor total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => {
                const totalAlm = (data.almacenes ?? []).reduce((s, a) => s + (data.stockAlmacenMap[a.id]?.[p.id] ?? 0), 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground sticky left-0 bg-card">{p.codigo}</TableCell>
                    <TableCell className="text-[12px] font-medium sticky left-[70px] bg-card">{p.nombre}</TableCell>
                    {(data.almacenes ?? []).map(a => {
                      const qty = data.stockAlmacenMap[a.id]?.[p.id] ?? 0;
                      return (
                        <TableCell key={a.id} className={cn("text-center font-medium", qty <= 0 ? "text-muted-foreground" : "")}>
                          {qty || '—'}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn("text-center font-bold", totalAlm <= 0 ? "text-destructive" : "")}>
                      {totalAlm}
                    </TableCell>
                    <TableCell className="text-right text-[12px]">$ {fmt(p.costo ?? 0)}</TableCell>
                    <TableCell className="text-right text-[12px]">$ {fmt(totalAlm * (p.costo ?? 0))}</TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts && filteredProducts.length > 0 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2} className="sticky left-0 bg-muted/50">Totales</TableCell>
                  {(data.almacenes ?? []).map(a => {
                    const total = filteredProducts.reduce((s, p) => s + (data.stockAlmacenMap[a.id]?.[p.id] ?? 0), 0);
                    return <TableCell key={a.id} className="text-center">{total}</TableCell>;
                  })}
                  <TableCell className="text-center">{filteredProducts.reduce((s, p) => s + (data.almacenes ?? []).reduce((ss, a) => ss + (data.stockAlmacenMap[a.id]?.[p.id] ?? 0), 0), 0)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">$ {fmt(filteredProducts.reduce((s, p) => {
                    const totalAlm = (data.almacenes ?? []).reduce((ss, a) => ss + (data.stockAlmacenMap[a.id]?.[p.id] ?? 0), 0);
                    return s + totalAlm * (p.costo ?? 0);
                  }, 0))}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rutas view */}
      {view === 'rutas' && data && !selectedRuta && (
        <div className="space-y-3">
          {data.cargas.filter(c => c.totalUnidades > 0).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No hay rutas activas</p>
            </div>
          )}
          {data.cargas.filter(c => c.totalUnidades > 0).map(c => (
            <div
              key={c.id}
              className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelectedRuta(c)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    <Truck className="h-4 w-4 inline mr-1" />
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
                    <p className="text-xs text-muted-foreground">{c.totalUnidades} uds abordo</p>
                    <p className="text-sm font-bold text-foreground">$ {fmt(c.valorCosto)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}

          {data.cargas.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-foreground">Total en rutas</p>
                <div className="text-right">
                  <p className="text-sm font-bold">Costo: $ {fmt(data.cargas.reduce((s, c) => s + c.valorCosto, 0))}</p>
                  <p className="text-sm text-success font-bold">Proyección: $ {fmt(data.cargas.reduce((s, c) => s + c.valorVenta, 0))}</p>
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
    </div>
  );
}

function RutaDetail({ ruta, onBack }: { ruta: any; onBack: () => void }) {
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
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cargado</p>
            <p className="text-lg font-bold text-foreground">{totalCargado}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entregado</p>
            <p className="text-lg font-bold text-success">{totalEntregado}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Devuelto</p>
            <p className="text-lg font-bold text-warning">{totalDevuelto}</p>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <p className="text-[10px] text-primary uppercase tracking-wide font-medium">Abordo</p>
            <p className="text-lg font-bold text-primary">{totalAbordo}</p>
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
                <TableCell className="text-center">{l.cargado}</TableCell>
                <TableCell className={cn("text-center", l.entregado > 0 ? "text-success font-medium" : "text-muted-foreground")}>
                  {l.entregado}
                </TableCell>
                <TableCell className={cn("text-center", l.devuelto > 0 ? "text-warning font-medium" : "text-muted-foreground")}>
                  {l.devuelto}
                </TableCell>
                <TableCell className="text-center font-bold text-primary">{l.abordo}</TableCell>
                <TableCell className="text-right text-[12px]">$ {fmt(l.abordo * l.costo)}</TableCell>
                <TableCell className="text-right text-[12px] text-success">$ {fmt(l.abordo * l.precio)}</TableCell>
              </TableRow>
            ))}
            {lineas.length > 0 && (
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={2}>Totales</TableCell>
                <TableCell className="text-center">{totalCargado}</TableCell>
                <TableCell className="text-center text-success">{totalEntregado}</TableCell>
                <TableCell className="text-center text-warning">{totalDevuelto}</TableCell>
                <TableCell className="text-center text-primary">{totalAbordo}</TableCell>
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
