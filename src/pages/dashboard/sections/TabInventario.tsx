import { Package, AlertTriangle } from 'lucide-react';
import { useDashboardInventarioCamion } from '../hooks/useDashboardInventarioCamion';
import type { DateRange } from '@/hooks/useDashboardData';

interface Props {
  range: DateRange;
  money: (n: number) => string;
}

export default function TabInventario({ range, money }: Props) {
  const { data, isLoading } = useDashboardInventarioCamion(range);

  if (isLoading) return <div className="h-48 bg-accent/30 rounded-xl animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {data.camiones.length === 0 ? (
          <div className="md:col-span-3 bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">Sin almacenes activos</div>
        ) : (
          data.camiones.map((c) => (
            <div key={c.almacenId} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.nombre}</span>
              </div>
              <div className="text-xl font-bold tabular-nums">{money(c.valor)}</div>
              <div className="text-[11px] text-muted-foreground">{c.uds.toLocaleString('es-MX', { maximumFractionDigits: 2 })} uds en stock</div>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 md:col-span-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Mermas y ajustes</span>
          </div>
          <div className="text-2xl font-bold tabular-nums mt-2">{money(data.mermasTotal)}</div>
          <div className="text-[11px] text-muted-foreground">{data.mermasCount} registros en el periodo</div>
        </div>
        <div className="bg-card border border-border rounded-xl md:col-span-2 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Mermas registradas</h4>
          </div>
          {data.mermasList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin mermas en este periodo</div>
          ) : (
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-accent/30 z-10">
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left px-3 py-2 font-medium">Folio</th>
                    <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium">Motivo</th>
                    <th className="text-right px-3 py-2 font-medium">Costo</th>
                    <th className="text-right px-3 py-2 font-medium">Valor venta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mermasList.map((m) => (
                    <tr key={m.id} className="border-b border-border/40">
                      <td className="px-3 py-2 font-medium">{m.folio || '—'}</td>
                      <td className="px-3 py-2 text-xs">{m.fecha}</td>
                      <td className="px-3 py-2 text-xs">{m.motivo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(m.total_costo)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(m.total_venta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
