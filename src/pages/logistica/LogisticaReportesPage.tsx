import { useState, useMemo } from 'react';
import { Boxes, Truck, Printer, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVendedores } from '@/hooks/useClientes';
import { useDateFilter } from '@/hooks/useDateFilter';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { fmtMoney } from '@/lib/currency';
import { fmtDate, cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Tab = 'productos_cargados' | 'pedidos_entregar';

// ============================================================================
// Hook: Productos cargados (consolidado por producto, con desglose por vendedor)
// ============================================================================
function useProductosCargados(empresaId: string | undefined, desde: string, hasta: string, vendedorIds: string[]) {
  return useQuery({
    queryKey: ['rep-productos-cargados', empresaId, desde, hasta, vendedorIds.join(',')],
    enabled: !!empresaId,
    queryFn: async () => {
      // "Productos cargados" = productos movidos por el vendedor en su jornada (ventas confirmadas/entregadas).
      // Sumamos venta_lineas y restamos devolucion_lineas del mismo período/vendedor.
      const ventas = await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('ventas')
          .select('id, fecha, vendedor_id, vendedores:profiles!vendedor_id(nombre), venta_lineas(producto_id, cantidad, productos(codigo, nombre))')
          .eq('empresa_id', empresaId!)
          .eq('es_saldo_inicial', false)
          .neq('status', 'cancelado')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .range(from, to);
        if (vendedorIds.length > 0) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const devoluciones = await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('devoluciones')
          .select('id, fecha, vendedor_id, devolucion_lineas(producto_id, cantidad, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
          .eq('empresa_id', empresaId!)
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .range(from, to);
        if (vendedorIds.length > 0) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      // Por vendedor → productos
      const byVendedor: Record<string, { vendedorId: string; vendedor: string; productos: Map<string, { codigo: string; nombre: string; cargado: number; vendido: number; devuelto: number }>; totalCargado: number; totalVendido: number; totalDevuelto: number }> = {};
      const consolidado = new Map<string, { codigo: string; nombre: string; cargado: number; vendido: number; devuelto: number }>();

      const ensureVendedor = (vid: string, vname: string) => {
        if (!byVendedor[vid]) byVendedor[vid] = { vendedorId: vid, vendedor: vname, productos: new Map(), totalCargado: 0, totalVendido: 0, totalDevuelto: 0 };
        return byVendedor[vid];
      };
      const ensureProd = (map: Map<string, any>, pid: string, codigo: string, nombre: string) => {
        let p = map.get(pid);
        if (!p) { p = { codigo, nombre, cargado: 0, vendido: 0, devuelto: 0 }; map.set(pid, p); }
        return p;
      };

      // Vendido (también suma a "cargado" porque lo cargó para vender)
      for (const v of ventas) {
        const vid = v.vendedor_id ?? 'sin';
        const vname = (v.vendedores as any)?.nombre ?? 'Sin vendedor';
        const grp = ensureVendedor(vid, vname);
        for (const l of (v.venta_lineas ?? []) as any[]) {
          const pid = l.producto_id;
          if (!pid) continue;
          const codigo = l.productos?.codigo ?? '';
          const nombre = l.productos?.nombre ?? '';
          const qty = Number(l.cantidad) || 0;
          const pv = ensureProd(grp.productos, pid, codigo, nombre);
          pv.vendido += qty; pv.cargado += qty;
          grp.totalVendido += qty; grp.totalCargado += qty;
          const pc = ensureProd(consolidado, pid, codigo, nombre);
          pc.vendido += qty; pc.cargado += qty;
        }
      }

      // Devuelto (también suma a "cargado" — lo llevaba pero regresó)
      for (const d of devoluciones) {
        const vid = d.vendedor_id ?? 'sin';
        const grp = byVendedor[vid];
        if (!grp) continue; // sólo si el vendedor ya tuvo ventas
        for (const l of (d.devolucion_lineas ?? []) as any[]) {
          const pid = l.producto_id;
          if (!pid) continue;
          const codigo = l.productos?.codigo ?? '';
          const nombre = l.productos?.nombre ?? '';
          const qty = Number(l.cantidad) || 0;
          const pv = ensureProd(grp.productos, pid, codigo, nombre);
          pv.devuelto += qty; pv.cargado += qty;
          grp.totalDevuelto += qty; grp.totalCargado += qty;
          const pc = ensureProd(consolidado, pid, codigo, nombre);
          pc.devuelto += qty; pc.cargado += qty;
        }
      }

      const vendedoresArr = Object.values(byVendedor).map(v => ({
        ...v,
        productos: Array.from(v.productos.values()).sort((a, b) => b.cargado - a.cargado),
      })).sort((a, b) => a.vendedor.localeCompare(b.vendedor));

      const consolidadoArr = Array.from(consolidado.values()).sort((a, b) => b.cargado - a.cargado);

      return {
        vendedores: vendedoresArr,
        consolidado: consolidadoArr,
        totalCargado: consolidadoArr.reduce((s, p) => s + p.cargado, 0),
        totalVendido: consolidadoArr.reduce((s, p) => s + p.vendido, 0),
        totalDevuelto: consolidadoArr.reduce((s, p) => s + p.devuelto, 0),
      };
    },
  });
}

// ============================================================================
// Hook: Pedidos a entregar
// ============================================================================
function usePedidosEntregar(empresaId: string | undefined, desde: string, hasta: string, vendedorIds: string[]) {
  return useQuery({
    queryKey: ['rep-pedidos-entregar', empresaId, desde, hasta, vendedorIds.join(',')],
    enabled: !!empresaId,
    queryFn: async () => {
      const ventas = await fetchAllPages<any>((from, to) => {
        let q = supabase
          .from('ventas')
          .select('id, folio, fecha, fecha_entrega, total, status, vendedor_id, cliente_id, clientes(nombre, direccion, telefono), vendedores:profiles!vendedor_id(nombre), venta_lineas(cantidad, total, productos(codigo, nombre))')
          .eq('empresa_id', empresaId!)
          .eq('tipo', 'pedido')
          .neq('status', 'cancelado')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: true })
          .range(from, to);
        if (vendedorIds.length > 0) q = q.in('vendedor_id', vendedorIds);
        return q;
      });

      const byVendedor: Record<string, { vendedorId: string; vendedor: string; pedidos: any[]; totalPedidos: number; totalImporte: number; totalPiezas: number }> = {};

      for (const v of ventas) {
        const vid = v.vendedor_id ?? 'sin';
        const vname = (v.vendedores as any)?.nombre ?? 'Sin vendedor';
        if (!byVendedor[vid]) byVendedor[vid] = { vendedorId: vid, vendedor: vname, pedidos: [], totalPedidos: 0, totalImporte: 0, totalPiezas: 0 };
        const piezas = (v.venta_lineas ?? []).reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
        byVendedor[vid].pedidos.push({ ...v, piezas });
        byVendedor[vid].totalPedidos += 1;
        byVendedor[vid].totalImporte += Number(v.total) || 0;
        byVendedor[vid].totalPiezas += piezas;
      }

      const arr = Object.values(byVendedor).sort((a, b) => a.vendedor.localeCompare(b.vendedor));

      return {
        vendedores: arr,
        totalPedidos: arr.reduce((s, v) => s + v.totalPedidos, 0),
        totalImporte: arr.reduce((s, v) => s + v.totalImporte, 0),
        totalPiezas: arr.reduce((s, v) => s + v.totalPiezas, 0),
      };
    },
  });
}

// ============================================================================
// Page
// ============================================================================
export default function LogisticaReportesPage() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;
  const { desde, hasta, setDesde, setHasta } = useDateFilter();
  const { data: vendedores = [] } = useVendedores();
  const [selectedVendedores, setSelectedVendedores] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('productos_cargados');

  const productosQ = useProductosCargados(empresaId, desde, hasta, selectedVendedores);
  const pedidosQ = usePedidosEntregar(empresaId, desde, hasta, selectedVendedores);

  const vendedorOptions = useMemo(() => vendedores.map((v: any) => ({ id: v.id, nombre: v.nombre })), [vendedores]);
  const isAllVendedores = selectedVendedores.length === 0;
  const selectedLabel = isAllVendedores
    ? 'Todos los vendedores'
    : selectedVendedores.length === 1
      ? vendedorOptions.find(v => v.id === selectedVendedores[0])?.nombre ?? '1 vendedor'
      : `${selectedVendedores.length} vendedores`;

  const toggleVendedor = (id: string) => {
    setSelectedVendedores(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePrint = () => window.print();

  return (
    <div className="p-4 md:p-6 space-y-4 print:p-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5" /> Reportes de Logística
          </h1>
          <p className="text-sm text-muted-foreground">Productos cargados y pedidos pendientes de entregar</p>
        </div>
        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <OdooDatePicker value={desde} onChange={setDesde} placeholder="Desde" />
        <OdooDatePicker value={hasta} onChange={setHasta} placeholder="Hasta" />

        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm hover:bg-accent">
              <Users className="h-4 w-4" />
              <span>{selectedLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-1 max-h-72 overflow-y-auto">
              <button
                onClick={() => setSelectedVendedores([])}
                className={cn('w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent', isAllVendedores && 'bg-accent font-medium')}
              >
                Todos los vendedores
              </button>
              <div className="border-t border-border my-1" />
              {vendedorOptions.map(v => (
                <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVendedores.includes(v.id)}
                    onChange={() => toggleVendedor(v.id)}
                    className="rounded"
                  />
                  <span>{v.nombre}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1 print:hidden">
        <TabButton active={tab === 'productos_cargados'} onClick={() => setTab('productos_cargados')} icon={Boxes} label="Productos cargados" />
        <TabButton active={tab === 'pedidos_entregar'} onClick={() => setTab('pedidos_entregar')} icon={Truck} label="Pedidos a entregar" />
      </div>

      {/* Print header (visible solo al imprimir) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">{tab === 'productos_cargados' ? 'Reporte de productos cargados' : 'Pedidos a entregar'}</h1>
        <p className="text-xs text-muted-foreground">Del {fmtDate(desde)} al {fmtDate(hasta)} — {selectedLabel}</p>
      </div>

      {/* Content */}
      {tab === 'productos_cargados' && (
        <ProductosCargadosView
          isLoading={productosQ.isLoading}
          data={productosQ.data}
          showByVendedor={isAllVendedores || selectedVendedores.length > 1}
        />
      )}
      {tab === 'pedidos_entregar' && (
        <PedidosEntregarView
          isLoading={pedidosQ.isLoading}
          data={pedidosQ.data}
          showByVendedor={isAllVendedores || selectedVendedores.length > 1}
        />
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-before: always; break-before: page; }
        }
      `}</style>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// ============================================================================
// View: Productos cargados
// ============================================================================
function ProductosCargadosView({ isLoading, data, showByVendedor }: { isLoading: boolean; data: any; showByVendedor: boolean }) {
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Cargando…</div>;
  if (!data || data.consolidado.length === 0) {
    return <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">Sin cargas en el período seleccionado</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Productos distintos" value={data.consolidado.length.toLocaleString()} />
        <KpiBox label="Total cargado" value={data.totalCargado.toLocaleString()} />
        <KpiBox label="Total vendido" value={data.totalVendido.toLocaleString()} />
        <KpiBox label="Total devuelto" value={data.totalDevuelto.toLocaleString()} />
      </div>

      {/* Resumen consolidado */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Resumen consolidado</h2>
        <ProductosTable rows={data.consolidado} />
      </section>

      {/* Desglose por vendedor */}
      {showByVendedor && data.vendedores.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2 page-break">Detalle por vendedor</h2>
          <div className="space-y-6">
            {data.vendedores.map((v: any, idx: number) => (
              <div key={v.vendedorId} className={cn('space-y-2', idx > 0 && 'page-break')}>
                <div className="flex items-center justify-between bg-accent/40 px-3 py-2 rounded-md border border-border">
                  <div className="font-semibold text-foreground">{v.vendedor}</div>
                  <div className="text-xs text-muted-foreground">
                    Cargado: <span className="font-semibold text-foreground">{v.totalCargado.toLocaleString()}</span> · Vendido: <span className="font-semibold text-foreground">{v.totalVendido.toLocaleString()}</span> · Devuelto: <span className="font-semibold text-foreground">{v.totalDevuelto.toLocaleString()}</span>
                  </div>
                </div>
                <ProductosTable rows={v.productos} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProductosTable({ rows }: { rows: any[] }) {
  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40">
          <tr className="text-[10px] text-muted-foreground uppercase">
            <th className="text-left px-3 py-2">Código</th>
            <th className="text-left px-3 py-2">Producto</th>
            <th className="text-right px-3 py-2">Cargado</th>
            <th className="text-right px-3 py-2">Vendido</th>
            <th className="text-right px-3 py-2">Devuelto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any, i: number) => (
            <tr key={i} className="border-t border-border/50">
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.codigo}</td>
              <td className="px-3 py-1.5">{p.nombre}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{p.cargado.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{p.vendido.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{p.devuelto.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// View: Pedidos a entregar
// ============================================================================
function PedidosEntregarView({ isLoading, data, showByVendedor }: { isLoading: boolean; data: any; showByVendedor: boolean }) {
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Cargando…</div>;
  if (!data || data.totalPedidos === 0) {
    return <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">Sin pedidos en el período seleccionado</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiBox label="Total pedidos" value={data.totalPedidos.toLocaleString()} />
        <KpiBox label="Total piezas" value={data.totalPiezas.toLocaleString()} />
        <KpiBox label="Importe total" value={fmtMoney(data.totalImporte)} />
      </div>

      <div className="space-y-6">
        {data.vendedores.map((v: any, idx: number) => (
          <section key={v.vendedorId} className={cn(showByVendedor && idx > 0 && 'page-break')}>
            {showByVendedor && (
              <div className="flex items-center justify-between bg-accent/40 px-3 py-2 rounded-md border border-border mb-2">
                <div className="font-semibold text-foreground">{v.vendedor}</div>
                <div className="text-xs text-muted-foreground">
                  {v.totalPedidos} pedidos · {v.totalPiezas.toLocaleString()} pzas · <span className="font-semibold text-foreground">{fmtMoney(v.totalImporte)}</span>
                </div>
              </div>
            )}
            <PedidosTable pedidos={v.pedidos} />
          </section>
        ))}
      </div>
    </div>
  );
}

function PedidosTable({ pedidos }: { pedidos: any[] }) {
  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40">
          <tr className="text-[10px] text-muted-foreground uppercase">
            <th className="text-left px-3 py-2">Folio</th>
            <th className="text-left px-3 py-2">Fecha</th>
            <th className="text-left px-3 py-2">Cliente</th>
            <th className="text-left px-3 py-2">Dirección</th>
            <th className="text-right px-3 py-2">Piezas</th>
            <th className="text-right px-3 py-2">Total</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p: any) => (
            <tr key={p.id} className="border-t border-border/50">
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.folio ?? '—'}</td>
              <td className="px-3 py-1.5">{fmtDate(p.fecha_entrega ?? p.fecha)}</td>
              <td className="px-3 py-1.5 font-medium">{(p.clientes as any)?.nombre ?? '—'}</td>
              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">{(p.clientes as any)?.direccion ?? '—'}</td>
              <td className="px-3 py-1.5 text-right">{p.piezas.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmtMoney(p.total)}</td>
              <td className="px-3 py-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-foreground capitalize">{p.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide">{label}</div>
      <div className="text-lg font-bold text-foreground mt-0.5">{value}</div>
    </div>
  );
}
