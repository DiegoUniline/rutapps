import { useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fmtDate } from '@/lib/utils';

interface CxCRow {
  id: string;
  folio: string | null;
  fecha: string;
  cliente: string;
  tipo: string;
  vencimiento: string | null;
  total: number;
  abonado: number;
  saldo: number;
  vencido: boolean;
  esSaldoInicial: boolean;
}

/**
 * Cuentas por cobrar — estado de cuenta clásico agrupado por cliente.
 * Columnas: Concepto · Documento · Num · Fecha aplic · Fecha venc · Cargos · Abonos · Saldos.
 * Muestra TODOS los folios con saldo > 0 (no depende del rango de fechas).
 */
export function ReporteCuentasPorCobrar(_props: { desde: string; hasta: string }) {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: rows = [], isLoading } = useQuery<CxCRow[]>({
    queryKey: ['reporte-cxc', empresaId],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'ReporteCuentasPorCobrar');
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, fecha_vencimiento, status, es_saldo_inicial, clientes(nombre)')
        .eq('empresa_id', eid)
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelado')
        .order('fecha', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((v: any) => {
        const total = Number(v.total) || 0;
        const saldo = Number(v.saldo_pendiente) || 0;
        const esCredito = v.condicion_pago === 'credito';
        const vencimiento = esCredito && v.fecha_vencimiento ? String(v.fecha_vencimiento).slice(0, 10) : null;
        return {
          id: v.id,
          folio: v.folio,
          fecha: v.fecha,
          cliente: v.clientes?.nombre ?? 'Sin cliente',
          tipo: v.es_saldo_inicial ? 'Saldo inicial' : esCredito ? 'Crédito' : 'Contado',
          vencimiento,
          total,
          abonado: Math.max(0, total - saldo),
          saldo,
          vencido: !!vencimiento && vencimiento < hoy,
          esSaldoInicial: !!v.es_saldo_inicial,
        } as CxCRow;
      });
    },
  });

  // Agrupar por cliente
  const grupos = useMemo(() => {
    const map = new Map<string, CxCRow[]>();
    for (const r of rows) {
      if (!map.has(r.cliente)) map.set(r.cliente, []);
      map.get(r.cliente)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cliente, items], idx) => {
        items.sort((a, b) => a.fecha.localeCompare(b.fecha));
        const cargos = items.reduce((s, r) => s + r.total, 0);
        const abonos = items.reduce((s, r) => s + r.abonado, 0);
        const saldos = items.reduce((s, r) => s + r.saldo, 0);
        return { cliente, num: idx + 1, items, cargos, abonos, saldos };
      });
  }, [rows]);

  const totalCargos = grupos.reduce((s, g) => s + g.cargos, 0);
  const totalAbonos = grupos.reduce((s, g) => s + g.abonos, 0);
  const totalSaldos = grupos.reduce((s, g) => s + g.saldos, 0);
  const totalVencido = rows.filter(r => r.vencido).reduce((s, r) => s + r.saldo, 0);

  const padDoc = (folio: string | null) => (folio ? folio.replace(/\D/g, '').padStart(10, '0') || folio : '—');

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card label="Por cobrar" value={fmt(totalSaldos)} tone="primary" />
        <Card label="Vencido" value={fmt(totalVencido)} tone={totalVencido > 0 ? 'danger' : 'muted'} />
        <Card label="Folios" value={String(rows.length)} />
        <Card label="Clientes" value={String(grupos.length)} />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-[12px]">
          <thead className="text-muted-foreground text-[10px] font-semibold uppercase border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 w-10">Cliente</th>
              <th className="text-left px-3 py-2">Concepto</th>
              <th className="text-left px-3 py-2">Documento</th>
              <th className="text-center px-2 py-2">Num.</th>
              <th className="text-left px-3 py-2">Fecha aplic.</th>
              <th className="text-left px-3 py-2">Fecha venc.</th>
              <th className="text-right px-3 py-2">Cargos</th>
              <th className="text-right px-3 py-2">Abonos</th>
              <th className="text-right px-3 py-2">Saldos</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <Fragment key={g.cliente}>
                {/* Encabezado del cliente */}
                <tr className="bg-accent/30 border-t border-border">
                  <td className="px-3 py-1.5 font-semibold tabular-nums">{g.num}</td>
                  <td className="px-3 py-1.5 font-semibold uppercase tracking-wide" colSpan={8}>
                    {g.cliente}
                  </td>
                </tr>
                {/* Filas de folios */}
                {g.items.map(r => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5">{r.esSaldoInicial ? 'Saldo inicial' : 'Nota de venta'}</td>
                    <td className="px-3 py-1.5 font-mono">{padDoc(r.folio)}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums">1</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${r.vencido ? 'text-destructive font-semibold' : ''}`}>
                      {r.vencimiento ? fmtDate(r.vencimiento) : fmtDate(r.fecha)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.abonado > 0 ? fmt(r.abonado) : fmt(0)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(r.saldo)}</td>
                  </tr>
                ))}
                {/* Subtotal del cliente */}
                <tr className="border-t border-dashed border-border/80 text-[12px]">
                  <td />
                  <td colSpan={5} />
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.cargos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.abonos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.saldos)}</td>
                </tr>
              </Fragment>
            ))}
            {!isLoading && grupos.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin saldos pendientes</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
            )}
          </tbody>
          {grupos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-bold bg-accent/20">
                <td className="px-3 py-2" colSpan={6}>TOTAL GENERAL</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalCargos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalAbonos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalSaldos)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'danger' | 'muted' }) {
  const styles = {
    default: 'bg-card border-border text-foreground',
    primary: 'bg-primary/10 border-primary/20 text-primary',
    danger: 'bg-destructive/10 border-destructive/30 text-destructive',
    muted: 'bg-muted border-border text-muted-foreground',
  }[tone];
  return (
    <div className={`border rounded-lg p-2 text-center ${styles}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-80 font-semibold">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
