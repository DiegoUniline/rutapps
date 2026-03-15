import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, Truck, Package, Search, TrendingUp, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
      const rutaStock: Record<string, number> = {};
      const cargaDetails: any[] = [];

      for (const c of (cargas ?? [])) {
        let cargaTotal = 0;
        let cargaValorCosto = 0;
        let cargaValorVenta = 0;
        for (const cl of (c.carga_lineas ?? [])) {
          const enRuta = cl.cantidad_cargada - cl.cantidad_vendida - cl.cantidad_devuelta;
          rutaStock[cl.producto_id] = (rutaStock[cl.producto_id] ?? 0) + Math.max(0, enRuta);
          const prod = (productos ?? []).find(p => p.id === cl.producto_id);
          const qty = Math.max(0, enRuta);
          cargaTotal += qty;
          cargaValorCosto += qty * (prod?.costo ?? 0);
          cargaValorVenta += qty * (prod?.precio_principal ?? 0);
        }
        cargaDetails.push({
          id: c.id,
          origen: 'carga',
          vendedor: (c.vendedores as any)?.nombre ?? '—',
          repartidor: (c.repartidor as any)?.nombre,
          almacen: (c.almacen as any)?.nombre,
          fecha: c.fecha,
          status: c.status,
          totalUnidades: cargaTotal,
          valorCosto: cargaValorCosto,
          valorVenta: cargaValorVenta,
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
        rutaStock[sc.producto_id] = (rutaStock[sc.producto_id] ?? 0) + Math.max(0, sc.cantidad_actual);
      }

      // Add stock_camion groups as route cards (avoid duplicating cargas vendedores)
      const cargaVendedorIds = new Set((cargas ?? []).map(c => c.vendedor_id));
      for (const [vid, group] of Object.entries(scByVendedor)) {
        if (cargaVendedorIds.has(vid)) continue; // already counted via cargas
        let total = 0, valCosto = 0, valVenta = 0;
        for (const sc of group.items ?? []) {
          const qty = Math.max(0, sc.cantidad_actual);
          total += qty;
          const prod = (productos ?? []).find(p => p.id === sc.producto_id);
          valCosto += qty * (prod?.costo ?? 0);
          valVenta += qty * (prod?.precio_principal ?? 0);
        }
        cargaDetails.push({
          id: `sc-${vid}`,
          origen: 'entrega',
          vendedor: group.vendedor,
          repartidor: null,
          almacen: null,
          fecha: (group.items ?? [])[0]?.fecha,
          status: 'cargado',
          totalUnidades: total,
          valorCosto: valCosto,
          valorVenta: valVenta,
        });
      }

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

      return { productos: productosEnriquecidos, cargas: cargaDetails, totales };
    },
  });
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventarioPage() {
  const { data, isLoading } = useInventarioData();
  const [view, setView] = useState<ViewMode>('resumen');
  const [search, setSearch] = useState('');

  const filteredProducts = data?.productos.filter(p =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.codigo.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { key: ViewMode; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Resumen general', icon: Package },
    { key: 'almacen', label: 'Almacén', icon: Warehouse },
    { key: 'rutas', label: 'Rutas activas', icon: Truck },
  ];

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Warehouse className="h-5 w-5" /> Inventario
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
                <TableHead className="text-[11px]">Código</TableHead>
                <TableHead className="text-[11px]">Producto</TableHead>
                <TableHead className="text-[11px] text-center">Almacén</TableHead>
                <TableHead className="text-[11px] text-center">En ruta</TableHead>
                <TableHead className="text-[11px] text-center font-bold">Total</TableHead>
                <TableHead className="text-[11px] text-right">Valor costo</TableHead>
                <TableHead className="text-[11px] text-right">Proyección venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
                  <TableCell className="text-[12px] font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-center">{p.stockAlmacen} {(p.unidades as any)?.abreviatura ?? ''}</TableCell>
                  <TableCell className={cn("text-center", p.stockRuta > 0 ? "text-warning font-medium" : "text-muted-foreground")}>
                    {p.stockRuta}
                  </TableCell>
                  <TableCell className="text-center font-bold">{p.stockTotal}</TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.valorCostoTotal)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">$ {fmt(p.valorVentaTotal)}</TableCell>
                </TableRow>
              ))}
              {filteredProducts && filteredProducts.length > 0 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2}>Totales</TableCell>
                  <TableCell className="text-center">{data.totales.stockAlmacen}</TableCell>
                  <TableCell className="text-center text-warning">{data.totales.stockRuta}</TableCell>
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
                <TableHead className="text-[11px]">Código</TableHead>
                <TableHead className="text-[11px]">Producto</TableHead>
                <TableHead className="text-[11px] text-center">Stock almacén</TableHead>
                <TableHead className="text-[11px] text-right">Costo unit.</TableHead>
                <TableHead className="text-[11px] text-right">Valor almacén</TableHead>
                <TableHead className="text-[11px] text-right">Precio venta</TableHead>
                <TableHead className="text-[11px] text-right">Proyección</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts?.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
                  <TableCell className="text-[12px] font-medium">{p.nombre}</TableCell>
                  <TableCell className={cn("text-center font-medium", p.stockAlmacen <= 0 ? "text-destructive" : "")}>
                    {p.stockAlmacen}
                  </TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.costo ?? 0)}</TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.valorCostoAlmacen)}</TableCell>
                  <TableCell className="text-right text-[12px]">$ {fmt(p.precio_principal ?? 0)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">$ {fmt(p.valorVentaAlmacen)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rutas view */}
      {view === 'rutas' && data && (
        <div className="space-y-3">
          {data.cargas.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No hay rutas activas</p>
            </div>
          )}
          {data.cargas.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    <Truck className="h-4 w-4 inline mr-1" />
                    {c.vendedor}
                    {c.repartidor && c.repartidor !== c.vendedor && (
                      <span className="text-muted-foreground font-normal"> · Repartidor: {c.repartidor}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.almacen && `Almacén: ${c.almacen} · `}{fmtDate(c.fecha)} · {c.status === 'en_ruta' ? 'En ruta' : 'Pendiente'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{c.totalUnidades} uds abordo</p>
                  <p className="text-sm font-bold text-foreground">Costo: $ {fmt(c.valorCosto)}</p>
                  <p className="text-[12px] text-success font-medium">Venta: $ {fmt(c.valorVenta)}</p>
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
