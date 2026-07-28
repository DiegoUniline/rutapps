import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CATALOG_STALE_TIME } from '@/hooks/useBootstrapPrefetch';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { pickColumns, CLIENTE_COLUMNS } from '@/lib/allowlist';
import { enrichClientes, ensureCatalogsForEnrich } from '@/lib/catalogEnrich';
import { deterministicUuid } from '@/lib/deterministicId';
import type { Cliente, Zona, Vendedor, Cobrador } from '@/types';

const CATALOG_STALE = CATALOG_STALE_TIME;


/** Paginated clients for list views. When fetchAll=true, returns all matching rows (used for grouping). */
export function useClientesPaginated(search?: string, statusFilter?: string, page = 1, pageSize = 80, vendedorFilter?: string, zonaFilter?: string, fetchAll = false) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const { seeAll, profileId, clientesVisibilidad } = useDataVisibility('clientes');
  const filterByVendedor = clientesVisibilidad === 'propios' && !seeAll && !!profileId;

  return useQuery({
    queryKey: ['clientes-page', empresa?.id, search, statusFilter, page, pageSize, filterByVendedor ? profileId : 'all', vendedorFilter, zonaFilter, fetchAll],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Se removieron los LEFT JOIN LATERAL (zonas(nombre), listas(nombre),
      // vendedores(nombre), cobradores(nombre), tarifas(nombre)) porque
      // multiplicaban el costo CPU en Postgres. Los nombres se resuelven en
      // el cliente con `enrichClientes` a partir de los catálogos pequeños
      // ya cacheados por useBootstrapPrefetch. La forma de la fila se
      // preserva: consumidores siguen leyendo cliente.zonas?.nombre, etc.
      const SELECT = 'id, codigo, nombre, telefono, lada, contacto, email, direccion, colonia, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, lista_precio_id, status, orden, credito, limite_credito, dias_credito, dia_visita, gps_lat, gps_lng, frecuencia, foto_url, foto_fachada_url';
      const applyFilters = (q: any) => {
        q = q.eq('empresa_id', empresa!.id).order('nombre', { ascending: true });
        if (filterByVendedor) q = q.eq('vendedor_id', profileId!);
        if (search) {
          const s = search.replace(/'/g, "''");
          q = q.or(`nombre.ilike.%${s}%,codigo.ilike.%${s}%,telefono.ilike.%${s}%,contacto.ilike.%${s}%,email.ilike.%${s}%,direccion.ilike.%${s}%,colonia.ilike.%${s}%`);
        }
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',');
          if (arr.length > 1) q = q.in('status', arr as any);
          else q = q.eq('status', statusFilter as Cliente['status']);
        }
        if (vendedorFilter && vendedorFilter !== 'todos') {
          const arr = vendedorFilter.split(',');
          if (arr.length > 1) q = q.in('vendedor_id', arr as any);
          else q = q.eq('vendedor_id', vendedorFilter);
        }
        if (zonaFilter && zonaFilter !== 'todos') {
          const arr = zonaFilter.split(',');
          if (arr.length > 1) q = q.in('zona_id', arr as any);
          else q = q.eq('zona_id', zonaFilter);
        }
        return q;
      };

      // Garantiza los catálogos en caché antes de resolver nombres (evita
      // nombres en blanco en recarga dura parado en la lista).
      await ensureCatalogsForEnrich(qc, empresa!.id);

      if (fetchAll) {
        const rows = await fetchAllPages<any>((from, to) => applyFilters(supabase.from('clientes').select(SELECT).range(from, to)));
        const enriched = enrichClientes(rows ?? [], qc, empresa!.id);
        return { rows: enriched as unknown as Cliente[], total: enriched.length };
      }

      let q = supabase.from('clientes').select(SELECT, { count: 'exact' }).range((page - 1) * pageSize, page * pageSize - 1);
      q = applyFilters(q);
      const { data, error, count } = await q;
      if (error) throw error;
      const enriched = enrichClientes((data ?? []) as any[], qc, empresa!.id);
      return { rows: enriched as unknown as Cliente[], total: count ?? 0 };
    },
  });
}

/** All clients (for lookups/selectors — not for list pages) */
export function useClientes(search?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['clientes', empresa?.id, search, statusFilter],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Mismo motivo que useClientesPaginated: joins fuera, enriquecer en cliente.
      const rows = await fetchAllPages<any>((from, to) => {
        let q = supabase.from('clientes')
          .select('id, codigo, nombre, telefono, lada, contacto, email, rfc, direccion, colonia, vendedor_id, cobrador_id, zona_id, tarifa_id, lista_id, lista_precio_id, status, orden, credito, limite_credito, dias_credito, dia_visita, gps_lat, gps_lng, frecuencia, foto_url, foto_fachada_url')
          .eq('empresa_id', empresa!.id)
          .order('nombre', { ascending: true })
          .range(from, to);
        if (search) q = q.or(`nombre.ilike.%${search}%,codigo.ilike.%${search}%`);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',').filter(Boolean);
          if (arr.length > 1) q = q.in('status', arr as any);
          else q = q.eq('status', statusFilter as Cliente['status']);
        }
        return q;
      });
      await ensureCatalogsForEnrich(qc, empresa!.id);
      return enrichClientes(rows ?? [], qc, empresa!.id) as unknown as Cliente[];
    },
  });
}


export function useCliente(id?: string) {
  return useQuery({
    queryKey: ['cliente', id],
    staleTime: CATALOG_STALE,
    // networkMode 'always' + fallback a IndexedDB: la pantalla de detalle de
    // cliente ya no se queda cargando/en blanco sin conexión.
    networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('clientes')
          .select('*, zonas(nombre), listas(nombre), vendedores:profiles!vendedor_id(nombre), cobradores:profiles!cobrador_id(nombre), tarifas(nombre)')
          .eq('id', id!).single();
        if (error) throw error;
        return data as Cliente;
      } catch (err) {
        // Offline: lee el cliente cacheado (campos propios; sin los joins).
        const { getOfflineTable } = await import('@/lib/offlineDb');
        const t = getOfflineTable('clientes');
        const local = t ? await t.get(id!).catch(() => null) : null;
        if (local) return local as Cliente;
        throw err;
      }
    },
    enabled: !!id,
  });
}

export function useSaveCliente() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    networkMode: 'always',

    mutationFn: async (cliente: Partial<Cliente> & { id?: string }) => {
      const clean = pickColumns(cliente, CLIENTE_COLUMNS);

      // Offline-first: si no hay red, encolar la operación en IndexedDB
      // para que se sincronice cuando vuelva la conexión.
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline) {
        const { queueOperation } = await import('@/lib/syncQueue');
        if (cliente.id) {
          const record: any = { ...clean, id: cliente.id, empresa_id: empresa?.id };
          await queueOperation('clientes', 'update', record, 'id');
          return { id: cliente.id };
        } else {
          if (!empresa?.id) throw new Error('Sin empresa');
          // Id DETERMINÍSTICO por contenido: reenviar el mismo alta (doble-toque,
          // resync) coincide en id → el upsert no crea un cliente duplicado.
          const newId = await deterministicUuid('cliente', empresa.id, (clean as any).nombre ?? '', (clean as any).telefono ?? '', (clean as any).direccion ?? '');
          const record: any = { ...clean, id: newId, empresa_id: empresa.id, status: (clean as any).status || 'activo' };
          await queueOperation('clientes', 'insert', record, 'id');
          return { id: newId };
        }
      }

      delete (clean as any).id;
      if (cliente.id) {
        const { data, error } = await supabase.from('clientes').update(clean as any).eq('id', cliente.id).select('id').single();
        if (error) { console.error('Error updating cliente:', error); throw error; }
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        (clean as any).empresa_id = empresa.id;
        const { data, error } = await supabase.from('clientes').insert(clean as any).select('id').single();
        if (error) { console.error('Error inserting cliente:', error); throw error; }
        return data;
      }
    },
    onMutate: async (cliente) => {
      if (!cliente.id) return;
      await qc.cancelQueries({ queryKey: ['clientes'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['clientes'] });
      qc.setQueriesData<any[]>({ queryKey: ['clientes'] }, (old) =>
        old?.map(c => c.id === cliente.id ? { ...c, ...cliente } : c)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['clientes-page'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
    },
  });
}


export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Offline-safe: encola el borrado suave (antes fallaba sin conexión).
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { queueOperation } = await import('@/lib/syncQueue');
        await queueOperation('clientes', 'update', { id, status: 'inactivo' }, 'id');
        return;
      }
      const { error } = await supabase.from('clientes').update({ status: 'inactivo' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['clientes'] });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['clientes'] });
      qc.setQueriesData<any[]>({ queryKey: ['clientes'] }, (old) =>
        old?.filter(c => c.id !== id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['clientes-page'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
    },
  });
}

// Catalog hooks with offline-first fallback (IndexedDB) — selectors in
// móvil deben llenarse incluso sin red.
async function readProfilesCache(empresaId: string) {
  try {
    const { offlineDb } = await import('@/lib/offlineDb');
    const cached = await offlineDb.profiles.where('empresa_id').equals(empresaId).toArray();
    return (cached as any[])
      .filter(p => !p.estado || p.estado === 'activo')
      .map(p => ({ id: p.id, nombre: p.nombre }))
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  } catch { return []; }
}

export function useZonas() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['zonas', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const cached = await offlineDb.zonas.where('empresa_id').equals(empresa!.id).toArray();
          return (cached as any[]).filter(z => z.activo !== false).map(z => ({ id: z.id, nombre: z.nombre })) as Zona[];
        } catch { return [] as Zona[]; }
      };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const c = await readCache(); if (c.length) return c;
      }
      try {
        const { data, error } = await supabase.from('zonas').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
        if (error) throw error;
        return (data || []) as Zona[];
      } catch {
        return await readCache();
      }
    },
  });
}

export function useVendedores() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    networkMode: 'always',
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const c = await readProfilesCache(empresa!.id); if (c.length) return c as Vendedor[];
      }
      try {
        const { data, error } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
        if (error) throw error;
        return (data || []) as Vendedor[];
      } catch {
        return (await readProfilesCache(empresa!.id)) as Vendedor[];
      }
    },
  });
}

export function useCobradores() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobradores', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    networkMode: 'always',
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const c = await readProfilesCache(empresa!.id); if (c.length) return c as Cobrador[];
      }
      try {
        const { data, error } = await supabase.from('profiles').select('id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
        if (error) throw error;
        return (data || []) as Cobrador[];
      } catch {
        return (await readProfilesCache(empresa!.id)) as Cobrador[];
      }
    },
  });
}


// Pedido sugerido per client
export function usePedidoSugerido(clienteId?: string) {
  return useQuery({
    queryKey: ['pedido-sugerido', clienteId],
    staleTime: CATALOG_STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_pedido_sugerido')
        .select('id, cliente_id, producto_id, cantidad, productos(id, codigo, nombre, precio_principal)')
        .eq('cliente_id', clienteId!)
        .order('created_at');
      if (error) throw error;
      return data as { id: string; cliente_id: string; producto_id: string; cantidad: number; productos: { id: string; codigo: string; nombre: string; precio_principal: number } }[];
    },
    enabled: !!clienteId,
  });
}

export function useSavePedidoSugerido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, items }: { clienteId: string; items: { producto_id: string; cantidad: number }[] }) => {
      await supabase.from('cliente_pedido_sugerido').delete().eq('cliente_id', clienteId);
      if (items.length > 0) {
        const rows = items.map(i => ({ cliente_id: clienteId, producto_id: i.producto_id, cantidad: i.cantidad }));
        const { error } = await supabase.from('cliente_pedido_sugerido').insert(rows);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pedido-sugerido'] }),
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}
