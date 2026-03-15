import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Tag } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReportePromociones({ desde, hasta }: { desde: string; hasta: string }) {
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
      
      // Aggregate by promo
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
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total descuentos otorgados</p>
          <p className="text-2xl font-bold text-foreground">${fmt(totalDescuentos)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Promociones activas usadas</p>
          <p className="text-2xl font-bold text-foreground">{(promociones ?? []).length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Veces aplicadas</p>
          <p className="text-2xl font-bold text-foreground">{(promociones ?? []).reduce((s, p) => s + p.veces, 0)}</p>
        </div>
      </div>

      {/* By promotion */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Promoción</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Veces aplicada</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total descuento</th>
            </tr>
          </thead>
          <tbody>
            {(promociones ?? []).map((p, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-primary shrink-0" /> {p.nombre}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.tipo}</td>
                <td className="px-4 py-3 text-right text-foreground">{p.veces}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">${fmt(p.totalDescuento)}</td>
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
