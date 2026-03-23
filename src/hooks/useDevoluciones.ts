import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useDevoluciones(search?: string) {
  return useQuery({
    queryKey: ['devoluciones', search],
    queryFn: async () => {
      let q = supabase
        .from('devoluciones')
        .select('id, fecha, tipo, notas, vendedor_id, cliente_id, user_id, vendedores(nombre), clientes(nombre), devolucion_lineas(id, cantidad, motivo, productos(codigo, nombre))')
        .order('fecha', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveDevolucion() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
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

      return dev;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      qc.invalidateQueries({ queryKey: ['carga-activa'] });
      qc.invalidateQueries({ queryKey: ['carga'] });
      qc.invalidateQueries({ queryKey: ['cargas'] });
    },
  });
}
