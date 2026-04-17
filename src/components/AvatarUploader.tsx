import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  /** UUID of the auth user (used as the storage folder name). */
  userId: string;
  /** UUID of the profile row (for the DB update). */
  profileId: string;
  currentUrl: string | null | undefined;
  /** Display name used to compute the fallback initial. */
  name?: string | null;
  size?: number;
  onChange?: (newUrl: string | null) => void;
}

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export default function AvatarUploader({ userId, profileId, currentUrl, name, size = 80, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(currentUrl ?? null);

  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('El archivo debe ser una imagen'); return; }
    if (file.size > MAX_BYTES) { toast.error('La imagen no puede pesar más de 3 MB'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      // path = <userId>/avatar.<ext> → folder name matches policies
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profileId);
      if (dbErr) throw dbErr;

      setUrl(publicUrl);
      onChange?.(publicUrl);
      toast.success('Foto actualizada');
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo subir la foto');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!url) return;
    if (!confirm('¿Quitar la foto de perfil?')) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profileId);
      if (error) throw error;
      setUrl(null);
      onChange?.(null);
      toast.success('Foto eliminada');
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo eliminar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'relative rounded-full overflow-hidden border-2 border-border bg-primary/10 flex items-center justify-center shrink-0',
        )}
        style={{ width: size, height: size }}
      >
        {url ? (
          <img src={url} alt={name ?? 'Avatar'} className="w-full h-full object-cover" />
        ) : (
          <span className="text-primary font-bold" style={{ fontSize: size / 2.5 }}>
            {initial !== '?' ? initial : <User style={{ width: size / 2, height: size / 2 }} />}
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" />
          {url ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {url && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        )}
        <span className="text-[10px] text-muted-foreground">JPG/PNG · máx 3 MB</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
