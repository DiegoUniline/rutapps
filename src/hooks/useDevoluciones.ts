import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useDevoluciones(search?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['devoluciones', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('devoluciones')
        .select('id, fecha, tipo, notas, vendedor_id, cliente_id, user_id, vendedores(nombre), clientes(nombre), devolucion_lineas(id, cantidad, motivo, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveDevolucion() {
  const qc = useQueryClient();
  const { empresa, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ devolucion, lineas }: {
      devolucion: { vendedor_id?: string; cliente_id?: string; carga_id?: string; tipo: string; notas?: string; user_id: string };
      lineas: { producto_id: string; cantidad: number; motivo: string; notas?: string }[];
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
          lineas.map(l => ({ devolucion_id: dev.id, producto_id: l.producto_id, cantidad: l.cantidad, motivo: l.motivo as any, notas: l.notas || null }))
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

      // ── Restore stock to the user's assigned warehouse ──
      const almacenId = profile?.almacen_id;
      if (almacenId && lineas.length > 0) {
        const prodIds = lineas.map(l => l.producto_id);

        // Get current stock_almacen rows for this warehouse
        const { data: stockRows } = await supabase
          .from('stock_almacen')
          .select('id, producto_id, cantidad')
          .eq('almacen_id', almacenId)
          .in('producto_id', prodIds);

        const stockMap = new Map((stockRows ?? []).map(s => [s.producto_id, s]));

        // Get current global product quantities
        const { data: prodRows } = await supabase
          .from('productos')
          .select('id, cantidad')
          .in('id', prodIds);

        const prodMap = new Map((prodRows ?? []).map(p => [p.id, p]));

        for (const l of lineas) {
          const existing = stockMap.get(l.producto_id);
          if (existing) {
            await supabase.from('stock_almacen').update({
              cantidad: (existing.cantidad ?? 0) + l.cantidad,
            }).eq('id', existing.id);
          } else {
            await supabase.from('stock_almacen').insert({
              almacen_id: almacenId, producto_id: l.producto_id,
              empresa_id: empresa.id, cantidad: l.cantidad,
            });
          }

          // Update global product stock
          const prod = prodMap.get(l.producto_id);
          if (prod) {
            await supabase.from('productos').update({
              cantidad: (prod.cantidad ?? 0) + l.cantidad,
            }).eq('id', l.producto_id);
          }

          // Log inventory movement
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa.id, tipo: 'entrada',
            producto_id: l.producto_id, cantidad: l.cantidad,
            almacen_destino_id: almacenId,
            referencia_tipo: 'devolucion', referencia_id: dev.id,
            user_id: devolucion.user_id,
            notas: `Devolución - ${l.motivo}`,
          });
        }
      }

      return dev;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
    },
  });
}
