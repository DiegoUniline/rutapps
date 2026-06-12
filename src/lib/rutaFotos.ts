import { supabase } from '@/integrations/supabase/client';
import { compressPhoto } from '@/lib/imageCompressor';

/** Upload an odometer photo to ruta-fotos bucket. Returns public URL. */
export async function uploadOdometroFoto(file: File | Blob, empresaId: string, kind: 'inicio' | 'fin'): Promise<string> {
  // Compress before upload (camera photos from mobile can be 5-8MB).
  // compressPhoto: max 800px / quality 0.65 → typically ≤200KB
  let toUpload: File | Blob = file;
  if (file instanceof File) {
    try { toUpload = await compressPhoto(file); } catch { /* fallback original */ }
  }

  const ext = (toUpload as File).name?.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${empresaId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('ruta-fotos').upload(path, toUpload, {
    contentType: (toUpload as File).type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ruta-fotos').getPublicUrl(path);
  return data.publicUrl;
}
