import { useState, useEffect } from 'react';
import { X, ExternalLink, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '@/hooks/useNotifications';

interface Props {
  notifications: AppNotification[];
}

export default function NotificationBubble({ notifications }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);

  const bubbles = notifications.filter(n => n.type === 'bubble' && !dismissed.has(n.id));

  // Entrance animation delay
  useEffect(() => {
    if (bubbles.length > 0) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [bubbles.length]);

  if (bubbles.length === 0) return null;

  const bubble = bubbles[0];
  const dismiss = () => setDismissed(prev => new Set(prev).add(bubble.id));

  const handleCta = () => {
    if (!bubble.redirect_url) return;
    if (bubble.redirect_type === 'external' || bubble.redirect_type === 'both') {
      window.open(bubble.redirect_url, '_blank');
    } else {
      navigate(bubble.redirect_url);
    }
  };

  return (
    <div
      className="fixed bottom-6 right-4 z-[90] w-[280px] transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
      }}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            {bubble.image_url ? (
              <img
                src={bubble.image_url}
                alt=""
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            )}
            <span className="text-sm font-bold text-foreground truncate">{bubble.title}</span>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-md hover:bg-muted transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        {bubble.body && (
          <div
            className="px-4 pt-1 pb-3 text-xs text-muted-foreground leading-relaxed [&_b]:font-semibold [&_b]:text-foreground"
            dangerouslySetInnerHTML={{ __html: bubble.body }}
          />
        )}

        {/* CTA */}
        {bubble.redirect_url && (
          <div className="px-4 pb-4">
            <button
              onClick={handleCta}
              className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg py-2.5 hover:bg-primary/90 transition-colors"
            >
              {bubble.redirect_type === 'external' || bubble.redirect_type === 'both'
                ? <><ExternalLink className="h-3 w-3" /> Ver más</>
                : <><ArrowRight className="h-3 w-3" /> Ver más</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
