import { useNavigate } from 'react-router-dom';
import { Trash2, Gift } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { cn, fmtDate } from '@/lib/utils';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';

interface Props {
  items: any[];
  selected: Set<string>;
  allSelected: boolean;
  canDelete: boolean;
  fmt: (v: number | null | undefined) => string;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteTarget: (id: string) => void;
}

export function VentasDesktopTable({ items, selected, allSelected, canDelete, fmt, onToggleAll, onToggleOne, onDeleteTarget }: Props) {
  const navigate = useNavigate();

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-table-border text-left">
          <th className="py-2 px-3 w-10 text-center">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded border-input" />
          </th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Condición</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">Subtotal</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Descuento</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Saldo</th>
          <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>
          <th className="py-2 px-2 w-8" />
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={13} className="text-center py-12 text-muted-foreground">No hay ventas. Crea la primera.</td>
          </tr>
        )}
        {items.map((v: any) => (
          <tr
            key={v.id}
            className={cn(
              "border-b border-table-border cursor-pointer transition-colors",
              selected.has(v.id) ? "bg-primary/5" : "hover:bg-table-hover"
            )}
            onClick={() => navigate(`/ventas/${v.id}`)}
          >
            <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); onToggleOne(v.id); }}>
              <input type="checkbox" checked={selected.has(v.id)} onChange={() => onToggleOne(v.id)} className="rounded border-input" />
            </td>
            <td className="py-2 px-3 font-mono text-xs font-medium">{v.folio || v.id.slice(0, 8)}</td>
            <td className="py-2 px-3">
              <span className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded",
                v.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
              )}>
                {TIPO_LABELS[v.tipo] || v.tipo}
              </span>
            </td>
            <td className="py-2 px-3 max-w-[180px] truncate">{v.clientes?.nombre || (v.cliente_id ? '—' : 'Público en general')}</td>
            <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{v.vendedores?.nombre ?? '—'}</td>
            <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{CONDICION_LABELS[v.condicion_pago] || v.condicion_pago}</td>
            <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDate(v.fecha)}</td>
            <td className="py-2 px-3 text-right hidden md:table-cell text-muted-foreground tabular-nums">{fmt(v.subtotal)}</td>
            <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
              {(v.descuento_total ?? 0) > 0 ? (
                <span className="flex items-center justify-end gap-1">
                  <Gift className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-destructive">-{fmt(v.descuento_total)}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-2 px-3 text-right font-medium tabular-nums">{fmt(v.total)}</td>
            <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
              {(v.saldo_pendiente ?? 0) > 0 ? (
                <span className="text-warning font-medium">{fmt(v.saldo_pendiente)}</span>
              ) : (
                <span className="text-muted-foreground">$0.00</span>
              )}
            </td>
            <td className="py-2 px-3 text-center">
              <StatusChip status={v.status} />
            </td>
            <td className="py-2 px-2 text-center w-8">
              {(v.status === 'borrador' || (v.status === 'cancelado' && canDelete)) && (
                <button
                  className="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                  title="Eliminar"
                  onClick={(e) => { e.stopPropagation(); onDeleteTarget(v.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      {items.length > 0 && (
        <tfoot>
          <tr className="bg-card border-t border-border font-semibold text-[12px]">
            <td colSpan={9} className="py-2 px-3 text-muted-foreground">{items.length} ventas</td>
            <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, v: any) => s + (v.total ?? 0), 0))}</td>
            <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums text-warning font-bold">{fmt(items.reduce((s: number, v: any) => s + (v.saldo_pendiente ?? 0), 0))}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}
