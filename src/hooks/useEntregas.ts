import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type StatusEntrega = 'borrador' | 'surtido' | 'asignado' | 'cargado' | 'en_ruta' | 'hecho' | 'cancelado';

export function useEntregasList(search?: string, vendedorFilter?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas-list', empresa?.id, search, vendedorFilter, statusFilter],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('entregas')
        .select('id, folio, fecha, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, fecha_asignacion, fecha_carga, validado_at, clientes(nombre), vendedores!entregas_vendedor_id_fkey(nombre), ventas!entregas_pedido_id_fkey(folio)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });

      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEntrega(id?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entrega', id],
    enabled: !!id && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('*, clientes(nombre), vendedores!entregas_vendedor_id_fkey(nombre), almacenes(nombre), ventas!entregas_pedido_id_fkey(folio, total, condicion_pago)')
        .eq('id', id!)
        .single();
      if (error) throw error;

      const { data: lineas, error: lErr } = await supabase
        .from('entrega_lineas')
        .select('*, productos(codigo, nombre, unidad_venta_id, cantidad), unidades(abreviatura), almacenes:almacen_origen_id(id, nombre)')
        .eq('entrega_id', id!)
        .order('created_at');
      if (lErr) throw lErr;

      return { ...data, entrega_lineas: lineas ?? [] };
    },
  });
}

export function useEntregasByPedido(pedidoId?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas-by-pedido', pedidoId],
    enabled: !!pedidoId && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('id, folio, status, entrega_lineas(producto_id, cantidad_entregada, hecho)')
        .eq('pedido_id', pedidoId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Calculate remaining quantities for a pedido based on existing entregas */
export function calcRemainingQty(
  lineas: { producto_id: string; cantidad: number }[],
  entregas: { entrega_lineas: { producto_id: string; cantidad_entregada: number }[] }[]
) {
  const delivered: Record<string, number> = {};
  for (const e of entregas) {
    for (const l of (e.entrega_lineas ?? [])) {
      delivered[l.producto_id] = (delivered[l.producto_id] ?? 0) + Number(l.cantidad_entregada);
    }
  }
  return lineas
    .map(l => ({
      ...l,
      cantidad_entregada_total: delivered[l.producto_id] ?? 0,
      cantidad_pendiente: Math.max(0, Number(l.cantidad) - (delivered[l.producto_id] ?? 0)),
    }))
    .filter(l => l.cantidad_pendiente > 0);
}

/** Surtir (fulfill) a single line — validates stock and creates movimiento */
export function useSurtirLinea() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineaId, productoId, almacenOrigenId, cantidadSurtida, entregaId, empresaId }: {
      lineaId: string;
      productoId: string;
      almacenOrigenId: string;
      cantidadSurtida: number;
      entregaId: string;
      empresaId: string;
    }) => {
      // 1. Check stock at origin
      const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', productoId).single();
      const stockDisponible = prod?.cantidad ?? 0;
      if (cantidadSurtida > stockDisponible) {
        throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}`);
      }

      // 2. Deduct stock from origin
      await supabase.from('productos').update({
        cantidad: Math.max(0, stockDisponible - cantidadSurtida),
      } as any).eq('id', productoId);

      // 3. Mark line as fulfilled
      await supabase.from('entrega_lineas').update({
        cantidad_entregada: cantidadSurtida,
        almacen_origen_id: almacenOrigenId,
        hecho: true,
      } as any).eq('id', lineaId);

      // 4. Log movimiento (salida de almacén)
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('movimientos_inventario').insert({
        empresa_id: empresaId,
        tipo: 'salida',
        producto_id: productoId,
        cantidad: cantidadSurtida,
        almacen_origen_id: almacenOrigenId,
        referencia_tipo: 'entrega',
        referencia_id: entregaId,
        user_id: user?.id,
        fecha: today,
        notas: 'Surtido de entrega',
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
  });
}

/** Surtir all lines at once — validates stock for each */
export function useSurtirTodo() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId, lineas, empresaId, almacenDefaultId }: {
      entregaId: string;
      lineas: { id: string; producto_id: string; cantidad_pedida: number; almacen_origen_id?: string; hecho?: boolean }[];
      empresaId: string;
      almacenDefaultId?: string;
    }) => {
      const today = new Date().toISOString().slice(0, 10);
      const pendientes = lineas.filter(l => !l.hecho);
      
      // First validate all stock
      for (const l of pendientes) {
        const almId = l.almacen_origen_id || almacenDefaultId;
        if (!almId) throw new Error('Falta almacén origen para el producto');
        const { data: prod } = await supabase.from('productos').select('cantidad, nombre').eq('id', l.producto_id).single();
        const stock = prod?.cantidad ?? 0;
        if (l.cantidad_pedida > stock) {
          throw new Error(`Stock insuficiente para "${prod?.nombre}". Disponible: ${stock}, Pedido: ${l.cantidad_pedida}`);
        }
      }

      // Then process all
      for (const l of pendientes) {
        const almId = l.almacen_origen_id || almacenDefaultId!;
        const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
        const stock = prod?.cantidad ?? 0;

        await supabase.from('productos').update({
          cantidad: Math.max(0, stock - l.cantidad_pedida),
        } as any).eq('id', l.producto_id);

        await supabase.from('entrega_lineas').update({
          cantidad_entregada: l.cantidad_pedida,
          almacen_origen_id: almId,
          hecho: true,
        } as any).eq('id', l.id);

        await supabase.from('movimientos_inventario').insert({
          empresa_id: empresaId,
          tipo: 'salida',
          producto_id: l.producto_id,
          cantidad: l.cantidad_pedida,
          almacen_origen_id: almId,
          referencia_tipo: 'entrega',
          referencia_id: entregaId,
          user_id: user?.id,
          fecha: today,
          notas: 'Surtido de entrega (masivo)',
        } as any);
      }

      // Update entrega status to surtido
      await supabase.from('entregas').update({ status: 'surtido' } as any).eq('id', entregaId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
  });
}

/** Assign entrega to a route (vendedor_ruta) */
export function useAsignarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId, vendedorRutaId }: { entregaId: string; vendedorRutaId: string }) => {
      const { error } = await supabase.from('entregas').update({
        status: 'asignado',
        vendedor_ruta_id: vendedorRutaId,
        fecha_asignacion: new Date().toISOString(),
      } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
    },
  });
}

/** Cargar entrega to truck — moves stock to stock_camion */
export function useCargarEntrega() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId }: { entregaId: string }) => {
      const { data: entrega } = await supabase
        .from('entregas')
        .select('id, empresa_id, vendedor_ruta_id, vendedor_id')
        .eq('id', entregaId)
        .single();
      if (!entrega) throw new Error('Entrega no encontrada');

      const vendedorId = entrega.vendedor_ruta_id || entrega.vendedor_id;
      if (!vendedorId) throw new Error('Falta vendedor/ruta asignado');

      const { data: lineas } = await supabase
        .from('entrega_lineas')
        .select('id, producto_id, cantidad_entregada, hecho, almacen_origen_id')
        .eq('entrega_id', entregaId);

      const today = new Date().toISOString().slice(0, 10);

      for (const l of (lineas ?? []).filter(l => l.hecho && l.cantidad_entregada > 0)) {
        // Insert into stock_camion
        await supabase.from('stock_camion').insert({
          empresa_id: entrega.empresa_id,
          vendedor_id: vendedorId,
          producto_id: l.producto_id,
          cantidad_inicial: l.cantidad_entregada,
          cantidad_actual: l.cantidad_entregada,
          fecha: today,
        } as any);

        // Log movimiento (entrada a camión)
        await supabase.from('movimientos_inventario').insert({
          empresa_id: entrega.empresa_id,
          tipo: 'entrada',
          producto_id: l.producto_id,
          cantidad: l.cantidad_entregada,
          vendedor_destino_id: vendedorId,
          referencia_tipo: 'entrega',
          referencia_id: entregaId,
          user_id: user?.id,
          fecha: today,
          notas: 'Carga a camión',
        } as any);
      }

      await supabase.from('entregas').update({
        status: 'cargado',
        fecha_carga: new Date().toISOString(),
      } as any).eq('id', entregaId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['stock-camion'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
  });
}

/** Express: Asignar + Cargar in one step */
export function useAsignarYCargar() {
  const asignar = useAsignarEntrega();
  const cargar = useCargarEntrega();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId, vendedorRutaId }: { entregaId: string; vendedorRutaId: string }) => {
      await asignar.mutateAsync({ entregaId, vendedorRutaId });
      await cargar.mutateAsync({ entregaId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
    },
  });
}

export function useCrearEntrega() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, vendedorId, clienteId, almacenId, lineas }: {
      pedidoId?: string;
      vendedorId?: string;
      clienteId?: string;
      almacenId?: string;
      lineas: { producto_id: string; unidad_id?: string; cantidad_pedida: number }[];
    }) => {
      const { data: entrega, error } = await supabase
        .from('entregas')
        .insert({
          empresa_id: empresa!.id,
          pedido_id: pedidoId ?? null,
          vendedor_id: vendedorId ?? null,
          cliente_id: clienteId ?? null,
          almacen_id: almacenId ?? null,
          status: 'borrador',
        } as any)
        .select('id, folio')
        .single();
      if (error) throw error;

      if (lineas.length > 0) {
        const { error: lErr } = await supabase.from('entrega_lineas').insert(
          lineas.map(l => ({
            entrega_id: entrega.id,
            producto_id: l.producto_id,
            unidad_id: l.unidad_id ?? null,
            cantidad_pedida: l.cantidad_pedida,
            cantidad_entregada: 0,
            hecho: false,
          }))
        );
        if (lErr) throw lErr;
      }

      return entrega;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
  });
}

export function useValidarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId }: { entregaId: string }) => {
      const { error } = await supabase.from('entregas').update({
        status: 'hecho',
        validado_at: new Date().toISOString(),
      } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
    },
  });
}

export function useCancelarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entregaId: string) => {
      const { error } = await supabase.from('entregas').update({ status: 'cancelado' } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
    },
  });
}

export function useVendedoresList() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}
