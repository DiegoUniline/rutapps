import { useState } from 'react';
import { PlayCircle, ExternalLink, X, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@RutAppMx';

const MODULES: { value: string; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'productos', label: 'Productos' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'cargas', label: 'Cargas' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'ajustes', label: 'Ajustes de Inventario' },
  { value: 'traspasos', label: 'Traspasos' },
  { value: 'auditorias', label: 'Auditorías' },
  { value: 'conteos', label: 'Conteos Físicos' },
  { value: 'cobranza', label: 'Cobranza' },
  { value: 'cuentasCobrar', label: 'Cuentas por Cobrar' },
  { value: 'cuentasPagar', label: 'Cuentas por Pagar' },
  { value: 'gastos', label: 'Gastos' },
  { value: 'comisiones', label: 'Comisiones' },
  { value: 'reportes', label: 'Reportes' },
  { value: 'compras', label: 'Compras' },
  { value: 'tarifas', label: 'Tarifas / Listas de Precio' },
  { value: 'configuracion', label: 'Configuración' },
  { value: 'usuarios', label: 'Usuarios' },
  { value: 'entregas', label: 'Entregas' },
  { value: 'descargas', label: 'Descargas' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'catalogos', label: 'Catálogos' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'promociones', label: 'Promociones' },
  { value: 'mapa', label: 'Mapa de Clientes' },
  { value: 'pos', label: 'Punto de Venta' },
  { value: 'logistica', label: 'Logística' },
  { value: 'lotes', label: 'Lotes' },
  { value: 'almacenes', label: 'Almacenes' },
  { value: 'proveedores', label: 'Proveedores' },
  { value: 'demanda', label: 'Demanda' },
  { value: 'monitor', label: 'Monitor de Rutas' },
  { value: 'rutaApp', label: 'App de Ruta (Vendedor)' },
  { value: 'suscripcion', label: 'Mi Suscripción' },
];

function extractVideoId(url: string): string {
  const m1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (m3) return m3[1];
  return url;
}

function thumbUrl(url: string) {
  return `https://img.youtube.com/vi/${extractVideoId(url)}/mqdefault.jpg`;
}

function embedUrl(url: string) {
  return `https://www.youtube.com/embed/${extractVideoId(url)}?rel=0`;
}

interface VideoRow {
  id: string;
  url: string;
  title: string;
  description: string | null;
  module: string | null;
  sort_order: number;
}

export default function TutorialesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const empresaId = profile?.empresa_id;

  const [selected, setSelected] = useState<VideoRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoRow | null>(null);
  const [form, setForm] = useState({ url: '', title: '', description: '', module: '' });

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['tutorial_videos', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tutorial_videos' as any)
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VideoRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tutorial_videos' as any).insert({
        empresa_id: empresaId!,
        url: form.url.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        module: form.module || null,
        sort_order: videos.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tutorial_videos'] });
      setShowAdd(false);
      setForm({ url: '', title: '', description: '', module: '' });
      toast.success('Video agregado');
    },
    onError: () => toast.error('Error al agregar video'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editingVideo) return;
      const { error } = await supabase.from('tutorial_videos' as any).update({
        url: form.url.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        module: form.module || null,
      } as any).eq('id', editingVideo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tutorial_videos'] });
      setEditingVideo(null);
      setForm({ url: '', title: '', description: '', module: '' });
      toast.success('Video actualizado');
    },
    onError: () => toast.error('Error al actualizar video'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tutorial_videos' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tutorial_videos'] });
      toast.success('Video eliminado');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  const openEdit = (video: VideoRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVideo(video);
    setForm({
      url: video.url,
      title: video.title,
      description: video.description || '',
      module: video.module || '',
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Video Tutoriales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aprende a usar cada módulo del sistema con nuestros videos paso a paso.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Ver canal
            </a>
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            Agregar video
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground text-sm">Cargando...</div>
      ) : videos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay videos agregados aún</p>
          <p className="text-xs mt-1">Haz clic en "Agregar video" para empezar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <Card
              key={video.id}
              className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden group relative"
              onClick={() => setSelected(video)}
            >
              <div className="relative">
                <AspectRatio ratio={16 / 9}>
                  <img src={thumbUrl(video.url)} alt={video.title} className="object-cover w-full h-full" loading="lazy" />
                </AspectRatio>
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <PlayCircle className="h-12 w-12 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                </div>
                {video.module && (
                  <span className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded">
                    {MODULES.find(m => m.value === video.module)?.label ?? video.module}
                  </span>
                )}
              </div>
              <CardContent className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2">{video.title}</h3>
                  {video.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={(e) => openEdit(video, e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteMut.mutate(video.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Player modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-foreground text-sm truncate pr-4">{selected?.title}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selected && (
            <AspectRatio ratio={16 / 9}>
              <iframe
                src={embedUrl(selected.url)}
                title={selected.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </AspectRatio>
          )}
        </DialogContent>
      </Dialog>

      {/* Add video dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Video Tutorial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>URL de YouTube *</Label>
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              {form.url && extractVideoId(form.url).length === 11 && (
                <img src={thumbUrl(form.url)} alt="Preview" className="rounded mt-2 w-full max-w-[200px]" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                placeholder="Ej: Cómo crear una venta"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Input
                placeholder="Breve descripción del video"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Módulo (opcional)</Label>
              <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona módulo..." />
                </SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!form.url.trim() || !form.title.trim() || addMut.isPending}
              onClick={() => addMut.mutate()}
            >
              {addMut.isPending ? 'Guardando...' : 'Agregar video'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit video dialog */}
      <Dialog open={!!editingVideo} onOpenChange={(open) => { if (!open) { setEditingVideo(null); setForm({ url: '', title: '', description: '', module: '' }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Video Tutorial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>URL de YouTube *</Label>
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              {form.url && extractVideoId(form.url).length === 11 && (
                <img src={thumbUrl(form.url)} alt="Preview" className="rounded mt-2 w-full max-w-[200px]" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Módulo (opcional)</Label>
              <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona módulo..." />
                </SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!form.url.trim() || !form.title.trim() || updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              {updateMut.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
