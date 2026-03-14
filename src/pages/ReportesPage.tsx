import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package, Banknote, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
type ReportTab = 'resumen' | 'ventas' | 'productos' | 'clientes' | 'vendedores';

function useReportesData() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['reportes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;
      const now = new Date();
      const mesActual = now.toISOString().slice(0, 7); // YYYY-MM
      const inicioMes = mesActual + '-01';
      const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const [ventasRes, cobrosRes, gastosRes, clientesRes, productosRes, ventaLineasRes] = await Promise.all([
        supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente, status, tipo, cliente_id, vendedor_id, clientes(nombre), vendedores(nombre)').eq('empresa_id', eid).gte('fecha', inicioMes).lte('fecha', finMes),
        supabase.from('cobros').select('id, monto, fecha').eq('empresa_id', eid).gte('fecha', inicioMes).lte('fecha', finMes),
        supabase.from('gastos').select('id, monto, concepto, fecha').eq('empresa_id', eid).gte('fecha', inicioMes).lte('fecha', finMes),
        supabase.from('clientes').select('id, nombre, codigo, status').eq('empresa_id', eid),
        supabase.from('productos').select('id, codigo, nombre, cantidad, costo, precio_principal').eq('empresa_id', eid).eq('status', 'activo'),
        supabase.from('venta_lineas').select('producto_id, cantidad, total, productos(codigo, nombre), venta_id, ventas!inner(empresa_id, fecha)').eq('ventas.empresa_id', eid).gte('ventas.fecha', inicioMes).lte('ventas.fecha', finMes),
      ]);

      const ventas = ventasRes.data ?? [];
      const cobros = cobrosRes.data ?? [];
      const gastos = gastosRes.data ?? [];
      const clientes = clientesRes.data ?? [];
      const productos = productosRes.data ?? [];
      const ventaLineas = ventaLineasRes.data ?? [];

      // Resumen
      const totalVentas = ventas.reduce((s, v) => s + (v.total ?? 0), 0);
      const totalCobros = cobros.reduce((s, c) => s + (c.monto ?? 0), 0);
      const totalGastos = gastos.reduce((s, g) => s + (g.monto ?? 0), 0);
      const totalPendiente = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);

      // Top productos
      const prodMap: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
      for (const l of ventaLineas) {
        const pid = l.producto_id ?? '';
        if (!prodMap[pid]) prodMap[pid] = { nombre: (l.productos as any)?.nombre ?? '', codigo: (l.productos as any)?.codigo ?? '', cantidad: 0, total: 0 };
        prodMap[pid].cantidad += l.cantidad ?? 0;
        prodMap[pid].total += l.total ?? 0;
      }
      const topProductos = Object.entries(prodMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);

      // Top clientes
      const cliMap: Record<string, { nombre: string; total: number; ventas: number }> = {};
      for (const v of ventas) {
        const cid = v.cliente_id ?? '';
        if (!cliMap[cid]) cliMap[cid] = { nombre: (v.clientes as any)?.nombre ?? '—', total: 0, ventas: 0 };
        cliMap[cid].total += v.total ?? 0;
        cliMap[cid].ventas += 1;
      }
      const topClientes = Object.entries(cliMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);

      // Top vendedores
      const vendMap: Record<string, { nombre: string; total: number; ventas: number }> = {};
      for (const v of ventas) {
        const vid = v.vendedor_id ?? '';
        if (!vendMap[vid]) vendMap[vid] = { nombre: (v.vendedores as any)?.nombre ?? '—', total: 0, ventas: 0 };
        vendMap[vid].total += v.total ?? 0;
        vendMap[vid].ventas += 1;
      }
      const topVendedores = Object.entries(vendMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);

      // Daily ventas for chart
      const dailyMap: Record<string, number> = {};
      for (const v of ventas) {
        dailyMap[v.fecha] = (dailyMap[v.fecha] ?? 0) + (v.total ?? 0);
      }
      const dailyVentas = Object.entries(dailyMap).sort().map(([fecha, total]) => ({ fecha, total }));

      return {
        totalVentas, totalCobros, totalGastos, totalPendiente,
        numVentas: ventas.length, numCobros: cobros.length,
        utilidad: totalVentas - totalGastos,
        topProductos, topClientes, topVendedores, dailyVentas,
        mesLabel: now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
      };
    },
  });
}

export default function ReportesPage() {
  const { data, isLoading } = useReportesData();
  const [tab, setTab] = useState<ReportTab>('resumen');

  const tabs: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: 'resumen', label: 'Resumen', icon: BarChart3 },
    { key: 'ventas', label: 'Ventas', icon: ShoppingCart },
    { key: 'productos', label: 'Productos', icon: Package },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'vendedores', label: 'Vendedores', icon: TrendingUp },
  ];

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando reportes...</div>;
  if (!data) return null;

  const maxDaily = Math.max(...data.dailyVentas.map(d => d.total), 1);

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-5 w-5" /> Reportes — {data.mesLabel}
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
            tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* RESUMEN */}
      {tab === 'resumen' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI icon={ShoppingCart} label="Ventas del mes" value={`$ ${fmt(data.totalVentas)}`} sub={`${data.numVentas} ventas`} color="text-primary" />
            <KPI icon={Banknote} label="Cobros del mes" value={`$ ${fmt(data.totalCobros)}`} sub={`${data.numCobros} cobros`} color="text-success" />
            <KPI icon={Receipt} label="Gastos del mes" value={`$ ${fmt(data.totalGastos)}`} sub="" color="text-destructive" />
            <KPI icon={DollarSign} label="Utilidad bruta" value={`$ ${fmt(data.utilidad)}`} sub={data.totalVentas > 0 ? `${Math.round((data.utilidad / data.totalVentas) * 100)}% margen` : ''} color={data.utilidad >= 0 ? "text-success" : "text-destructive"} />
          </div>

          {/* Daily chart */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-4">Ventas diarias</h3>
            <div className="flex items-end gap-1 h-32">
              {data.dailyVentas.map(d => (
                <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1" title={`${d.fecha}: $ ${fmt(d.total)}`}>
                  <div
                    className="w-full bg-primary/80 rounded-t-sm min-h-[2px] transition-all hover:bg-primary"
                    style={{ height: `${(d.total / maxDaily) * 100}%` }}
                  />
                  <span className="text-[8px] text-muted-foreground rotate-45 origin-left">{d.fecha.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[11px] text-muted-foreground uppercase">Por cobrar</p>
              <p className="text-xl font-bold text-warning">$ {fmt(data.totalPendiente)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-[11px] text-muted-foreground uppercase">Flujo neto</p>
              <p className={cn("text-xl font-bold", (data.totalCobros - data.totalGastos) >= 0 ? "text-success" : "text-destructive")}>
                $ {fmt(data.totalCobros - data.totalGastos)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VENTAS DAILY */}
      {tab === 'ventas' && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 text-[11px] text-muted-foreground">Fecha</th>
                <th className="py-2 px-3 text-[11px] text-muted-foreground text-right">Total</th>
                <th className="py-2 px-3 text-[11px] text-muted-foreground">Gráfico</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyVentas.map(d => (
                <tr key={d.fecha} className="border-b border-border/50">
                  <td className="py-2 px-3">{d.fecha}</td>
                  <td className="py-2 px-3 text-right font-bold">$ {fmt(d.total)}</td>
                  <td className="py-2 px-3">
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(d.total / maxDaily) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TOP PRODUCTOS */}
      {tab === 'productos' && (
        <RankingTable
          headers={['Producto', 'Código', 'Uds vendidas', 'Total vendido']}
          rows={data.topProductos.slice(0, 20).map(p => [p.nombre, p.codigo, p.cantidad.toString(), `$ ${fmt(p.total)}`])}
          maxVal={data.topProductos[0]?.total ?? 1}
          vals={data.topProductos.slice(0, 20).map(p => p.total)}
        />
      )}

      {/* TOP CLIENTES */}
      {tab === 'clientes' && (
        <RankingTable
          headers={['Cliente', 'Ventas', 'Total']}
          rows={data.topClientes.slice(0, 20).map(c => [c.nombre, c.ventas.toString(), `$ ${fmt(c.total)}`])}
          maxVal={data.topClientes[0]?.total ?? 1}
          vals={data.topClientes.slice(0, 20).map(c => c.total)}
        />
      )}

      {/* TOP VENDEDORES */}
      {tab === 'vendedores' && (
        <RankingTable
          headers={['Vendedor', 'Ventas', 'Total']}
          rows={data.topVendedores.slice(0, 20).map(v => [v.nombre, v.ventas.toString(), `$ ${fmt(v.total)}`])}
          maxVal={data.topVendedores[0]?.total ?? 1}
          vals={data.topVendedores.slice(0, 20).map(v => v.total)}
        />
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-[11px] text-muted-foreground uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RankingTable({ headers, rows, maxVal, vals }: { headers: string[]; rows: string[][]; maxVal: number; vals: number[] }) {
  return (
    <div className="bg-card border border-border rounded overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 px-3 text-[11px] text-muted-foreground w-8">#</th>
            {headers.map(h => <th key={h} className="py-2 px-3 text-[11px] text-muted-foreground">{h}</th>)}
            <th className="py-2 px-3 text-[11px] text-muted-foreground">Participación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 px-3 font-bold text-muted-foreground">{i + 1}</td>
              {row.map((cell, j) => (
                <td key={j} className={cn("py-2 px-3", j === 0 && "font-medium", j === row.length - 1 && "font-bold text-right")}>
                  {cell}
                </td>
              ))}
              <td className="py-2 px-3 w-32">
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(vals[i] / maxVal) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={headers.length + 2} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
