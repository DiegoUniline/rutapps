import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AppNotification {
  id: string;
  empresa_id: string;
  title: string;
  body: string;
  type: 'banner' | 'modal' | 'bubble';
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  redirect_url: string | null;
  redirect_type: 'internal' | 'external' | 'both' | null;
  image_url: string | null;
  bg_color: string | null;
  text_color: string | null;
  max_views: number;
  created_at: string;
}

export interface NotificationView {
  id: string;
  notification_id: string;
  user_id: string;
  view_count: number;
  last_seen_at: string;
  dismissed: boolean;
}

/** Fetch all notifications for admin CRUD */
export function useAdminNotifications() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['admin-notifications', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AppNotification[];
    },
  });
}

/** Fetch active notifications for runtime display */
export function useActiveNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['active-notifications'],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', now)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Filter out expired ones client-side (end_date)
      return ((data ?? []) as unknown as AppNotification[]).filter(n =>
        !n.end_date || new Date(n.end_date) > new Date()
      );
    },
    staleTime: 60_000,
  });
}

/** Fetch user's notification views */
export function useNotificationViews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notification-views', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_views')
        .select('*')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationView[];
    },
  });
}

/** Increment view count for a notification */
export function useIncrementView() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId, dismiss = false }: { notificationId: string; dismiss?: boolean }) => {
      // Upsert
      const { data: existing } = await supabase
        .from('notification_views')
        .select('id, view_count')
        .eq('notification_id', notificationId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('notification_views')
          .update({
            view_count: existing.view_count + (dismiss ? 0 : 1),
            last_seen_at: new Date().toISOString(),
            ...(dismiss ? { dismissed: true } : {}),
          } as any)
          .eq('id', existing.id);
      } else {
        await supabase
          .from('notification_views')
          .insert({
            notification_id: notificationId,
            user_id: user!.id,
            view_count: dismiss ? 0 : 1,
            ...(dismiss ? { dismissed: true } : {}),
          } as any);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-views'] }),
  });
}

/** Save (create or update) a notification */
export function useSaveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notif: Partial<AppNotification> & { empresa_id: string }) => {
      if (notif.id) {
        const { id, ...rest } = notif;
        const { error } = await supabase.from('notifications').update(rest as any).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('notifications').insert(notif as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });
}

/** Delete a notification */
export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });
}
