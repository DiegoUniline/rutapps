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
  precio_unitario: number;
  descuento_pct?: number;
  impuesto_pct?: number;
  subtotal: number;
  impuesto: number;
  total: number;
  producto_snapshot?: any;
  orden?: number;
}

export interface Cotizacion {
  id?: string;
  empresa_id?: string;
  folio?: string;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  tarifa_id?: string | null;
  almacen_id?: string | null;
  fecha: string;
  vigencia_dias: number;
  vence_at?: string;
  subtotal: number;
  descuento: number;
  impuestos: number;
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
  id, folio, fecha, vigencia_dias, vence_at, total, subtotal, impuestos,
  estado, cliente_id, vendedor_id, venta_id, enviada_wa_at, token_publico,
  created_at, notas,
  clientes:cliente_id(nombre, telefono)
`;

const SELECT_FULL = `
  *,
  clientes:cliente_id(nombre, telefono, rfc, direccion),
  cotizacion_lineas(*)
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
        almacen_id: c.almacen_id ?? null,
        fecha: c.fecha,
        vigencia_dias: c.vigencia_dias ?? 15,
        subtotal: c.subtotal ?? 0,
        descuento: c.descuento ?? 0,
        impuestos: c.impuestos ?? 0,
        total: c.total ?? 0,
        moneda: c.moneda ?? 'MXN',
        notas: c.notas ?? null,
        estado: c.estado ?? 'borrador',
      };

      let cotId = c.id;
      if (cotId) {
        const { error } = await supabase.from('cotizaciones').update(payload).eq('id', cotId);
        if (error) throw error;
        // Replace lines
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
          .map((l, i) => ({
            cotizacion_id: cotId,
            empresa_id: empresa.id,
            producto_id: l.producto_id ?? null,
            descripcion: l.descripcion ?? null,
            cantidad: Number(l.cantidad ?? 0),
            precio_unitario: Number(l.precio_unitario ?? 0),
            descuento_pct: Number(l.descuento_pct ?? 0),
            impuesto_pct: Number(l.impuesto_pct ?? 0),
            subtotal: Number(l.subtotal ?? 0),
            impuesto: Number(l.impuesto ?? 0),
            total: Number(l.total ?? 0),
            producto_snapshot: l.producto_snapshot ?? null,
            orden: i,
          }));
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
