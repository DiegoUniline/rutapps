import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useBroadcastMessages } from '@/hooks/useBroadcastMessages';
import { cn } from '@/lib/utils';

const TIPO_COLORS: Record<string, string> = {
  info: 'border-l-blue-500',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  error: 'border-l-red-500',
};

export default function BroadcastBell() {
  const { messages, isLoading, unreadCount, reads, markAllAsRead } = useBroadcastMessages();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v && unreadCount > 0) markAllAsRead(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Mensajes del administrador"
          title="Mensajes del administrador"
        >
          <Megaphone className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mensajes del administrador</h3>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => markAllAsRead()}>
              Marcar leídas
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <p className="text-center text-[12px] text-muted-foreground py-6">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground py-6">Sin mensajes</p>
          ) : (
            messages.map((m) => {
              const isUnread = !reads.has(m.id);
              return (
                <div
                  key={m.id}
                  className={cn(
                    'px-3 py-2 border-b border-border/40 last:border-0 border-l-4',
                    TIPO_COLORS[m.tipo] ?? TIPO_COLORS.info,
                    isUnread && 'bg-accent/40',
                  )}
                >
                  <p className="text-[13px] text-foreground whitespace-pre-wrap break-words">{m.mensaje}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(m.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
