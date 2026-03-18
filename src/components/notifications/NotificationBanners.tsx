import { useState } from 'react';
import { X, ExternalLink, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '@/hooks/useNotifications';

interface Props {
  notifications: AppNotification[];
}

export default function NotificationBanners({ notifications }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const banners = notifications.filter(n => n.type === 'banner' && !dismissed.has(n.id));

  if (banners.length === 0) return null;

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id));

  return (
    <div className="w-full z-50">
      {banners.map(b => (
        <div key={b.id} className="relative flex items-center justify-center gap-3 px-4 py-2.5 text-sm"
          style={{ backgroundColor: b.bg_color ?? '#1d4ed8', color: b.text_color ?? '#ffffff' }}>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <span className="font-semibold">{b.title}</span>
            {b.body && <span className="opacity-90" dangerouslySetInnerHTML={{ __html: b.body }} />}
            {b.redirect_url && (b.redirect_type === 'internal' || b.redirect_type === 'both') && (
              <button onClick={() => navigate(b.redirect_url!)}
                className="inline-flex items-center gap-1 underline underline-offset-2 font-medium opacity-90 hover:opacity-100">
                Ver más <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {b.redirect_url && (b.redirect_type === 'external' || b.redirect_type === 'both') && (
              <a href={b.redirect_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 font-medium opacity-90 hover:opacity-100">
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <button onClick={() => dismiss(b.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/20 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
