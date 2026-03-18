import { useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '@/hooks/useNotifications';

interface Props {
  notifications: AppNotification[];
}

export default function NotificationBubble({ notifications }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const bubbles = notifications.filter(n => n.type === 'bubble' && !dismissed.has(n.id));
  if (bubbles.length === 0) return null;

  // Show only the first active bubble
  const bubble = bubbles[0];
  const dismiss = () => setDismissed(prev => new Set(prev).add(bubble.id));

  const handleClick = () => {
    if (!bubble.redirect_url) return;
    if (bubble.redirect_type === 'external' || bubble.redirect_type === 'both') {
      window.open(bubble.redirect_url, '_blank');
    } else {
      navigate(bubble.redirect_url);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-[90] group">
      {/* Dismiss */}
      <button onClick={dismiss}
        className="absolute -top-1.5 -right-1.5 bg-card border border-border rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <X className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Bubble */}
      <button onClick={handleClick}
        className="relative w-14 h-14 rounded-full shadow-xl border-2 border-primary overflow-hidden hover:scale-110 transition-transform cursor-pointer"
        title={bubble.title}>
        {bubble.image_url ? (
          <img src={bubble.image_url} alt={bubble.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold">
            {bubble.title.charAt(0)}
          </div>
        )}
      </button>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-lg shadow-lg px-3 py-2 
        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        <span className="text-xs font-semibold text-foreground">{bubble.title}</span>
      </div>
    </div>
  );
}
