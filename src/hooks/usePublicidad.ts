import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Publicidad {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo_media: 'imagen' | 'video' | 'url_video' | 'solo_texto';
  media_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  activo: boolean;
  mostrar_popup: boolean;
  created_at: string;
  updated_at: string;
}

/** All ads (active) ordered by most recent — used in /actualizaciones */
export function usePublicidadList() {
  return useQuery({
    queryKey: ['publicidad', 'list'],
    queryFn: async (): Promise<Publicidad[]> => {
      const { data, error } = await supabase
        .from('publicidad_anuncios')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Publicidad[];
    },
    staleTime: 60_000,
  });
}

/** Returns the next ad the current user has not yet seen (popup only) */
export function useNextUnseenPopup() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['publicidad', 'next-unseen', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Publicidad | null> => {
      if (!user?.id) return null;
      const { data: ads, error } = await supabase
        .from('publicidad_anuncios')
        .select('*')
        .eq('activo', true)
        .eq('mostrar_popup', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!ads || ads.length === 0) return null;

      const { data: vistas } = await supabase
        .from('publicidad_vistas')
        .select('anuncio_id')
        .eq('user_id', user.id);
      const seen = new Set((vistas || []).map((v: any) => v.anuncio_id));
      const next = ads.find((a: any) => !seen.has(a.id));
      return (next as Publicidad) || null;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Resolve media_url: signed URL for storage paths, or pass-through for full URLs */
export async function resolveMediaUrl(mediaUrl: string | null): Promise<string | null> {
  if (!mediaUrl) return null;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  const { data } = await supabase.storage
    .from('publicidad')
    .createSignedUrl(mediaUrl, 60 * 60 * 24 * 7); // 7 days
  return data?.signedUrl || null;
}

/** Extract embeddable YouTube/Vimeo URL */
export function toEmbedUrl(url: string): string {
  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
  // Vimeo
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`;
  return url;
}
