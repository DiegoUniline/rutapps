import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LiveVendedor {
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  battery_level: number | null;
  updated_at: string;
  // joined
  nombre: string | null;
  avatar_url: string | null;
}

const STALE_MINUTES = 10; // hide vendedores que no actualizan hace 10 min

/**
 * Subscribes to live vendedor positions for the current empresa.
 * - Initial fetch via react-query (cached, deduped).
 * - Realtime UPDATEs patch the cache locally (no refetch).
 * - Auto-filters out stale rows (>10 min without heartbeat).
 */
export function useLiveVendedores(enabled: boolean = true) {
  const { empresa } = useAuth();
  const [rows, setRows] = useState<LiveVendedor[]>([]);

  // 1) Initial load — joins profile name once (cheap)
  const { data: initial } = useQuery({
    queryKey: ['live-vendedores', empresa?.id],
    enabled: enabled && !!empresa?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendedor_ubicaciones' as any)
        .select('user_id, lat, lng, accuracy, speed, battery_level, updated_at')
        .eq('empresa_id', empresa!.id)
        .gte('updated_at', new Date(Date.now() - STALE_MINUTES * 60_000).toISOString());

      if (error || !data) return [];

      const userIds = (data as any[]).map(r => r.user_id);
      if (userIds.length === 0) return [];

      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, nombre, avatar_url')
        .in('user_id', userIds);

      const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      return (data as any[]).map(r => ({
        ...r,
        nombre: profMap.get(r.user_id)?.nombre ?? 'Vendedor',
        avatar_url: profMap.get(r.user_id)?.avatar_url ?? null,
      })) as LiveVendedor[];
    },
  });

  useEffect(() => {
    if (initial) setRows(initial);
  }, [initial]);

  // 2) Realtime — patch in place, no refetch
  useEffect(() => {
    if (!enabled || !empresa?.id) return;

    const channel = supabase
      .channel(`vendedor-ubicaciones-${empresa.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vendedor_ubicaciones', filter: `empresa_id=eq.${empresa.id}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const old: any = payload.old;
            setRows(prev => prev.filter(r => r.user_id !== old.user_id));
            return;
          }
          const n: any = payload.new;
          setRows(prev => {
            const existing = prev.find(r => r.user_id === n.user_id);
            const merged: LiveVendedor = {
              user_id: n.user_id,
              lat: n.lat,
              lng: n.lng,
              accuracy: n.accuracy,
              speed: n.speed,
              battery_level: n.battery_level,
              updated_at: n.updated_at,
              nombre: existing?.nombre ?? null,
              avatar_url: existing?.avatar_url ?? null,
            };
            // Lazy-fetch nombre if new vendedor appeared
            if (!existing) {
              supabase
                .from('profiles')
                .select('nombre, avatar_url')
                .eq('user_id', n.user_id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    setRows(p => p.map(r => r.user_id === n.user_id
                      ? { ...r, nombre: (data as any).nombre, avatar_url: (data as any).avatar_url }
                      : r));
                  }
                });
            }
            const next = prev.filter(r => r.user_id !== n.user_id);
            next.push(merged);
            return next;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enabled, empresa?.id]);

  // 3) Periodic stale filter (every 60s) — drop sellers inactive >10 min
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const cutoff = Date.now() - STALE_MINUTES * 60_000;
      setRows(prev => prev.filter(r => new Date(r.updated_at).getTime() > cutoff));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return rows;
}
