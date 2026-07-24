import { useMemo } from 'react';
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
}

/**
 * Cuentas por cobrar: UNA fila por folio (venta con saldo), no por producto.
 * Columnas: Fecha · Cliente · Folio · Tipo · Vence · Total · Abonado · Saldo.
 */
// Cuentas por cobrar = saldo vivo de crédito. Muestra TODOS los folios con
// saldo pendiente, sin importar la fecha (no es un reporte por período).
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
      // Misma base que la vista de Finanzas / Por Cobrar (que sí lista todo):
      // saldo_pendiente > 0 y status != cancelado, incluyendo saldos iniciales.
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
          abonado: Math.max(0, total - saldo),  // pagado = total − saldo (convención del sistema)
          saldo,
          vencido: !!vencimiento && vencimiento < hoy,
        } as CxCRow;
      });
    },
  });

  // Orden: por cliente, luego por fecha (para monitorear crédito por cliente).
  const items = useMemo(
    () => [...rows].sort((a, b) => a.cliente.localeCompare(b.cliente) || a.fecha.localeCompare(b.fecha)),
    [rows],
  );

  const totalSaldo = items.reduce((s, r) => s + r.saldo, 0);
  const totalVencido = items.filter(r => r.vencido).reduce((s, r) => s + r.saldo, 0);
  const clientesUnicos = new Set(items.map(r => r.cliente)).size;

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card label="Por cobrar" value={fmt(totalSaldo)} tone="primary" />
        <Card label="Vencido" value={fmt(totalVencido)} tone={totalVencido > 0 ? 'danger' : 'muted'} />
        <Card label="Folios" value={String(items.length)} />
        <Card label="Clientes" value={String(clientesUnicos)} />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-accent/40 text-muted-foreground uppercase text-[10px] font-semibold">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Cliente</th>
              <th className="text-left px-3 py-2">Folio</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Vence</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Abonado</th>
              <th className="text-right px-3 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                <td className="px-3 py-1.5">{r.cliente}</td>
                <td className="px-3 py-1.5 font-mono">{r.folio ?? '—'}</td>
                <td className="px-3 py-1.5">{r.tipo}</td>
                <td className={`px-3 py-1.5 whitespace-nowrap ${r.vencido ? 'text-destructive font-semibold' : ''}`}>
                  {r.vencimiento ? fmtDate(r.vencimiento) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.abonado)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(r.saldo)}</td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin saldos pendientes</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-3 py-2" colSpan={7}>Total por cobrar</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalSaldo)}</td>
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
