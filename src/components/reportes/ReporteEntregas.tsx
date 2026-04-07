import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

const COLUMNS: ColumnDef[] = [
  { key: 'expand', label: 'Expandir' },
  { key: 'nombre', label: 'Ruta / Vendedor' },
  { key: 'entregas', label: 'Entregas' },
  { key: 'total', label: 'Total' },
];

const PROD_COLUMNS: ColumnDef[] = [
  { key: 'ruta', label: 'Ruta' },
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto' },
  { key: 'cantidad', label: 'Cantidad' },
  { key: 'total', label: 'Total' },
];

export function ReporteEntregas({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const { visible, setVisible, isVisible } = useColumnVisibility(COLUMNS);
  const { visible: prodVisible, setVisible: setProdVisible, isVisible: isProdVisible } = useColumnVisibility(PROD_COLUMNS);
  const [expandedRuta, setExpandedRuta] = useState<number | null>(null);
  const rutas = data.entregasPorRuta ?? [];

  const colCount = COLUMNS.filter(c => visible.has(c.key)).length;
  const prodColCount = PROD_COLUMNS.filter(c => prodVisible.has(c.key)).length;

  // Flat table: ruta x producto
  const rutaProductos = useMemo(() => {
    const rows: { ruta: string; codigo: string; producto: string; cantidad: number; total: number }[] = [];
    for (const r of rutas) {
      const prods = Object.values(r.productos ?? {}) as any[];
      for (const p of prods) {
        rows.push({
          ruta: r.nombre,
          codigo: p.codigo ?? '',
          producto: p.nombre ?? '',
          cantidad: p.cantidad ?? 0,
          total: 0, // entregas data doesn't have per-product total in this structure
        });
      }
    }
    return rows;
  }, [rutas]);

  // Compute per-product total from entregas raw data
  const rutaProductosWithTotal = useMemo(() => {
    const entregas = data.entregas ?? [];
    const map: Record<string, { ruta: string; codigo: string; producto: string; cantidad: number; total: number }> = {};
    for (const e of entregas) {
      const ruta = (e as any).vendedores?.nombre ?? 'Sin ruta';
      for (const l of ((e as any).venta_lineas ?? [])) {
        const pid = l.producto_id ?? '';
        const key = `${ruta}__${pid}`;
        if (!map[key]) {
          map[key] = {
            ruta,
            codigo: l.productos?.codigo ?? '',
            producto: l.productos?.nombre ?? '',
            cantidad: 0,
            total: 0,
          };
        }
        map[key].cantidad += l.cantidad ?? 0;
        map[key].total += l.total ?? 0;
      }
    }
    return Object.values(map).sort((a, b) => a.ruta.localeCompare(b.ruta) || b.cantidad - a.cantidad);
  }, [data.entregas]);

  const totalUnidades = rutaProductosWithTotal.reduce((s, r) => s + r.cantidad, 0);
  const totalMonto = rutaProductosWithTotal.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total entregas</div>
            <div className="text-lg font-bold text-foreground">{data.totalEntregas}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Rutas</div>
            <div className="text-lg font-bold text-foreground">{rutas.length}</div>
          </div>
        </div>
      </div>

      {/* Resumen por ruta (expandible) */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[11px] font-semibold text-foreground">Resumen por ruta</span>
          <ColumnChooser columns={COLUMNS} visible={visible} onChange={setVisible} />
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              {isVisible('expand') && <th className="py-2 px-3 w-8"></th>}
              {isVisible('nombre') && <th className="text-left py-2 px-3">Ruta / Vendedor</th>}
              {isVisible('entregas') && <th className="text-right py-2 px-3">Entregas</th>}
              {isVisible('total') && <th className="text-right py-2 px-3">Total</th>}
            </tr>
          </thead>
          <tbody>
            {rutas.map((r: any, i: number) => {
              const prods = Object.values(r.productos) as any[];
              const isOpen = expandedRuta === i;
              return (
                <>
                  <tr key={i} className="border-b border-border/50 cursor-pointer hover:bg-accent/30" onClick={() => setExpandedRuta(isOpen ? null : i)}>
                    {isVisible('expand') && <td className="py-2 px-3">{isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}</td>}
                    {isVisible('nombre') && <td className="py-2 px-3 font-medium">{r.nombre}</td>}
                    {isVisible('entregas') && <td className="py-2 px-3 text-right">{r.entregas}</td>}
                    {isVisible('total') && <td className="py-2 px-3 text-right font-semibold">{fmt(r.total)}</td>}
                  </tr>
                  {isOpen && prods.length > 0 && (
                    <tr key={`${i}-detail`}>
                      <td colSpan={colCount} className="p-0">
                        <div className="px-6 py-2 border-b border-border/50">
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-[9px] text-muted-foreground uppercase"><th className="py-1 text-left">Código</th><th className="py-1 text-left">Producto</th><th className="py-1 text-right">Cantidad</th></tr></thead>
                            <tbody>
                              {prods.map((p: any, j: number) => (
                                <tr key={j} className="border-t border-border/30">
                                  <td className="py-1 font-mono text-muted-foreground">{p.codigo}</td>
                                  <td className="py-1">{p.nombre}</td>
                                  <td className="py-1 text-right font-semibold">{p.cantidad}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {rutas.length === 0 && <tr><td colSpan={colCount} className="text-center py-8 text-muted-foreground">Sin entregas en el período</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Entregas por ruta por producto (tabla completa) */}
      {rutaProductosWithTotal.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" />
              Entregas por ruta por producto
            </span>
            <ColumnChooser columns={PROD_COLUMNS} visible={prodVisible} onChange={setProdVisible} />
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                {isProdVisible('ruta') && <th className="text-left py-2 px-3">Ruta</th>}
                {isProdVisible('codigo') && <th className="text-left py-2 px-3">Código</th>}
                {isProdVisible('producto') && <th className="text-left py-2 px-3">Producto</th>}
                {isProdVisible('cantidad') && <th className="text-right py-2 px-3">Cantidad</th>}
                {isProdVisible('total') && <th className="text-right py-2 px-3">Total</th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastRuta = '';
                return rutaProductosWithTotal.map((row, i) => {
                  const showRuta = row.ruta !== lastRuta;
                  lastRuta = row.ruta;
                  return (
                    <tr key={i} className={showRuta ? 'border-t border-border' : 'border-t border-border/30'}>
                      {isProdVisible('ruta') && (
                        <td className="py-1.5 px-3 font-medium">
                          {showRuta ? row.ruta : ''}
                        </td>
                      )}
                      {isProdVisible('codigo') && <td className="py-1.5 px-3 font-mono text-muted-foreground">{row.codigo}</td>}
                      {isProdVisible('producto') && <td className="py-1.5 px-3">{row.producto}</td>}
                      {isProdVisible('cantidad') && <td className="py-1.5 px-3 text-right font-semibold">{row.cantidad}</td>}
                      {isProdVisible('total') && <td className="py-1.5 px-3 text-right">{fmt(row.total)}</td>}
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-semibold text-[11px]">
                <td colSpan={isProdVisible('ruta') && isProdVisible('codigo') && isProdVisible('producto') ? 3 : isProdVisible('ruta') && isProdVisible('codigo') ? 2 : isProdVisible('ruta') ? 1 : isProdVisible('codigo') && isProdVisible('producto') ? 2 : isProdVisible('codigo') ? 1 : isProdVisible('producto') ? 1 : 0} className="py-2 px-3">Total</td>
                {isProdVisible('cantidad') && <td className="py-2 px-3 text-right">{totalUnidades}</td>}
                {isProdVisible('total') && <td className="py-2 px-3 text-right">{fmt(totalMonto)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
