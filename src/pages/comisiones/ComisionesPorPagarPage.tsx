import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { cn, todayLocal, fmtDate } from '@/lib/utils';
import { Calendar, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

export default function ComisionesPorPagarPage() {
  const { user, empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [ppFechaCorte, setPpFechaCorte] = useState(todayLocal());
  const [ppSaldoFilter, setPpSaldoFilter] = useState<'cobradas' | 'pendientes' | 'todas'>('cobradas');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedVendors, setCollapsedVendors] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => setCollapsedVendors(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { data: pendientesPP, isLoading: loadingPP } = useQuery({
    queryKey: ['comisiones-por-pagar', empresa?.id, ppFechaCorte, ppSaldoFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Embed inner siempre, para poder EXCLUIR comisiones de ventas canceladas
      // (una comisión no debe pagarse si la venta se canceló).
      const ventasEmbed = 'ventas!inner(folio, saldo_pendiente, status)';
      let q = supabase.from('venta_comisiones')
        .select(`id, vendedor_id, comision_monto, monto_venta, fecha_venta, venta_id, ${ventasEmbed}, vendedores:profiles!vendedor_id(nombre)`)
        .eq('empresa_id', empresa!.id)
        .eq('pagada', false)
        .is('pago_comision_id', null)
        .neq('ventas.status', 'cancelado')
        .lte('fecha_venta', ppFechaCorte)
        .order('fecha_venta');
      if (ppSaldoFilter === 'cobradas') q = q.eq('ventas.saldo_pendiente', 0);
      if (ppSaldoFilter === 'pendientes') q = q.gt('ventas.saldo_pendiente', 0);
      const { data, error } = await q;
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
      g.count += 1; g.total += c.comision_monto ?? 0;
    }
    return Array.from(map.values());
  }, [pendientesPP, selected]);

  const selectedTotal = useMemo(() => selectedSummary.reduce((s, g) => s + g.total, 0), [selectedSummary]);
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVendor = (items: any[]) => setSelected(prev => {
    const n = new Set(prev);
    const allSel = items.every(i => n.has(i.id));
    if (allSel) items.forEach(i => n.delete(i.id)); else items.forEach(i => n.add(i.id));
    return n;
  });
  const selectAll = () => setSelected(new Set((pendientesPP ?? []).map(c => c.id)));
  const clearSel = () => setSelected(new Set());

  const generarMut = useMutation({
    mutationFn: async () => {
      if (!empresa?.id || !user?.id) throw new Error('Datos incompletos');
      if (selected.size === 0) throw new Error('Selecciona al menos una comisión');
      const itemIds = (pendientesPP ?? []).filter(c => selected.has(c.id)).map(c => c.id);
      const total = (pendientesPP ?? []).filter(c => selected.has(c.id)).reduce((s, c) => s + (c.comision_monto ?? 0), 0);
      const vendedorIds = new Set((pendientesPP ?? []).filter(c => selected.has(c.id)).map(c => c.vendedor_id).filter(Boolean));
      const vendedorId = vendedorIds.size === 1 ? Array.from(vendedorIds)[0] : null;
      const notas = vendedorId ? null : `Recibo agrupado · ${selectedSummary.map(g => `${g.nombre} (${fmt(g.total)})`).join(' · ')}`;
      const { data: pago, error: pagoErr } = await supabase.from('pago_comisiones').insert({
        empresa_id: empresa.id, vendedor_id: vendedorId, fecha_corte: ppFechaCorte,
        total_comisiones: total, user_id: user.id, estado: 'pendiente', notas,
      }).select('id').single();
      if (pagoErr) throw pagoErr;
      const BATCH = 100;
      for (let i = 0; i < itemIds.length; i += BATCH) {
        const slice = itemIds.slice(i, i + BATCH);
        const { error: upErr } = await supabase.from('venta_comisiones').update({ pago_comision_id: pago.id }).in('id', slice);
        if (upErr) throw upErr;
      }
    },
    onSuccess: () => {
      toast.success('Recibo generado');
      clearSel();
      qc.invalidateQueries({ queryKey: ['comisiones-por-pagar'] });
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      qc.invalidateQueries({ queryKey: ['venta_comisiones'] });
      navigate('/comisiones/recibos');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded p-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Pagar comisiones hasta:</span>
        <input type="date" className="input-odoo text-xs py-1.5 w-36" value={ppFechaCorte} onChange={e => { setPpFechaCorte(e.target.value); clearSel(); }} />
        <div className="h-6 w-px bg-border mx-1" />
        <div className="flex border border-border rounded overflow-hidden">
          {([['cobradas', 'Cobradas'], ['pendientes', 'Por cobrar'], ['todas', 'Todas']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setPpSaldoFilter(key); clearSel(); }}
              className={cn('px-2.5 py-1.5 text-xs transition-colors', ppSaldoFilter === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>{label}</button>
          ))}
        </div>
        <button onClick={selectAll} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Seleccionar todo</button>
        <button onClick={clearSel} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Limpiar</button>
        <button onClick={() => setCollapsedVendors(new Set(ppGrupos.map(g => g.vendedor_id)))} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Contraer todo</button>
        <button onClick={() => setCollapsedVendors(new Set())} className="px-2 py-1 text-[11px] bg-muted hover:bg-muted/70 rounded">Expandir todo</button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs">Seleccionado: <span className="font-mono font-bold text-odoo-teal">{fmt(selectedTotal)}</span> ({selected.size})</div>
          <button onClick={() => generarMut.mutate()} disabled={generarMut.isPending || selected.size === 0} className="btn-odoo-primary">
            <FileText className="h-4 w-4" /> Generar recibo
          </button>
        </div>
      </div>

      {loadingPP ? <TableSkeleton /> : ppGrupos.length === 0 ? (
        <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
          {ppSaldoFilter === 'cobradas' ? 'No hay comisiones de ventas cobradas hasta la fecha de corte'
            : ppSaldoFilter === 'pendientes' ? 'No hay comisiones de ventas por cobrar hasta la fecha de corte'
            : 'No hay comisiones pendientes hasta la fecha de corte'}
        </div>
      ) : (
        <div className="space-y-3">
          {ppGrupos.map(g => {
            const allSel = g.items.every(i => selected.has(i.id));
            const someSel = g.items.some(i => selected.has(i.id));
            const selCount = g.items.filter(i => selected.has(i.id)).length;
            const selTotal = g.items.filter(i => selected.has(i.id)).reduce((s, i) => s + (i.comision_monto ?? 0), 0);
            const cobradas = g.items.filter(i => i.ventas?.saldo_pendiente === 0).length;
            const porCobrar = g.items.filter(i => (i.ventas?.saldo_pendiente ?? 0) > 0).length;
            return (
              <div key={g.vendedor_id} className="border border-border rounded overflow-hidden">
                <div className="flex items-center gap-3 bg-muted/40 px-3 py-2 border-b border-table-border">
                  <input type="checkbox" checked={allSel}
                    ref={el => { if (el) el.indeterminate = !allSel && someSel; }}
                    onChange={() => toggleVendor(g.items)} onClick={e => e.stopPropagation()} />
                  <button type="button" onClick={() => toggleCollapse(g.vendedor_id)} className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
                    {collapsedVendors.has(g.vendedor_id) ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm">{g.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.items.length} comisiones
                      {cobradas > 0 && <span className="ml-1 text-green-600">· {cobradas} cobradas</span>}
                      {porCobrar > 0 && <span className="ml-1 text-amber-600">· {porCobrar} por cobrar</span>}
                      {' · Total: '}<span className="font-mono font-semibold text-odoo-teal">{fmt(g.total)}</span>
                    </span>
                  </button>
                  <div className="text-xs">Seleccionado: <span className="font-mono font-bold text-primary">{fmt(selTotal)}</span> ({selCount})</div>
                </div>
                {!collapsedVendors.has(g.vendedor_id) && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-table-border">
                        <th className="th-odoo w-8"></th>
                        <th className="th-odoo text-left">Fecha</th>
                        <th className="th-odoo text-left">Folio</th>
                        <th className="th-odoo text-right">Venta</th>
                        <th className="th-odoo text-right">Saldo venta</th>
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
                          <td className="py-1.5 px-3 text-right font-mono text-xs">
                            {i.ventas?.saldo_pendiente !== undefined && i.ventas?.saldo_pendiente !== null ? (
                              <span className={i.ventas.saldo_pendiente === 0 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                                {fmt(i.ventas.saldo_pendiente)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-semibold text-odoo-teal">{fmt(i.comision_monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
