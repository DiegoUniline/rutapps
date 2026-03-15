import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useDevoluciones(search?: string, page = 0, pageSize = 25) {
  return useQuery({
    queryKey: ['devoluciones', search, page],
    queryFn: async () => {
      const from = page * pageSize;
      let q = supabase
        .from('devoluciones')
        .select('id, fecha, tipo, notas, vendedor_id, cliente_id, vendedores(nombre), clientes(nombre), devolucion_lineas(id, cantidad, motivo, productos(codigo, nombre))', { count: 'exact' })
        .order('fecha', { ascending: false })
        .range(from, from + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0, page, pageSize };
    },
  });
}

export function useSaveDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ devolucion, lineas }: {
      devolucion: { vendedor_id?: string; cliente_id?: string; carga_id?: string; tipo: string; notas?: string; user_id: string };
      lineas: { producto_id: string; cantidad: number; motivo: string; notas?: string }[];
    }) => {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
      const { data: dev, error: devErr } = await supabase.from('devoluciones').insert({
        ...devolucion,
        empresa_id: profile!.empresa_id,
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
