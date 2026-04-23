import { supabase } from '@/integrations/supabase/client';

/** Upload an odometer photo to ruta-fotos bucket. Returns public URL. */
export async function uploadOdometroFoto(file: File | Blob, empresaId: string, kind: 'inicio' | 'fin'): Promise<string> {
  const ext = (file as File).name?.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${empresaId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('ruta-fotos').upload(path, file, {
    contentType: (file as File).type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ruta-fotos').getPublicUrl(path);
  return data.publicUrl;
}
