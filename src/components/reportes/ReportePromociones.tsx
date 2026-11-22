import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { useRegistrarPdfReporte, type RegistrarPdfReporte } from '@/hooks/useRegistrarPdfReporte';
import { pdfDeReporte, periodoReporte } from '@/lib/reportePdf';
import { SortableTh, useSortableTable } from '@/hooks/useSortableTable';

export function ReportePromociones({ desde, hasta, registrarPdf }: { desde: string; hasta: string; registrarPdf?: RegistrarPdfReporte }) {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  const { data: promociones, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reporte-promo-summary', empresaId, desde, hasta],
    enabled: hasEmpresa(empresaId),
    queryFn: async ({ signal }) => {
      const eid = requireEmpresa(empresaId, 'ReportePromociones.summary');
      const { data, error } = await supabase
        .from('promocion_aplicada')
        .select('promocion_id, descuento_aplicado, promociones!inner(nombre, tipo), ventas!inner(empresa_id)')
        .eq('ventas.empresa_id', eid)
        .gte('created_at', desde)
        .lte('created_at', hasta + 'T23:59:59')
        .abortSignal(signal);
      if (error) throw error;
      
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
  const { sorted: promocionesOrd, sort, toggle: toggleSort } = useSortableTable(promociones ?? [], undefined, undefined, 'reporte-promociones');


  // PDF por código con lo mismo que la pantalla (D-051).
  useRegistrarPdfReporte(registrarPdf, async () => {
    if (!promociones) return null;
    const totalDesc = promociones.reduce((s, p) => s + p.totalDescuento, 0);
    const veces = promociones.reduce((s, p) => s + p.veces, 0);
    return pdfDeReporte({
      titulo: 'Reporte de Promociones',
      periodo: periodoReporte(desde, hasta),
      kpis: [
        { label: 'Total descuentos otorgados', value: fmt(totalDesc) },
        { label: 'Promociones activas usadas', value: String(promociones.length) },
        { label: 'Veces aplicadas', value: String(veces) },
      ],
      secciones: [{
        columnas: [{ header: 'Promoción' }, { header: 'Tipo' }, { header: 'Veces aplicada', align: 'right' }, { header: 'Total descuento', align: 'right' }],
        filas: promociones.map(p => [p.nombre, p.tipo, String(p.veces), fmt(p.totalDescuento)]),
        pie: ['Total', '', String(veces), fmt(totalDesc)],
        vacio: 'No se aplicaron promociones en este período',
      }],
      archivo: `Reporte_Promociones_${desde}_${hasta}`,
    }, empresa ?? { nombre: '' });
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">Cargando...</p>;
  if (isError) {
    return (
      <div className="py-8 text-center text-sm space-y-2">
        <p className="text-destructive">Error al cargar promociones: {error instanceof Error ? error.message : 'Error desconocido'}</p>
        <button type="button" onClick={() => refetch()} className="text-xs font-semibold underline">Reintentar</button>
      </div>
    );
  }

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
              <SortableTh sortKey="nombre" sort={sort} onToggle={toggleSort} className="text-left px-3 py-2 font-semibold">Promoción</SortableTh>
              <SortableTh sortKey="tipo" sort={sort} onToggle={toggleSort} className="text-left px-3 py-2 font-semibold">Tipo</SortableTh>
              <SortableTh sortKey="veces" sort={sort} onToggle={toggleSort} align="right" className="text-right px-3 py-2 font-semibold">Veces aplicada</SortableTh>
              <SortableTh sortKey="totalDescuento" sort={sort} onToggle={toggleSort} align="right" className="text-right px-3 py-2 font-semibold">Total descuento</SortableTh>
            </tr>
          </thead>
          <tbody>
            {promocionesOrd.map((p, i) => (
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
