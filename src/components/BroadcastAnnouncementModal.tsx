import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useBroadcastMessages } from '@/hooks/useBroadcastMessages';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Megaphone, AlertTriangle, Info, CheckCircle, XCircle, Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIPO_STYLES: Record<string, { icon: React.ElementType; color: string; border: string; bg: string }> = {
  info:    { icon: Info,        color: 'text-blue-600',    border: 'border-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/20' },
  success: { icon: CheckCircle, color: 'text-emerald-600', border: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
  warning: { icon: AlertTriangle,color: 'text-amber-600',   border: 'border-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/20' },
  error:   { icon: XCircle,     color: 'text-red-600',     border: 'border-red-500',     bg: 'bg-red-50 dark:bg-red-950/20' },
};

const LOCAL_KEY_PREFIX = 'broadcast_announcement_seen_';

function isSeenLocal(messageId: string) {
  try {
    return localStorage.getItem(`${LOCAL_KEY_PREFIX}${messageId}`) !== null;
  } catch {
    return false;
  }
}

export default function BroadcastAnnouncementModal() {
  const { messages, isLoading, markAsRead } = useBroadcastMessages();
  const [open, setOpen] = useState(false);

  const unseen = messages.filter((m) => !isSeenLocal(m.id));
  const latest = unseen[0];

  useEffect(() => {
    if (isLoading || !latest) {
      setOpen(false);
      return;
    }
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [latest, isLoading]);

  const handleClose = () => {
    if (latest) {
      markAsRead(latest.id);
      try {
        localStorage.setItem(`${LOCAL_KEY_PREFIX}${latest.id}`, new Date().toISOString());
      } catch {}
    }
    setOpen(false);
  };

  if (!latest) return null;

  const style = TIPO_STYLES[latest.tipo] ?? TIPO_STYLES.info;
  const Icon = style.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-2 border-primary/20">
        <div className={cn('px-5 pt-5 pb-3 border-b', style.bg)}>
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-2">
              <span className={cn('p-2 rounded-full bg-white dark:bg-background shadow-sm', style.color)}>
                <Icon className="h-5 w-5" />
              </span>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                Aviso importante
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              Mensaje del administrador del sistema
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className={cn('border-l-4 pl-3 py-2', style.border)}>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {latest.mensaje}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {new Date(latest.created_at).toLocaleString('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          {unseen.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Bell className="h-3.5 w-3.5" />
              Tienes {unseen.length} avisos sin leer. Los encontrarás en la campanita del menú.
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Entendido, cerrar
            </Button>
            <Button className="flex-1 gap-2" onClick={handleClose}>
              <CheckCircle className="h-4 w-4" />
              Aceptar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
