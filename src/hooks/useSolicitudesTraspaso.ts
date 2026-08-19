import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fetchAllPages } from '@/lib/supabasePaginate';

export type StatusSolicitudTraspaso =
  | 'borrador' | 'solicitada' | 'aprobada' | 'parcialmente_surtida'
  | 'surtida' | 'rechazada' | 'cancelada';

export const SOLICITUD_STATUS_LABELS: Record<StatusSolicitudTraspaso, string> = {
  borrador: 'Borrador',
  solicitada: 'Solicitada',
  aprobada: 'Aprobada',
  parcialmente_surtida: 'Parcialmente surtida',
  surtida: 'Surtida',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

export interface SolicitudTraspaso {
  id: string;
  empresa_id: string;
  folio: string | null;
  fecha: string;
  status: StatusSolicitudTraspaso;
  almacen_origen_id: string | null;
  almacen_destino_id: string | null;
  solicitante_user_id: string | null;
  solicitante_profile_id: string | null;
  observaciones: string | null;
  enviado_at: string | null;
  aprobado_at: string | null;
  rechazado_at: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  updated_at: string;
  almacen_origen?: { nombre: string } | null;
  almacen_destino?: { nombre: string } | null;
  solicitante?: { nombre: string | null } | null;
}

export interface SolicitudTraspasoLinea {
  id: string;
  solicitud_id: string;
  producto_id: string;
  presentacion_id: string | null;
  stock_actual_snapshot: number;
  stock_minimo_snapshot: number;
  stock_maximo_snapshot: number;
  cantidad_sugerida: number;
  cantidad_solicitada: number;
  cantidad_aprobada: number;
  cantidad_surtida: number;
  notas: string | null;
  productos?: { codigo: string; nombre: string } | null;
}

const from = (t: string) => (supabase.from as any)(t);

const HEADER_SELECT =
  'id, empresa_id, folio, fecha, status, almacen_origen_id, almacen_destino_id, solicitante_user_id, solicitante_profile_id, observaciones, enviado_at, aprobado_at, rechazado_at, motivo_rechazo, created_at, updated_at,' +
  ' almacen_origen:almacenes!solicitudes_traspaso_almacen_origen_id_fkey(nombre),' +
  ' almacen_destino:almacenes!solicitudes_traspaso_almacen_destino_id_fkey(nombre),' +
  ' solicitante:profiles!solicitudes_traspaso_solicitante_profile_id_fkey(nombre)';

export function useSolicitudesTraspaso(opts?: { soloMias?: boolean }) {
  const { empresa, user } = useAuth();
  const empresaId = empresa?.id;
  const soloMias = !!opts?.soloMias;

  return useQuery({
    queryKey: ['solicitudes_traspaso', empresaId, soloMias ? user?.id : 'todas'],
    enabled: hasEmpresa(empresaId),
    queryFn: async (): Promise<SolicitudTraspaso[]> => {
      const eid = requireEmpresa(empresaId, 'useSolicitudesTraspaso');
      return fetchAllPages<SolicitudTraspaso>((desde, hasta) => {
        let q = from('solicitudes_traspaso')
          .select(HEADER_SELECT)
          .eq('empresa_id', eid);
        if (soloMias && user?.id) q = q.eq('solicitante_user_id', user.id);
        return q.order('created_at', { ascending: false }).range(desde, hasta);
      });
    },
  });
}

export function useSolicitudTraspaso(id?: string) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;

  return useQuery({
    queryKey: ['solicitud_traspaso', empresaId, id],
    enabled: hasEmpresa(empresaId) && !!id && id !== 'nueva',
    queryFn: async (): Promise<SolicitudTraspaso | null> => {
      const eid = requireEmpresa(empresaId, 'useSolicitudTraspaso');
      const { data, error } = await from('solicitudes_traspaso')
        .select(HEADER_SELECT)
        .eq('empresa_id', eid)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as SolicitudTraspaso | null;
    },
  });
}

export function useSolicitudTraspasoLineas(solicitudId?: string) {
  return useQuery({
    queryKey: ['solicitud_traspaso_lineas', solicitudId],
    enabled: !!solicitudId && solicitudId !== 'nueva',
    queryFn: async (): Promise<SolicitudTraspasoLinea[]> => {
      const { data, error } = await from('solicitud_traspaso_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('solicitud_id', solicitudId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SolicitudTraspasoLinea[];
    },
  });
}

export function useSolicitudTraspasoHistorial(solicitudId?: string) {
  return useQuery({
    queryKey: ['solicitud_traspaso_historial', solicitudId],
    enabled: !!solicitudId && solicitudId !== 'nueva',
    queryFn: async () => {
      const { data, error } = await from('solicitud_traspaso_historial')
        .select('id, accion, user_nombre, detalle, created_at')
        .eq('solicitud_id', solicitudId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; accion: string; user_nombre: string | null; detalle: any; created_at: string }>;
    },
  });
}

/** Invalida todo lo relacionado con solicitudes (raíz). */
export function useInvalidarSolicitudes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['solicitudes_traspaso'] });
    qc.invalidateQueries({ queryKey: ['solicitud_traspaso'] });
    qc.invalidateQueries({ queryKey: ['solicitud_traspaso_lineas'] });
    qc.invalidateQueries({ queryKey: ['solicitud_traspaso_historial'] });
    qc.invalidateQueries({ queryKey: ['stock_almacen'] });
    qc.invalidateQueries({ queryKey: ['traspasos'] });
  };
}

export interface LineaBorrador {
  id: string;
  producto_id: string;
  stock_actual_snapshot: number;
  stock_minimo_snapshot: number;
  stock_maximo_snapshot: number;
  cantidad_sugerida: number;
  cantidad_solicitada: number;
}

/** Guarda encabezado + líneas del borrador (upsert idempotente por id). */
export function useGuardarSolicitud() {
  const { empresa, user, profile } = useAuth();
  const invalidar = useInvalidarSolicitudes();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      almacen_origen_id: string;
      almacen_destino_id: string;
      observaciones?: string;
      fecha?: string;
      lineas: LineaBorrador[];
      lineasEliminadas?: string[];
    }) => {
      const eid = requireEmpresa(empresa?.id, 'useGuardarSolicitud');

      const { error: headErr } = await from('solicitudes_traspaso').upsert({
        id: payload.id,
        empresa_id: eid,
        fecha: payload.fecha ?? new Date().toISOString().slice(0, 10),
        almacen_origen_id: payload.almacen_origen_id,
        almacen_destino_id: payload.almacen_destino_id,
        observaciones: payload.observaciones ?? null,
        solicitante_user_id: user?.id ?? null,
        solicitante_profile_id: profile?.id ?? null,
      }, { onConflict: 'id' });
      if (headErr) throw headErr;

      if (payload.lineasEliminadas?.length) {
        const { error } = await from('solicitud_traspaso_lineas')
          .delete().in('id', payload.lineasEliminadas);
        if (error) throw error;
      }

      if (payload.lineas.length > 0) {
        const rows = payload.lineas.map(l => ({
          id: l.id,
          solicitud_id: payload.id,
          producto_id: l.producto_id,
          stock_actual_snapshot: l.stock_actual_snapshot,
          stock_minimo_snapshot: l.stock_minimo_snapshot,
          stock_maximo_snapshot: l.stock_maximo_snapshot,
          cantidad_sugerida: l.cantidad_sugerida,
          cantidad_solicitada: l.cantidad_solicitada,
        }));
        const { error } = await from('solicitud_traspaso_lineas').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      return payload.id;
    },
    onSettled: invalidar,
  });
}

function useRpc<TArgs extends Record<string, unknown>>(fn: string) {
  const invalidar = useInvalidarSolicitudes();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const { data, error } = await (supabase.rpc as any)(fn, args);
      if (error) throw error;
      return data;
    },
    onSettled: invalidar,
  });
}

export const useEnviarSolicitud = () => useRpc<{ p_solicitud_id: string }>('enviar_solicitud_traspaso');
export const useAprobarSolicitud = () => useRpc<{ p_solicitud_id: string; p_lineas: any }>('aprobar_solicitud_traspaso');
export const useRechazarSolicitud = () => useRpc<{ p_solicitud_id: string; p_motivo: string | null }>('rechazar_solicitud_traspaso');
export const useCancelarSolicitud = () => useRpc<{ p_solicitud_id: string; p_motivo: string | null }>('cancelar_solicitud_traspaso');
export const useSurtirSolicitud = () => useRpc<{ p_solicitud_id: string; p_lineas: any }>('surtir_solicitud_traspaso');
