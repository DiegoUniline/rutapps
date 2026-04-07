import { useNavigate } from 'react-router-dom';
import { StatusChip } from '@/components/StatusChip';
import { cn, fmtDate } from '@/lib/utils';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';

interface Props {
  items: any[];
  fmt: (v: number | null | undefined) => string;
}

export function VentasProductosTable({ items, fmt }: Props) {
  const navigate = useNavigate();

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-table-border text-left">
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Cantidad</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">P. Unit.</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center hidden lg:table-cell">Estado</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={11} className="text-center py-12 text-muted-foreground">No hay líneas de producto.</td>
          </tr>
        )}
        {items.map((row: any, i: number) => (
          <tr
            key={`${row.venta_id}-${row.linea_id}-${i}`}
            className="border-b border-table-border cursor-pointer transition-colors hover:bg-table-hover"
            onClick={() => navigate(`/ventas/${row.venta_id}`)}
          >
            <td className="py-2 px-3 font-mono text-xs font-medium">{row.folio || row.venta_id?.slice(0, 8)}</td>
            <td className="py-2 px-3">
              <span className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded",
                row.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
              )}>
                {TIPO_LABELS[row.tipo] || row.tipo}
              </span>
            </td>
            <td className="py-2 px-3 max-w-[160px] truncate">{row.cliente_nombre || 'Público en general'}</td>
            <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{row.vendedor_nombre ?? '—'}</td>
            <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(row.fecha)}</td>
            <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{row.producto_codigo ?? ''}</td>
            <td className="py-2 px-3 max-w-[180px] truncate">{row.producto_nombre ?? ''}</td>
            <td className="py-2 px-3 text-right font-semibold tabular-nums">{row.cantidad}</td>
            <td className="py-2 px-3 text-right hidden md:table-cell text-muted-foreground tabular-nums">{fmt(row.precio_unitario)}</td>
            <td className="py-2 px-3 text-right font-medium tabular-nums">{fmt(row.linea_total)}</td>
            <td className="py-2 px-3 text-center hidden lg:table-cell">
              <StatusChip status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
      {items.length > 0 && (
        <tfoot>
          <tr className="bg-card border-t border-border font-semibold text-[12px]">
            <td colSpan={7} className="py-2 px-3 text-muted-foreground">{items.length} líneas</td>
            <td className="py-2 px-3 text-right tabular-nums">{items.reduce((s: number, r: any) => s + (r.cantidad ?? 0), 0)}</td>
            <td className="py-2 px-3 hidden md:table-cell" />
            <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, r: any) => s + (r.linea_total ?? 0), 0))}</td>
            <td className="hidden lg:table-cell" />
          </tr>
        </tfoot>
      )}
    </table>
  );
}
