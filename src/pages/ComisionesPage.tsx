import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVendedores } from '@/hooks/useClientes';
import SearchableSelect from '@/components/SearchableSelect';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { cn, todayLocal, fmtDate } from '@/lib/utils';
import { Check, DollarSign, Calendar, FileText } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import ComisionesReglasTab from '@/components/comisiones/ComisionesReglasTab';

const PAGE_SIZE = 20;

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function firstOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function lastOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}
function mondayOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

type TabKey = 'historial' | 'por_pagar' | 'recibos' | 'reglas';

export default function ComisionesPage() {
  const { user, empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('historial');

  // Historial filters
  const [vendedorFilter, setVendedorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'pendientes' | 'pagadas' | 'todas'>('pendientes');
  const [fechaDesde, setFechaDesde] = useState<string>(firstOfMonth());
  const [fechaHasta, setFechaHasta] = useState<string>(todayLocal());
  const [page, setPage] = useState(0);

  const { data: vendedores } = useVendedores();

  const { data: comisiones, isLoading } = useQuery({
    queryKey: ['venta_comisiones', empresa?.id, vendedorFilter, statusFilter, fechaDesde, fechaHasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('venta_comisiones')
        .select('id, venta_id, vendedor_id, producto_id, monto_venta, comision_pct, comision_monto, pagada, fecha_venta, pago_comision_id, ventas(folio), productos(nombre), vendedores:profiles!vendedor_id(nombre), pago_comisiones(fecha_corte, estado)')
        .order('fecha_venta', { ascending: false });
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter === 'pendientes') q = q.eq('pagada', false);
      if (statusFilter === 'pagadas') q = q.eq('pagada', true);
      if (fechaDesde) q = q.gte('fecha_venta', fechaDesde);
      if (fechaHasta) q = q.lte('fecha_venta', fechaHasta);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const paged = useMemo(() => (comisiones ?? []).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [comisiones, page]);
  const totalMonto = useMemo(() => (comisiones ?? []).reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisiones]);
  const totalPend = useMemo(() => (comisiones ?? []).filter(c => !c.pagada).reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisiones]);
  const totalPag = useMemo(() => (comisiones ?? []).filter(c => c.pagada).reduce((s, c) => s + (c.comision_monto ?? 0), 0), [comisiones]);

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
      if (c.pagada) r.pagada += c.comision_monto ?? 0;
      else r.pendiente += c.comision_monto ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.comision - a.comision);
  }, [comisiones]);

  const vendedorOpts = [{ value: '', label: 'Todos los vendedores' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))];

  const setRange = (d: string, h: string) => { setFechaDesde(d); setFechaHasta(h); setPage(0); };

  // ============== POR PAGAR ==============
  const [ppFechaCorte, setPpFechaCorte] = useState(todayLocal());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: pendientesPP, isLoading: loadingPP } = useQuery({
    queryKey: ['comisiones-por-pagar', empresa?.id, ppFechaCorte],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_comisiones')
        .select('id, vendedor_id, comision_monto, monto_venta, fecha_venta, venta_id, ventas(folio), vendedores:profiles!vendedor_id(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('pagada', false)
        .is('pago_comision_id', null)
        .lte('fecha_venta', ppFechaCorte)
        .order('fecha_venta');
      if (error) throw error;
      return data as any[];
    },
  });

  const ppGrupos = useMemo(() => {
    const map = new Map<string, { vendedor_id: string; nombre: string; items: any[]; total: number }>();
    for (const c of pendientesPP ?? []) {
      const id = c.vendedor_id ?? 'sin';
      if (!map.has(id)) map.set(id, { vendedor_id: id, nombre: c.vendedores?.nombre ?? 'Sin vendedor', items: [], total: 0 });
      const g = map.get(id)!;
      g.items.push(c);
      g.total += c.comision_monto ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [pendientesPP]);

  const selectedSummary = useMemo(() => {
    const map = new Map<string, { vendedor_id: string; nombre: string; count: number; total: number }>();
    for (const c of pendientesPP ?? []) {
      if (!selected.has(c.id)) continue;
      const id = c.vendedor_id ?? 'sin';
      if (!map.has(id)) map.set(id, { vendedor_id: id, nombre: c.vendedores?.nombre ?? 'Sin vendedor', count: 0, total: 0 });
      const g = map.get(id)!;
      g.count += 1;
      g.total += c.comision_monto ?? 0;
    }
    return Array.from(map.values());
  }, [pendientesPP, selected]);

  const selectedTotal = useMemo(() => selectedSummary.reduce((s, g) => s + g.total, 0), [selectedSummary]);

  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVendor = (items: any[]) => setSelected(prev => {
    const n = new Set(prev);
    const allSel = items.every(i => n.has(i.id));
    if (allSel) items.forEach(i => n.delete(i.id));
    else items.forEach(i => n.add(i.id));
    return n;
  });
  const selectAll = () => setSelected(new Set((pendientesPP ?? []).map(c => c.id)));
  const clearSel = () => setSelected(new Set());

  const generarMut = useMutation({
    mutationFn: async () => {
      if (!empresa?.id || !user?.id) throw new Error('Datos incompletos');
      if (selectedSummary.length === 0) throw new Error('Selecciona al menos una comisión');

      for (const g of selectedSummary) {
        const itemIds = (pendientesPP ?? [])
          .filter(c => selected.has(c.id) && c.vendedor_id === g.vendedor_id)
          .map(c => c.id);
        const { data: pago, error: pagoErr } = await supabase.from('pago_comisiones').insert({
          empresa_id: empresa.id,
          vendedor_id: g.vendedor_id,
          fecha_corte: ppFechaCorte,
          total_comisiones: g.total,
          user_id: user.id,
          estado: 'borrador',
        }).select('id').single();
        if (pagoErr) throw pagoErr;

        const { error: upErr } = await supabase
          .from('venta_comisiones')
          .update({ pago_comision_id: pago.id })
          .in('id', itemIds);
        if (upErr) throw upErr;
      }
    },
    onSuccess: () => {
      toast.success('Recibos generados');
      clearSel();
      qc.invalidateQueries({ queryKey: ['comisiones-por-pagar'] });
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
      setTab('recibos');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ============== RECIBOS ==============
  const [recibosEstado, setRecibosEstado] = useState<'borrador' | 'pagada' | 'todos'>('borrador');

  const { data: recibos, isLoading: loadingRecibos } = useQuery({
    queryKey: ['pago_comisiones', empresa?.id, recibosEstado],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('pago_comisiones')
        .select('id, fecha_corte, fecha_pago, total_comisiones, estado, vendedor_id, gasto_id, notas, vendedores:profiles!vendedor_id(nombre), created_at')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (recibosEstado !== 'todos') q = q.eq('estado', recibosEstado);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const totalBorrador = useMemo(
    () => (recibos ?? []).filter(r => r.estado === 'borrador').reduce((s, r) => s + (r.total_comisiones ?? 0), 0),
    [recibos]
  );

  // Modal de pago (crea gasto)
  const [payingRecibo, setPayingRecibo] = useState<any | null>(null);
  const [payFecha, setPayFecha] = useState(todayLocal());
  const [payMetodo, setPayMetodo] = useState<string>('efectivo');
  const [payNotas, setPayNotas] = useState('');

  const openPagar = (r: any) => {
    setPayingRecibo(r);
    setPayFecha(todayLocal());
    setPayMetodo('efectivo');
    setPayNotas('');
  };

  const marcarPagadoMut = useMutation({
    mutationFn: async () => {
      if (!payingRecibo || !empresa?.id || !user?.id) throw new Error('Datos incompletos');
      const r = payingRecibo;
      const concepto = `Pago de comisiones - ${r.vendedores?.nombre ?? 'Vendedor'} (corte ${fmtDate(r.fecha_corte)})`;
      const notasGasto = [`Método: ${payMetodo}`, payNotas].filter(Boolean).join(' · ');

      const { data: gasto, error: gErr } = await supabase.from('gastos').insert({
        empresa_id: empresa.id,
        vendedor_id: r.vendedor_id,
        user_id: user.id,
        fecha: payFecha,
        concepto,
        monto: r.total_comisiones,
        notas: notasGasto || null,
      }).select('id').single();
      if (gErr) throw gErr;

      const { error: upRec } = await supabase
        .from('pago_comisiones')
        .update({ estado: 'pagada', fecha_pago: payFecha, gasto_id: gasto.id, notas: notasGasto || null })
        .eq('id', r.id);
      if (upRec) throw upRec;

      const { error: upCom } = await supabase
        .from('venta_comisiones')
        .update({ pagada: true })
        .eq('pago_comision_id', r.id);
      if (upCom) throw upCom;
    },
    onSuccess: () => {
      toast.success('Recibo pagado y gasto registrado');
      setPayingRecibo(null);
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
      qc.invalidateQueries({ queryKey: ['gastos'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelarReciboMut = useMutation({
    mutationFn: async (reciboId: string) => {
      const { error: upCom } = await supabase
        .from('venta_comisiones')
        .update({ pago_comision_id: null })
        .eq('pago_comision_id', reciboId);
      if (upCom) throw upCom;
      const { error: delRec } = await supabase.from('pago_comisiones').delete().eq('id', reciboId);
      if (delRec) throw delRec;
    },
    onSuccess: () => {
      toast.success('Recibo cancelado, comisiones liberadas');
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['comisiones-por-pagar'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, (comisiones ?? []).length);
  const total = (comisiones ?? []).length;

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Comisiones <HelpButton title={HELP.comisiones.title} sections={HELP.comisiones.sections} /></h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          ['historial', 'Comisiones generadas'],
          ['por_pagar', 'Por pagar'],
          ['recibos', 'Recibos'],
          ['reglas', 'Reglas de comisión'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as TabKey)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'reglas' && <ComisionesReglasTab />}

      {tab === 'historial' && (
        <>
          {/* Filtros en una sola línea */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-44">
              <SearchableSelect
                options={vendedorOpts}
                value={vendedorFilter}
                onChange={v => { setVendedorFilter(v); setPage(0); }}
                placeholder="Vendedor"
              />
            </div>
            <div className="flex border border-border rounded overflow-hidden">
              {([['pendientes', 'Pendientes'], ['pagadas', 'Pagadas'], ['todas', 'Todas']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setPage(0); }}
                  className={cn(
                    'px-2.5 py-1.5 text-xs transition-colors',
                    statusFilter === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-border mx-1" />
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input type="date" className="input-odoo text-xs py-1.5 w-36" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPage(0); }} />
            <span className="text-xs text-muted-foreground">-</span>
            <input type="date" className="input-odoo text-xs py-1.5 w-36" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPage(0); }} />
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

          {/* Resumen por vendedor */}
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
                    <tr
                      key={r.vendedor_id}
                      className="border-b border-table-border last:border-0 hover:bg-table-hover cursor-pointer"
                      onClick={() => { setVendedorFilter(r.vendedor_id === 'sin' ? '' : r.vendedor_id); setPage(0); }}
                    >
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

          {/* Tabla */}
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
                  {paged.map((c: any) => (
                    <tr key={c.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                      <td className="py-1.5 px-3 text-xs">{fmtDate(c.fecha_venta)}</td>
                      <td className="py-1.5 px-3 text-xs font-mono">
                        {c.venta_id ? (
                          <a href={`/ventas/${c.venta_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            {c.ventas?.folio ?? '—'}
                          </a>
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
                  {paged.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">Sin comisiones en el rango seleccionado</td></tr>
                  )}
                </tbody>
              </table>
              {total > PAGE_SIZE && (
                <OdooPaginationLite from={from} to={to} total={total} page={page} pageSize={PAGE_SIZE} onPrev={() => setPage(p => Math.max(0, p - 1))} onNext={() => setPage(p => p + 1)} />
              )}
            </div>
          )}
        </>
      )}

      {tab === 'por_pagar' && (
        <>
          {/* Barra superior */}
          <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Pagar comisiones hasta:</span>
            <input type="date" className="input-odoo text-xs py-1.5 w-36" value={ppFechaCorte} onChange={e => { setPpFechaCorte(e.target.value); clearSel(); }} />
            <button onClick={selectAll} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Seleccionar todo</button>
            <button onClick={clearSel} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Limpiar</button>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-xs">Seleccionado: <span className="font-mono font-bold text-odoo-teal">{fmt(selectedTotal)}</span> ({selected.size})</div>
              <button
                onClick={() => generarMut.mutate()}
                disabled={generarMut.isPending || selected.size === 0}
                className="btn-odoo-primary"
              >
                <FileText className="h-4 w-4" /> Generar recibos
              </button>
            </div>
          </div>

          {loadingPP ? <TableSkeleton /> : ppGrupos.length === 0 ? (
            <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
              No hay comisiones pendientes hasta la fecha de corte
            </div>
          ) : (
            <div className="space-y-3">
              {ppGrupos.map(g => {
                const allSel = g.items.every(i => selected.has(i.id));
                const someSel = g.items.some(i => selected.has(i.id));
                const selCount = g.items.filter(i => selected.has(i.id)).length;
                const selTotal = g.items.filter(i => selected.has(i.id)).reduce((s, i) => s + (i.comision_monto ?? 0), 0);
                return (
                  <div key={g.vendedor_id} className="border border-border rounded overflow-hidden">
                    <div className="flex items-center gap-3 bg-muted/40 px-3 py-2 border-b border-table-border">
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = !allSel && someSel; }}
                        onChange={() => toggleVendor(g.items)}
                      />
                      <div className="font-semibold text-sm">{g.nombre}</div>
                      <div className="text-xs text-muted-foreground">{g.items.length} comisiones · Total: <span className="font-mono font-semibold text-odoo-teal">{fmt(g.total)}</span></div>
                      <div className="ml-auto text-xs">
                        Seleccionado: <span className="font-mono font-bold text-primary">{fmt(selTotal)}</span> ({selCount})
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-table-border">
                          <th className="th-odoo w-8"></th>
                          <th className="th-odoo text-left">Fecha</th>
                          <th className="th-odoo text-left">Folio</th>
                          <th className="th-odoo text-right">Venta</th>
                          <th className="th-odoo text-right">Comisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map(i => (
                          <tr key={i.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                            <td className="py-1.5 px-3 text-center">
                              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleOne(i.id)} />
                            </td>
                            <td className="py-1.5 px-3 text-xs">{fmtDate(i.fecha_venta)}</td>
                            <td className="py-1.5 px-3 text-xs font-mono">
                              {i.venta_id ? (
                                <a href={`/ventas/${i.venta_id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{i.ventas?.folio ?? '—'}</a>
                              ) : (i.ventas?.folio ?? '—')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-xs">{fmt(i.monto_venta)}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">{fmt(i.comision_monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'recibos' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex border border-border rounded overflow-hidden">
              {([['borrador', 'Por pagar'], ['pagada', 'Pagados'], ['todos', 'Todos']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRecibosEstado(key)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs transition-colors',
                    recibosEstado === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                  )}
                >{label}</button>
              ))}
            </div>
            <div className="ml-auto text-sm">
              Por pagar: <span className="font-mono font-bold text-amber-600">{fmt(totalBorrador)}</span>
            </div>
          </div>

          {loadingRecibos ? <TableSkeleton /> : (recibos ?? []).length === 0 ? (
            <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
              No hay recibos {recibosEstado === 'borrador' ? 'por pagar' : recibosEstado === 'pagada' ? 'pagados' : ''}
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-table-border">
                    <th className="th-odoo text-left">Generado</th>
                    <th className="th-odoo text-left">Vendedor</th>
                    <th className="th-odoo text-left">Corte</th>
                    <th className="th-odoo text-left">Pagado</th>
                    <th className="th-odoo text-right">Total</th>
                    <th className="th-odoo text-center">Estado</th>
                    <th className="th-odoo text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(recibos ?? []).map((r: any) => (
                    <tr key={r.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                      <td className="py-1.5 px-3 text-xs">{fmtDate(r.created_at)}</td>
                      <td className="py-1.5 px-3 text-xs font-medium">{r.vendedores?.nombre ?? '—'}</td>
                      <td className="py-1.5 px-3 text-xs">{fmtDate(r.fecha_corte)}</td>
                      <td className="py-1.5 px-3 text-xs">{r.fecha_pago ? fmtDate(r.fecha_pago) : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold text-odoo-teal">{fmt(r.total_comisiones)}</td>
                      <td className="py-1.5 px-3 text-center">
                        {r.estado === 'pagada' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Pagada</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Por pagar</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {r.estado === 'borrador' && (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => marcarPagadoMut.mutate(r.id)}
                              disabled={marcarPagadoMut.isPending}
                              className="px-2 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:bg-primary/90 inline-flex items-center gap-1"
                            >
                              <Check className="h-3 w-3" /> Marcar pagado
                            </button>
                            <button
                              onClick={() => { if (confirm('¿Cancelar recibo y liberar comisiones?')) cancelarReciboMut.mutate(r.id); }}
                              disabled={cancelarReciboMut.isPending}
                              className="px-2 py-1 text-[11px] bg-muted text-foreground rounded hover:bg-muted/70"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OdooPaginationLite({ from, to, total, onPrev, onNext, page, pageSize }: { from: number; to: number; total: number; page: number; pageSize: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{from}-{to} de {total}</span>
      <button onClick={onPrev} disabled={page === 0} className="px-2 py-1 bg-muted rounded disabled:opacity-50">‹</button>
      <button onClick={onNext} disabled={to >= total} className="px-2 py-1 bg-muted rounded disabled:opacity-50">›</button>
    </div>
  );
}
