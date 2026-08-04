import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardAging } from '../hooks/useDashboardAging';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { DateRange } from '@/hooks/useDashboardData';
import { startOfWeek, format, eachWeekOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  range: DateRange;
  ventasMes: number;
  ventas: any[];
  cobros: any[];
  money: (n: number) => string;
}

const BUCKET_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

export default function TabCartera({ range, ventasMes, ventas, cobros, money }: Props) {
  const { data, isLoading } = useDashboardAging();

  const dsoDias = useMemo(() => {
    if (!data || !data.carteraTotal) return 0;
    const dias = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86400000) + 1);
    if (ventasMes <= 0) return 0;
    return (data.carteraTotal / ventasMes) * dias;
  }, [data, ventasMes, range]);

  const semanasData = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
    return weeks.map((w) => {
      const wEnd = new Date(w); wEnd.setDate(wEnd.getDate() + 6);
      const vendido = (ventas ?? []).reduce((s, v: any) => {
        const f = new Date(v.fecha);
        return f >= w && f <= wEnd ? s + Number(v.total || 0) : s;
      }, 0);
      const cobrado = (cobros ?? []).reduce((s, c: any) => {
        const f = new Date(c.fecha);
        return f >= w && f <= wEnd ? s + Number(c.monto_efectivo ?? c.monto || 0) : s;
      }, 0);
      return { semana: format(w, "d MMM", { locale: es }), vendido, cobrado };
    });
  }, [ventas, cobros, range]);

  const exportCsv = () => {
    if (!data) return;
    const rows = ['Cliente,Folio,Saldo,Días vencido,Vendedor,Fecha'];
    data.vencidos.forEach((v) => {
      const clean = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      rows.push([clean(v.cliente), clean(v.folio || ''), v.saldo.toFixed(2), String(v.diasVencido), clean(v.vendedor), v.fecha].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `cartera-vencida-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="h-48 bg-accent/30 rounded-xl animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {data.buckets.map((b, i) => (
          <div key={b.label} className="bg-card border border-border rounded-xl p-3" style={{ borderTopWidth: 3, borderTopColor: BUCKET_COLORS[i] }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{b.label}</div>
            <div className="text-xl font-bold tabular-nums mt-1">{money(b.monto)}</div>
            <div className="text-[11px] text-muted-foreground">{b.clientes} cliente{b.clientes === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 md:col-span-1">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">DSO · Días promedio de cobro</div>
          <div className="text-3xl font-bold tabular-nums mt-2">{dsoDias.toFixed(1)} días</div>
          <div className="text-[11px] text-muted-foreground mt-1">Cartera {money(data.carteraTotal)} vs venta del periodo</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 md:col-span-2">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Cobrado vs Vendido por semana</div>
          {semanasData.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sin datos en este periodo</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={semanasData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => money(v).replace(/[^\d]/g, '').slice(0, 4) + 'k'} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="vendido" stackId="a" fill="hsl(var(--chart-1))" name="Vendido" />
                <Bar dataKey="cobrado" stackId="b" fill="hsl(var(--success))" name="Cobrado" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Clientes con saldo vencido</h4>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={data.vencidos.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
        </div>
        {data.vencidos.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin clientes vencidos</div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-accent/30 z-10">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Folio</th>
                  <th className="text-right px-3 py-2 font-medium">Saldo</th>
                  <th className="text-right px-3 py-2 font-medium">Días vencido</th>
                  <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.vencidos.map((v) => (
                  <tr key={v.ventaId} className="border-b border-border/40">
                    <td className="px-3 py-2 font-medium">{v.cliente}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.folio || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{money(v.saldo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.diasVencido}</td>
                    <td className="px-3 py-2">{v.vendedor}</td>
                    <td className="px-3 py-2 text-xs">{v.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
