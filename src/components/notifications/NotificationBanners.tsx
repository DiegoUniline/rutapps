import { useState } from 'react';
import { X, ExternalLink, ArrowRight, MoreHorizontal } from 'lucide-react';
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
      {banners.map(b => {
        const bgColor = b.bg_color ?? '#1e293b';
        const txtColor = b.text_color ?? '#ffffff';

        return (
          <div
            key={b.id}
            className="relative flex items-center justify-between px-4 py-2 text-sm"
            style={{ backgroundColor: bgColor, color: txtColor }}
          >
            <div className="flex items-center gap-2.5 flex-wrap min-w-0 flex-1">
              {/* Pill badge with title */}
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0"
                style={{ backgroundColor: `${txtColor}22`, color: txtColor }}
              >
                {b.title}
              </span>

              <span className="opacity-40 text-xs shrink-0">•</span>

              {/* Body text */}
              <span
                className="opacity-90 text-[13px] leading-snug [&_b]:font-semibold [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: b.body }}
              />

              {/* Redirect links inline */}
              {b.redirect_url && (b.redirect_type === 'internal' || b.redirect_type === 'both') && (
                <button
                  onClick={() => navigate(b.redirect_url!)}
                  className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: txtColor }}
                >
                  Ver más <ArrowRight className="h-3 w-3" />
                </button>
              )}
              {b.redirect_url && (b.redirect_type === 'external' || b.redirect_type === 'both') && (
                <a
                  href={b.redirect_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: txtColor }}
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <button
              onClick={() => dismiss(b.id)}
              className="p-1 rounded-md hover:bg-white/10 transition-colors shrink-0 ml-3"
            >
              <X className="h-3.5 w-3.5" style={{ color: txtColor }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
