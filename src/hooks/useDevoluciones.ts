import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { toast } from 'sonner';

export function useDevoluciones(search?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['devoluciones', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        let q = supabase
          .from('devoluciones')
          .select('id, fecha, tipo, notas, vendedor_id, cliente_id, user_id, vendedores:profiles!vendedor_id(nombre), clientes(nombre), devolucion_lineas(id, cantidad, motivo, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
          .eq('empresa_id', empresa!.id)
          .order('fecha', { ascending: false })
          .range(from, to);
        return q;
      });
    },
  });
}

export function useSaveDevolucion() {
  const qc = useQueryClient();
  const { empresa, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ devolucion, lineas }: {
      devolucion: { vendedor_id?: string; cliente_id?: string; carga_id?: string; venta_id?: string; almacen_destino_id?: string; reembolso_efectivo?: boolean; reembolso_metodo?: string; tipo: string; notas?: string; user_id: string };
      lineas: { producto_id: string; cantidad: number; motivo: string; notas?: string; accion?: string; monto_credito?: number }[];
    }) => {
      if (!empresa?.id) throw new Error('Sin empresa');
      const { data: dev, error: devErr } = await supabase.from('devoluciones').insert({
        ...devolucion,
        empresa_id: empresa.id,
        tipo: devolucion.tipo as any,
      }).select('id').single();
      if (devErr) throw devErr;

      if (lineas.length > 0) {
        const { error: linErr } = await supabase.from('devolucion_lineas').insert(
          lineas.map(l => ({ devolucion_id: dev.id, producto_id: l.producto_id, cantidad: l.cantidad, motivo: l.motivo as any, notas: l.notas || null, accion: (l.accion as any) ?? null, monto_credito: l.monto_credito ?? 0 }))
        );
        if (linErr) throw linErr;
      }

      // Bulk update carga_lineas if linked to a carga
      if (devolucion.carga_id && lineas.length > 0) {
        const prodIds = lineas.map(l => l.producto_id);
        const { data: cls } = await supabase
          .from('carga_lineas')
          .select('id, producto_id, cantidad_devuelta')
          .eq('carga_id', devolucion.carga_id)
          .in('producto_id', prodIds);

        if (cls && cls.length > 0) {
          const updates = cls.map(cl => {
            const linea = lineas.find(l => l.producto_id === cl.producto_id);
            return supabase.from('carga_lineas').update({
              cantidad_devuelta: (cl.cantidad_devuelta ?? 0) + (linea?.cantidad ?? 0),
            }).eq('id', cl.id);
          });
          await Promise.all(updates);
        }
      }

      // ── Reingreso al inventario: lo aplica el trigger BD
      // (trg_apply_devolucion_linea_inventory en devolucion_lineas).
      // El stock_almacen del usuario que registra se actualiza solo.

      return dev;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      qc.invalidateQueries({ queryKey: ['venta-devoluciones'] });
      qc.invalidateQueries({ queryKey: ['venta-pagos'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}
