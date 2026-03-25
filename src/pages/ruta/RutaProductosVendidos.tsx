import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useDateFilter } from '@/hooks/useDateFilter';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';
import DateFilterBar from '@/components/ruta/DateFilterBar';
import { Search } from 'lucide-react';

export default function RutaProductosVendidos() {
  const { empresa, profile } = useAuth();
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');
  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();
  const vendedorId = profile?.vendedor_id || profile?.id;

  const { data: ventas } = useOfflineQuery('ventas', {
    empresa_id: empresa?.id,
    vendedor_id: vendedorId,
  }, { enabled: !!empresa?.id && !!vendedorId });

  const { data: ventaLineas } = useOfflineQuery('venta_lineas', {}, {
    enabled: !!empresa?.id,
  });

  const { data: productos } = useOfflineQuery('productos', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id });

  const productoMap = useMemo(() =>
    new Map((productos ?? []).map((p: any) => [p.id, p.nombre])),
    [productos]
  );

  const grouped = useMemo(() => {
    const validVentas = filterByDate((ventas ?? []) as any[], 'fecha')
      .filter((v: any) => v.status !== 'cancelado');
    const ventaIds = new Set(validVentas.map((v: any) => v.id));
    const ventaFechaMap = new Map(validVentas.map((v: any) => [v.id, v.fecha]));

    // Group lines by date → product
    const byDate: Record<string, Record<string, { cantidad: number; total: number; nombre: string }>> = {};

    for (const l of (ventaLineas ?? []) as any[]) {
      if (!ventaIds.has(l.venta_id)) continue;
      const fecha = ventaFechaMap.get(l.venta_id) ?? 'Sin fecha';
      const nombre = productoMap.get(l.producto_id) ?? 'Producto';

      if (search && !nombre.toLowerCase().includes(search.toLowerCase())) continue;

      if (!byDate[fecha]) byDate[fecha] = {};
      if (!byDate[fecha][l.producto_id]) {
        byDate[fecha][l.producto_id] = { cantidad: 0, total: 0, nombre };
      }
      byDate[fecha][l.producto_id].cantidad += l.cantidad ?? 0;
      byDate[fecha][l.producto_id].total += l.total ?? (l.precio_unitario ?? 0) * (l.cantidad ?? 0);
    }

    // Sort dates descending
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([fecha, prods]) => ({
        fecha,
        productos: Object.values(prods).sort((a, b) => b.total - a.total),
        totalDia: Object.values(prods).reduce((s, p) => s + p.total, 0),
        unidadesDia: Object.values(prods).reduce((s, p) => s + p.cantidad, 0),
      }));
  }, [ventas, ventaLineas, productoMap, search, desde, hasta, filterByDate]);

  return (
    <div className="px-4 py-3 space-y-3">
      <DateFilterBar desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar producto…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-card text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground text-[12px] py-8">Sin productos vendidos en el periodo</p>
      )}

      {grouped.map(g => (
        <div key={g.fecha} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground">{fmtDate(g.fecha)}</span>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>{g.unidadesDia} uds</span>
              <span className="font-semibold text-foreground">{fmt(g.totalDia)}</span>
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border divide-y divide-border">
            {g.productos.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{p.nombre}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground">{p.cantidad} uds</span>
                  <span className="text-[12px] font-semibold text-foreground w-20 text-right">{fmt(p.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
