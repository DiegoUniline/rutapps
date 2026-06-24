import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface BroadcastMessage {
  id: string;
  mensaje: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  created_at: string;
  created_by: string | null;
}

export function useBroadcastMessages() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Last 50 messages
  const messagesQ = useQuery({
    queryKey: ['broadcast-messages', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_messages')
        .select('id, mensaje, tipo, created_at, created_by')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BroadcastMessage[];
    },
  });

  // Reads by current user
  const readsQ = useQuery({
    queryKey: ['broadcast-reads', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_reads')
        .select('message_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.message_id as string));
    },
  });

  // Realtime subscription
  const shownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('broadcast-messages-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcast_messages' },
        (payload) => {
          const m = payload.new as BroadcastMessage;
          if (shownRef.current.has(m.id)) return;
          shownRef.current.add(m.id);
          showBroadcastToast(m);
          qc.invalidateQueries({ queryKey: ['broadcast-messages'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const unreadCount = (messagesQ.data ?? []).filter(
    (m) => !readsQ.data?.has(m.id),
  ).length;

  const markAsRead = async (messageId: string) => {
    if (!user?.id) return;
    await supabase.from('broadcast_reads').upsert(
      { message_id: messageId, user_id: user.id },
      { onConflict: 'message_id,user_id' },
    );
    qc.invalidateQueries({ queryKey: ['broadcast-reads'] });
  };

  const markAllAsRead = async () => {
    if (!user?.id || !messagesQ.data) return;
    const unread = messagesQ.data.filter((m) => !readsQ.data?.has(m.id));
    if (unread.length === 0) return;
    await supabase.from('broadcast_reads').upsert(
      unread.map((m) => ({ message_id: m.id, user_id: user.id })),
      { onConflict: 'message_id,user_id' },
    );
    qc.invalidateQueries({ queryKey: ['broadcast-reads'] });
  };

  return {
    messages: messagesQ.data ?? [],
    isLoading: messagesQ.isLoading,
    unreadCount,
    reads: readsQ.data ?? new Set<string>(),
    markAsRead,
    markAllAsRead,
  };
}

function showBroadcastToast(m: BroadcastMessage) {
  const fn = (toast as any)[m.tipo] ?? toast.info ?? toast;
  fn(m.mensaje, { duration: 8000, description: 'Mensaje del administrador' });
}
