import { todayLocal } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type StatusEntrega = 'borrador' | 'surtido' | 'asignado' | 'cargado' | 'en_ruta' | 'hecho' | 'cancelado';

export function useEntregasList(search?: string, vendedorFilter?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas-list', empresa?.id, search, vendedorFilter, statusFilter],
    enabled: !!empresa?.id,
    staleTime: 30_000,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        let q = supabase
          .from('entregas')
          .select('id, folio, fecha, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, fecha_asignacion, fecha_carga, validado_at, clientes(nombre), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), ventas!entregas_pedido_id_fkey(folio), almacenes(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), entrega_lineas(almacen_origen_id, almacenes:almacen_origen_id(id, nombre))')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (search) q = q.or(`folio.ilike.%${search}%`);
        if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
        if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);
        return q;
      });
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
        .select('*, clientes(nombre), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre), almacenes(nombre), ventas!entregas_pedido_id_fkey(folio, total, condicion_pago)')
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
      // Atomic stock deduction via DB function (prevents race conditions)
      const { error } = await supabase.rpc('surtir_linea_entrega', {
        p_linea_id: lineaId,
        p_producto_id: productoId,
        p_almacen_origen_id: almacenOrigenId,
        p_cantidad_surtida: cantidadSurtida,
        p_entrega_id: entregaId,
        p_empresa_id: empresaId,
        p_user_id: user?.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
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
      const pendientes = lineas.filter(l => !l.hecho);

      // Validate almacen exists for all lines
      for (const l of pendientes) {
        if (!(l.almacen_origen_id || almacenDefaultId)) {
          throw new Error('Falta almacén origen para el producto');
        }
      }

      // Process all via atomic DB function (each call locks the product row)
      for (const l of pendientes) {
        const almId = l.almacen_origen_id || almacenDefaultId!;
        const { error } = await supabase.rpc('surtir_linea_entrega', {
          p_linea_id: l.id,
          p_producto_id: l.producto_id,
          p_almacen_origen_id: almId,
          p_cantidad_surtida: l.cantidad_pedida,
          p_entrega_id: entregaId,
          p_empresa_id: empresaId,
          p_user_id: user?.id,
        });
        if (error) throw new Error(error.message);
      }

      // Update entrega status to surtido + almacen
      await supabase.from('entregas').update({ status: 'surtido', almacen_id: almacenDefaultId } as any).eq('id', entregaId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
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
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

/** Cargar entrega — moves stock to vendedor's almacen via stock_almacen */
export function useCargarEntrega() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId }: { entregaId: string }) => {
      const { data: entrega } = await supabase
        .from('entregas')
        .select('id, folio, empresa_id, vendedor_ruta_id, vendedor_id, status')
        .eq('id', entregaId)
        .single();
      if (!entrega) throw new Error('Entrega no encontrada');

      const folio = entrega.folio || entregaId.slice(0, 8);
      const vendedorId = entrega.vendedor_ruta_id || entrega.vendedor_id;
      if (!vendedorId) throw new Error(`No se puede cargar la entrega ${folio}: falta asignar vendedor de ruta.`);

      // Get vendedor's almacen_id from profiles
      const { data: prof } = await supabase.from('profiles').select('almacen_id').eq('id', vendedorId).maybeSingle();
      const almacenDestinoId = prof?.almacen_id;
      if (!almacenDestinoId) throw new Error(`No se puede cargar la entrega ${folio}: el vendedor no tiene almacén asignado en su perfil.`);

      const { data: lineas } = await supabase
        .from('entrega_lineas')
        .select('id, producto_id, cantidad_entregada, hecho, almacen_origen_id, productos(nombre)')
        .eq('entrega_id', entregaId);

      // Validación dura previa: cada línea hecha debe tener almacén origen
      const lineasHechas = (lineas ?? []).filter(l => l.hecho && l.cantidad_entregada > 0);
      if (lineasHechas.length === 0) {
        throw new Error(`No se puede cargar la entrega ${folio}: no hay líneas surtidas. Surte al menos un producto antes de cargar.`);
      }
      const sinOrigen = lineasHechas.filter(l => !l.almacen_origen_id);
      if (sinOrigen.length > 0) {
        const nombres = sinOrigen
          .map((l: any) => l.productos?.nombre || l.producto_id)
          .slice(0, 5)
          .join(', ');
        const extra = sinOrigen.length > 5 ? ` y ${sinOrigen.length - 5} más` : '';
        throw new Error(`No se puede cargar la entrega ${folio}: las siguientes líneas no tienen almacén origen: ${nombres}${extra}.`);
      }

      const today = todayLocal();

      for (const l of (lineas ?? []).filter(l => l.hecho && l.cantidad_entregada > 0)) {
        // Upsert into stock_almacen for vendedor's almacen
        const { data: existing } = await supabase.from('stock_almacen')
          .select('id, cantidad').eq('almacen_id', almacenDestinoId).eq('producto_id', l.producto_id).maybeSingle();

        if (existing) {
          await supabase.from('stock_almacen').update({ cantidad: existing.cantidad + l.cantidad_entregada, updated_at: new Date().toISOString() } as any).eq('id', existing.id);
        } else {
          await supabase.from('stock_almacen').insert({ empresa_id: entrega.empresa_id, almacen_id: almacenDestinoId, producto_id: l.producto_id, cantidad: l.cantidad_entregada } as any);
        }

        // Log movimiento (entrada a almacén del vendedor)
        await supabase.from('movimientos_inventario').insert({
          empresa_id: entrega.empresa_id,
          tipo: 'entrada',
          producto_id: l.producto_id,
          cantidad: l.cantidad_entregada,
          almacen_origen_id: l.almacen_origen_id ?? null,
          almacen_destino_id: almacenDestinoId,
          referencia_tipo: 'entrega',
          referencia_id: entregaId,
          user_id: user?.id,
          fecha: today,
          notas: 'Carga a ubicación',
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
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
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
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
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
      // Fetch client's saved route order to set orden_entrega
      let ordenEntrega = 0;
      if (clienteId) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('orden')
          .eq('id', clienteId)
          .single();
        ordenEntrega = cliente?.orden ?? 0;
      }

      const { data: entrega, error } = await supabase
        .from('entregas')
        .insert({
          empresa_id: empresa!.id,
          pedido_id: pedidoId ?? null,
          vendedor_id: vendedorId ?? null,
          cliente_id: clienteId ?? null,
          almacen_id: almacenId ?? null,
          status: 'borrador',
          orden_entrega: ordenEntrega,
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
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
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

      // Deduct from vendedor's almacen via stock_almacen
      const { data: ent } = await supabase.from('entregas')
        .select('empresa_id, vendedor_ruta_id, vendedor_id, entrega_lineas(producto_id, cantidad_entregada, hecho)')
        .eq('id', entregaId).single();

      const vendId = ent?.vendedor_ruta_id || ent?.vendedor_id;
      if (vendId) {
        const { data: prof } = await supabase.from('profiles').select('almacen_id').eq('id', vendId).maybeSingle();
        const almId = prof?.almacen_id;
        if (almId) {
          for (const l of (ent?.entrega_lineas ?? []).filter((l: any) => l.hecho && l.cantidad_entregada > 0)) {
            const { data: sa } = await supabase.from('stock_almacen')
              .select('id, cantidad').eq('almacen_id', almId)
              .eq('producto_id', (l as any).producto_id).maybeSingle();
            if (sa) {
              await supabase.from('stock_almacen')
                .update({ cantidad: Math.max(0, sa.cantidad - (l as any).cantidad_entregada), updated_at: new Date().toISOString() } as any)
                .eq('id', sa.id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useCancelarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entregaId: string) => {
      // Restore stock for surtidas lines before cancelling
      const { data: lineas } = await supabase
        .from('entrega_lineas')
        .select('producto_id, cantidad_entregada, hecho, almacen_origen_id')
        .eq('entrega_id', entregaId);

      const { data: ent } = await supabase.from('entregas').select('empresa_id').eq('id', entregaId).single();

      for (const l of (lineas ?? []).filter(l => l.hecho && l.cantidad_entregada > 0 && l.almacen_origen_id)) {
        const { data: existing } = await supabase.from('stock_almacen')
          .select('id, cantidad').eq('empresa_id', ent!.empresa_id)
          .eq('almacen_id', l.almacen_origen_id).eq('producto_id', l.producto_id).maybeSingle();
        if (existing) {
          await supabase.from('stock_almacen').update({ cantidad: existing.cantidad + l.cantidad_entregada } as any).eq('id', existing.id);
        } else {
          await supabase.from('stock_almacen').insert({ empresa_id: ent!.empresa_id, almacen_id: l.almacen_origen_id, producto_id: l.producto_id, cantidad: l.cantidad_entregada } as any);
        }
      }

      const { error } = await supabase.from('entregas').update({ status: 'cancelado' } as any).eq('id', entregaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useVendedoresList() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}
