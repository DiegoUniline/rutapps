import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InternalNotification {
  id: string;
  empresa_id: string;
  tipo: 'venta' | 'pedido' | 'cobro' | 'devolucion' | 'entrega' | 'stock_bajo' | string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface InternalNotificationRead {
  notification_id: string;
  user_id: string;
  read_at: string;
}

export function useInternalNotifications(limit = 50) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();

  // Realtime: invalidate on insert/update/delete
  useEffect(() => {
    if (!empresa?.id) return;
    const ch = supabase
      .channel(`inotif-${empresa.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_notifications', filter: `empresa_id=eq.${empresa.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['internal-notifications', empresa.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresa?.id, qc]);

  const list = useQuery({
    queryKey: ['internal-notifications', empresa?.id],
    enabled: !!empresa?.id && !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_notifications' as any)
        .select('*')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as InternalNotification[];
    },
  });

  const reads = useQuery({
    queryKey: ['internal-notifications-reads', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_notification_reads' as any)
        .select('notification_id, read_at')
        .eq('user_id', user!.id);
      if (error) throw error;
      return new Set(((data ?? []) as any[]).map(r => r.notification_id as string));
    },
  });

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user?.id) return;
      await supabase
        .from('internal_notification_reads' as any)
        .upsert({ notification_id: notificationId, user_id: user.id } as any, { onConflict: 'notification_id,user_id' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-notifications-reads', user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id || !list.data) return;
      const readSet = reads.data ?? new Set<string>();
      const unread = list.data.filter(n => !readSet.has(n.id));
      if (unread.length === 0) return;
      await supabase
        .from('internal_notification_reads' as any)
        .upsert(unread.map(n => ({ notification_id: n.id, user_id: user.id })) as any, { onConflict: 'notification_id,user_id' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-notifications-reads', user?.id] }),
  });

  const notifications = list.data ?? [];
  const readSet = reads.data ?? new Set<string>();
  const unreadCount = notifications.filter(n => !readSet.has(n.id)).length;

  return {
    notifications,
    readSet,
    unreadCount,
    loading: list.isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
