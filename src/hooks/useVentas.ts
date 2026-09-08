import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { pickColumns, VENTA_COLUMNS, VENTA_LINEA_COLUMNS } from '@/lib/allowlist';
import { createVentaLoadError } from '@/lib/ventaLoadGuard';
import type { Venta, VentaLinea } from '@/types';

/**
 * IDs de ventas de la empresa que traen promoción.
 * Señales (unión): registro en `promocion_aplicada` (promo persistida) o línea
 * regalada (precio 0 con cantidad > 0), que es como quedan las promos cuando el
 * descuento se aplica neto en la línea y no deja registro aparte.
 */
async function fetchVentaIdsConPromo(empresaId: string): Promise<string[]> {
  const [aplicadas, gratis] = await Promise.all([
    supabase.from('promocion_aplicada').select('venta_id, ventas!inner(empresa_id)').eq('ventas.empresa_id', empresaId).limit(5000),
    supabase.from('venta_lineas').select('venta_id').eq('empresa_id', empresaId).eq('precio_unitario', 0).gt('cantidad', 0).limit(5000),
  ]);
  const ids = new Set<string>();
  for (const r of (aplicadas.data ?? []) as any[]) if (r.venta_id) ids.add(r.venta_id);
  for (const r of (gratis.data ?? []) as any[]) if (r.venta_id) ids.add(r.venta_id);
  return [...ids];
}

/** Paginated ventas for list views. When fetchAll=true, returns all matching rows (used for grouping). */
export function useVentasPaginated(search?: string, statusFilter?: string, tipoFilter?: string, page = 1, pageSize = 80, condicionFilter?: string, vendedorFilter?: string, dateFrom?: string, dateTo?: string, fetchAll = false, promoFilter?: 'si' | 'no', clienteFilter?: string, enabled = true) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { seeAll, profileId } = useDataVisibility('ventas');
  const filterOwn = !seeAll && !!profileId;

  // Realtime de ventas centralizado en useProductosRealtime (AppLayout) -> data-ventas-{empresa}.
  // Se eliminó el canal duplicado 'ventas-realtime' para reducir egress de Realtime.

  return useQuery({
    queryKey: ['ventas', empresa?.id, search, statusFilter, tipoFilter, page, pageSize, filterOwn ? profileId : 'all', condicionFilter, vendedorFilter, clienteFilter, dateFrom, dateTo, fetchAll, promoFilter ?? 'todas'],
    enabled: !!empresa?.id && enabled,
    queryFn: async () => {
      const SELECT = 'id, folio, fecha, created_at, total, subtotal, iva_total, ieps_total, descuento_total, descuento_extra, descuento_extra_tipo, saldo_pendiente, status, tipo, condicion_pago, politica_cobro, cerrado_at, cerrado_por, total_efectivo, cerrado_snapshot, vendedor_id, cliente_id, almacen_id, es_saldo_inicial, origen, clientes(nombre, rfc, telefono, direccion, colonia, requiere_factura), vendedores:profiles!vendedor_id(nombre, telefono), almacenes(nombre), entregas(status, entrega_lineas(cantidad_pedida, cantidad_entregada)), cobro_aplicaciones(monto_aplicado, cobros!inner(status)), venta_lineas(subtotal, descuento_pct, precio_unitario, cantidad, iva_monto, ieps_monto, total), promocion_aplicada(descuento_aplicado)';

      // Filtro de promoción resuelto en servidor sobre TODA la empresa (no solo la página).
      let promoIds: string[] | null = null;
      if (promoFilter) promoIds = await fetchVentaIdsConPromo(empresa!.id);


      // Resolve search-derived id filters once (shared by both branches)
      let searchOr: string | null = null;
      if (search) {
        const s = search.replace(/[%_,()]/g, '\\$&').replace(/'/g, "''");
        const [clientesRes, vendedoresRes, almacenesRes] = await Promise.all([
          supabase.from('clientes').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
          supabase.from('profiles').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
          supabase.from('almacenes').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
        ]);
        const clienteIds = (clientesRes.data ?? []).map((r: any) => r.id);
        const vendedorIds = (vendedoresRes.data ?? []).map((r: any) => r.id);
        const almacenIds = (almacenesRes.data ?? []).map((r: any) => r.id);
        const orParts: string[] = [`folio.ilike.%${s}%`];
        if (clienteIds.length) orParts.push(`cliente_id.in.(${clienteIds.join(',')})`);
        if (vendedorIds.length) orParts.push(`vendedor_id.in.(${vendedorIds.join(',')})`);
        if (almacenIds.length) orParts.push(`almacen_id.in.(${almacenIds.join(',')})`);
        searchOr = orParts.join(',');
      }

      const applyFilters = (q: any) => {
        q = q.eq('empresa_id', empresa!.id).eq('es_saldo_inicial', false).order('created_at', { ascending: false });
        if (filterOwn) q = q.eq('vendedor_id', profileId!);
        if (searchOr) q = q.or(searchOr);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',');
          if (arr.length > 1) q = q.in('status', arr as any);
          else q = q.eq('status', statusFilter as Venta['status']);
        }
        if (tipoFilter && tipoFilter !== 'todos') {
          const arr = tipoFilter.split(',');
          if (arr.length > 1) q = q.in('tipo', arr as any);
          else q = q.eq('tipo', tipoFilter as Venta['tipo']);
        }
        if (condicionFilter && condicionFilter !== 'todos') {
          const arr = condicionFilter.split(',');
          if (arr.length > 1) q = q.in('condicion_pago', arr as any);
          else q = q.eq('condicion_pago', condicionFilter as any);
        }
        if (vendedorFilter && vendedorFilter !== 'todos') {
          const arr = vendedorFilter.split(',');
          if (arr.length > 1) q = q.in('vendedor_id', arr as any);
          else q = q.eq('vendedor_id', vendedorFilter);
        }
        if (clienteFilter && clienteFilter !== 'todos') {
          const arr = clienteFilter.split(',');
          if (arr.length > 1) q = q.in('cliente_id', arr as any);
          else q = q.eq('cliente_id', clienteFilter);
        }
        if (dateFrom) q = q.gte('fecha', dateFrom);
        if (dateTo) q = q.lte('fecha', dateTo);
        if (promoIds) {
          if (promoFilter === 'si') {
            // Sin coincidencias: forzamos resultado vacío con un id imposible.
            q = q.in('id', promoIds.length ? promoIds : ['00000000-0000-0000-0000-000000000000']);
          } else if (promoIds.length) {
            q = q.not('id', 'in', `(${promoIds.join(',')})`);
          }
        }
        return q;
      };


      if (fetchAll) {
        const rows = await fetchAllPages((from, to) => applyFilters(supabase.from('ventas').select(SELECT).range(from, to)));
        return { rows: (rows ?? []) as unknown as Venta[], total: rows?.length ?? 0 };
      }

      let q = supabase.from('ventas').select(SELECT, { count: 'exact' }).range((page - 1) * pageSize, page * pageSize - 1);
      q = applyFilters(q);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Venta[], total: count ?? 0 };
    },
  });
}

/**
 * Resumen (totales) de ventas sobre TODO el filtro — no solo la página visible.
 * Trae todas las filas que cumplen los filtros con un SELECT ligero (solo los
 * campos que necesitan los totales) y las devuelve para que la página calcule
 * el resumen con la misma lógica que las filas (totalEfectivoVenta, saldoReal,
 * computeResumenFromLineas). La paginación es solo visual; los totales son del
 * conjunto completo.
 *
 * OJO: la lógica de filtros debe mantenerse en sync con `useVentasPaginated`.
 */
export function useVentasResumen(search?: string, statusFilter?: string, tipoFilter?: string, condicionFilter?: string, vendedorFilter?: string, dateFrom?: string, dateTo?: string, promoFilter?: 'si' | 'no', enabled = true, clienteFilter?: string) {
  const { empresa } = useAuth();
  const { seeAll, profileId } = useDataVisibility('ventas');
  const filterOwn = !seeAll && !!profileId;

  return useQuery({
    queryKey: ['ventas-resumen', empresa?.id, search, statusFilter, tipoFilter, filterOwn ? profileId : 'all', condicionFilter, vendedorFilter, clienteFilter, dateFrom, dateTo, promoFilter ?? 'todas'],
    enabled: !!empresa?.id && enabled,
    queryFn: async () => {
      // SELECT ligero: solo lo que consumen los totales (sin joins de cliente/vendedor/almacén/entregas).
      const SELECT = 'id, total, iva_total, ieps_total, descuento_total, status, total_efectivo, cerrado_at, cerrado_snapshot, cliente_id, cobro_aplicaciones(monto_aplicado, cobros!inner(status)), venta_lineas(subtotal, descuento_pct, precio_unitario, cantidad, iva_monto, ieps_monto, total), promocion_aplicada(descuento_aplicado)';

      let promoIds: string[] | null = null;
      if (promoFilter) promoIds = await fetchVentaIdsConPromo(empresa!.id);

      let searchOr: string | null = null;
      if (search) {
        const s = search.replace(/[%_,()]/g, '\\$&').replace(/'/g, "''");
        const [clientesRes, vendedoresRes, almacenesRes] = await Promise.all([
          supabase.from('clientes').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
          supabase.from('profiles').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
          supabase.from('almacenes').select('id').eq('empresa_id', empresa!.id).ilike('nombre', `%${s}%`).limit(500),
        ]);
        const clienteIds = (clientesRes.data ?? []).map((r: any) => r.id);
        const vendedorIds = (vendedoresRes.data ?? []).map((r: any) => r.id);
        const almacenIds = (almacenesRes.data ?? []).map((r: any) => r.id);
        const orParts: string[] = [`folio.ilike.%${s}%`];
        if (clienteIds.length) orParts.push(`cliente_id.in.(${clienteIds.join(',')})`);
        if (vendedorIds.length) orParts.push(`vendedor_id.in.(${vendedorIds.join(',')})`);
        if (almacenIds.length) orParts.push(`almacen_id.in.(${almacenIds.join(',')})`);
        searchOr = orParts.join(',');
      }

      const applyFilters = (q: any) => {
        q = q.eq('empresa_id', empresa!.id).eq('es_saldo_inicial', false);
        if (filterOwn) q = q.eq('vendedor_id', profileId!);
        if (searchOr) q = q.or(searchOr);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',');
          if (arr.length > 1) q = q.in('status', arr as any); else q = q.eq('status', statusFilter as any);
        }
        if (tipoFilter && tipoFilter !== 'todos') {
          const arr = tipoFilter.split(',');
          if (arr.length > 1) q = q.in('tipo', arr as any); else q = q.eq('tipo', tipoFilter as any);
        }
        if (condicionFilter && condicionFilter !== 'todos') {
          const arr = condicionFilter.split(',');
          if (arr.length > 1) q = q.in('condicion_pago', arr as any); else q = q.eq('condicion_pago', condicionFilter as any);
        }
        if (vendedorFilter && vendedorFilter !== 'todos') {
          const arr = vendedorFilter.split(',');
          if (arr.length > 1) q = q.in('vendedor_id', arr as any); else q = q.eq('vendedor_id', vendedorFilter);
        }
        if (clienteFilter && clienteFilter !== 'todos') {
          const arr = clienteFilter.split(',');
          if (arr.length > 1) q = q.in('cliente_id', arr as any); else q = q.eq('cliente_id', clienteFilter);
        }
        if (dateFrom) q = q.gte('fecha', dateFrom);
        if (dateTo) q = q.lte('fecha', dateTo);
        if (promoIds) {
          if (promoFilter === 'si') q = q.in('id', promoIds.length ? promoIds : ['00000000-0000-0000-0000-000000000000']);
          else if (promoIds.length) q = q.not('id', 'in', `(${promoIds.join(',')})`);
        }
        return q;
      };

      const rows = await fetchAllPages((from, to) => applyFilters(supabase.from('ventas').select(SELECT).range(from, to)));
      return (rows ?? []) as unknown as Venta[];
    },
  });
}

/**
 * Resumen (totales) de líneas de venta sobre TODO el filtro (vista Productos).
 * Devuelve la suma de cantidad y de importe de línea del conjunto completo.
 * OJO: mantener los filtros en sync con `useVentaLineasPaginated`.
 */
export function useVentaLineasResumen(search?: string, statusFilter?: string, tipoFilter?: string, condicionFilter?: string, vendedorFilter?: string, dateFrom?: string, dateTo?: string, enabled = true, clienteFilter?: string, promoFilter?: 'si' | 'no') {
  const { empresa } = useAuth();
  const { seeAll, profileId } = useDataVisibility('ventas');
  const filterOwn = !seeAll && !!profileId;

  return useQuery({
    queryKey: ['venta-lineas-resumen', empresa?.id, search, statusFilter, tipoFilter, filterOwn ? profileId : 'all', condicionFilter, vendedorFilter, clienteFilter, dateFrom, dateTo, promoFilter ?? 'todas'],
    enabled: !!empresa?.id && enabled,
    queryFn: async () => {
      const SELECT = 'cantidad, total, ventas!inner(empresa_id, status, tipo, condicion_pago, vendedor_id, fecha, folio)';

      let promoIds: string[] | null = null;
      if (promoFilter) promoIds = await fetchVentaIdsConPromo(empresa!.id);

      let searchOr: string | null = null;
      let searchEmpty = false;
      if (search) {
        const s = search.replace(/[%_,()]/g, '\\$&').replace(/'/g, "''");
        const [productosRes, ventasRes] = await Promise.all([
          supabase.from('productos').select('id').eq('empresa_id', empresa!.id).or(`nombre.ilike.%${s}%,codigo.ilike.%${s}%`).limit(500),
          supabase.from('ventas').select('id').eq('empresa_id', empresa!.id).ilike('folio', `%${s}%`).limit(500),
        ]);
        const productoIds = (productosRes.data ?? []).map((r: any) => r.id);
        const ventaIds = (ventasRes.data ?? []).map((r: any) => r.id);
        const orParts: string[] = [];
        if (productoIds.length) orParts.push(`producto_id.in.(${productoIds.join(',')})`);
        if (ventaIds.length) orParts.push(`venta_id.in.(${ventaIds.join(',')})`);
        if (orParts.length === 0) searchEmpty = true; else searchOr = orParts.join(',');
      }

      const applyFilters = (q: any) => {
        q = q.eq('ventas.empresa_id', empresa!.id);
        if (filterOwn) q = q.eq('ventas.vendedor_id', profileId!);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.status', arr as any); else q = q.eq('ventas.status', statusFilter as any);
        }
        if (tipoFilter && tipoFilter !== 'todos') {
          const arr = tipoFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.tipo', arr as any); else q = q.eq('ventas.tipo', tipoFilter as any);
        }
        if (condicionFilter && condicionFilter !== 'todos') {
          const arr = condicionFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.condicion_pago', arr as any); else q = q.eq('ventas.condicion_pago', condicionFilter as any);
        }
        if (vendedorFilter && vendedorFilter !== 'todos') {
          const arr = vendedorFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.vendedor_id', arr as any); else q = q.eq('ventas.vendedor_id', vendedorFilter);
        }
        if (clienteFilter && clienteFilter !== 'todos') {
          const arr = clienteFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.cliente_id', arr as any); else q = q.eq('ventas.cliente_id', clienteFilter);
        }
        if (dateFrom) q = q.gte('ventas.fecha', dateFrom);
        if (dateTo) q = q.lte('ventas.fecha', dateTo);
        if (promoIds) {
          if (promoFilter === 'si') q = q.in('venta_id', promoIds.length ? promoIds : ['00000000-0000-0000-0000-000000000000']);
          else if (promoIds.length) q = q.not('venta_id', 'in', `(${promoIds.join(',')})`);
        }
        if (searchEmpty) q = q.eq('venta_id', '00000000-0000-0000-0000-000000000000');
        else if (searchOr) q = q.or(searchOr);
        return q;
      };

      const data = await fetchAllPages<any>((from, to) => applyFilters(supabase.from('venta_lineas').select(SELECT).range(from, to)));
      let cantidad = 0, total = 0;
      for (const r of (data ?? []) as any[]) { cantidad += Number(r.cantidad) || 0; total += Number(r.total) || 0; }
      return { count: (data ?? []).length, cantidad, total };
    },
  });
}

/** Paginated product lines (venta_lineas) with header data for "Products" view. When fetchAll=true, returns all matching rows (used for grouping). */
export function useVentaLineasPaginated(
  search?: string, statusFilter?: string, tipoFilter?: string,
  page = 1, pageSize = 80, condicionFilter?: string,
  vendedorFilter?: string, dateFrom?: string, dateTo?: string,
  fetchAll = false, clienteFilter?: string, promoFilter?: 'si' | 'no',
  enabled = true,
) {
  const { empresa } = useAuth();
  const { seeAll, profileId } = useDataVisibility('ventas');
  const filterOwn = !seeAll && !!profileId;

  return useQuery({
    queryKey: ['venta-lineas', empresa?.id, search, statusFilter, tipoFilter, page, pageSize, filterOwn ? profileId : 'all', condicionFilter, vendedorFilter, clienteFilter, dateFrom, dateTo, fetchAll, promoFilter ?? 'todas'],
    enabled: !!empresa?.id && enabled,
    queryFn: async () => {
      const SELECT = 'id, venta_id, producto_id, cantidad, precio_unitario, total, productos(codigo, nombre), ventas!inner(id, folio, fecha, created_at, status, tipo, condicion_pago, vendedor_id, cliente_id, empresa_id, tarifa_id, clientes(id, nombre), vendedores:profiles!vendedor_id(nombre), tarifas(nombre))';

      let promoIds: string[] | null = null;
      if (promoFilter) promoIds = await fetchVentaIdsConPromo(empresa!.id);

      let searchOr: string | null = null;
      let searchEmpty = false;
      if (search) {
        const s = search.replace(/[%_,()]/g, '\\$&').replace(/'/g, "''");
        const [productosRes, ventasRes] = await Promise.all([
          supabase.from('productos').select('id').eq('empresa_id', empresa!.id).or(`nombre.ilike.%${s}%,codigo.ilike.%${s}%`).limit(500),
          supabase.from('ventas').select('id').eq('empresa_id', empresa!.id).ilike('folio', `%${s}%`).limit(500),
        ]);
        const productoIds = (productosRes.data ?? []).map((r: any) => r.id);
        const ventaIds = (ventasRes.data ?? []).map((r: any) => r.id);
        const orParts: string[] = [];
        if (productoIds.length) orParts.push(`producto_id.in.(${productoIds.join(',')})`);
        if (ventaIds.length) orParts.push(`venta_id.in.(${ventaIds.join(',')})`);
        if (orParts.length === 0) searchEmpty = true;
        else searchOr = orParts.join(',');
      }

      const applyFilters = (q: any) => {
        q = q.eq('ventas.empresa_id', empresa!.id).order('created_at', { ascending: false, referencedTable: undefined });
        if (filterOwn) q = q.eq('ventas.vendedor_id', profileId!);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.status', arr as any);
          else q = q.eq('ventas.status', statusFilter as any);
        }
        if (tipoFilter && tipoFilter !== 'todos') {
          const arr = tipoFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.tipo', arr as any);
          else q = q.eq('ventas.tipo', tipoFilter as any);
        }
        if (condicionFilter && condicionFilter !== 'todos') {
          const arr = condicionFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.condicion_pago', arr as any);
          else q = q.eq('ventas.condicion_pago', condicionFilter as any);
        }
        if (vendedorFilter && vendedorFilter !== 'todos') {
          const arr = vendedorFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.vendedor_id', arr as any);
          else q = q.eq('ventas.vendedor_id', vendedorFilter);
        }
        if (clienteFilter && clienteFilter !== 'todos') {
          const arr = clienteFilter.split(',');
          if (arr.length > 1) q = q.in('ventas.cliente_id', arr as any);
          else q = q.eq('ventas.cliente_id', clienteFilter);
        }
        if (dateFrom) q = q.gte('ventas.fecha', dateFrom);
        if (dateTo) q = q.lte('ventas.fecha', dateTo);
        if (promoIds) {
          if (promoFilter === 'si') q = q.in('venta_id', promoIds.length ? promoIds : ['00000000-0000-0000-0000-000000000000']);
          else if (promoIds.length) q = q.not('venta_id', 'in', `(${promoIds.join(',')})`);
        }
        if (searchEmpty) q = q.eq('venta_id', '00000000-0000-0000-0000-000000000000');
        else if (searchOr) q = q.or(searchOr);
        return q;
      };

      const mapRow = (row: any) => ({
        linea_id: row.id,
        venta_id: row.venta_id,
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        precio_unitario: row.precio_unitario,
        linea_total: row.total,
        producto_codigo: row.productos?.codigo ?? '',
        producto_nombre: row.productos?.nombre ?? '',
        folio: row.ventas?.folio,
        fecha: row.ventas?.fecha,
        created_at: row.ventas?.created_at,
        status: row.ventas?.status,
        tipo: row.ventas?.tipo,
        condicion_pago: row.ventas?.condicion_pago,
        cliente_id: row.ventas?.cliente_id,
        cliente_nombre: row.ventas?.clientes?.nombre,
        vendedor_nombre: row.ventas?.vendedores?.nombre,
        tarifa_nombre: row.ventas?.tarifas?.nombre ?? null,
      });

      if (fetchAll) {
        const data = await fetchAllPages<any>((from, to) => applyFilters(supabase.from('venta_lineas').select(SELECT).range(from, to)));
        const rows = (data ?? []).map(mapRow);
        return { rows, total: rows.length };
      }

      let q = supabase.from('venta_lineas').select(SELECT, { count: 'exact' }).range((page - 1) * pageSize, page * pageSize - 1);
      q = applyFilters(q);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []).map(mapRow);
      return { rows, total: count ?? 0 };
    },
  });
}

/** All ventas (for lookups) */
export function useVentas(search?: string, statusFilter?: string, tipoFilter?: string) {
  const qc = useQueryClient();
  const { empresa } = useAuth();

  // Realtime ya está cubierto por el canal 'ventas-realtime' de useVentasPaginated.
  // No duplicamos suscripción aquí para evitar doble invalidación.

  return useQuery({
    queryKey: ['ventas', empresa?.id, search, statusFilter, tipoFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      return fetchAllPages((from, to) => {
        let q = supabase
          .from('ventas')
          .select('id, folio, fecha, total, subtotal, iva_total, descuento_total, saldo_pendiente, status, tipo, condicion_pago, vendedor_id, cliente_id, clientes(nombre), vendedores:profiles!vendedor_id(nombre)')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (search) q = q.or(`folio.ilike.%${search}%`);
        if (statusFilter && statusFilter !== 'todos') {
          const arr = statusFilter.split(',').filter(Boolean);
          if (arr.length > 1) q = q.in('status', arr as any);
          else q = q.eq('status', statusFilter as Venta['status']);
        }
        if (tipoFilter && tipoFilter !== 'todos') {
          const arr = tipoFilter.split(',').filter(Boolean);
          if (arr.length > 1) q = q.in('tipo', arr as any);
          else q = q.eq('tipo', tipoFilter as Venta['tipo']);
        }
        return q;
      }) as Promise<Venta[]>;
    },
  });
}

export function useVenta(id?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['venta', empresa?.id, id],
    networkMode: 'always',
    retry: (failureCount) => failureCount < 2,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3_000),
    queryFn: async () => {
      let serverError: unknown = null;
      let serverRespondedWithoutVenta = false;
      // Intentar siempre el servidor. `navigator.onLine` puede reportar `false`
      // aunque la PWA sí tenga salida a Internet (Android, redes corporativas o
      // cambios Wi-Fi/datos). La petición real es la única fuente confiable; si
      // falla, entonces sí usamos IndexedDB como respaldo.
      {
        try {
          // Cargar el encabezado primero evita que una relación secundaria o una
          // respuesta anidada cortada convierta toda la venta en un error opaco.
          const { data: venta, error: ventaError } = await supabase
            .from('ventas')
            .select('*')
            .eq('id', id!)
            .eq('empresa_id', empresa!.id)
            .maybeSingle();
          if (ventaError) throw new Error(`Encabezado de la venta: ${ventaError.message}`);
          if (!venta) {
            serverRespondedWithoutVenta = true;
          } else {
            const optionalOne = async (
              table: 'clientes' | 'profiles' | 'tarifas' | 'almacenes',
              recordId: string | null | undefined,
              columns: string,
              label: string,
            ) => {
              if (!recordId) return null;
              const { data, error } = await supabase.from(table).select(columns).eq('id', recordId).maybeSingle();
              if (error) throw new Error(`${label}: ${error.message}`);
              return data;
            };

            const [lineasResult, cliente, vendedor, tarifa, almacen] = await Promise.all([
              supabase.from('venta_lineas').select('*').eq('venta_id', venta.id).order('created_at', { ascending: true }),
              optionalOne('clientes', venta.cliente_id, 'nombre, tarifa_id, lista_precio_id', 'Cliente'),
              optionalOne('profiles', venta.vendedor_id, 'nombre, telefono', 'Vendedor'),
              optionalOne('tarifas', venta.tarifa_id, 'nombre', 'Tarifa'),
              optionalOne('almacenes', venta.almacen_id, 'nombre', 'Almacén'),
            ]);
            if (lineasResult.error) throw new Error(`Partidas de la venta: ${lineasResult.error.message}`);

            const lineas = lineasResult.data ?? [];
            const productoIds = [...new Set(lineas.map(linea => linea.producto_id).filter(Boolean))] as string[];
            const loteIds = [...new Set(lineas.map(linea => linea.lote_id).filter(Boolean))] as string[];
            const unidadLineaIds = [...new Set(lineas.map(linea => linea.unidad_id).filter(Boolean))] as string[];

            const [productosResult, lotesResult] = await Promise.all([
              productoIds.length
                ? supabase.from('productos').select('id, codigo, nombre, precio_principal, tiene_iva, tiene_ieps, iva_pct, ieps_pct, unidad_venta_id, es_granel, unidad_granel').in('id', productoIds)
                : Promise.resolve({ data: [], error: null }),
              loteIds.length
                ? supabase.from('lotes').select('id, codigo').in('id', loteIds)
                : Promise.resolve({ data: [], error: null }),
            ]);
            if (productosResult.error) throw new Error(`Productos de la venta: ${productosResult.error.message}`);
            if (lotesResult.error) throw new Error(`Lotes de la venta: ${lotesResult.error.message}`);

            const productos = productosResult.data ?? [];
            const unidadProductoIds = productos.map(producto => producto.unidad_venta_id).filter(Boolean) as string[];
            const unidadIds = [...new Set([...unidadLineaIds, ...unidadProductoIds])];
            const unidadesResult = unidadIds.length
              ? await supabase.from('unidades').select('id, nombre, abreviatura').in('id', unidadIds)
              : { data: [], error: null };
            if (unidadesResult.error) throw new Error(`Unidades de la venta: ${unidadesResult.error.message}`);

            const productosPorId = new Map((productos ?? []).map(producto => [producto.id, producto]));
            const lotesPorId = new Map((lotesResult.data ?? []).map(lote => [lote.id, lote]));
            const unidadesPorId = new Map((unidadesResult.data ?? []).map(unidad => [unidad.id, unidad]));
            const ventaLineas = lineas.map(linea => {
              const producto = linea.producto_id ? productosPorId.get(linea.producto_id) : null;
              return {
                ...linea,
                productos: producto
                  ? { ...producto, unidades_venta: producto.unidad_venta_id ? unidadesPorId.get(producto.unidad_venta_id) ?? null : null }
                  : null,
                lotes: linea.lote_id ? lotesPorId.get(linea.lote_id) ?? null : null,
                unidades: linea.unidad_id ? unidadesPorId.get(linea.unidad_id) ?? null : null,
              };
            });

            return {
              ...venta,
              clientes: cliente,
              vendedores: vendedor,
              tarifas: tarifa,
              almacenes: almacen,
              venta_lineas: ventaLineas,
            } as unknown as Venta;
          }
        } catch (err) {
          // Network/fetch error: fall through to local cache
          console.warn('[useVenta] server fetch failed, trying offline cache:', err);
          serverError = err;
        }
      }

      // Fallback: try local IndexedDB (offline, or sale not yet synced)
      try {
        const { getOfflineTable } = await import('@/lib/offlineDb');
        const table = getOfflineTable('ventas');
        if (table) {
          const local = await table.get(id!);
          if (local) {
            // Enrich with local venta_lineas if available
            const lineasTable = getOfflineTable('venta_lineas');
            let venta_lineas: unknown[] = [];
            if (lineasTable) {
              const allLineas = await lineasTable.toArray();
              venta_lineas = allLineas.filter((l: Record<string, unknown>) => l.venta_id === id);
              const prodTable = getOfflineTable('productos');
              if (prodTable) {
                const prods = await prodTable.toArray();
                const prodMap = new Map(prods.map((p: Record<string, unknown>) => [p.id, p]));
                venta_lineas = venta_lineas.map((l: unknown) => {
                  const line = l as Record<string, unknown>;
                  return {
                    ...line,
                    productos: prodMap.get(line.producto_id as string) || { id: line.producto_id, codigo: '', nombre: (line.descripcion as string) ?? '—' },
                  };
                });
              }
            }
            let clientes: { nombre: string } = { nombre: 'Sin cliente' };
            if (local.cliente_id) {
              const cliTable = getOfflineTable('clientes');
              if (cliTable) {
                const cli = await cliTable.get(local.cliente_id);
                if (cli) clientes = { nombre: cli.nombre };
              }
            }
            return { ...local, clientes, vendedores: null, tarifas: null, almacenes: null, venta_lineas } as unknown as Venta;
          }
        }
      } catch { /* IndexedDB not available */ }

      // Nunca convertir un error/no-encontrado en una venta vacía. El formulario
      // usa este error para mostrar Reintentar y evita que el usuario guarde por
      // accidente sobre una pantalla que aparenta ser una venta nueva.
      throw createVentaLoadError(serverError, serverRespondedWithoutVenta);
    },
    enabled: !!id && !!empresa?.id,
  });
}

export function useSaveVenta() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (venta: Partial<Venta> & { id?: string }) => {
      const clean = pickColumns(venta, VENTA_COLUMNS);
      delete (clean as any).id;
      if (venta.id) {
        const { data, error } = await supabase.from('ventas').update(clean as any).eq('id', venta.id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        (clean as any).empresa_id = empresa.id;
        const { data, error } = await supabase.from('ventas').insert(clean as any).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useSaveVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linea: Partial<VentaLinea> & { id?: string }) => {
      const clean = pickColumns(linea, VENTA_LINEA_COLUMNS);
      delete (clean as any).id;
      if (linea.id) {
        const { data, error } = await supabase.from('venta_lineas').update(clean as any).eq('id', linea.id).select('id').single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('venta_lineas').insert(clean as any).select('id').single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useDeleteVentaLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('venta_lineas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venta'] }),
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useDeleteVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Validate no cobros applied before deleting
      const { count, error: checkErr } = await supabase
        .from('cobro_aplicaciones')
        .select('id', { count: 'exact', head: true })
        .eq('venta_id', id);
      if (checkErr) throw checkErr;
      if (count && count > 0) throw new Error('No puedes eliminar una venta con pagos aplicados. Cancélala primero.');

      // Block deletion if a CFDI was already issued for this venta
      const { count: cfdiCount } = await (supabase as any)
        .from('cfdi_lineas')
        .select('id', { count: 'exact', head: true })
        .eq('venta_id', id);
      if (cfdiCount && cfdiCount > 0) {
        throw new Error('No puedes eliminar una venta facturada. Cancela primero el CFDI.');
      }

      // Clean dependent rows so the FK constraints don't block the delete
      const { data: ents } = await (supabase as any).from('entregas').select('id').eq('pedido_id', id);
      const eIds = ((ents ?? []) as any[]).map((e: any) => e.id);
      if (eIds.length) {
        await supabase.from('entrega_lineas').delete().in('entrega_id', eIds);
        await supabase.from('entregas').delete().in('id', eIds);
      }
      await supabase.from('cobro_aplicaciones').delete().eq('venta_id', id);
      await supabase.from('venta_comisiones').delete().eq('venta_id', id);
      await supabase.from('venta_historial').delete().eq('venta_id', id);
      await supabase.from('promocion_aplicada').delete().eq('venta_id', id);
      await supabase.from('venta_lineas').delete().eq('venta_id', id);

      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['ventas'] });
      const prev = qc.getQueriesData<any>({ queryKey: ['ventas'] });
      qc.setQueriesData<any>({ queryKey: ['ventas'] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.filter((v: any) => v.id !== id);
        if (Array.isArray(old?.rows)) return { ...old, rows: old.rows.filter((v: any) => v.id !== id), total: Math.max(0, (old.total ?? old.rows.length) - 1) };
        return old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['cobros-desktop'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['saldos'] });
      qc.invalidateQueries({ queryKey: ['stock_almacen'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
  });
}
