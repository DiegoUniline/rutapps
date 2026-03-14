import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Check, Package, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

function useMisEntregas() {
  const { empresa, user } = useAuth();
  return useQuery({
    queryKey: ['mis-entregas', empresa?.id, user?.id],
    enabled: !!empresa?.id && !!user?.id,
    queryFn: async () => {
      // Get vendedor linked to this user (via profile or all vendedores for now)
      const { data } = await supabase
        .from('ventas')
        .select('*, clientes(nombre, direccion, colonia, telefono), venta_lineas(cantidad, productos(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'venta_directa')
        .not('pedido_origen_id', 'is', null)
        .in('status', ['confirmado'] as any)
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });
}

export default function RutaEntregas() {
  const qc = useQueryClient();
  const { data: entregas, isLoading } = useMisEntregas();

  const marcarEntregado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ status: 'entregado' as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('¡Entrega completada!');
      qc.invalidateQueries({ queryKey: ['mis-entregas'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h1 className="text-[18px] font-bold text-foreground">Por entregar</h1>
        <Badge variant="secondary" className="ml-auto text-[11px]">{entregas?.length ?? 0} pendientes</Badge>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Cargando...</p>}

      {!isLoading && (entregas?.length ?? 0) === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No tienes entregas pendientes</p>
        </div>
      )}

      {entregas?.map((e: any) => (
        <div key={e.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-mono text-muted-foreground">{e.folio}</p>
                <p className="text-[15px] font-semibold text-foreground">{e.clientes?.nombre ?? '—'}</p>
              </div>
              <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">
                Por entregar
              </Badge>
            </div>

            {(e.clientes?.direccion || e.clientes?.colonia) && (
              <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{[e.clientes?.direccion, e.clientes?.colonia].filter(Boolean).join(', ')}</span>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">{fmtDate(e.fecha)}</p>

            {/* Products */}
            <div className="bg-muted/50 rounded-xl p-3 space-y-1">
              {e.venta_lineas?.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-[12px]">
                  <span className="text-foreground">{l.productos?.nombre ?? '—'}</span>
                  <span className="font-medium text-foreground">{l.cantidad}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[14px] font-bold text-foreground">
                $ {(e.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
              <Button
                size="sm"
                className="rounded-xl"
                onClick={() => marcarEntregado.mutate(e.id)}
                disabled={marcarEntregado.isPending}
              >
                <Check className="h-4 w-4 mr-1" /> Entregar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
