import { useState, useMemo, lazy, Suspense } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVendedores } from '@/hooks/useClientes';
import { OdooPagination } from '@/components/OdooPagination';
import SearchableSelect from '@/components/SearchableSelect';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Check, DollarSign } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import ComisionesReglasTab from '@/components/comisiones/ComisionesReglasTab';

const PAGE_SIZE = 20;

export default function ComisionesPage() {
  const { user, empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'historial' | 'reglas'>('historial');
  const [vendedorFilter, setVendedorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'pendientes' | 'pagadas' | 'todas'>('pendientes');
  const [page, setPage] = useState(0);

  const [payVendedor, setPayVendedor] = useState<string>('');
  const [payFechaCorte, setPayFechaCorte] = useState(new Date().toISOString().slice(0, 10));
  const [showPayForm, setShowPayForm] = useState(false);

  const { data: vendedores } = useVendedores();

  const { data: comisiones, isLoading } = useQuery({
    queryKey: ['venta_comisiones', vendedorFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('venta_comisiones')
        .select('id, venta_id, vendedor_id, producto_id, monto_venta, comision_pct, comision_monto, pagada, fecha_venta, ventas(folio), productos(nombre), vendedores(nombre)')
        .order('fecha_venta', { ascending: false });
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter === 'pendientes') q = q.eq('pagada', false);
      if (statusFilter === 'pagadas') q = q.eq('pagada', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pendingForPay } = useQuery({
    queryKey: ['comisiones-pendientes-pago', payVendedor, payFechaCorte],
    enabled: !!payVendedor && !!payFechaCorte,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_comisiones')
        .select('id, comision_monto, fecha_venta')
        .eq('vendedor_id', payVendedor)
        .eq('pagada', false)
        .lte('fecha_venta', payFechaCorte)
        .order('fecha_venta');
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalPendiente = useMemo(() =>
    (pendingForPay ?? []).reduce((s, c) => s + (c.comision_monto ?? 0), 0),
    [pendingForPay]
  );

  const payMut = useMutation({
    mutationFn: async () => {
      if (!payVendedor || !empresa?.id || !user?.id) throw new Error('Datos incompletos');
      const ids = (pendingForPay ?? []).map(c => c.id);
      if (ids.length === 0) throw new Error('No hay comisiones pendientes');

      const { data: pago, error: pagoErr } = await supabase.from('pago_comisiones').insert({
        empresa_id: empresa.id,
        vendedor_id: payVendedor,
        fecha_corte: payFechaCorte,
        total_comisiones: totalPendiente,
        user_id: user.id,
      }).select('id').single();
      if (pagoErr) throw pagoErr;

      const { error: upErr } = await supabase
        .from('venta_comisiones')
        .update({ pagada: true, pago_comision_id: pago.id })
        .in('id', ids);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success('Comisiones pagadas');
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
      qc.invalidateQueries({ queryKey: ['comisiones-pendientes-pago'] });
      setShowPayForm(false);
      setPayVendedor('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const paged = useMemo(() => (comisiones ?? []).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [comisiones, page]);
  const totalMonto = useMemo(() => (comisiones ?? []).reduce((s, c) => s + c.comision_monto, 0), [comisiones]);

  const vendedorOpts = [{ value: '', label: 'Todos los vendedores' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))];
  const vendedorPayOpts = (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));

  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, (comisiones ?? []).length);
  const total = (comisiones ?? []).length;

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">Comisiones <HelpButton title={HELP.comisiones.title} sections={HELP.comisiones.sections} /></h1>
        {tab === 'historial' && (
          <button onClick={() => setShowPayForm(true)} className="btn-odoo-primary">
            <DollarSign className="h-4 w-4" /> Pagar comisiones
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([['historial', 'Comisiones generadas'], ['reglas', 'Reglas de comisión']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
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

      {tab === 'reglas' ? (
        <ComisionesReglasTab />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-48">
              <SearchableSelect
                options={vendedorOpts}
                value={vendedorFilter}
                onChange={v => { setVendedorFilter(v); setPage(0); }}
                placeholder="Vendedor"
              />
            </div>
            <div className="flex border border-border rounded overflow-hidden">
              {(['pendientes', 'pagadas', 'todas'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(0); }}
                  className={cn(
                    'px-3 py-1.5 text-xs capitalize transition-colors',
                    statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="ml-auto text-sm font-semibold text-foreground">
              Total: <span className="text-odoo-teal font-mono">{fmt(totalMonto)}</span>
            </div>
          </div>

          {/* Pay form */}
          {showPayForm && (
            <div className="bg-card border border-primary/30 rounded-lg p-4 shadow-lg space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Pagar comisiones pendientes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendedor</label>
                  <SearchableSelect
                    options={vendedorPayOpts}
                    value={payVendedor}
                    onChange={setPayVendedor}
                    placeholder="Seleccionar vendedor"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Pagar hasta fecha</label>
                  <input
                    type="date"
                    className="input-odoo w-full"
                    value={payFechaCorte}
                    onChange={e => setPayFechaCorte(e.target.value)}
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-xs text-muted-foreground mb-1">
                    {(pendingForPay ?? []).length} comisiones pendientes
                  </div>
                  <div className="text-lg font-bold text-odoo-teal font-mono">
                    $ {totalPendiente.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => payMut.mutate()}
                  disabled={payMut.isPending || !payVendedor || totalPendiente <= 0}
                  className="btn-odoo-primary"
                >
                  <Check className="h-4 w-4" /> Pagar $ {totalPendiente.toFixed(2)}
                </button>
                <button onClick={() => setShowPayForm(false)} className="btn-odoo-secondary">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Table */}
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
                      <td className="py-1.5 px-3 text-xs">{c.fecha_venta}</td>
                      <td className="py-1.5 px-3 text-xs font-mono">{c.ventas?.folio ?? '—'}</td>
                      <td className="py-1.5 px-3 text-xs">{c.vendedores?.nombre ?? '—'}</td>
                      <td className="py-1.5 px-3 text-xs">{c.productos?.nombre ?? '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-xs">$ {c.monto_venta?.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-xs">{c.comision_pct}%</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">$ {c.comision_monto?.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-center">
                        {c.pagada ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Pagada</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">
                      Sin comisiones {statusFilter !== 'todas' ? statusFilter : ''}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <OdooPagination
              from={from}
              to={to}
              total={total}
              onPrev={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => p + 1)}
            />
          )}
        </>
      )}
    </div>
  );
}
