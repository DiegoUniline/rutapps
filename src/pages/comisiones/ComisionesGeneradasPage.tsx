import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVendedores } from '@/hooks/useClientes';
import SearchableSelect from '@/components/SearchableSelect';
import { TableSkeleton } from '@/components/TableSkeleton';
import { cn, todayLocal, fmtDate } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { useTablePagination } from '@/hooks/useTablePagination';
import { TablePagination } from '@/components/TablePagination';


const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const firstOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10); };
const lastOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10); };
const mondayOfWeek = () => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).toISOString().slice(0, 10); };

export default function ComisionesGeneradasPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const { data: vendedores } = useVendedores();

  const [vendedorFilter, setVendedorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pendientes' | 'pagadas' | 'todas'>('pendientes');
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth());
  const [fechaHasta, setFechaHasta] = useState(todayLocal());


  const { data: comisiones, isLoading } = useQuery({
    queryKey: ['venta_comisiones', empresa?.id, vendedorFilter, statusFilter, fechaDesde, fechaHasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/supabasePaginate');
      return await fetchAllPages<any>((from, to) => {
        let q = supabase.from('venta_comisiones')
          .select('id, venta_id, vendedor_id, producto_id, monto_venta, comision_pct, comision_monto, pagada, fecha_venta, pago_comision_id, ventas(folio), productos(nombre), vendedores:profiles!vendedor_id(nombre), pago_comisiones(fecha_corte, estado)')
          .eq('empresa_id', empresa!.id)
          .order('fecha_venta', { ascending: false });
        if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
        if (statusFilter === 'pendientes') q = q.eq('pagada', false);
        if (statusFilter === 'pagadas') q = q.eq('pagada', true);
        if (fechaDesde) q = q.gte('fecha_venta', fechaDesde);
        if (fechaHasta) q = q.lte('fecha_venta', fechaHasta);
        return q.range(from, to);
      });
    },
  });


  const comisionesList = comisiones ?? [];
  const pag = useTablePagination(comisionesList);
  useEffect(() => { pag.resetPage(); }, [vendedorFilter, statusFilter, fechaDesde, fechaHasta]);
  const totalMonto = useMemo(() => comisionesList.reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisionesList]);
  const totalPend = useMemo(() => comisionesList.filter(c => !c.pagada).reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisionesList]);
  const totalPag = useMemo(() => comisionesList.filter(c => c.pagada).reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisionesList]);


  const resumenVendedor = useMemo(() => {
    const map = new Map<string, { vendedor_id: string; nombre: string; ventas: Set<string>; vendido: number; comision: number; pendiente: number; pagada: number }>();
    for (const c of comisiones ?? []) {
      const id = c.vendedor_id ?? 'sin';
      const nombre = c.vendedores?.nombre ?? 'Sin vendedor';
      if (!map.has(id)) map.set(id, { vendedor_id: id, nombre, ventas: new Set(), vendido: 0, comision: 0, pendiente: 0, pagada: 0 });
      const r = map.get(id)!;
      if (c.venta_id) r.ventas.add(c.venta_id);
      r.vendido += c.monto_venta ?? 0;
      r.comision += c.comision_monto ?? 0;
      if (c.pagada) r.pagada += c.comision_monto ?? 0; else r.pendiente += c.comision_monto ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.comision - a.comision);
  }, [comisiones]);

  const vendedorOpts = [{ value: '', label: 'Todos los vendedores' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))];
  const setRange = (d: string, h: string) => { setFechaDesde(d); setFechaHasta(h); };


  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-44">
          <SearchableSelect options={vendedorOpts} value={vendedorFilter} onChange={v => setVendedorFilter(v)} placeholder="Vendedor" />
        </div>
        <div className="flex border border-border rounded overflow-hidden">
          {([['pendientes', 'Pendientes'], ['pagadas', 'Pagadas'], ['todas', 'Todas']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={cn('px-2.5 py-1.5 text-xs transition-colors', statusFilter === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-border mx-1" />
        <DateRangePicker from={fechaDesde} to={fechaHasta} onChange={(f, t) => { setFechaDesde(f); setFechaHasta(t); }} />
        <div className="flex gap-1">
          <button onClick={() => setRange(todayLocal(), todayLocal())} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Hoy</button>
          <button onClick={() => setRange(mondayOfWeek(), todayLocal())} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Semana</button>
          <button onClick={() => setRange(firstOfMonth(), todayLocal())} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Mes</button>
          <button onClick={() => setRange(firstOfLastMonth(), lastOfLastMonth())} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Ant.</button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <div>Pendiente: <span className="font-mono font-semibold text-amber-600">{fmt(totalPend)}</span></div>
          <div>Pagado: <span className="font-mono font-semibold text-primary">{fmt(totalPag)}</span></div>
          <div className="text-sm">Total: <span className="font-mono font-bold text-odoo-teal">{fmt(totalMonto)}</span></div>
        </div>
      </div>

      {!isLoading && resumenVendedor.length > 0 && (
        <div className="border border-border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Vendedor</th>
                <th className="th-odoo text-right"># Ventas</th>
                <th className="th-odoo text-right">Vendido</th>
                <th className="th-odoo text-right">Comisión total</th>
                <th className="th-odoo text-right">Pendiente</th>
                <th className="th-odoo text-right">Pagada</th>
              </tr>
            </thead>
            <tbody>
              {resumenVendedor.map(r => (
                <tr key={r.vendedor_id} className="border-b border-table-border last:border-0 hover:bg-table-hover cursor-pointer"
                  onClick={() => setVendedorFilter(r.vendedor_id === 'sin' ? '' : r.vendedor_id)}>
                  <td className="py-1.5 px-3 text-xs font-medium">{r.nombre}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs">{r.ventas.size}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs">{fmt(r.vendido)}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">{fmt(r.comision)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-amber-600">{fmt(r.pendiente)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-primary">{fmt(r.pagada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isLoading ? <TableSkeleton /> : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Fecha</th>
                <th className="th-odoo text-left">Folio</th>
                <th className="th-odoo text-left">Vendedor</th>
                <th className="th-odoo text-left">Producto</th>
                <th className="th-odoo text-right">Venta</th>
                <th className="th-odoo text-right">% Com.</th>
                <th className="th-odoo text-right">Comisión</th>
                <th className="th-odoo text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pag.paginatedItems.map((c: any) => (
                <tr key={c.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                  <td className="py-1.5 px-3 text-xs">{fmtDate(c.fecha_venta)}</td>
                  <td className="py-1.5 px-3 text-xs font-mono">
                    {c.venta_id ? (
                      <a href={`/ventas/${c.venta_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.ventas?.folio ?? '—'}</a>
                    ) : (c.ventas?.folio ?? '—')}
                  </td>
                  <td className="py-1.5 px-3 text-xs">{c.vendedores?.nombre ?? '—'}</td>
                  <td className="py-1.5 px-3 text-xs">{c.productos?.nombre ?? '—'}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs">{fmt(c.monto_venta)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs">{c.comision_pct}%</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">{fmt(c.comision_monto)}</td>
                  <td className="py-1.5 px-3 text-center">
                    {c.pagada ? (
                      <span title={c.pago_comisiones?.fecha_corte ? `Pagada al corte ${fmtDate(c.pago_comisiones.fecha_corte)}` : 'Pagada'} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Pagada</span>
                    ) : c.pago_comision_id ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">En recibo</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              {pag.paginatedItems.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">Sin comisiones en el rango seleccionado</td></tr>
              )}
            </tbody>

          </table>
          <TablePagination
            from={pag.from}
            to={pag.to}
            total={pag.total}
            page={pag.page}
            totalPages={pag.totalPages}
            pageSize={pag.pageSize}
            onPageSizeChange={pag.setPageSize}
            onFirst={pag.goFirst}
            onPrev={pag.goPrev}
            onNext={pag.goNext}
            onLast={pag.goLast}
          />

        </div>
      )}
    </div>
  );
}
