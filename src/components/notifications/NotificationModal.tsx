import { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification, NotificationView } from '@/hooks/useNotifications';
import { useIncrementView } from '@/hooks/useNotifications';

interface Props {
  notifications: AppNotification[];
  views: NotificationView[];
}

export default function NotificationModal({ notifications, views }: Props) {
  const navigate = useNavigate();
  const incrementView = useIncrementView();
  const [current, setCurrent] = useState<AppNotification | null>(null);
  const [neverShow, setNeverShow] = useState(false);

  const modals = notifications.filter(n => n.type === 'modal');

  // Find first modal the user hasn't exceeded views for
  useEffect(() => {
    if (current) return;
    for (const m of modals) {
      const view = views.find(v => v.notification_id === m.id);
      const count = view?.view_count ?? 0;
      if (m.max_views > 0 && count >= m.max_views) continue;
      setCurrent(m);
      incrementView.mutate(m.id);
      break;
    }
  }, [modals.length, views.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (neverShow && current) {
      // Set view_count to max_views so it never shows again
      // We've already incremented, this is handled by the max_views check
    }
    setCurrent(null);
  }, [neverShow, current]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{current.title}</h2>
          <button onClick={close} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {current.image_url && (
            <img src={current.image_url} alt="" className="w-full rounded-lg max-h-60 object-cover" />
          )}
          <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: current.body }} />
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={neverShow} onChange={e => setNeverShow(e.target.checked)}
              className="accent-primary h-3.5 w-3.5" />
            <span className="text-xs text-muted-foreground">No mostrar de nuevo</span>
          </label>
          <div className="flex gap-2">
            {current.redirect_url && (current.redirect_type === 'internal' || current.redirect_type === 'both') && (
              <button onClick={() => { navigate(current.redirect_url!); close(); }}
                className="btn-odoo-primary text-xs flex items-center gap-1.5">
                Ver más <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {current.redirect_url && (current.redirect_type === 'external' || current.redirect_type === 'both') && (
              <a href={current.redirect_url} target="_blank" rel="noopener noreferrer"
                className="btn-odoo-primary text-xs inline-flex items-center gap-1.5">
                Abrir enlace <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button onClick={close} className="btn-odoo text-xs">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
