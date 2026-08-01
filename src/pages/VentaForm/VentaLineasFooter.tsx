import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/currency';
import type { VentaLinea } from '@/types';
import { VENTA_LINEAS_DESGLOSE_COLUMNS } from './ventaLineasColumns';

interface Props {
  lineas: Partial<VentaLinea>[];
  cols: Record<string, boolean>;
  currencyCode?: string | null;
  /** Etiqueta de la fila de totales (se pinta en la celda de Producto). */
  label?: string;
}

/**
 * Fila de TOTALES al final de la tabla de líneas del detalle de venta.
 * Se acomoda exactamente igual que el encabezado: cada celda se pinta solo si
 * su columna está visible, respetando el mismo orden.
 */
export function VentaLineasFooter({ lineas, cols, currencyCode, label = 'Totales' }: Props) {
  const { fmt } = useCurrency();
  const money = (v: number) => (currencyCode ? formatCurrency(v, currencyCode) : fmt(v));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const showCol = (k: string) => cols[k] !== false;

  const sum = (fn: (l: any) => number) => r2(lineas.reduce((s, l) => s + (fn(l) || 0), 0));
  const n = (v: any) => Number(v) || 0;

  const totCantidad = sum(l => n(l.cantidad));
  const totIva = sum(l => n(l.iva_monto));
  const totIeps = sum(l => n(l.ieps_monto));
  const totPromo = sum(l => n(l.descuento_promocion_monto));
  const totDescMan = sum(l => n(l.descuento_manual_monto));
  const totBruto = sum(l => n(l.importe_bruto));
  const totNeto = sum(l => n(l.precio_lista_unitario) * n(l.cantidad));
  const totTotal = sum(l => n(l.total));
  const totBonif = sum(l => n(l.cantidad_bonificada));
  const totBaseIeps = sum(l => n(l.base_ieps));
  const totBaseIva = sum(l => n(l.base_iva));
  const totBaseDescMan = sum(l => n(l.base_descuento_manual));

  const cellCls = 'py-2 px-2 bg-card text-right text-[12px] font-semibold tabular-nums whitespace-nowrap';
  const val = (v: number, fmtFn: (x: number) => string = money) =>
    v ? fmtFn(v) : <span className="text-muted-foreground font-normal">—</span>;

  const desgloseTotals: Record<string, React.ReactNode> = {
    dSubtotalNeto: val(totNeto),
    dImpuestosTotal: val(r2(totIva + totIeps)),
    dSubtotalBruto: val(totBruto),
    dDescTotal: totPromo + totDescMan > 0
      ? <span className="text-primary">−{money(r2(totPromo + totDescMan))}</span>
      : <span className="text-muted-foreground font-normal">—</span>,
    dDescPromoMonto: totPromo > 0
      ? <span className="text-primary">−{money(totPromo)}</span>
      : <span className="text-muted-foreground font-normal">—</span>,
    dCantBonificada: val(totBonif, v => String(v)),
    dDescManMonto: val(totDescMan),
    dTotal: val(totTotal),
    dBaseDescMan: val(totBaseDescMan),
    dBaseIeps: val(totBaseIeps),
    dIepsMontoUnit: val(totIeps),
    dBaseIva: val(totBaseIva),
    dIvaMontoUnit: val(totIva),
  };

  return (
    <tfoot>
      <tr className="border-t-2 border-table-border bg-card sticky bottom-0 z-10 shadow-[0_-1px_0_0_hsl(var(--border))]">
        <td className="py-2 px-2 bg-card" />
        {showCol('cantidad') && <td className={cellCls}>{totCantidad ? totCantidad : '—'}</td>}
        <td className="py-2 px-2 bg-card text-[12px] font-semibold whitespace-nowrap">{label}</td>
        {showCol('unidad') && <td className="py-2 px-2 bg-card" />}
        {showCol('precioBruto') && <td className="py-2 px-2 bg-card" />}
        {showCol('precioNeto') && <td className="py-2 px-2 bg-card" />}
        {showCol('iva') && <td className={cellCls}>{val(totIva)}</td>}
        {showCol('ieps') && <td className={cellCls}>{val(totIeps)}</td>}
        {showCol('descPromo') && <td className={cellCls}>{val(totPromo)}</td>}
        {showCol('descMan') && <td className="py-2 px-2 bg-card" />}
        {showCol('subtotal') && <td className={cellCls}>{val(totTotal)}</td>}
        {showCol('lote') && <td className="py-2 px-2 bg-card" />}
        {VENTA_LINEAS_DESGLOSE_COLUMNS.filter(c => showCol(c.key)).map(c => (
          <td key={c.key} className={cellCls}>
            {desgloseTotals[c.key] ?? ''}
          </td>
        ))}
        <td className="py-2 px-2 bg-card" />
      </tr>
    </tfoot>
  );
}
