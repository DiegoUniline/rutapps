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

/** Suma N días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function addDays(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
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
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, dias_credito, clientes(nombre), cobro_aplicaciones(monto_aplicado, cobros!inner(status))')
        .eq('empresa_id', eid)
        .eq('es_saldo_inicial', false)
        .gt('saldo_pendiente', 0.009)
        .neq('status', 'cancelado')
        .neq('status', 'borrador')
        .order('fecha', { ascending: true });

      return (data ?? []).map((v: any) => {
        const abonado = (v.cobro_aplicaciones ?? [])
          .filter((ca: any) => (ca.cobros?.status ?? 'activo') !== 'cancelado')
          .reduce((s: number, ca: any) => s + Number(ca.monto_aplicado || 0), 0);
        const esCredito = v.condicion_pago === 'credito';
        const dias = Number(v.dias_credito) || 0;
        const vencimiento = esCredito && dias > 0 ? addDays(v.fecha, dias) : null;
        return {
          id: v.id,
          folio: v.folio,
          fecha: v.fecha,
          cliente: v.clientes?.nombre ?? 'Sin cliente',
          tipo: esCredito ? 'Crédito' : 'Contado',
          vencimiento,
          total: Number(v.total) || 0,
          abonado,
          saldo: Number(v.saldo_pendiente) || 0,
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
