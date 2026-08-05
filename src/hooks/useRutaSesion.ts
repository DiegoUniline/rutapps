import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { todayLocal } from '@/lib/utils';
import { offlineDb } from '@/lib/offlineDb';
import { queueOperation } from '@/lib/syncQueue';

export interface RutaSesion {
  id: string;
  empresa_id: string;
  vehiculo_id: string;
  vendedor_id: string;
  carga_id: string | null;
  fecha: string;
  inicio_at: string;
  km_inicio: number;
  lat_inicio: number | null;
  lng_inicio: number | null;
  foto_inicio_url: string | null;
  notas_inicio: string | null;
  fin_at: string | null;
  km_fin: number | null;
  lat_fin: number | null;
  lng_fin: number | null;
  foto_fin_url: string | null;
  notas_fin: string | null;
  km_recorridos: number | null;
  status: 'en_ruta' | 'cerrada' | 'cancelada';
  vehiculos?: { alias: string; placa: string | null } | null;
}

/** Active route session (status=en_ruta) for current vendedor today */
export function useRutaSesionActiva() {
  const { profile, empresa } = useAuth();
  const vendedorId = profile?.id;

  // Tiempo real: en vez de consultar cada 60s, escuchamos cambios de la sesión
  // de ruta. Mantenemos un refetch de red-de-seguridad amplio (5 min) por si el
  // canal realtime se cae en segundo plano en el celular.
  useRealtimeInvalidate({
    table: 'ruta_sesiones',
    empresaId: empresa?.id,
    queryKeys: [['ruta-sesion-activa'], ['ruta-sesiones']],
  });

  return useQuery({
    queryKey: ['ruta-sesion-activa', empresa?.id, vendedorId],
    enabled: !!empresa?.id && !!vendedorId,
    refetchInterval: 5 * 60_000,
    // La jornada debe resolverse aunque el celular no tenga señal y aunque la
    // app se haya cerrado por completo: la respuesta buena se guarda en
    // IndexedDB y, sin red, se lee de ahí (no de la memoria de React Query).
    networkMode: 'always',
    queryFn: async (): Promise<RutaSesion | null> => {
      const leerLocal = async (): Promise<RutaSesion | null> => {
        const filas = await offlineDb.ruta_sesiones
          .where('empresa_id').equals(empresa!.id)
          .filter((r: any) => r.vendedor_id === vendedorId && r.status === 'en_ruta' && r.fecha === todayLocal())
          .toArray();
        const activa = filas.sort((a: any, b: any) => String(b.inicio_at).localeCompare(String(a.inicio_at)))[0] ?? null;
        if (!activa) return null;
        const veh = activa.vehiculo_id ? await offlineDb.vehiculos.get(activa.vehiculo_id) : null;
        return { ...activa, vehiculos: veh ? { alias: veh.alias, placa: veh.placa ?? null } : null } as RutaSesion;
      };

      try {
        const { data, error } = await supabase
          .from('ruta_sesiones')
          .select('*, vehiculos(alias, placa)')
          .eq('empresa_id', empresa!.id)
          .eq('vendedor_id', vendedorId!)
          .eq('status', 'en_ruta')
          .eq('fecha', todayLocal())
          .order('inicio_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const { vehiculos: _v, ...fila } = data as any;
          await offlineDb.ruta_sesiones.put(fila);
        }
        return data as any;
      } catch (e) {
        // Sin red: la copia local manda. Si tampoco hay copia, se informa como
        // "sin jornada" solo cuando la tabla local ya existe.
        return await leerLocal();
      }
    },
  });
}

export function useAbrirRutaSesion() {
  const { profile, empresa } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      vehiculo_id: string | null;
      km_inicio: number | null;
      lat_inicio?: number | null;
      lng_inicio?: number | null;
      foto_inicio_url?: string | null;
      notas_inicio?: string | null;
      carga_id?: string | null;
    }) => {
      if (!empresa?.id || !profile?.id) throw new Error('Sesión no disponible');
      const payload: any = {
        id: crypto.randomUUID(),
        empresa_id: empresa.id,
        vendedor_id: profile.id,
        fecha: todayLocal(),
        inicio_at: new Date().toISOString(),
        status: 'en_ruta',
        ...input,
      };
      try {
        const { data, error } = await supabase
          .from('ruta_sesiones')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await offlineDb.ruta_sesiones.put(data);
        return data;
      } catch {
        // Offline: la jornada se abre localmente y se sube en cuanto vuelva la
        // señal. El id lo genera el dispositivo, así que no se duplica.
        await queueOperation('ruta_sesiones', 'insert', payload);
        return payload;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruta-sesion-activa'] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
    },
  });
}

export function useCerrarRutaSesion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      km_fin: number;
      lat_fin?: number | null;
      lng_fin?: number | null;
      foto_fin_url?: string | null;
      notas_fin?: string | null;
    }) => {
      const { id, ...rest } = input;
      const cambios = { ...rest, status: 'cerrada' as const, fin_at: new Date().toISOString() };
      try {
        const { data, error } = await supabase
          .from('ruta_sesiones')
          .update(cambios)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        await offlineDb.ruta_sesiones.put(data);
        return data;
      } catch {
        await queueOperation('ruta_sesiones', 'update', { id, ...cambios });
        const local = await offlineDb.ruta_sesiones.get(id);
        const cerrada = { ...(local ?? { id }), ...cambios };
        await offlineDb.ruta_sesiones.put(cerrada);
        return cerrada;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruta-sesion-activa'] });
      qc.invalidateQueries({ queryKey: ['ruta-sesiones'] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
    },
  });
}
