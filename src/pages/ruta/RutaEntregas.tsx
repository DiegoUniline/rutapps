import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery, useOfflineMutation } from '@/hooks/useOfflineData';
import { Truck, Check, Package, MapPin, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

export default function RutaEntregas() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const vendedorId = profile?.vendedor_id;
  const { mutate: offlineMutate, isPending } = useOfflineMutation();

  // Query entregas assigned to this vendedor's route with status cargado or en_ruta
  const { data: allEntregas, refetch } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id, orderBy: 'fecha' });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: entregaLineas } = useOfflineQuery('entrega_lineas', {}, { enabled: !!empresa?.id });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));
  const productoMap = new Map((productos ?? []).map((p: any) => [p.id, p]));

  // Filter: entregas cargadas/en_ruta assigned to this vendedor
  const entregas = (allEntregas ?? [])
    .filter((e: any) =>
      (e.status === 'cargado' || e.status === 'en_ruta') &&
      (e.vendedor_ruta_id === vendedorId || e.vendedor_id === vendedorId)
    )
    .map((e: any) => {
      const cliente = clienteMap.get(e.cliente_id);
      const lineas = (entregaLineas ?? [])
        .filter((l: any) => l.entrega_id === e.id)
        .map((l: any) => ({
          ...l,
          _productoNombre: productoMap.get(l.producto_id)?.nombre ?? '—',
          _productoCodigo: productoMap.get(l.producto_id)?.codigo ?? '',
        }));
      return { ...e, _cliente: cliente, _lineas: lineas };
    });

  const marcarEntregado = async (id: string) => {
    const entrega = (allEntregas ?? []).find((e: any) => e.id === id) as any;
    if (!entrega) return;
    await offlineMutate('entregas', 'update', {
      ...entrega,
      status: 'hecho',
      validado_at: new Date().toISOString(),
    });
    toast.success('¡Entrega completada!');
    refetch();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h1 className="text-[18px] font-bold text-foreground">Por entregar</h1>
        <Badge variant="secondary" className="ml-auto text-[11px]">{entregas.length} pendientes</Badge>
      </div>

      {entregas.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No tienes entregas pendientes</p>
        </div>
      )}

      {entregas.map((e: any) => (
        <div key={e.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-mono text-muted-foreground">{e.folio}</p>
                <p className="text-[15px] font-semibold text-foreground">{e._cliente?.nombre ?? '—'}</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">
                {e.status === 'en_ruta' ? 'En ruta' : 'Cargado'}
              </Badge>
            </div>

            {(e._cliente?.direccion || e._cliente?.colonia) && (
              <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{[e._cliente?.direccion, e._cliente?.colonia].filter(Boolean).join(', ')}</span>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">{fmtDate(e.fecha)}</p>

            <div className="bg-muted/50 rounded-xl p-3 space-y-1">
              {e._lineas.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-[12px]">
                  <span className="text-foreground">{l._productoNombre}</span>
                  <span className="font-medium text-foreground">{l.cantidad_entregada || l.cantidad_pedida}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end pt-1">
              <Button size="sm" className="rounded-xl" onClick={() => marcarEntregado(e.id)} disabled={isPending}>
                <Check className="h-4 w-4 mr-1" /> Entregar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
