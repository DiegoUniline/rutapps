import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fmtDate, todayLocal } from '@/lib/utils';

interface SaldoRow {
  cliente_id: string;
  cliente: string;
  cargos: number;
  abonos: number;
  saldo: number;
}

/**
 * Saldo de cada cliente A LA FECHA de corte (= "hasta"): cargos (ventas) menos
 * abonos (cobros) acumulados hasta esa fecha, considerando todo el historial.
 * Se reconstruye en la BD con saldo_clientes_a_la_fecha().
 */
export function ReporteSaldoClienteFecha({ hasta }: { desde: string; hasta: string }) {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  // "A la fecha" usa UNA sola fecha de corte (no un rango). Default: hoy.
  const [fecha, setFecha] = useState(hasta || todayLocal());

  const { data: rows = [], isLoading } = useQuery<SaldoRow[]>({
    queryKey: ['reporte-saldo-cliente-fecha', empresaId, fecha],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'ReporteSaldoClienteFecha');
      const { data, error } = await supabase.rpc('saldo_clientes_a_la_fecha', { p_empresa_id: eid, p_fecha: fecha } as any);
      if (error) throw error;
      return (data ?? []) as SaldoRow[];
    },
  });

  const conSaldo = useMemo(() => rows.filter(r => Math.abs(r.saldo) > 0.009), [rows]);
  const totalSaldo = conSaldo.reduce((s, r) => s + r.saldo, 0);
  const totalCargos = rows.reduce((s, r) => s + r.cargos, 0);
  const totalAbonos = rows.reduce((s, r) => s + r.abonos, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Saldo a la fecha</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="border border-border rounded-md px-2 py-1 text-[12px] bg-background" />
        <span className="text-[11px] text-muted-foreground">cargos (ventas) − abonos (cobros) acumulados al {fmtDate(fecha)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card label="Saldo total" value={fmt(totalSaldo)} tone="primary" />
        <Card label="Cargos" value={fmt(totalCargos)} tone="muted" />
        <Card label="Abonos" value={fmt(totalAbonos)} tone="muted" />
        <Card label="Clientes con saldo" value={String(conSaldo.length)} />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-accent/40 text-muted-foreground uppercase text-[10px] font-semibold">
            <tr>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-right px-3 py-2">Cargos</th>
              <th className="text-right px-3 py-2">Abonos</th>
              <th className="text-right px-3 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {conSaldo.map(r => (
              <tr key={r.cliente_id} className="border-t border-border">
                <td className="px-3 py-1.5">{r.cliente}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.cargos)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.abonos)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.saldo < 0 ? 'text-emerald-600' : ''}`}>{fmt(r.saldo)}</td>
              </tr>
            ))}
            {!isLoading && conSaldo.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin saldos a esta fecha</td></tr>
            )}
            {isLoading && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
          </tbody>
          {conSaldo.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalCargos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalAbonos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalSaldo)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'muted' }) {
  const styles = {
    default: 'bg-card border-border text-foreground',
    primary: 'bg-primary/10 border-primary/20 text-primary',
    muted: 'bg-muted border-border text-muted-foreground',
  }[tone];
  return (
    <div className={`border rounded-lg p-2 text-center ${styles}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-80 font-semibold">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
