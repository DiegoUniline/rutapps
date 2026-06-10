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
      className={cn('bg-card border border-border rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow', onClick && 'cursor-pointer')}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
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
