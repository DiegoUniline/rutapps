import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Bot, X, Minus, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import SoporteChatPanel, {
  SOPORTE_STORAGE_KEY,
  SOPORTE_EVENT,
} from "@/components/soporte/SoporteChatPanel";

type Thread = { id: string; messages: unknown[] };

function readThreadCount(): number {
  try {
    const raw = localStorage.getItem(SOPORTE_STORAGE_KEY);
    if (!raw) return 0;
    const arr = JSON.parse(raw) as Thread[];
    if (!Array.isArray(arr)) return 0;
    // Only consider threads that have at least one message
    return arr.filter((t) => Array.isArray(t.messages) && t.messages.length > 0).length;
  } catch {
    return 0;
  }
}

/**
 * FloatingSoporteChat
 * - Mounted globally inside AppLayout.
 * - Hidden on /soporte (panel is already embedded there).
 * - Only appears once the user has an active conversation with at least one message
 *   (avoids nagging brand-new users).
 * - User can minimize (small bubble) or close (hidden until next conversation/page reload).
 */
export default function FloatingSoporteChat() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [count, setCount] = useState<number>(() =>
    typeof window === "undefined" ? 0 : readThreadCount(),
  );
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = () => setCount(readThreadCount());
    window.addEventListener(SOPORTE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(SOPORTE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Reset dismissal whenever a new message lands (so the bubble reappears
  // if the user starts chatting again from the Soporte page).
  useEffect(() => {
    if (count > 0) setDismissed(false);
  }, [count]);

  // Visible en TODA la app administrativa (escritorio y móvil del admin).
  // Solo se oculta en la app móvil de ruta (/ruta) o si el usuario lo cierra.
  const isRutaApp = pathname.startsWith("/ruta");
  const compactOnSale = /^\/ventas\/(?:nuevo|[0-9a-f-]{36})$/i.test(pathname);
  void count;
  void isMobile;

  if (isRutaApp) return null;
  if (dismissed) return null;



  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-[60] flex items-center gap-2 rounded-full",
          "bg-primary text-primary-foreground shadow-xl hover:shadow-2xl",
          "transition-all hover:scale-[1.03]",
          compactOnSale
            ? "bottom-4 right-4 h-11 w-11 justify-center p-0"
            : "bottom-5 right-5 py-2.5 pl-3 pr-4",
        )}
        aria-label="Abrir Asesor IA de Soporte"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/15">
          <Bot className="h-4 w-4" />
        </span>
        {!compactOnSale && <span className="whitespace-nowrap text-sm font-semibold">Asesor IA</span>}
        {!compactOnSale && count > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-bold">
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[60] flex flex-col overflow-hidden",
        "rounded-xl border bg-card shadow-2xl",
        "w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100dvh-2rem)]",
      )}
      role="dialog"
      aria-label="Asesor IA de Soporte"
    >
      <div className="flex items-center justify-between border-b bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-xs font-bold">Asesor IA de Soporte</p>
            <p className="text-[10px] text-muted-foreground">Disponible 24/7</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="Minimizar"
            title="Minimizar"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setDismissed(true);
            }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <SoporteChatPanel compact onAfterNavigate={() => { /* keep open while navigating */ }} />
      </div>
      <a
        href="/soporte"
        className="border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground hover:bg-muted text-center flex items-center justify-center gap-1.5"
      >
        <MessageCircle className="h-3 w-3" />
        Ver pantalla completa de Soporte
      </a>
    </div>
  );
}
