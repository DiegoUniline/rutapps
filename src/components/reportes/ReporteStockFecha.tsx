import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fmtDate } from '@/lib/utils';

interface StockRow {
  producto_id: string;
  producto: string;
  almacen_id: string;
  almacen: string;
  cantidad: number;
}

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

/**
 * Existencia por producto y almacén A LA FECHA de corte (= "hasta"),
 * reconstruida desde todo el ledger de movimientos_inventario en la BD
 * (stock_a_la_fecha): entradas, salidas, traspasos, ajustes, ventas, compras…
 */
export function ReporteStockFecha({ hasta }: { desde: string; hasta: string }) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  const { data: rows = [], isLoading } = useQuery<StockRow[]>({
    queryKey: ['reporte-stock-fecha', empresaId, hasta],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'ReporteStockFecha');
      const { data, error } = await supabase.rpc('stock_a_la_fecha', { p_empresa_id: eid, p_fecha: hasta } as any);
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
  });

  const totalUnidades = useMemo(() => rows.reduce((s, r) => s + Number(r.cantidad || 0), 0), [rows]);
  const productosUnicos = useMemo(() => new Set(rows.map(r => r.producto_id)).size, [rows]);
  const almacenesUnicos = useMemo(() => new Set(rows.map(r => r.almacen_id)).size, [rows]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Existencia al corte del <strong>{fmtDate(hasta)}</strong> — reconstruida desde el kardex completo.</p>
      <div className="grid grid-cols-3 gap-2">
        <Card label="Unidades" value={nf.format(totalUnidades)} />
        <Card label="Productos" value={String(productosUnicos)} />
        <Card label="Almacenes" value={String(almacenesUnicos)} />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-accent/40 text-muted-foreground uppercase text-[10px] font-semibold">
            <tr>
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-left px-3 py-2">Almacén</th>
              <th className="text-right px-3 py-2">Existencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.producto_id}-${r.almacen_id}`} className="border-t border-border">
                <td className="px-3 py-1.5">{r.producto}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.almacen}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${Number(r.cantidad) < 0 ? 'text-destructive' : ''}`}>{nf.format(Number(r.cantidad || 0))}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">Sin existencias a esta fecha</td></tr>
            )}
            {isLoading && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg p-2 text-center bg-card">
      <div className="text-[9px] uppercase tracking-wide opacity-80 font-semibold text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
