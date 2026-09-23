import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EntityMultiSelect } from '@/components/reportes/EntityMultiSelect';
import { buildConcentradoReport, getOrderRoutes, UNASSIGNED, type ReportGrouping } from '@/lib/concentradoReport';
import { fetchConcentradoReport, type ConcentradoReportFilters } from '@/lib/concentradoReportData';

interface Props {
  filters: ConcentradoReportFilters;
  empresa: { nombre: string; logo_url?: string | null };
  initialSellerIds: string[];
  onClose: () => void;
}
const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', confirmado: 'Confirmado / Por surtir', entregado: 'Surtido / Entregado',
  facturado: 'Facturado', cancelado: 'Cancelado',
};

export default function ConcentradoReportDialog({ filters, empresa, initialSellerIds, onClose }: Props) {
  const [grouping, setGrouping] = useState<ReportGrouping>('general');
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [sellerIds, setSellerIds] = useState(initialSellerIds);
  const [quantity, setQuantity] = useState<'requerido' | 'pendiente'>('requerido');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const exportLock = useRef(false);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['concentrado-hoja-surtido', filters],
    queryFn: () => fetchConcentradoReport(filters),
    enabled: !!filters.empresaId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });
  const options = useMemo(() => {
    const routes = new Map<string, string>([[UNASSIGNED, 'Sin ruta asignada']]);
    const sellers = new Map<string, string>([[UNASSIGNED, 'Sin vendedor']]);
    for (const order of data?.orders ?? []) sellers.set(order.vendedor_id ?? UNASSIGNED, order.vendedor?.nombre || 'Sin vendedor');
    for (const values of getOrderRoutes(data?.deliveries ?? []).values()) {
      for (const [id, name] of values) routes.set(id, name);
    }
    const sorted = (values: Map<string, string>) => [...values].map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
    return { routes: sorted(routes), sellers: sorted(sellers) };
  }, [data]);
  const report = useMemo(() => {
    try {
      return { groups: data ? buildConcentradoReport(data, { grouping, routeIds, sellerIds }) : [], error: '' };
    } catch (cause) {
      return { groups: [], error: cause instanceof Error ? cause.message : 'No se pudo calcular el reporte.' };
    }
  }, [data, grouping, routeIds, sellerIds]);
  const groups = report.groups;
  const orderCount = groups.reduce((sum, g) => sum + g.orderCount, 0);
  const productCount = new Set(groups.flatMap(g => g.products.map(p => p.id))).size;
  const failure = error ? (error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.') : report.error;
  const busy = isFetching || !!exporting;
  const fechaLabel = filters.fechaField === 'fecha_entrega' ? 'Fecha de entrega' : 'Fecha de levantamiento';
  const formatDate = (value: string) => value ? value.split('-').reverse().join('/') : 'Sin límite';
  const statusLabel = filters.statuses.map(s => STATUS_LABELS[s] || s).join(', ');

  const exportReport = async (format: 'pdf' | 'excel') => {
    if (exportLock.current || busy || failure || !productCount) return;
    exportLock.current = true;
    setExporting(format);
    try {
      const { exportConcentradoReport } = await import('@/lib/concentradoReportExport');
      await exportConcentradoReport(format, {
        empresa: empresa.nombre, logoUrl: empresa.logo_url, desde: filters.desde, hasta: filters.hasta,
        fechaLabel, groups, quantity,
      });
      toast.success(`Reporte ${format === 'pdf' ? 'PDF' : 'Excel'} generado`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo exportar el reporte.');
    } finally {
      exportLock.current = false;
      setExporting(null);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !exportLock.current) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reporte de surtido</DialogTitle>
          <DialogDescription>Concentra los productos de todos los pedidos del rango y prepara tu hoja de carga.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
          <p><strong>{fechaLabel}:</strong> {formatDate(filters.desde)} al {formatDate(filters.hasta)}</p>
          <p><strong>Estado:</strong> {statusLabel}</p>
          <p><strong>Documentos:</strong> {filters.tipo === 'todos' ? 'Pedidos y ventas directas' : filters.tipo === 'pedido' ? 'Solo pedidos' : 'Solo ventas directas'}</p>
        </div>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <div className="grid sm:grid-cols-2 gap-3">
            <EntityMultiSelect label="Filtrar por ruta asignada" options={options.routes} value={routeIds} onChange={setRouteIds} placeholder="Todas las rutas" loading={isFetching} />
            <EntityMultiSelect label="Filtrar por vendedor" options={options.sellers} value={sellerIds} onChange={setSellerIds} placeholder="Todos los vendedores" loading={isFetching} />
          </div>
          <p className="text-xs text-muted-foreground">Ruta asignada: repartidor seleccionado en Entregas. Vendedor: quien levantó el pedido.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium space-y-1 block">
              <span>Organizar reporte</span>
              <select value={grouping} onChange={e => setGrouping(e.target.value as ReportGrouping)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="general">General · todos los productos juntos</option>
                <option value="ruta">Separado por ruta</option>
                <option value="vendedor">Separado por vendedor</option>
              </select>
            </label>
            <label className="text-xs font-medium space-y-1 block">
              <span>Cantidad en la hoja PDF</span>
              <select value={quantity} onChange={e => setQuantity(e.target.value as 'requerido' | 'pendiente')} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="requerido">Requerido total</option>
                <option value="pendiente">Solo cantidad pendiente de surtir</option>
              </select>
            </label>
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          PDF: tablas con el formato y logo de tu empresa y espacio para anotar lo entregado; cada grupo inicia en una página nueva.
          Excel: requerido, ya surtido y pendiente, con encabezado y fila en blanco entre grupos.
        </p>
        {isFetching ? (
          <p role="status" className="flex items-center gap-2 py-4 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Preparando todos los pedidos del rango…</p>
        ) : failure ? (
          <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            <p>{failure}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 text-sm font-medium">{orderCount} pedidos · {productCount} productos · {groups.length} grupos</div>
            <div className="max-h-52 overflow-auto divide-y">
              {!productCount && <p className="p-4 text-sm text-muted-foreground">No hay productos para los filtros seleccionados.</p>}
              {groups.map(group => (
                <div key={group.id} className="px-3 py-2 text-xs flex justify-between gap-3">
                  <span className="font-medium">{group.label}</span>
                  <span className="text-muted-foreground shrink-0">{group.orderCount} pedidos · {group.products.length} productos</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {grouping === 'ruta' && groups.some(g => g.label.startsWith('Rutas compartidas:')) && (
          <p className="text-xs rounded-md bg-amber-50 text-amber-900 p-3">Hay pedidos asignados a más de una ruta. Aparecen juntos en “Rutas compartidas” para contar sus productos una sola vez; revisa esos pedidos antes de preparar cada carga.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!exporting}>Cerrar</Button>
          <Button variant="outline" disabled={busy || !!failure || !productCount} onClick={() => exportReport('excel')}>
            {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel
          </Button>
          <Button disabled={busy || !!failure || !productCount} onClick={() => exportReport('pdf')}>
            {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
