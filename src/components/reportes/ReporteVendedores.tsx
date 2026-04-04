import { useCurrency } from '@/hooks/useCurrency';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

const COLUMNS: ColumnDef[] = [
  { key: '#', label: '#' },
  { key: 'nombre', label: 'Vendedor' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'total', label: 'Total' },
  { key: 'costo', label: 'Costo', defaultVisible: false },
  { key: 'utilidad', label: 'Utilidad' },
  { key: 'margen', label: 'Margen %', defaultVisible: false },
  { key: 'pct', label: '% Participación' },
];

export function ReporteVendedores({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const items: any[] = data.topVendedores ?? [];
  const totalGeneral = items.reduce((s, v) => s + v.total, 0);
  const totalUtilidad = items.reduce((s, v) => s + (v.utilidad ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Vendedores</div>
            <div className="text-lg font-bold text-foreground">{items.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total</div>
            <div className="text-lg font-bold text-foreground">{fmt(totalGeneral)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Utilidad</div>
            <div className="text-lg font-bold text-foreground">{fmt(totalUtilidad)}</div>
          </div>
        </div>
        <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('#') && <th className="text-left py-2 px-3 w-8">#</th>}
              {isVisible('nombre') && <th className="text-left py-2 px-3">Vendedor</th>}
              {isVisible('ventas') && <th className="text-right py-2 px-3">Ventas</th>}
              {isVisible('total') && <th className="text-right py-2 px-3">Total</th>}
              {isVisible('costo') && <th className="text-right py-2 px-3">Costo</th>}
              {isVisible('utilidad') && <th className="text-right py-2 px-3">Utilidad</th>}
              {isVisible('margen') && <th className="text-right py-2 px-3">Margen</th>}
              {isVisible('pct') && <th className="text-right py-2 px-3">% Part.</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((v, i) => {
              const margen = v.total > 0 ? ((v.utilidad ?? 0) / v.total) * 100 : 0;
              const pct = totalGeneral > 0 ? (v.total / totalGeneral) * 100 : 0;
              return (
                <tr key={v.id} className="border-b border-border/50">
                  {isVisible('#') && <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>}
                  {isVisible('nombre') && <td className="py-1.5 px-3 font-medium">{v.nombre}</td>}
                  {isVisible('ventas') && <td className="py-1.5 px-3 text-right">{v.ventas}</td>}
                  {isVisible('total') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(v.total)}</td>}
                  {isVisible('costo') && <td className="py-1.5 px-3 text-right">{fmt(v.costo ?? 0)}</td>}
                  {isVisible('utilidad') && <td className="py-1.5 px-3 text-right font-semibold">{fmt(v.utilidad ?? 0)}</td>}
                  {isVisible('margen') && <td className="py-1.5 px-3 text-right text-muted-foreground">{margen.toFixed(1)}%</td>}
                  {isVisible('pct') && <td className="py-1.5 px-3 text-right text-muted-foreground">{pct.toFixed(1)}%</td>}
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold text-[11px]">
                {isVisible('#') && <td className="py-2 px-3"></td>}
                {isVisible('nombre') && <td className="py-2 px-3 text-right text-muted-foreground">Total:</td>}
                {isVisible('ventas') && <td className="py-2 px-3 text-right">{items.reduce((s, v) => s + v.ventas, 0)}</td>}
                {isVisible('total') && <td className="py-2 px-3 text-right">{fmt(totalGeneral)}</td>}
                {isVisible('costo') && <td className="py-2 px-3 text-right">{fmt(items.reduce((s, v) => s + (v.costo ?? 0), 0))}</td>}
                {isVisible('utilidad') && <td className="py-2 px-3 text-right">{fmt(totalUtilidad)}</td>}
                {isVisible('margen') && <td className="py-2 px-3 text-right">{totalGeneral > 0 ? ((totalUtilidad / totalGeneral) * 100).toFixed(1) : 0}%</td>}
                {isVisible('pct') && <td className="py-2 px-3 text-right">100%</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
