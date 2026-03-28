import { Plus, Trash2, ReceiptText } from 'lucide-react';
import ProductSearchInput from '@/components/ProductSearchInput';
import type { PromoResult } from '@/hooks/usePromociones';
import { VentaTotals } from '@/components/venta/VentaTotals';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { VentaLinea } from '@/types';
import { VentaLineaMobile } from './VentaLineaMobile';
import { VentaLineaDesktop } from './VentaLineaDesktop';

interface Props {
  lineas: Partial<VentaLinea>[];
  productosList: any[];
  readOnly: boolean;
  totals: { subtotal: number; descuento_total: number; iva_total: number; ieps_total: number; total: number; descuento_promo?: number; descuento_extra_amt?: number };
  promoResults?: PromoResult[];
  onProductSelect: (idx: number, pid: string) => void;
  onUpdateLine: (idx: number, field: string, val: any) => void;
  onRemoveLine: (idx: number) => void;
  onAddLine: () => void;
  setCellRef: (row: number, col: number, el: HTMLElement | null) => void;
  onCellKeyDown: (e: React.KeyboardEvent, row: number, col: number) => void;
  navigateCell: (row: number, col: number, dir: 'next' | 'prev') => void;
  setLineas: React.Dispatch<React.SetStateAction<Partial<VentaLinea>[]>>;
  sinImpuestos?: boolean;
  setSinImpuestos?: (v: boolean) => void;
  readOnlyForm?: boolean;
  saldoPendiente?: number;
}

export function VentaLineasTab(props: Props) {
  const isMobile = useIsMobile();
  const { lineas, readOnly, totals, onAddLine, sinImpuestos, setSinImpuestos, readOnlyForm, saldoPendiente, promoResults } = props;

  return (
    <div className="p-3 sm:p-4 space-y-3">
      {isMobile ? (
        <div className="space-y-2">
          {lineas.map((l, idx) => (
            <VentaLineaMobile key={idx} idx={idx} line={l} {...props} />
          ))}
        </div>
      ) : (
        <div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-table-border text-left">
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[240px]">Producto</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20 text-right">Cantidad</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-16 text-center hidden md:table-cell">Unidad</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Precio</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-center hidden md:table-cell">Impuestos</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20 text-right">Desc %</th>
                <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right">Subtotal</th>
                <th className="py-2 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, idx) => (
                <VentaLineaDesktop key={idx} idx={idx} line={l} isLast={idx === lineas.length - 1} {...props} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && (
        <div className="flex items-center justify-between">
          <button onClick={onAddLine} className="btn-odoo-secondary text-xs">
            <Plus className="h-3 w-3" /> Agregar producto
          </button>
          {setSinImpuestos && !readOnlyForm && (
            <button onClick={() => setSinImpuestos(!sinImpuestos)} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all border", sinImpuestos ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300" : "bg-accent/50 border-border/40 text-muted-foreground")}>
              <ReceiptText className="h-3.5 w-3.5" />
              Sin impuestos
              <div className={cn("w-8 h-4 rounded-full relative transition-colors", sinImpuestos ? "bg-amber-500" : "bg-border")}>
                <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform", sinImpuestos ? "translate-x-4" : "translate-x-0.5")} />
              </div>
            </button>
          )}
        </div>
      )}
      <VentaTotals {...totals} isMobile={isMobile} saldoPendiente={saldoPendiente} promoResults={promoResults} descuento_promo={totals.descuento_promo} />
    </div>
  );
}
