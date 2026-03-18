import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Plus, Pencil, Trash2, X, Bold, Italic, Link2, List, ListOrdered, Heading2, Eye, Code, Image } from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';

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

const TYPE_LABELS: Record<string, string> = { banner: 'Banner', modal: 'Modal', bubble: 'Bubble' };
const TYPE_COLORS: Record<string, string> = {
  banner: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  modal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  bubble: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

const emptyForm = (): Partial<AppNotification> => ({
  title: '', body: '', type: 'banner', is_active: true,
  start_date: new Date().toISOString().slice(0, 16),
  end_date: null, redirect_url: '', redirect_type: null,
  image_url: '', bg_color: '#1d4ed8', text_color: '#ffffff', max_views: 0,
  empresa_id: null,
});

/* ─── HTML toolbar helper ─── */
function HtmlToolbar({ onInsert }: { onInsert: (before: string, after: string) => void }) {
  const tools = [
    { icon: Bold, before: '<b>', after: '</b>', title: 'Negrita' },
    { icon: Italic, before: '<i>', after: '</i>', title: 'Cursiva' },
    { icon: Heading2, before: '<h2>', after: '</h2>', title: 'Encabezado' },
    { icon: Link2, before: '<a href="URL">', after: '</a>', title: 'Enlace' },
    { icon: Image, before: '<img src="', after: '" style="max-width:100%;border-radius:8px" />', title: 'Imagen' },
    { icon: List, before: '<ul>\n  <li>', after: '</li>\n</ul>', title: 'Lista' },
    { icon: ListOrdered, before: '<ol>\n  <li>', after: '</li>\n</ol>', title: 'Lista numerada' },
    { icon: Code, before: '<code>', after: '</code>', title: 'Código' },
  ];

  return (
    <div className="flex items-center gap-0.5 border border-border rounded-t-lg bg-muted/40 px-2 py-1.5">
      {tools.map(({ icon: Icon, before, after, title }) => (
        <button key={title} type="button" onClick={() => onInsert(before, after)}
          className="p-1.5 rounded hover:bg-muted transition-colors" title={title}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

export default function AdminAnunciosTab() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<AppNotification>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: notifs } = await supabase
      .from('notifications').select('*').order('created_at', { ascending: false });
    setNotifications((notifs ?? []) as unknown as AppNotification[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm()); setEditing(true); setShowPreview(false); };
  const openEdit = (n: AppNotification) => {
    setForm({ ...n, start_date: n.start_date?.slice(0, 16), end_date: n.end_date?.slice(0, 16) ?? null });
    setEditing(true);
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = { ...form, empresa_id: null }; // system-wide
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from('notifications').update(rest as any).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('notifications').insert(payload as any);
        if (error) throw error;
      }
      toast.success(form.id ? 'Actualizado' : 'Creado');
      setEditing(false);
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

  const insertHtml = useCallback((before: string, after: string) => {
    const ta = document.getElementById('body-editor') as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = form.body ?? '';
    const selected = text.slice(start, end) || 'texto';
    const newText = text.slice(0, start) + before + selected + after + text.slice(end);
    set('body', newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }, [form.body]);

  if (editing) {
    return (
      <div className="max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">{form.id ? 'Editar' : 'Nuevo'} Anuncio (Global)</h2>
          <button onClick={() => setEditing(false)} className="p-2 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">Tipo</label>
          <div className="flex gap-2">
            {(['banner', 'modal', 'bubble'] as const).map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={cn('px-4 py-2 rounded-lg text-xs font-semibold border transition-all',
                  form.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                )}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Título</label>
          <input value={form.title ?? ''} onChange={e => set('title', e.target.value)}
            className="input-odoo w-full text-sm" placeholder="Título del anuncio" />
        </div>

        {/* HTML editor with toolbar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-foreground">Contenido (HTML)</label>
            <button type="button" onClick={() => setShowPreview(!showPreview)}
              className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-all',
                showPreview ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              )}>
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>

          {showPreview ? (
            <div className="border border-border rounded-lg p-4 bg-card min-h-[160px]">
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: form.body || '<p class="text-muted-foreground">Sin contenido...</p>' }} />
            </div>
          ) : (
            <div>
              <HtmlToolbar onInsert={insertHtml} />
              <textarea
                id="body-editor"
                value={form.body ?? ''}
                onChange={e => set('body', e.target.value)}
                className="input-odoo w-full text-sm min-h-[160px] font-mono text-xs rounded-t-none border-t-0"
                placeholder="<p>Escribe tu contenido aquí...</p>"
              />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active ?? true} onChange={e => set('is_active', e.target.checked)}
            className="accent-primary h-4 w-4" />
          <span className="text-sm text-foreground">Activa</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Fecha inicio</label>
            <input type="datetime-local" value={form.start_date ?? ''} onChange={e => set('start_date', e.target.value)}
              className="input-odoo w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Fecha fin (opcional)</label>
            <input type="datetime-local" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)}
              className="input-odoo w-full text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">URL de redirección (opcional)</label>
          <input value={form.redirect_url ?? ''} onChange={e => set('redirect_url', e.target.value)}
            className="input-odoo w-full text-sm" placeholder="https://..." />
        </div>
        {form.redirect_url && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Tipo de redirección</label>
            <select value={form.redirect_type ?? ''} onChange={e => set('redirect_type', e.target.value || null)}
              className="input-odoo w-full text-sm">
              <option value="">Sin tipo</option>
              <option value="internal">Interna</option>
              <option value="external">Externa</option>
              <option value="both">Ambas</option>
            </select>
          </div>
        )}

        {form.type === 'banner' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Color de fondo</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.bg_color ?? '#1d4ed8'} onChange={e => set('bg_color', e.target.value)}
                  className="w-10 h-8 rounded border border-border cursor-pointer" />
                <span className="text-xs text-muted-foreground">{form.bg_color}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Color de texto</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.text_color ?? '#ffffff'} onChange={e => set('text_color', e.target.value)}
                  className="w-10 h-8 rounded border border-border cursor-pointer" />
                <span className="text-xs text-muted-foreground">{form.text_color}</span>
              </div>
            </div>
          </div>
        )}

        {form.type === 'modal' && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Máximo de vistas por usuario <span className="text-muted-foreground font-normal">(0 = ilimitado)</span>
            </label>
            <input type="number" min={0} value={form.max_views ?? 0} onChange={e => set('max_views', parseInt(e.target.value) || 0)}
              className="input-odoo w-32 text-sm" />
          </div>
        )}

        {form.type === 'bubble' && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">URL de imagen</label>
            <input value={form.image_url ?? ''} onChange={e => set('image_url', e.target.value)}
              className="input-odoo w-full text-sm" placeholder="https://..." />
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-2 w-16 h-16 rounded-full object-cover border border-border" />
            )}
          </div>
        )}

        {/* Live preview panel */}
        {(form.title || form.body) && (
          <div className="border border-dashed border-border rounded-lg p-4 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Vista previa</p>
            {form.type === 'banner' && (
              <div className="rounded-lg flex items-center justify-center gap-3 px-4 py-2.5 text-sm"
                style={{ backgroundColor: form.bg_color ?? '#1d4ed8', color: form.text_color ?? '#ffffff' }}>
                <span className="font-semibold">{form.title || 'Título'}</span>
                {form.body && <span className="opacity-90" dangerouslySetInnerHTML={{ __html: form.body }} />}
              </div>
            )}
            {form.type === 'modal' && (
              <div className="bg-card border border-border rounded-xl shadow-lg max-w-sm mx-auto overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground">{form.title || 'Título'}</h3>
                </div>
                <div className="p-4">
                  {form.image_url && <img src={form.image_url} alt="" className="w-full rounded-lg max-h-32 object-cover mb-3" />}
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs"
                    dangerouslySetInnerHTML={{ __html: form.body || '<p>Contenido...</p>' }} />
                </div>
                <div className="p-3 border-t border-border flex justify-end gap-2">
                  {form.redirect_url && <span className="btn-odoo-primary text-[10px] px-3 py-1">Ver más</span>}
                  <span className="btn-odoo text-[10px] px-3 py-1">Cerrar</span>
                </div>
              </div>
            )}
            {form.type === 'bubble' && (
              <div className="flex items-end justify-end gap-2">
                <span className="text-xs bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">{form.title || 'Título'}</span>
                <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center overflow-hidden">
                  {form.image_url
                    ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    : <Bell className="h-5 w-5 text-primary" />
                  }
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-odoo-primary text-sm px-5">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={() => setEditing(false)} className="btn-odoo text-sm">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Bell className="h-5 w-5" /> Anuncios del sistema (Global)
        </h2>
        <button onClick={openNew} className="btn-odoo-primary text-xs flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Cargando...</div>
      ) : notifications.length === 0 ? (
        <div className="text-muted-foreground text-sm py-12 text-center">No hay anuncios.</div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs">Título</th>
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs">Tipo</th>
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs">Activa</th>
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs">Inicio</th>
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs">Fin</th>
                <th className="px-4 py-2.5 font-semibold text-foreground text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => (
                <tr key={n.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-foreground font-medium">{n.title}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-semibold', TYPE_COLORS[n.type])}>
                      {TYPE_LABELS[n.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => toggleActive(n)}
                      className={cn('w-9 h-5 rounded-full relative transition-colors',
                        n.is_active ? 'bg-primary' : 'bg-muted-foreground/30'
                      )}>
                      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                        n.is_active ? 'left-[18px]' : 'left-0.5'
                      )} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(n.start_date)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{n.end_date ? fmtDate(n.end_date) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(n)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Editar">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(n.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
