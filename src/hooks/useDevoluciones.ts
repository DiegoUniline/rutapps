import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useDevoluciones(search?: string) {
  return useQuery({
    queryKey: ['devoluciones', search],
    queryFn: async () => {
      let q = supabase
        .from('devoluciones')
        .select('*, vendedores(nombre), clientes(nombre), devolucion_lineas(id, cantidad, motivo, productos(codigo, nombre))')
        .order('fecha', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data;
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

      // Update carga_lineas if linked to a carga
      if (devolucion.carga_id) {
        for (const l of lineas) {
          const { data: cl } = await supabase
            .from('carga_lineas')
            .select('id, cantidad_devuelta')
            .eq('carga_id', devolucion.carga_id)
            .eq('producto_id', l.producto_id)
            .maybeSingle();
          if (cl) {
            await supabase.from('carga_lineas').update({
              cantidad_devuelta: (cl.cantidad_devuelta ?? 0) + l.cantidad,
            }).eq('id', cl.id);
          }
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
