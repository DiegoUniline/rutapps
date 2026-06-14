import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { toast } from 'sonner';

export type CotizacionEstado =
  | 'borrador' | 'enviada' | 'aprobada' | 'convertida' | 'vencida' | 'cancelada';

export interface CotizacionLinea {
  id?: string;
  cotizacion_id?: string;
  empresa_id?: string;
  producto_id?: string | null;
  descripcion?: string | null;
  cantidad: number;
  unidad_id?: string | null;
  precio_unitario: number;
  descuento_pct?: number;
  // Impuestos al estilo ventas
  iva_pct?: number;
  ieps_pct?: number;
  iva_monto?: number;
  ieps_monto?: number;
  // Legacy combinado (compatibilidad PDF/RPC stock)
  impuesto_pct?: number;
  impuesto?: number;
  subtotal: number;
  total: number;
  producto_snapshot?: any;
  lista_precio_id?: string | null;
  precio_manual?: boolean;
  orden?: number;
  // joined / display helpers
  productos?: any;
  unidad_label?: string;
  impuestos_label?: string;
  display_unit_price?: number;
}

export interface Cotizacion {
  id?: string;
  empresa_id?: string;
  folio?: string;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  tarifa_id?: string | null;
  lista_precio_id?: string | null;
  almacen_id?: string | null;
  fecha: string;
  vigencia_dias: number;
  vence_at?: string;
  subtotal: number;
  descuento: number;
  impuestos: number;
  iva_total?: number;
  ieps_total?: number;
  descuento_extra?: number;
  descuento_extra_tipo?: 'porcentaje' | 'monto';
  total: number;
  moneda?: string;
  notas?: string | null;
  estado: CotizacionEstado;
  venta_id?: string | null;
  enviada_wa_at?: string | null;
  token_publico?: string;
  cliente_snapshot?: any;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  clientes?: { nombre: string; telefono?: string | null } | null;
  cotizacion_lineas?: CotizacionLinea[];
}

const SELECT_LIST = `
  id, folio, fecha, vigencia_dias, vence_at, total, subtotal, impuestos, iva_total, ieps_total,
  estado, cliente_id, vendedor_id, venta_id, enviada_wa_at, token_publico,
  created_at, notas,
  clientes:cliente_id(nombre, telefono)
`;

const SELECT_FULL = `
  *,
  clientes:cliente_id(nombre, telefono, rfc, direccion),
  cotizacion_lineas(*, productos:producto_id(id, codigo, nombre, precio_principal, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, unidad_venta_id, es_granel, unidad_granel), unidades:unidad_id(nombre, abreviatura))
`;

export function useCotizaciones() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cotizaciones', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const rows = await fetchAllPages((from, to) =>
        supabase.from('cotizaciones').select(SELECT_LIST)
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      return rows as unknown as Cotizacion[];
    },
  });
}

export function useCotizacion(id?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cotizacion', id],
    enabled: !!id && id !== 'nuevo' && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select(SELECT_FULL)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as Cotizacion;
    },
  });
}

export function useSaveCotizacion() {
  const qc = useQueryClient();
  const { empresa, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      cotizacion: Partial<Cotizacion>;
      lineas: Partial<CotizacionLinea>[];
    }) => {
      if (!empresa?.id) throw new Error('Sin empresa');
      const { cotizacion: c, lineas } = input;

      const payload: any = {
        empresa_id: empresa.id,
        cliente_id: c.cliente_id ?? null,
        vendedor_id: c.vendedor_id ?? user?.id ?? null,
        tarifa_id: c.tarifa_id ?? null,
        lista_precio_id: c.lista_precio_id ?? null,
        almacen_id: c.almacen_id ?? null,
        fecha: c.fecha,
        vigencia_dias: c.vigencia_dias ?? 15,
        subtotal: c.subtotal ?? 0,
        descuento: c.descuento ?? 0,
        impuestos: (c.iva_total ?? 0) + (c.ieps_total ?? 0),
        iva_total: c.iva_total ?? 0,
        ieps_total: c.ieps_total ?? 0,
        descuento_extra: c.descuento_extra ?? 0,
        descuento_extra_tipo: c.descuento_extra_tipo ?? 'porcentaje',
        total: c.total ?? 0,
        moneda: c.moneda ?? empresa.moneda ?? 'MXN',
        notas: c.notas ?? null,
        estado: c.estado ?? 'borrador',
      };

      let cotId = c.id;
      if (cotId) {
        const { error } = await supabase.from('cotizaciones').update(payload).eq('id', cotId);
        if (error) throw error;
        await supabase.from('cotizacion_lineas').delete().eq('cotizacion_id', cotId);
      } else {
        payload.created_by = user?.id ?? null;
        const { data, error } = await supabase.from('cotizaciones').insert(payload).select('id').single();
        if (error) throw error;
        cotId = data.id;
      }

      if (lineas.length) {
        const toInsert = lineas
          .filter(l => l.producto_id || l.descripcion)
          .map((l, i) => {
            const iva_pct = Number(l.iva_pct ?? 0);
            const ieps_pct = Number(l.ieps_pct ?? 0);
            const iva_monto = Number(l.iva_monto ?? 0);
            const ieps_monto = Number(l.ieps_monto ?? 0);
            return {
              cotizacion_id: cotId,
              empresa_id: empresa.id,
              producto_id: l.producto_id ?? null,
              descripcion: l.descripcion ?? null,
              cantidad: Number(l.cantidad ?? 0),
              unidad_id: l.unidad_id ?? null,
              precio_unitario: Number(l.precio_unitario ?? 0),
              descuento_pct: Number(l.descuento_pct ?? 0),
              iva_pct, ieps_pct, iva_monto, ieps_monto,
              // legacy combinado (para PDF público y RPC validar_stock)
              impuesto_pct: iva_pct + ieps_pct,
              impuesto: iva_monto + ieps_monto,
              subtotal: Number(l.subtotal ?? 0),
              total: Number(l.total ?? 0),
              producto_snapshot: l.producto_snapshot ?? null,
              lista_precio_id: l.lista_precio_id ?? null,
              precio_manual: !!l.precio_manual,
              orden: i,
            };
          });
        if (toInsert.length) {
          const { error } = await supabase.from('cotizacion_lineas').insert(toInsert);
          if (error) throw error;
        }
      }
      return cotId!;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizacion'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Error al guardar cotización'),
  });
}

export function useDeleteCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
    onError: (e: any) => toast.error(e?.message || 'Error al eliminar'),
  });
}

export function useSetCotizacionEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado, extra }: { id: string; estado: CotizacionEstado; extra?: Record<string, any> }) => {
      const { error } = await supabase.from('cotizaciones')
        .update({ estado, ...(extra || {}) }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizacion'] });
    },
  });
}

export interface StockValidationRow {
  producto_id: string;
  descripcion: string;
  cantidad_solicitada: number;
  stock_disponible: number;
  faltante: number;
  ok: boolean;
}

export async function validarStockCotizacion(cotizacionId: string, almacenId: string) {
  const { data, error } = await supabase.rpc('validar_stock_cotizacion', {
    p_cotizacion_id: cotizacionId,
    p_almacen_id: almacenId,
  });
  if (error) throw error;
  return (data ?? []) as StockValidationRow[];
}
