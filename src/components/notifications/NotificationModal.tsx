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
    setCurrent(null);
  }, []);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-0">
          <h2 className="text-lg font-bold text-foreground pr-4 leading-snug">{current.title}</h2>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 -mt-0.5">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {current.image_url && (
            <img src={current.image_url} alt="" className="w-full rounded-xl max-h-60 object-cover" />
          )}
          <div
            className="text-sm text-foreground/80 leading-relaxed prose prose-sm dark:prose-invert max-w-none
              [&_img]:rounded-xl [&_img]:my-3 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm
              [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:text-sm [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: current.body }}
          />
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={neverShow}
              onChange={e => setNeverShow(e.target.checked)}
              className="rounded border-border accent-primary h-3.5 w-3.5"
            />
            <span className="text-xs text-muted-foreground">No volver a mostrar</span>
          </label>
          <div className="flex gap-2">
            {current.redirect_url && (current.redirect_type === 'internal' || current.redirect_type === 'both') && (
              <button
                onClick={() => { navigate(current.redirect_url!); close(); }}
                className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
              >
                Ver más <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {current.redirect_url && (current.redirect_type === 'external' || current.redirect_type === 'both') && (
              <a
                href={current.redirect_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
              >
                Abrir enlace <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={close}
              className="text-xs font-medium text-muted-foreground px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
