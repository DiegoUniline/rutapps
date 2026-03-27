import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';

export function ReportePromociones({ desde, hasta }: { desde: string; hasta: string }) {
  const { fmt } = useCurrency();

  const { data: promoAplicadas, isLoading } = useQuery({
    queryKey: ['reporte-promociones', desde, hasta],
    queryFn: async () => {
      const { data } = await supabase
        .from('promocion_aplicada')
        .select('*, promociones(nombre, tipo, valor), ventas(folio, fecha, total, clientes(nombre))')
        .gte('created_at', desde)
        .lte('created_at', hasta + 'T23:59:59')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: promociones } = useQuery({
    queryKey: ['reporte-promo-summary', desde, hasta],
    queryFn: async () => {
      const { data } = await supabase
        .from('promocion_aplicada')
        .select('promocion_id, descuento_aplicado, promociones(nombre, tipo)')
        .gte('created_at', desde)
        .lte('created_at', hasta + 'T23:59:59');
      
      const summary: Record<string, { nombre: string; tipo: string; veces: number; totalDescuento: number }> = {};
      (data ?? []).forEach((r: any) => {
        const key = r.promocion_id;
        if (!summary[key]) {
          summary[key] = {
            nombre: (r.promociones as any)?.nombre || 'Desconocida',
            tipo: (r.promociones as any)?.tipo || '',
            veces: 0,
            totalDescuento: 0,
          };
        }
        summary[key].veces++;
        summary[key].totalDescuento += r.descuento_aplicado ?? 0;
      });
      return Object.values(summary).sort((a, b) => b.totalDescuento - a.totalDescuento);
    },
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">Cargando...</p>;

  const totalDescuentos = (promociones ?? []).reduce((s, p) => s + p.totalDescuento, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total descuentos otorgados</div>
          <div className="text-lg font-bold text-foreground">{fmt(totalDescuentos)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Promociones activas usadas</div>
          <div className="text-lg font-bold text-foreground">{(promociones ?? []).length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Veces aplicadas</div>
          <div className="text-lg font-bold text-foreground">{(promociones ?? []).reduce((s, p) => s + p.veces, 0)}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
              <th className="text-left px-3 py-2 font-semibold">Promoción</th>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th>
              <th className="text-right px-3 py-2 font-semibold">Veces aplicada</th>
              <th className="text-right px-3 py-2 font-semibold">Total descuento</th>
            </tr>
          </thead>
          <tbody>
            {(promociones ?? []).map((p, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium">{p.nombre}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.tipo}</td>
                <td className="px-3 py-2 text-right">{p.veces}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(p.totalDescuento)}</td>
              </tr>
            ))}
            {(promociones ?? []).length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No se aplicaron promociones en este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
