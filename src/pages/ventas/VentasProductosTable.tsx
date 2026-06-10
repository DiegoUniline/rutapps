import { useNavigate } from 'react-router-dom';
import { StatusChip } from '@/components/StatusChip';
import { cn, fmtDate } from '@/lib/utils';
import { TIPO_LABELS, CONDICION_LABELS } from './ventasConstants';
import { ClienteLink, ProductoLink } from '@/components/links/EntityLinks';
import { useSortableTable, SortableTh } from '@/hooks/useSortableTable';

interface Props {
  items: any[];
  fmt: (v: number | null | undefined) => string;
}

export function VentasProductosTable({ items, fmt }: Props) {
  const navigate = useNavigate();
  const { sorted, sort, toggle } = useSortableTable(items, (r, k) => {
    if (k === 'cliente') return r.cliente_nombre ?? '';
    if (k === 'vendedor') return r.vendedor_nombre ?? '';
    if (k === 'codigo') return r.producto_codigo ?? '';
    if (k === 'producto') return r.producto_nombre ?? '';
    if (k === 'fecha') return r.fecha ? new Date(r.fecha).getTime() : 0;
    if (k === 'lista') return r.tarifa_nombre ?? '';
    if (k === 'precio') return r.precio_unitario ?? 0;
    if (k === 'total') return r.linea_total ?? 0;
    if (k === 'tipo') return TIPO_LABELS[r.tipo] || r.tipo;
    return r?.[k];
  });

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-table-border text-left">
          <SortableTh sortKey="folio" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</SortableTh>
          <SortableTh sortKey="tipo" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Tipo</SortableTh>
          <SortableTh sortKey="cliente" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</SortableTh>
          <SortableTh sortKey="vendedor" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Vendedor</SortableTh>
          <SortableTh sortKey="fecha" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Fecha</SortableTh>
          <SortableTh sortKey="codigo" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</SortableTh>
          <SortableTh sortKey="producto" sort={sort} onToggle={toggle} className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</SortableTh>
          <SortableTh sortKey="cantidad" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Cantidad</SortableTh>
          <SortableTh sortKey="precio" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right hidden md:table-cell">P. Unit.</SortableTh>
          <SortableTh sortKey="total" sort={sort} onToggle={toggle} align="right" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</SortableTh>
          <SortableTh sortKey="status" sort={sort} onToggle={toggle} align="center" className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center hidden lg:table-cell">Estado</SortableTh>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={11} className="text-center py-12 text-muted-foreground">No hay líneas de producto.</td>
          </tr>
        )}
        {sorted.map((row: any, i: number) => (
          <tr
            key={`${row.venta_id}-${row.linea_id}-${i}`}
            className="border-b border-table-border cursor-pointer transition-colors hover:bg-table-hover"
            onClick={() => navigate(`/ventas/${row.venta_id}`)}
          >
            <td className="py-2 px-3 font-mono text-xs font-medium">{row.folio || row.venta_id?.slice(0, 8)}</td>
            <td className="py-2 px-3">
              <span className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded",
                row.tipo === 'pedido' ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
              )}>
                {TIPO_LABELS[row.tipo] || row.tipo}
              </span>
            </td>
            <td className="py-2 px-3 max-w-[160px] truncate">{row.cliente_id ? <ClienteLink id={row.cliente_id}>{row.cliente_nombre || '—'}</ClienteLink> : 'Público en general'}</td>
            <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{row.vendedor_nombre ?? '—'}</td>
            <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{fmtDateTime(row.created_at)}</td>
            <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{row.producto_codigo ?? ''}</td>
            <td className="py-2 px-3 max-w-[180px] truncate"><ProductoLink id={row.producto_id}>{row.producto_nombre ?? ''}</ProductoLink></td>
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
