import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { confirmDialog } from '@/lib/confirm';
import { fmtDate } from '@/lib/utils';
import { resolveMediaUrl, toEmbedUrl, type Publicidad } from '@/hooks/usePublicidad';
import {
  Plus, Pencil, Trash2, Megaphone, Upload, Eye, EyeOff, ImageIcon,
  Video, Link2, FileText, X, ExternalLink,
} from 'lucide-react';

type TipoMedia = Publicidad['tipo_media'];

interface FormState {
  id?: string;
  titulo: string;
  descripcion: string;
  tipo_media: TipoMedia;
  media_url: string;
  cta_label: string;
  cta_url: string;
  activo: boolean;
  mostrar_popup: boolean;
}

const EMPTY: FormState = {
  titulo: '', descripcion: '',
  tipo_media: 'imagen', media_url: '',
  cta_label: '', cta_url: '',
  activo: true, mostrar_popup: true,
};

const TIPO_OPTIONS: { value: TipoMedia; label: string; icon: any }[] = [
  { value: 'imagen', label: 'Imagen', icon: ImageIcon },
  { value: 'video', label: 'Video (archivo)', icon: Video },
  { value: 'url_video', label: 'YouTube / Vimeo', icon: Link2 },
  { value: 'solo_texto', label: 'Solo texto', icon: FileText },
];

export default function AdminPublicidadTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-publicidad'],
    queryFn: async (): Promise<Publicidad[]> => {
      const { data, error } = await supabase
        .from('publicidad_anuncios')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Publicidad[];
    },
  });

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (ad: Publicidad) => {
    setForm({
      id: ad.id,
      titulo: ad.titulo,
      descripcion: ad.descripcion || '',
      tipo_media: ad.tipo_media,
      media_url: ad.media_url || '',
      cta_label: ad.cta_label || '',
      cta_url: ad.cta_url || '',
      activo: ad.activo,
      mostrar_popup: ad.mostrar_popup,
    });
    setOpen(true);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    const maxMB = form.tipo_media === 'video' ? 100 : 10;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`El archivo excede ${maxMB} MB`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('publicidad')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setForm(f => ({ ...f, media_url: path }));
      toast.success('Archivo subido');
    } catch (e: any) {
      toast.error('Error al subir: ' + (e.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.titulo.trim()) { toast.error('El título es obligatorio'); return; }
    if ((form.tipo_media === 'imagen' || form.tipo_media === 'video') && !form.media_url) {
      toast.error('Sube un archivo'); return;
    }
    if (form.tipo_media === 'url_video' && !form.media_url) {
      toast.error('Ingresa la URL del video'); return;
    }
    if (form.cta_url && !form.cta_label) {
      toast.error('Agrega un texto al botón'); return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo_media: form.tipo_media,
        media_url: form.media_url.trim() || null,
        cta_label: form.cta_label.trim() || null,
        cta_url: form.cta_url.trim() || null,
        activo: form.activo,
        mostrar_popup: form.mostrar_popup,
        ...(form.id ? {} : { created_by: user?.id }),
      };
      if (form.id) {
        const { error } = await supabase
          .from('publicidad_anuncios').update(payload).eq('id', form.id);
        if (error) throw error;
        toast.success('Anuncio actualizado');
      } else {
        const { error } = await supabase
          .from('publicidad_anuncios').insert(payload as any);
        if (error) throw error;
        toast.success('Anuncio creado');
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-publicidad'] });
      qc.invalidateQueries({ queryKey: ['publicidad'] });
    } catch (e: any) {
      toast.error('Error: ' + (e.message || ''));
    } finally { setSaving(false); }
  };

  const remove = async (ad: Publicidad) => {
    const ok = await confirmDialog(`¿Eliminar "${ad.titulo}"? Esta acción no se puede deshacer.`, {
      title: 'Eliminar anuncio',
      confirmText: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    const { error } = await supabase.from('publicidad_anuncios').delete().eq('id', ad.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Eliminado');
    qc.invalidateQueries({ queryKey: ['admin-publicidad'] });
    qc.invalidateQueries({ queryKey: ['publicidad'] });
  };

  const toggleActivo = async (ad: Publicidad) => {
    const { error } = await supabase
      .from('publicidad_anuncios').update({ activo: !ad.activo }).eq('id', ad.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    qc.invalidateQueries({ queryKey: ['admin-publicidad'] });
    qc.invalidateQueries({ queryKey: ['publicidad'] });
  };

  const resetVistas = async (ad: Publicidad) => {
    const ok = await confirmDialog({
      title: 'Reenviar a todos',
      description: 'Esto eliminará el registro de quienes ya vieron este anuncio. El popup volverá a aparecerle a TODOS los usuarios. ¿Continuar?',
      confirmText: 'Reenviar',
    });
    if (!ok) return;
    const { error } = await supabase.from('publicidad_vistas').delete().eq('anuncio_id', ad.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Vistas reiniciadas — todos los usuarios volverán a ver el popup');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Publicidad</h2>
            <p className="text-sm text-muted-foreground">Popups de novedades para usuarios de escritorio (una sola vez por usuario).</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva publicidad
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : !items || items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto opacity-30 mb-3" />
          <p>No hay publicidad publicada todavía.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map(ad => <AdRow key={ad.id} ad={ad} onEdit={openEdit} onDelete={remove} onToggle={toggleActivo} onReset={resetVistas} />)}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{form.id ? 'Editar publicidad' : 'Nueva publicidad'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div>
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} maxLength={120} />
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={4} maxLength={1000}
                placeholder="¿Qué es esta novedad? ¿Qué hace?"
              />
            </div>

            <div>
              <Label>Tipo de contenido *</Label>
              <Select value={form.tipo_media} onValueChange={(v) => setForm(f => ({ ...f, tipo_media: v as TipoMedia, media_url: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2"><opt.icon className="h-4 w-4" /> {opt.label}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(form.tipo_media === 'imagen' || form.tipo_media === 'video') && (
              <div>
                <Label>Archivo *</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={form.tipo_media === 'imagen' ? 'image/*' : 'video/mp4,video/webm'}
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? 'Subiendo…' : (form.media_url ? 'Reemplazar' : 'Subir archivo')}
                  </Button>
                  {form.media_url && (
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      ✓ {form.media_url}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.tipo_media === 'imagen' ? 'JPG/PNG/WebP, máx 10 MB.' : 'MP4/WebM, máx 100 MB.'}
                </p>
              </div>
            )}

            {form.tipo_media === 'url_video' && (
              <div>
                <Label>URL del video *</Label>
                <Input
                  value={form.media_url}
                  onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="text-xs text-muted-foreground mt-1">YouTube o Vimeo.</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-semibold">Botón de acción (opcional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Texto del botón</Label>
                  <Input value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} placeholder="Ver tutorial" maxLength={40} />
                </div>
                <div>
                  <Label className="text-xs">URL destino</Label>
                  <Input value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Activo</Label>
                  <p className="text-xs text-muted-foreground">Visible en Actualizaciones y popup.</p>
                </div>
                <Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mostrar como popup</Label>
                  <p className="text-xs text-muted-foreground">Aparece una vez por usuario al entrar al escritorio.</p>
                </div>
                <Switch checked={form.mostrar_popup} onCheckedChange={v => setForm(f => ({ ...f, mostrar_popup: v }))} />
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Crear')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AdRow({ ad, onEdit, onDelete, onToggle, onReset }: {
  ad: Publicidad;
  onEdit: (a: Publicidad) => void;
  onDelete: (a: Publicidad) => void;
  onToggle: (a: Publicidad) => void;
  onReset: (a: Publicidad) => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [vistasCount, setVistasCount] = useState<number | null>(null);
  const meta = TIPO_OPTIONS.find(o => o.value === ad.tipo_media)!;
  const Icon = meta.icon;

  useEffect(() => {
    if (ad.tipo_media === 'imagen' && ad.media_url) {
      resolveMediaUrl(ad.media_url).then(setThumb);
    }
    supabase.from('publicidad_vistas').select('id', { count: 'exact', head: true })
      .eq('anuncio_id', ad.id)
      .then(({ count }) => setVistasCount(count ?? 0));
  }, [ad]);

  return (
    <Card className="p-4">
      <div className="flex gap-4">
        <div className="h-20 w-32 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <Icon className="h-7 w-7 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="secondary" className="gap-1"><Icon className="h-3 w-3" />{meta.label}</Badge>
                {ad.activo
                  ? <Badge className="bg-green-600 hover:bg-green-600">Activo</Badge>
                  : <Badge variant="outline">Inactivo</Badge>}
                {ad.mostrar_popup && <Badge variant="outline" className="text-primary border-primary">Popup</Badge>}
                <span className="text-xs text-muted-foreground">{fmtDate(ad.created_at)}</span>
                {vistasCount !== null && (
                  <span className="text-xs text-muted-foreground">· {vistasCount} vistas</span>
                )}
              </div>
              <h3 className="font-semibold truncate">{ad.titulo}</h3>
              {ad.descripcion && <p className="text-sm text-muted-foreground line-clamp-2">{ad.descripcion}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onToggle(ad)} title={ad.activo ? 'Desactivar' : 'Activar'}>
                {ad.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(ad)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(ad)} title="Eliminar" className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {ad.mostrar_popup && (
            <div className="mt-2">
              <button onClick={() => onReset(ad)} className="text-xs text-primary hover:underline">
                Reenviar popup a todos los usuarios
              </button>
            </div>
          )}
          {ad.cta_url && (
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> {ad.cta_label}: <span className="truncate">{ad.cta_url}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
