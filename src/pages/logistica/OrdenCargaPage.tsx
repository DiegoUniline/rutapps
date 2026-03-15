import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, Printer, CheckCircle } from 'lucide-react';
import { useCarga, useUpdateCargaStatus, useSaveCargaLineas } from '@/hooks/useCargas';
import { useCargaPedidos } from '@/hooks/useLogistica';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/TableSkeleton';
import { InlineEditCell } from '@/components/InlineEditCell';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendiente: { label: 'Borrador', variant: 'outline' },
  confirmada: { label: 'Confirmada', variant: 'secondary' },
  en_ruta: { label: 'En ruta', variant: 'default' },
  completada: { label: 'Completada', variant: 'secondary' },
};

interface ConsolidatedProduct {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidadPedida: number;
  cantidadSurtida: number;
}

export default function OrdenCargaPage() {
  const { camionId } = useParams();
  const navigate = useNavigate();
  const { data: carga, isLoading: loadingCarga } = useCarga(camionId);
  const { data: cargaPedidos, isLoading: loadingPedidos } = useCargaPedidos(camionId);
  const updateStatus = useUpdateCargaStatus();
  const saveLineas = useSaveCargaLineas();

  // Local state for surtido quantities
  const [surtido, setSurtido] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  // Consolidate products from all assigned pedidos
  const consolidated = useMemo(() => {
    const byProduct: Record<string, ConsolidatedProduct> = {};

    (cargaPedidos ?? []).forEach((cp: any) => {
      const lineas = cp.ventas?.venta_lineas ?? [];
      lineas.forEach((l: any) => {
        const pid = l.producto_id;
        if (!pid) return;
        if (!byProduct[pid]) {
          byProduct[pid] = {
            producto_id: pid,
            codigo: l.productos?.codigo ?? '',
            nombre: l.productos?.nombre ?? '',
            cantidadPedida: 0,
            cantidadSurtida: 0,
          };
        }
        byProduct[pid].cantidadPedida += Number(l.cantidad) || 0;
      });
    });

    // Match with carga_lineas if they exist
    if (carga?.carga_lineas) {
      (carga.carga_lineas as any[]).forEach(cl => {
        const pid = cl.producto_id;
        if (byProduct[pid]) {
          byProduct[pid].cantidadSurtida = cl.cantidad_cargada;
        }
      });
    }

    return Object.values(byProduct).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [cargaPedidos, carga]);

  // Initialize surtido from consolidated
  if (!initialized && consolidated.length > 0) {
    const init: Record<string, number> = {};
    consolidated.forEach(p => { init[p.producto_id] = p.cantidadSurtida || p.cantidadPedida; });
    setSurtido(init);
    setInitialized(true);
  }

  const isConfirmed = (carga?.status as string) === 'confirmada' || carga?.status === 'en_ruta' || carga?.status === 'completada';

  const handleUpdateSurtido = (pid: string, val: string) => {
    setSurtido(prev => ({ ...prev, [pid]: Number(val) || 0 }));
  };

  const handleConfirm = async () => {
    if (!camionId) return;
    try {
      // Save lineas
      const lineas = consolidated.map(p => ({
        producto_id: p.producto_id,
        cantidad_cargada: surtido[p.producto_id] ?? p.cantidadPedida,
      }));
      await saveLineas.mutateAsync({ cargaId: camionId, lineas });
      await updateStatus.mutateAsync({ id: camionId, status: 'confirmada' });
      toast.success('Carga confirmada');
    } catch {
      toast.error('Error al confirmar');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loadingCarga) return <div className="p-6"><TableSkeleton /></div>;

  const sc = statusConfig[carga?.status ?? 'pendiente'] ?? statusConfig.pendiente;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Truck className="h-5 w-5" /> Orden de carga
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <span>{(carga as any)?.vendedores?.nombre ?? 'Sin vendedor'}</span>
              <span>·</span>
              <span>{(carga as any)?.almacen_origen?.nombre ?? '—'} → {(carga as any)?.almacen_destino?.nombre ?? '—'}</span>
              <Badge variant={sc.variant} className="ml-2">{sc.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          {!isConfirmed && (
            <Button size="sm" onClick={handleConfirm} disabled={consolidated.length === 0}>
              <CheckCircle className="h-4 w-4 mr-1" /> Confirmar carga
            </Button>
          )}
        </div>
      </div>

      {/* Pedidos asignados count */}
      <div className="text-sm text-muted-foreground">
        {(cargaPedidos ?? []).length} pedido(s) asignados · {consolidated.length} productos consolidados
      </div>

      {/* Consolidated product table */}
      {loadingPedidos ? <TableSkeleton /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">Surtido</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consolidated.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin productos. Asigna pedidos primero.</TableCell></TableRow>
              )}
              {consolidated.map(p => {
                const surtidoQty = surtido[p.producto_id] ?? p.cantidadPedida;
                const diff = surtidoQty - p.cantidadPedida;
                const diffColor = diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-amber-600';
                return (
                  <TableRow key={p.producto_id} className="hover:bg-accent/40">
                    <TableCell className="font-mono text-[13px]">{p.codigo}</TableCell>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell className="text-right font-mono">{p.cantidadPedida}</TableCell>
                    <TableCell className="text-right">
                      {isConfirmed ? (
                        <span className="font-mono">{surtidoQty}</span>
                      ) : (
                        <InlineEditCell
                          value={surtidoQty}
                          type="number"
                          onSave={val => handleUpdateSurtido(p.producto_id, val)}
                          className="text-right font-mono"
                          min="0"
                          step="1"
                        />
                      )}
                    </TableCell>
                    <TableCell className={cn('text-right font-mono font-semibold', diffColor)}>
                      {diff > 0 ? '+' : ''}{diff}
                      {diff < 0 && <Badge variant="destructive" className="ml-1.5 text-[10px]">Quiebre</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
