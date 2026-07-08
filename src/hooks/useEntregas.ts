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
          .select('id, folio, fecha, fecha_entrega, status, notas, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, fecha_asignacion, fecha_carga, validado_at, clientes(nombre), vendedores:profiles!entregas_vendedor_id_profiles_fkey(nombre, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), ventas!entregas_pedido_id_fkey(folio, fecha), almacenes(nombre), vendedor_ruta:profiles!entregas_vendedor_ruta_id_profiles_fkey(nombre, almacen_destino:almacenes!profiles_almacen_id_fkey(id, nombre)), entrega_lineas(id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, productos(codigo, nombre), almacenes:almacen_origen_id(id, nombre))')
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
    mutationFn: async ({ lineaId, productoId, almacenOrigenId, cantidadSurtida, entregaId, empresaId, asignacionLotes }: {
      lineaId: string;
      productoId: string;
      almacenOrigenId: string;
      cantidadSurtida: number;
      entregaId: string;
      empresaId: string;
      asignacionLotes?: { lote_id: string; cantidad: number }[];
    }) => {
      // Surtido por lote (asignación multi-lote) o surtido normal.
      if (asignacionLotes && asignacionLotes.length > 0) {
        const { error } = await supabase.rpc('surtir_linea_entrega_lotes' as any, {
          p_linea_id: lineaId,
          p_producto_id: productoId,
          p_almacen_origen_id: almacenOrigenId,
          p_entrega_id: entregaId,
          p_empresa_id: empresaId,
          p_user_id: user?.id,
          p_asignacion: asignacionLotes,
        });
        if (error) throw new Error(error.message);
        return;
      }
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

      // Surtir cada línea con lo que alcance el stock (parcial). El RPC devuelve
      // la cantidad realmente surtida: 0 = sin stock, la línea queda pendiente.
      const resultados: { id: string; producto_id: string; pedida: number; surtido: number }[] = [];
      for (const l of pendientes) {
        const almId = l.almacen_origen_id || almacenDefaultId!;
        const { data, error } = await supabase.rpc('surtir_linea_entrega_parcial' as any, {
          p_linea_id: l.id,
          p_producto_id: l.producto_id,
          p_almacen_origen_id: almId,
          p_cantidad_pedida: l.cantidad_pedida,
          p_entrega_id: entregaId,
          p_empresa_id: empresaId,
          p_user_id: user?.id,
        });
        if (error) throw new Error(error.message);
        resultados.push({ id: l.id, producto_id: l.producto_id, pedida: Number(l.cantidad_pedida), surtido: Number(data ?? 0) });
      }

      // El estado de la entrega lo decide el caller (solo pasa a 'surtido' si
      // todas las líneas quedaron completas).
      return resultados;
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

/** Cargar entrega — DB trigger `trg_apply_entrega_cargado_inventory` handles stock movement.
 *  Frontend only updates status (DB-authoritative inventory). */
export function useCargarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entregaId }: { entregaId: string }) => {
      const { data: entrega } = await supabase
        .from('entregas')
        .select('id, folio, vendedor_ruta_id, vendedor_id')
        .eq('id', entregaId)
        .single();
      if (!entrega) throw new Error('Entrega no encontrada');

      const folio = entrega.folio || entregaId.slice(0, 8);
      const vendedorId = entrega.vendedor_ruta_id || entrega.vendedor_id;
      if (!vendedorId) throw new Error(`No se puede cargar la entrega ${folio}: falta asignar vendedor de ruta.`);

      const { data: prof } = await supabase.from('profiles').select('almacen_id').eq('id', vendedorId).maybeSingle();
      if (!prof?.almacen_id) throw new Error(`No se puede cargar la entrega ${folio}: el vendedor no tiene almacén asignado en su perfil.`);

      const { data: lineas } = await supabase
        .from('entrega_lineas')
        .select('id, hecho, cantidad_entregada, almacen_origen_id, productos(nombre)')
        .eq('entrega_id', entregaId);

      const lineasHechas = (lineas ?? []).filter(l => l.hecho && l.cantidad_entregada > 0);
      if (lineasHechas.length === 0) {
        throw new Error(`No se puede cargar la entrega ${folio}: no hay líneas surtidas. Surte al menos un producto antes de cargar.`);
      }
      const sinOrigen = lineasHechas.filter(l => !l.almacen_origen_id);
      if (sinOrigen.length > 0) {
        const nombres = sinOrigen.map((l: any) => l.productos?.nombre || '').slice(0, 5).join(', ');
        const extra = sinOrigen.length > 5 ? ` y ${sinOrigen.length - 5} más` : '';
        throw new Error(`No se puede cargar la entrega ${folio}: las siguientes líneas no tienen almacén origen: ${nombres}${extra}.`);
      }

      // DB trigger moves stock; we only flip status
      const { error } = await supabase.from('entregas').update({
        status: 'cargado',
        fecha_carga: new Date().toISOString(),
      } as any).eq('id', entregaId);
      if (error) throw error;
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

/** Express: Crear entrega + Surtir todas las líneas + (opcional) Asignar repartidor — un solo paso. */
export function useEntregaExpress() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, vendedorId, clienteId, almacenId, vendedorRutaId, lineas }: {
      pedidoId: string;
      vendedorId?: string;
      clienteId?: string;
      almacenId: string;
      vendedorRutaId?: string;
      lineas: { producto_id: string; unidad_id?: string; cantidad_pendiente: number }[];
    }) => {
      if (!almacenId) throw new Error('Selecciona un almacén origen');
      if (lineas.length === 0) throw new Error('No hay cantidades pendientes para surtir');

      // Evitar duplicado: si ya existe una entrega activa para este pedido, reutilizarla / avisar
      const { data: existente } = await supabase
        .from('entregas')
        .select('id, folio, status')
        .eq('pedido_id', pedidoId)
        .in('status', ['borrador', 'asignado', 'cargado'])
        .maybeSingle();
      if (existente) {
        const err: any = new Error(`Este pedido ya tiene una entrega activa (${existente.folio ?? existente.id.slice(0,8)}) en estado "${existente.status}". Abre esa entrega o cancélala antes de crear una nueva.`);
        err.entregaExistenteId = existente.id;
        err.handled = true;
        throw err;
      }

      let ordenEntrega = 0;
      if (clienteId) {
        const { data: cliente } = await supabase.from('clientes').select('orden').eq('id', clienteId).single();
        ordenEntrega = cliente?.orden ?? 0;
      }

      const { data: entrega, error: eErr } = await supabase
        .from('entregas')
        .insert({
          empresa_id: empresa!.id,
          pedido_id: pedidoId,
          vendedor_id: vendedorId ?? null,
          cliente_id: clienteId ?? null,
          almacen_id: almacenId,
          status: 'borrador',
          orden_entrega: ordenEntrega,
        } as any)
        .select('id, folio')
        .single();
      if (eErr) throw eErr;

      const { data: lineasInsertadas, error: lErr } = await supabase
        .from('entrega_lineas')
        .insert(lineas.map(l => ({
          entrega_id: entrega.id,
          producto_id: l.producto_id,
          unidad_id: l.unidad_id ?? null,
          cantidad_pedida: l.cantidad_pendiente,
          cantidad_entregada: 0,
          hecho: false,
        })))
        .select('id, producto_id, cantidad_pedida');
      if (lErr) throw lErr;

      for (const l of (lineasInsertadas ?? [])) {
        const { error } = await supabase.rpc('surtir_linea_entrega', {
          p_linea_id: l.id,
          p_producto_id: l.producto_id,
          p_almacen_origen_id: almacenId,
          p_cantidad_surtida: l.cantidad_pedida,
          p_entrega_id: entrega.id,
          p_empresa_id: empresa!.id,
          p_user_id: user?.id,
        });
        if (error) throw new Error(error.message);
      }

      const update: any = vendedorRutaId
        ? { status: 'asignado', vendedor_ruta_id: vendedorRutaId, fecha_asignacion: new Date().toISOString() }
        : { status: 'surtido' };
      await supabase.from('entregas').update(update).eq('id', entrega.id);

      return entrega;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['entregas-by-pedido'] });
      qc.invalidateQueries({ queryKey: ['entrega'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
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
      // Validación previa: solo se puede validar una entrega cargada
      const { data: cur } = await supabase.from('entregas')
        .select('status, folio').eq('id', entregaId).single();
      if (!cur) throw new Error('Entrega no encontrada');
      if (!['cargado', 'en_ruta'].includes(cur.status as string)) {
        throw new Error(`No se puede validar la entrega ${cur.folio || ''}: primero debe estar cargada (estado actual: ${cur.status}).`);
      }

      // DB trigger `trg_apply_entrega_hecho_inventory` deducts stock. Frontend only flips status.
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
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useCancelarEntrega() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entregaId: string) => {
      // El inventario al cancelar lo maneja la BD (trigger apply_entrega_cargado_inventory):
      // el producto se QUEDA en el almacén del vendedor (camión) y se reconcilia en la
      // descarga. Antes este código sumaba el stock a la bodega desde el front, lo que
      // (a) duplicaba el reingreso junto con el trigger y (b) contradecía esa regla.
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
      // Solo usuarios activos: los dados de baja/archivados no deben poder
      // elegirse al crear/asignar entregas (solo aparecen en Usuarios → Baja).
      const { data } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return data ?? [];
    },
  });
}
