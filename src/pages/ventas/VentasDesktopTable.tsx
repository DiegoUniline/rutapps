import React, { useState } from 'react';
import { Trash2, Gift, ChevronDown, Lock } from 'lucide-react';
import { StatusChip } from '@/components/StatusChip';
import { cn, fmtDateTime } from '@/lib/utils';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';
import { VentaExpandedRow } from './VentaExpandedRow';
import { ClienteLink } from '@/components/links/EntityLinks';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';
import { isCerradaParcial, totalEfectivoVenta, ventaCerradaBadgeLabel, saldoRealVenta } from '@/lib/ventaCerrada';
import { isVentaEntregadaParcial } from '@/lib/ventaEntregaParcial';

interface Props {
  items: any[];
  selected: Set<string>;
  allSelected: boolean;
  canDelete: boolean;
  fmt: (v: number | null | undefined) => string;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onDeleteTarget: (id: string) => void;
  onCancelTarget?: (id: string) => void;
  empresaId?: string;
  empresa?: any;
  clientesList?: any[];
  /** Map of column key -> visibility */
  columnVisibility?: Record<string, boolean>;
}

export function VentasDesktopTable({ items, selected, allSelected, canDelete, fmt, onToggleAll, onToggleOne, onDeleteTarget, onCancelTarget, empresaId, empresa, clientesList, columnVisibility }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const v = (key: string) => columnVisibility ? columnVisibility[key] !== false : true;
  const { sorted, sort, toggle } = useSortableTable(items, (r, k) => {
    if (k === 'cliente') return r.clientes?.nombre ?? '';
    if (k === 'vendedor') return r.vendedores?.nombre ?? '';
    if (k === 'almacen') return r.almacenes?.nombre ?? '';
    if (k === 'condicion') return CONDICION_LABELS[r.condicion_pago] || r.condicion_pago;
    if (k === 'tipo') return TIPO_LABELS[r.tipo] || r.tipo;
    if (k === 'fecha') return r.created_at ? new Date(r.created_at).getTime() : 0;
    if (k === 'descuento') return r.descuento_total ?? 0;
    if (k === 'iva') return r.iva_total ?? 0;
    if (k === 'saldo') return saldoRealVenta(r);
    if (k === 'pagado') return Math.max(0, totalEfectivoVenta(r) - saldoRealVenta(r));
    return r?.[k];
  });

  // Count visible data columns for the empty/footer colSpan
  const dataCols = ['folio','tipo','cliente','vendedor','almacen','condicion','fecha','subtotal','descuento','iva','total','pagado','saldo','status']
    .filter(k => v(k)).length;
  const totalCols = 1 /* checkbox */ + dataCols + 1 /* chevron */;

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-table-border text-left">
          <th className="py-2 px-3 w-10 text-center">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded border-input" />
          </th>
          {v('folio') && <SortableTh sortKey="folio" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</SortableTh>}
          {v('tipo') && <SortableTh sortKey="tipo" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</SortableTh>}
          {v('cliente') && <SortableTh sortKey="cliente" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</SortableTh>}
          {v('vendedor') && <SortableTh sortKey="vendedor" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</SortableTh>}
          {v('almacen') && <SortableTh sortKey="almacen" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Almacén</SortableTh>}
          {v('condicion') && <SortableTh sortKey="condicion" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Condición</SortableTh>}
          {v('fecha') && <SortableTh sortKey="fecha" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha / Hora</SortableTh>}
          {v('subtotal') && <SortableTh sortKey="subtotal" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">Subtotal</SortableTh>}
          {v('descuento') && <SortableTh sortKey="descuento" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Descuento</SortableTh>}
          {v('iva') && <SortableTh sortKey="iva" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">IVA</SortableTh>}
          {v('total') && <SortableTh sortKey="total" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</SortableTh>}
          {v('pagado') && <SortableTh sortKey="pagado" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Pagado</SortableTh>}
          {v('saldo') && <SortableTh sortKey="saldo" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden lg:table-cell">Saldo</SortableTh>}
          {v('status') && <SortableTh sortKey="status" sort={sort} onToggle={toggle} align="center" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Estado</SortableTh>}
          <th className="py-2 px-2 w-8" />
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={totalCols} className="text-center py-12 text-muted-foreground">No hay ventas. Crea la primera.</td>
          </tr>
        )}
        {sorted.map((row: any) => {
          const isExpanded = expandedId === row.id;
          return (
            <React.Fragment key={row.id}>
              <tr
                className={cn(

                  "border-b border-table-border cursor-pointer transition-colors",
                  isExpanded ? "bg-primary/5" : selected.has(row.id) ? "bg-primary/5" : "hover:bg-table-hover"
                )}
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
              >
                <td className="py-2 px-3 text-center" onClick={e => { e.stopPropagation(); onToggleOne(row.id); }}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => onToggleOne(row.id)} className="rounded border-input" />
                </td>
                {v('folio') && (
                  <td className="py-2 px-3 font-mono text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{row.folio || row.id.slice(0, 8)}</span>
                      {row.origen === 'pos' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 uppercase tracking-wider">POS</span>
                      )}
                    </div>
                  </td>
                )}
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
                {v('cliente') && <td className="py-2 px-3 max-w-[180px] truncate">{row.cliente_id ? <ClienteLink id={row.cliente_id}>{row.clientes?.nombre || '—'}</ClienteLink> : 'Público en general'}</td>}
                {v('vendedor') && <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{row.vendedores?.nombre ?? '—'}</td>}
                {v('almacen') && <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{row.almacenes?.nombre ?? <span className="text-destructive">Sin almacén</span>}</td>}
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
                {v('total') && (
                  <td className="py-2 px-3 text-right font-medium tabular-nums">
                    {isCerradaParcial(row) ? (
                      <span title="Pedido cerrado" className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3 text-warning" />
                        <span>{fmt(totalEfectivoVenta(row))}</span>
                      </span>
                    ) : fmt(row.total)}
                  </td>
                )}

                {v('pagado') && (() => {
                  const pagado = Math.max(0, totalEfectivoVenta(row) - saldoRealVenta(row));
                  return (
                    <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
                      {pagado > 0 ? (
                        <span className="text-success font-medium">{fmt(pagado)}</span>
                      ) : (
                        <span className="text-muted-foreground">$0.00</span>
                      )}
                    </td>
                  );
                })()}
                {v('saldo') && (() => {
                  const saldo = saldoRealVenta(row);
                  return (
                    <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums">
                      {saldo > 0 ? (
                        <span className="text-warning font-medium">{fmt(saldo)}</span>
                      ) : (
                        <span className="text-muted-foreground">$0.00</span>
                      )}
                    </td>
                  );
                })()}
                {v('status') && (
                  <td className="py-2 px-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      {!isCerradaParcial(row) && (
                        <StatusChip status={isVentaEntregadaParcial(row) ? 'entregado_parcial' : row.status} />
                      )}
                      {isCerradaParcial(row) && (
                        <span title="Pedido cerrado — no acepta más entregas" className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30 inline-flex items-center gap-0.5">
                          <Lock className="h-2.5 w-2.5" />
                          {ventaCerradaBadgeLabel(row) === 'Cerrado parcial' ? 'CERRADO PARCIAL' : 'CERRADO'}
                        </span>
                      )}
                    </div>
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
                  onCancelTarget={onCancelTarget}
                  onCollapse={() => setExpandedId(null)}
                  empresaId={empresaId}
                  empresa={empresa}
                  clientesList={clientesList}
                />
              )}
            </React.Fragment>
          );
        })}
      </tbody>
      {items.length > 0 && (() => {
        const totSubtotal = items.reduce((s: number, r: any) => s + (r.subtotal ?? 0), 0);
        const totDescuento = items.reduce((s: number, r: any) => s + (r.descuento_total ?? 0), 0);
        const totIva = items.reduce((s: number, r: any) => s + (r.iva_total ?? 0), 0);
        const totTotal = items.reduce((s: number, r: any) => s + totalEfectivoVenta(r), 0);
        const totSaldo = items.reduce((s: number, r: any) => s + saldoRealVenta(r), 0);
        return (
          <tfoot>
            <tr className="bg-card border-t border-border font-semibold text-[12px]">
              <td className="py-2 px-3" />
              {v('folio') && <td className="py-2 px-3 text-muted-foreground">{items.length} ventas</td>}
              {v('tipo') && <td />}
              {v('cliente') && <td />}
              {v('vendedor') && <td className="hidden md:table-cell" />}
              {v('almacen') && <td className="hidden md:table-cell" />}
              {v('condicion') && <td className="hidden lg:table-cell" />}
              {v('fecha') && <td className="hidden lg:table-cell" />}
              {v('subtotal') && <td className="py-2 px-3 text-right hidden md:table-cell tabular-nums font-bold">{fmt(totSubtotal)}</td>}
              {v('descuento') && <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums font-bold text-destructive">{totDescuento > 0 ? `-${fmt(totDescuento)}` : '—'}</td>}
              {v('iva') && <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums font-bold">{fmt(totIva)}</td>}
              {v('total') && <td className="py-2 px-3 text-right font-bold tabular-nums">{fmt(totTotal)}</td>}
              {v('saldo') && <td className="py-2 px-3 text-right hidden lg:table-cell tabular-nums text-warning font-bold">{fmt(totSaldo)}</td>}
              {v('status') && <td />}
              <td />
            </tr>
          </tfoot>
        );
      })()}
    </table>
  );
}
