import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Megaphone, Monitor, MessageCircle, Sparkles,
  ArrowRight, ExternalLink, Check, Palette, Upload, ImageIcon, X as XIcon, Info,
} from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/* ─── Types ─── */
interface AppNotification {
  id: string;
  empresa_id: string | null;
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

/* ─── Constants ─── */
const TYPE_META = {
  banner: {
    label: 'Banner',
    desc: 'Barra fija arriba del sistema',
    icon: Monitor,
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    accent: 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30',
  },
  modal: {
    label: 'Modal',
    desc: 'Popup centrado post-login',
    icon: MessageCircle,
    badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    accent: 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30',
  },
  bubble: {
    label: 'Bubble',
    desc: 'Tarjeta flotante inferior derecha',
    icon: Sparkles,
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    accent: 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30',
  },
} as const;

/* ═══ TEMPLATES ═══ */
interface Template {
  id: string;
  name: string;
  preview: string; // short visual hint
  build: (title: string, message: string, cta: string) => string;
}

const BANNER_TEMPLATES: Template[] = [
  {
    id: 'simple', name: 'Simple', preview: '📢 Texto directo',
    build: (_t, msg) => msg,
  },
  {
    id: 'bold', name: 'Destacado', preview: '🔥 Con negritas',
    build: (_t, msg) => `<b>${msg}</b>`,
  },
  {
    id: 'emoji_alert', name: 'Alerta', preview: '⚠️ Emoji + texto',
    build: (_t, msg) => `⚠️ <b>Atención:</b> ${msg}`,
  },
  {
    id: 'promo', name: 'Promo', preview: '🎉 Promoción',
    build: (_t, msg) => `🎉 <b>¡Oferta!</b> ${msg}`,
  },
];

const MODAL_TEMPLATES: Template[] = [
  {
    id: 'info', name: 'Informativo', preview: '📋 Clásico',
    build: (t, msg, cta) =>
      `<h2 style="margin:0 0 8px">${t}</h2><p>${msg}</p>`,
  },
  {
    id: 'promo_card', name: 'Promoción', preview: '🎁 Oferta especial',
    build: (t, msg, cta) =>
      `<div style="text-align:center;padding:8px 0"><p style="font-size:32px;margin:0">🎁</p><h2 style="margin:8px 0 4px">${t}</h2><p style="color:#666">${msg}</p></div>`,
  },
  {
    id: 'warning', name: 'Aviso importante', preview: '⚠️ Llamativo',
    build: (t, msg) =>
      `<div style="background:#fef3c7;border-radius:12px;padding:16px;text-align:center"><p style="font-size:28px;margin:0">⚠️</p><h2 style="margin:8px 0 4px">${t}</h2><p style="margin:0;color:#92400e">${msg}</p></div>`,
  },
  {
    id: 'feature', name: 'Nueva función', preview: '✨ Novedad',
    build: (t, msg) =>
      `<div style="text-align:center;padding:8px 0"><p style="font-size:32px;margin:0">✨</p><h2 style="margin:8px 0 4px">${t}</h2><p style="color:#666">${msg}</p><ul style="text-align:left;padding-left:20px;margin-top:12px"><li>Mejora en rendimiento</li><li>Nuevas opciones disponibles</li></ul></div>`,
  },
];

const BUBBLE_TEMPLATES: Template[] = [
  {
    id: 'simple', name: 'Simple', preview: '💬 Básico',
    build: (_t, msg) => `<p>${msg}</p>`,
  },
  {
    id: 'promo', name: 'Promoción', preview: '🔥 Oferta',
    build: (_t, msg) => `<p>🔥 <b>¡No te lo pierdas!</b></p><p>${msg}</p>`,
  },
  {
    id: 'tip', name: 'Consejo', preview: '💡 Tip útil',
    build: (_t, msg) => `<p>💡 <b>Consejo:</b> ${msg}</p>`,
  },
  {
    id: 'update', name: 'Actualización', preview: '🆕 Novedad',
    build: (_t, msg) => `<p>🆕 ${msg}</p>`,
  },
];

function getTemplates(type: string): Template[] {
  if (type === 'banner') return BANNER_TEMPLATES;
  if (type === 'modal') return MODAL_TEMPLATES;
  if (type === 'bubble') return BUBBLE_TEMPLATES;
  return BANNER_TEMPLATES;
}

const emptyForm = (): Partial<AppNotification> & { _templateId?: string; _message?: string; _cta?: string } => ({
  title: '', body: '', type: 'banner', is_active: true,
  start_date: new Date().toISOString().slice(0, 16),
  end_date: null, redirect_url: '', redirect_type: null,
  image_url: '', bg_color: '#1e293b', text_color: '#ffffff', max_views: 0,
  empresa_id: null,
  _templateId: 'simple', _message: '', _cta: '',
});

/* ─── Live Previews ─── */
function BannerPreview({ form }: { form: Partial<AppNotification> }) {
  const bg = form.bg_color ?? '#1e293b';
  const txt = form.text_color ?? '#ffffff';
  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: bg, color: txt }}>
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${txt}22`, color: txt }}>
          {form.title || 'TÍTULO'}
        </span>
        <span className="opacity-40 text-xs">•</span>
        {form.body ? (
          <span className="opacity-90 text-xs [&_b]:font-semibold" dangerouslySetInnerHTML={{ __html: form.body }} />
        ) : (
          <span className="opacity-50 text-xs">Mensaje del banner...</span>
        )}
      </div>
    </div>
  );
}

function ModalPreview({ form }: { form: Partial<AppNotification> }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg max-w-xs mx-auto overflow-hidden">
      <div className="p-4 pb-0">
        <h3 className="text-sm font-bold text-foreground">{form.title || 'Título'}</h3>
      </div>
      <div className="p-4 pt-2">
        {form.image_url && <img src={form.image_url} alt="" className="w-full rounded-xl max-h-28 object-cover mb-3" />}
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-0"
          dangerouslySetInnerHTML={{ __html: form.body || '<p class="text-muted-foreground">Contenido...</p>' }} />
      </div>
      <div className="p-3 border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">☐ No volver a mostrar</span>
        <div className="flex gap-1.5">
          {form.redirect_url && <span className="bg-primary text-primary-foreground text-[10px] font-semibold px-2.5 py-1 rounded-md">Ver más</span>}
          <span className="text-[10px] text-muted-foreground border border-border px-2.5 py-1 rounded-md">Cerrar</span>
        </div>
      </div>
    </div>
  );
}

function BubblePreview({ form }: { form: Partial<AppNotification> }) {
  return (
    <div className="flex justify-end">
      <div className="w-[240px] bg-card border border-border rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
          {form.image_url ? (
            <img src={form.image_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          <span className="text-xs font-bold text-foreground truncate">{form.title || 'Título'}</span>
        </div>
        {form.body && (
          <div className="px-3.5 pt-0.5 pb-2.5 text-[11px] text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground" dangerouslySetInnerHTML={{ __html: form.body }} />
        )}
        {form.redirect_url && (
          <div className="px-3.5 pb-3">
            <div className="w-full bg-primary text-primary-foreground text-[11px] font-semibold rounded-md py-1.5 text-center">
              Ver más
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Image size guide ─── */
const IMAGE_SPECS: Record<string, { w: number; h: number; label: string; tip: string }> = {
  modal: { w: 600, h: 300, label: '600 × 300 px', tip: 'Formato horizontal 2:1 — se muestra completa arriba del texto' },
  bubble: { w: 56, h: 56, label: '56 × 56 px', tip: 'Cuadrada — aparece como ícono junto al título' },
};

/* ─── Image Upload Component ─── */
function ImageUploadField({ type, imageUrl, onUrlChange }: { type: string; imageUrl: string; onUrlChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const spec = IMAGE_SPECS[type] ?? IMAGE_SPECS.modal;

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5 MB'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('notification-images').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('notification-images').getPublicUrl(path);
      onUrlChange(urlData.publicUrl);
      toast.success('Imagen subida');
    } catch (e: any) {
      toast.error(e.message ?? 'Error al subir imagen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        Imagen (opcional)
      </label>

      {/* Dimension guide */}
      <div className="flex items-start gap-2 mb-2.5 bg-accent/50 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-foreground">Medida recomendada: {spec.label}</p>
          <p className="text-[10px] text-muted-foreground">{spec.tip}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />

      {imageUrl ? (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="preview"
            className={cn(
              'rounded-xl border border-border object-cover',
              type === 'bubble' ? 'w-14 h-14' : 'w-full max-h-40',
            )}
          />
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors shadow-sm"
              title="Cambiar imagen"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onUrlChange('')}
              className="bg-card/90 backdrop-blur-sm border border-border rounded-lg p-1.5 text-muted-foreground hover:text-destructive transition-colors shadow-sm"
              title="Quitar imagen"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border hover:border-primary/40 rounded-xl py-6 flex flex-col items-center gap-2 transition-colors group"
        >
          {uploading ? (
            <>
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Subiendo...</span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                Haz clic para subir imagen
              </span>
              <span className="text-[10px] text-muted-foreground">JPG, PNG — máx. 5 MB</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/* ---- MAIN COMPONENT ---- */
export default function AdminAnunciosTab() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    setNotifications((data ?? []) as unknown as AppNotification[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm()); setSheetOpen(true); };
  const openEdit = (n: AppNotification) => {
    setForm({
      ...n,
      start_date: n.start_date?.slice(0, 16),
      end_date: n.end_date?.slice(0, 16) ?? null,
      _templateId: 'simple',
      _message: '',
      _cta: '',
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _templateId, _message, _cta, ...payload } = { ...form, empresa_id: null };
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from('notifications').update(rest as any).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('notifications').insert(payload as any);
        if (error) throw error;
      }
      toast.success(form.id ? 'Anuncio actualizado' : 'Anuncio creado');
      setSheetOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este anuncio?')) return;
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Eliminado'); load(); }
  };

  const toggleActive = async (n: AppNotification) => {
    await supabase.from('notifications').update({ is_active: !n.is_active } as any).eq('id', n.id);
    load();
  };

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  // Rebuild body from template whenever template fields change
  const applyTemplate = (templateId: string, message?: string, title?: string) => {
    const templates = getTemplates(form.type ?? 'banner');
    const tpl = templates.find(t => t.id === templateId) ?? templates[0];
    const msg = message ?? form._message ?? '';
    const t = title ?? form.title ?? '';
    const body = tpl.build(t, msg, form._cta ?? '');
    setForm(prev => ({ ...prev, _templateId: templateId, _message: message ?? prev._message, body }));
  };

  /* ─── Empty State ─── */
  if (!loading && notifications.length === 0 && !sheetOpen) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-card flex items-center justify-center mb-5">
            <Megaphone className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No hay anuncios configurados</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            Crea banners, modales o burbujas para comunicarte con todos los usuarios del sistema.
          </p>
          <button onClick={openNew} className="btn-odoo-primary text-sm flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Crear anuncio
          </button>
        </div>
        {renderSheet()}
      </>
    );
  }

  /* ─── Sheet (Side Panel) ─── */
  function renderSheet() {
    const templates = getTemplates(form.type ?? 'banner');
    const currentTpl = templates.find(t => t.id === form._templateId) ?? templates[0];

    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col" side="right">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-base font-bold">
              {form.id ? 'Editar anuncio' : 'Nuevo anuncio'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* ─── Type Selector Cards ─── */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-2.5 block">Tipo de anuncio</label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['banner', 'modal', 'bubble'] as const).map(t => {
                  const meta = TYPE_META[t];
                  const Icon = meta.icon;
                  const selected = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        set('type', t);
                        // Reset template when type changes
                        const newTemplates = getTemplates(t);
                        setTimeout(() => applyTemplate(newTemplates[0].id, form._message, form.title), 0);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3.5 transition-all text-center',
                        selected ? meta.accent : 'border-border hover:border-muted-foreground/30 bg-card',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', selected ? 'text-foreground' : 'text-muted-foreground')} />
                      <span className={cn('text-xs font-semibold', selected ? 'text-foreground' : 'text-muted-foreground')}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{meta.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Content Section ─── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Contenido</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Título</label>
                <input
                  value={form.title ?? ''}
                  onChange={e => {
                    set('title', e.target.value);
                    applyTemplate(form._templateId ?? 'simple', form._message, e.target.value);
                  }}
                  className="input-odoo w-full text-sm"
                  placeholder="Ej: Mantenimiento programado"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Mensaje</label>
                <textarea
                  value={form._message ?? ''}
                  onChange={e => {
                    const msg = e.target.value;
                    set('_message', msg);
                    applyTemplate(form._templateId ?? 'simple', msg, form.title);
                  }}
                  className="input-odoo w-full text-sm min-h-[80px] resize-none"
                  placeholder="Escribe el mensaje que verán los usuarios..."
                />
              </div>

              {/* ─── Template Selector ─── */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  Estilo visual
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map(tpl => {
                    const selected = form._templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className={cn(
                          'relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-left transition-all',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30 bg-card',
                        )}
                      >
                        <span className="text-base">{tpl.preview.split(' ')[0]}</span>
                        <div className="min-w-0">
                          <p className={cn('text-xs font-semibold truncate', selected ? 'text-foreground' : 'text-foreground/80')}>
                            {tpl.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {tpl.preview.split(' ').slice(1).join(' ')}
                          </p>
                        </div>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ─── Settings Section ─── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Configuración</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className={cn(
                  'w-9 h-5 rounded-full relative transition-colors cursor-pointer',
                  form.is_active ? 'bg-primary' : 'bg-muted-foreground/30',
                )} onClick={() => set('is_active', !form.is_active)}>
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                    form.is_active ? 'left-[18px]' : 'left-0.5',
                  )} />
                </div>
                <span className="text-sm text-foreground">Activo</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Fecha inicio</label>
                  <input type="datetime-local" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value)} className="input-odoo w-full text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Fecha fin (opcional)</label>
                  <input type="datetime-local" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} className="input-odoo w-full text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">URL de redirección (opcional)</label>
                <input value={form.redirect_url ?? ''} onChange={e => set('redirect_url', e.target.value)} className="input-odoo w-full text-sm" placeholder="https://... o /ruta-interna" />
              </div>
              {form.redirect_url && (
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Tipo de redirección</label>
                  <select value={form.redirect_type ?? ''} onChange={e => set('redirect_type', e.target.value || null)} className="input-odoo w-full text-sm">
                    <option value="">Sin tipo</option>
                    <option value="internal">Interna</option>
                    <option value="external">Externa</option>
                    <option value="both">Ambas</option>
                  </select>
                </div>
              )}

              {/* Banner-only: color pickers */}
              {form.type === 'banner' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Color de fondo</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.bg_color ?? '#1e293b'} onChange={e => set('bg_color', e.target.value)} className="w-8 h-8 rounded-lg border border-border cursor-pointer p-0.5" />
                      <span className="text-xs text-muted-foreground font-mono">{form.bg_color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">Color de texto</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.text_color ?? '#ffffff'} onChange={e => set('text_color', e.target.value)} className="w-8 h-8 rounded-lg border border-border cursor-pointer p-0.5" />
                      <span className="text-xs text-muted-foreground font-mono">{form.text_color}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal-only: max views */}
              {form.type === 'modal' && (
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Máximo de vistas por usuario</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={form.max_views ?? 0} onChange={e => set('max_views', parseInt(e.target.value) || 0)} className="input-odoo w-24 text-sm" />
                    <span className="text-[11px] text-muted-foreground">0 = ilimitado</span>
                  </div>
                </div>
              )}

              {/* Image upload for bubble/modal */}
              {(form.type === 'bubble' || form.type === 'modal') && (
                <ImageUploadField
                  type={form.type}
                  imageUrl={form.image_url ?? ''}
                  onUrlChange={url => set('image_url', url)}
                />
              )}
            </div>

            {/* ─── Live Preview ─── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Vista previa</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="border border-dashed border-border rounded-xl p-4 bg-card/80">
                {form.type === 'banner' && <BannerPreview form={form} />}
                {form.type === 'modal' && <ModalPreview form={form} />}
                {form.type === 'bubble' && <BubblePreview form={form} />}
              </div>
            </div>
          </div>

          {/* ─── Sticky Footer ─── */}
          <div className="border-t border-border px-6 py-4 flex gap-2 justify-end shrink-0 bg-card">
            <button onClick={() => setSheetOpen(false)} className="btn-odoo text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-odoo-primary text-sm px-6">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  /* ─── List View ─── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" /> Anuncios del sistema
        </h2>
        <button onClick={openNew} className="btn-odoo-primary text-xs flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nuevo anuncio
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Cargando...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Título</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Inicio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Fin</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => {
                const meta = TYPE_META[n.type];
                return (
                  <tr key={n.id} className="border-t border-border hover:bg-card/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border', meta.badge)}>
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{n.title}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(n)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                          n.is_active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', n.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                        {n.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(n.start_date)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{n.end_date ? fmtDate(n.end_date) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        <button onClick={() => openEdit(n)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Editar">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(n.id)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {renderSheet()}
    </div>
  );
}
