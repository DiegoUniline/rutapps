import { ClipboardCheck, Route, ShoppingBag, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  efectividadPct: number;
  visitas: number;
  ventasConPedido: number;
  cumplimientoPct: number;
  visitasPlaneadas: number;
  dropSize: number;
  cobertura: number;
  clientesConCompra: number;
  clientesActivos: number;
  clientesSinCompra30d: number;
  onSinCompraClick?: () => void;
  money: (n: number) => string;
}

function Tile({ title, icon: Icon, value, subtitle, color, onClick }: {
  title: string; icon: any; value: string; subtitle?: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn('bg-card border border-border rounded-xl p-3 sm:p-4 flex flex-col gap-1 sm:gap-2 min-w-0 hover:shadow-md transition-shadow', onClick && 'cursor-pointer')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight min-w-0">{title}</span>
        <div className={cn('w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0', color)}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
        </div>
      </div>
      <div className="text-lg sm:text-2xl font-bold text-foreground tracking-tight truncate">{value}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground leading-tight">{subtitle}</div>}
    </div>
  );
}

export default function KpiExtras(p: Props) {
  return (
    <>
      <Tile
        title="Efectividad"
        icon={ClipboardCheck}
        value={`${p.efectividadPct.toFixed(0)}%`}
        subtitle={`${p.ventasConPedido} de ${p.visitas} visitas`}
        color="bg-[hsl(var(--chart-4))]"
      />
      <Tile
        title="Cumplimiento ruta"
        icon={Route}
        value={`${p.cumplimientoPct.toFixed(0)}%`}
        subtitle={`${p.visitas} de ${p.visitasPlaneadas} planeadas`}
        color="bg-[hsl(var(--chart-2))]"
      />
      <Tile
        title="Drop size"
        icon={ShoppingBag}
        value={p.money(p.dropSize)}
        subtitle="por punto de venta"
        color="bg-[hsl(var(--chart-1))]"
      />
      <Tile
        title="Cobertura"
        icon={Users}
        value={`${p.cobertura.toFixed(0)}%`}
        subtitle={
          <span className="hover:underline">
            {p.clientesSinCompra30d} clientes sin compra 30+ días
          </span>
        }
        color="bg-[hsl(var(--chart-3))]"
        onClick={p.onSinCompraClick}
      />
    </>
  );
}
