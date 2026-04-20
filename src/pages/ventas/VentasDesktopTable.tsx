import { useState } from 'react';
import { Trash2, Gift, ChevronDown } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { cn, fmtDateTime } from '@/lib/utils';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';
import { VentaExpandedRow } from './VentaExpandedRow';

interface Props {
  items: any[];
  selected: Set<string>;
  allSelected: boolean;
  canDelete: boolean;
  fmt: (v: number | null | undefined) => string;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteTarget: (id: string) => void;
  empresaId?: string;
  empresa?: any;
  clientesList?: any[];
  /** Map of column key -> visibility */
  columnVisibility?: Record<string, boolean>;
}

export function VentasDesktopTable({ items, selected, allSelected, canDelete, fmt, onToggleAll, onToggleOne, onDeleteTarget, empresaId, empresa, clientesList, columnVisibility }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const v = (key: string) => columnVisibility ? columnVisibility[key] !== false : true;

  // Count visible data columns for the empty/footer colSpan
  const dataCols = ['folio','tipo','cliente','vendedor','condicion','fecha','subtotal','descuento','iva','total','saldo','status']
    .filter(k => v(k)).length;
  const totalCols = 1 /* checkbox */ + dataCols + 1 /* chevron */;

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-table-border text-left">
          <th className="py-2 px-3 w-10 text-center">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded border-input" />
          </th>
          {v('folio') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>}
          {v('tipo') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</th>}
          {v('cliente') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>}
          {v('vendedor') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</th>}
          {v('condicion') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Condición</th>}
          {v('fecha') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha / Hora</th>}
          {v('subtotal') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">Subtotal</th>}
          {v('descuento') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Descuento</th>}
          {v('iva') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">IVA</th>}
          {v('total') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>}
          {v('saldo') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Saldo</th>}
          {v('status') && <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</th>}
          <th className="py-2 px-2 w-8" />
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={totalCols} className="text-center py-12 text-muted-foreground">No hay ventas. Crea la primera.</td>
          </tr>
        )}
        {items.map((row: any) => {
          const isExpanded = expandedId === row.id;
          return (
            <>
              <tr
                key={row.id}
                className={cn(
                  "border-b border-table-border cursor-pointer transition-colors",
                  isExpanded ? "bg-primary/5" : selected.has(row.id) ? "bg-primary/5" : "hover:bg-table-hover"
                )}
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
              >
                <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); onToggleOne(row.id); }}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => onToggleOne(row.id)} className="rounded border-input" />
                </td>
                {v('folio') && <td className="py-2 px-3 font-mono text-xs font-medium">{row.folio || row.id.slice(0, 8)}</td>}
                {v('tipo') && (
                  <td className="py-2 px-3">
                    <span className={cn(
                      "text-[11px] font-medium px-2 py-0.5 rounded",
                      row.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                    )}>
                      {TIPO_LABELS[row.tipo] || row.tipo}
                    </span>
                  </td>
                )}
                {v('cliente') && <td className="py-2 px-3 max-w-[180px] truncate">{row.clientes?.nombre || (row.cliente_id ? '—' : 'Público en general')}</td>}
                {v('vendedor') && <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{row.vendedores?.nombre ?? '—'}</td>}
                {v('condicion') && <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{CONDICION_LABELS[row.condicion_pago] || row.condicion_pago}</td>}
                {v('fecha') && <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDateTime(row.created_at)}</td>}
                {v('subtotal') && <td className="py-2 px-3 text-right hidden md:table-cell text-muted-foreground tabular-nums">{fmt(row.subtotal)}</td>}
                {v('descuento') && (
                  <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
                    {(row.descuento_total ?? 0) > 0 ? (
                      <span className="flex items-center justify-end gap-1">
                        <Gift className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-destructive">-{fmt(row.descuento_total)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                {v('iva') && <td className="py-2 px-3 text-right hidden lg:table-cell text-muted-foreground tabular-nums">{fmt(row.iva_total)}</td>}
                {v('total') && <td className="py-2 px-3 text-right font-medium tabular-nums">{fmt(row.total)}</td>}
                {v('saldo') && (
                  <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
                    {(row.saldo_pendiente ?? 0) > 0 ? (
                      <span className="text-warning font-medium">{fmt(row.saldo_pendiente)}</span>
                    ) : (
                      <span className="text-muted-foreground">$0.00</span>
                    )}
                  </td>
                )}
                {v('status') && (
                  <td className="py-2 px-3 text-center">
                    <StatusChip status={row.status} />
                  </td>
                )}
                <td className="py-2 px-2 text-center w-8">
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </td>
              </tr>
              {isExpanded && (
                <VentaExpandedRow
                  key={`exp-${row.id}`}
                  venta={row}
                  fmt={fmt}
                  canDelete={canDelete}
                  onDeleteTarget={onDeleteTarget}
                  onCollapse={() => setExpandedId(null)}
                  empresaId={empresaId}
                  empresa={empresa}
                  clientesList={clientesList}
                />
              )}
            </>
          );
        })}
      </tbody>
      {items.length > 0 && (
        <tfoot>
          <tr className="bg-card border-t border-border font-semibold text-[12px]">
            <td colSpan={Math.max(1, totalCols - (v('saldo') ? 3 : 2))} className="py-2 px-3 text-muted-foreground">{items.length} ventas</td>
            {v('total') && <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(items.reduce((s: number, r: any) => s + (r.total ?? 0), 0))}</td>}
            {v('saldo') && <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums text-warning font-bold">{fmt(items.reduce((s: number, r: any) => s + (r.saldo_pendiente ?? 0), 0))}</td>}
            {v('status') && <td />}
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}
