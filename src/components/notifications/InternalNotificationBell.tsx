import { useNavigate } from 'react-router-dom';
import { Bell, ShoppingCart, ClipboardList, DollarSign, Undo2, Truck, AlertTriangle, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useInternalNotifications, type InternalNotification } from '@/hooks/useInternalNotifications';

const TIPO_META: Record<string, { icon: any; color: string; bg: string }> = {
  venta:       { icon: ShoppingCart,  color: 'text-success',     bg: 'bg-success/10' },
  pedido:      { icon: ClipboardList, color: 'text-info',        bg: 'bg-info/10' },
  cobro:       { icon: DollarSign,    color: 'text-success',     bg: 'bg-success/10' },
  devolucion:  { icon: Undo2,         color: 'text-warning',     bg: 'bg-warning/10' },
  entrega:     { icon: Truck,         color: 'text-info',        bg: 'bg-info/10' },
  stock_bajo:        { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  compra_por_vencer: { icon: AlertTriangle, color: 'text-warning',     bg: 'bg-warning/10' },
  compra_vencida:    { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  cuenta_por_vencer: { icon: AlertTriangle, color: 'text-warning',     bg: 'bg-warning/10' },
  cuenta_vencida:    { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function InternalNotificationBell() {
  const navigate = useNavigate();
  const { notifications, readSet, unreadCount, loading, markRead, markAllRead } = useInternalNotifications(50);

  const handleClick = (n: InternalNotification) => {
    if (!readSet.has(n.id)) markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Notificaciones"
          aria-label="Notificaciones"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 max-h-[calc(100vh-80px)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Notificaciones</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground">
                {unreadCount} nuevas
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => markAllRead()}>
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Sin notificaciones todavía
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map(n => {
                const meta = TIPO_META[n.tipo] ?? { icon: Bell, color: 'text-primary', bg: 'bg-primary/10' };
                const Icon = meta.icon;
                const unread = !readSet.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 flex gap-3 hover:bg-muted/50 transition-colors',
                        unread && 'bg-primary/5'
                      )}
                    >
                      <span className={cn('shrink-0 h-8 w-8 rounded-full flex items-center justify-center', meta.bg)}>
                        <Icon className={cn('h-4 w-4', meta.color)} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className={cn('text-[13px] leading-snug flex-1', unread ? 'font-semibold text-foreground' : 'text-foreground/80')}>
                            {n.title}
                          </p>
                          {unread && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        {n.body && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.body}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
