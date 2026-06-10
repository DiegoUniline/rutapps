import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardEquipo, type EquipoRow } from '../hooks/useDashboardEquipo';
import type { DateRange } from '@/hooks/useDashboardData';

interface Props {
  range: DateRange;
  metaMes: number;
  money: (n: number) => string;
}

type SortKey = 'venta' | 'metaPct' | 'efectividadPct' | 'cumplimientoRutaPct' | 'cobrado' | 'carteraVencida';

const DOT: Record<EquipoRow['semaforo'], string> = {
  verde: 'bg-[hsl(var(--success))]',
  ambar: 'bg-[hsl(var(--warning))]',
  rojo: 'bg-destructive',
};

export default function TabEquipo({ range, metaMes, money }: Props) {
  const { data: rows = [], isLoading } = useDashboardEquipo(range, metaMes);
  const [sortKey, setSortKey] = useState<SortKey>('venta');
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return r;
  }, [rows, sortKey, asc]);

  const topVenta = useMemo(() => [...rows].sort((a, b) => b.venta - a.venta).slice(0, 5), [rows]);
  const topMargen = useMemo(() => [...rows].sort((a, b) => b.margen - a.margen).slice(0, 5), [rows]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setAsc(!asc);
    else { setSortKey(k); setAsc(false); }
  };

  if (isLoading) return <div className="h-48 bg-accent/30 rounded-xl animate-pulse" />;
  if (rows.length === 0) return <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">Sin datos en este periodo</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniList title="Top 5 por venta" rows={topVenta} kind="venta" money={money} />
        <MiniList title="Top 5 por margen" rows={topMargen} kind="margen" money={money} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30 text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                <Th label="Venta $" sortKey="venta" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <Th label="% Meta" sortKey="metaPct" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <Th label="Efectividad" sortKey="efectividadPct" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <Th label="% Ruta" sortKey="cumplimientoRutaPct" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <Th label="Cobrado $" sortKey="cobrado" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <Th label="Cartera vencida" sortKey="carteraVencida" current={sortKey} asc={asc} onClick={setSort} align="right" />
                <th className="text-center px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <>
                  <tr
                    key={r.vendedorId}
                    onClick={() => setExpanded((s) => (s === r.vendedorId ? null : r.vendedorId))}
                    className="border-b border-border/50 hover:bg-accent/20 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium">{r.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.venta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.metaPct.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.efectividadPct.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cumplimientoRutaPct.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.cobrado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{money(r.carteraVencida)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('inline-block w-3 h-3 rounded-full', DOT[r.semaforo])} />
                    </td>
                  </tr>
                  {expanded === r.vendedorId && (
                    <tr className="bg-accent/10">
                      <td colSpan={8} className="px-3 py-3 text-xs">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <Info label="Visitas realizadas" value={String(r.visitas)} />
                          <Info label="Visitas planeadas" value={String(r.visitasPlaneadas)} />
                          <Info label="Ventas con pedido" value={String(r.ventasConPedido)} />
                          <Info label="Margen bruto" value={money(r.margen)} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ label, sortKey, current, asc, onClick, align = 'left' }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onClick: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = current === sortKey;
  return (
    <th className={`px-3 py-2 font-medium select-none cursor-pointer text-${align}`} onClick={() => onClick(sortKey)}>
      <span className={cn('inline-flex items-center gap-1', active && 'text-foreground')}>
        {label}
        {active && (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MiniList({ title, rows, kind, money }: { title: string; rows: EquipoRow[]; kind: 'venta' | 'margen'; money: (n: number) => string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">Sin datos en este periodo</div>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.vendedorId} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}.</span>
                <span className="font-medium">{r.nombre}</span>
              </span>
              <span className="tabular-nums font-semibold">{money(kind === 'venta' ? r.venta : r.margen)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
