import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Send, Loader2, Plus, Trash2, MessageSquare, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string; ts: number };
type Thread = { id: string; title: string; updatedAt: number; messages: Msg[] };

export const SOPORTE_STORAGE_KEY = "rutapp.soporte.threads.v1";
export const SOPORTE_ACTIVE_KEY = "rutapp.soporte.active.v1";
export const SOPORTE_EVENT = "rutapp:soporte-updated";
const MAX_THREADS = 30;

function notifyUpdate() {
  try { window.dispatchEvent(new Event(SOPORTE_EVENT)); } catch {}
}

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(SOPORTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveThreads(threads: Thread[]) {
  try {
    localStorage.setItem(SOPORTE_STORAGE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)));
    notifyUpdate();
  } catch {}
}

function saveActive(id: string) {
  try { localStorage.setItem(SOPORTE_ACTIVE_KEY, id); notifyUpdate(); } catch {}
}

function loadActive(): string | null {
  try { return localStorage.getItem(SOPORTE_ACTIVE_KEY); } catch { return null; }
}

function newId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function newThread(): Thread {
  return { id: newId(), title: "Nueva conversación", updatedAt: Date.now(), messages: [] };
}

function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean || "Nueva conversación";
}

const SUGGESTIONS = [
  "¿Cómo registro una venta directa en POS?",
  "¿Cómo aplico un pago a un cliente?",
  "¿Cómo cargo productos por Excel?",
  "¿Cómo configuro permisos de un usuario?",
];

type Props = {
  /** When true: hides thread sidebar and renders in compact floating mode. */
  compact?: boolean;
  /** Called after the user clicks an internal markdown link (useful to close floating panel). */
  onAfterNavigate?: () => void;
};

export default function SoporteChatPanel({ compact = false, onAfterNavigate }: Props = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>(() => {
    if (typeof window === "undefined") return [];
    const loaded = loadThreads();
    if (loaded.length === 0) {
      const t = newThread();
      saveThreads([t]);
      saveActive(t.id);
      return [t];
    }
    return loaded;
  });

  // Sync from other tabs / floating widget
  useEffect(() => {
    const handler = () => setThreads(loadThreads());
    window.addEventListener(SOPORTE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(SOPORTE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const urlThreadId = compact ? null : searchParams.get("c");
  const storedActive = useMemo(() => (typeof window !== "undefined" ? loadActive() : null), [threads.length]);

  const activeId = useMemo(() => {
    if (urlThreadId && threads.some((t) => t.id === urlThreadId)) return urlThreadId;
    if (storedActive && threads.some((t) => t.id === storedActive)) return storedActive;
    return threads[0]?.id ?? "";
  }, [urlThreadId, storedActive, threads]);

  // Ensure URL has the active id on /soporte page (non-compact)
  useEffect(() => {
    if (!compact && activeId && urlThreadId !== activeId) {
      const next = new URLSearchParams(searchParams);
      next.set("c", activeId);
      setSearchParams(next, { replace: true });
    }
    if (activeId) saveActive(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, compact]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0];

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus input on mount and on thread switch / after send
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId, sending]);

  // After sending: scroll the user's last message to the top, so the assistant's
  // reply starts at the top of the view and the user can read from the start.
  useEffect(() => {
    if (!scrollRef.current) return;
    const lastUser = scrollRef.current.querySelector<HTMLElement>('[data-last-user="true"]');
    if (lastUser) {
      lastUser.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.messages.length, sending]);

  const updateThreads = (updater: (prev: Thread[]) => Thread[]) => {
    setThreads((prev) => {
      const next = updater(prev);
      saveThreads(next);
      return next;
    });
  };

  const selectThread = (id: string) => {
    saveActive(id);
    if (!compact) {
      const next = new URLSearchParams(searchParams);
      next.set("c", id);
      setSearchParams(next);
    } else {
      // Force re-render in compact mode by re-reading active key
      setThreads((prev) => [...prev]);
    }
  };

  const createThread = () => {
    const t = newThread();
    updateThreads((prev) => [t, ...prev]);
    selectThread(t.id);
  };

  const deleteThread = (id: string) => {
    updateThreads((prev) => {
      let next = prev.filter((t) => t.id !== id);
      if (next.length === 0) next = [newThread()];
      if (id === activeId) {
        saveActive(next[0].id);
        if (!compact) {
          const url = new URLSearchParams(searchParams);
          url.set("c", next[0].id);
          setSearchParams(url, { replace: true });
        }
      }
      return next;
    });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending || !active) return;
    const userMsg: Msg = { role: "user", content, ts: Date.now() };

    // Optimistic update
    updateThreads((prev) =>
      prev.map((t) =>
        t.id === active.id
          ? {
              ...t,
              title: t.messages.length === 0 ? deriveTitle(content) : t.title,
              updatedAt: Date.now(),
              messages: [...t.messages, userMsg],
            }
          : t,
      ),
    );
    setInput("");
    setSending(true);

    try {
      const history = [...active.messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("soporte-chat", {
        body: { messages: history },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = (data as any)?.reply ?? "";
      if (!reply) throw new Error("Respuesta vacía");

      const assistantMsg: Msg = { role: "assistant", content: reply, ts: Date.now() };
      updateThreads((prev) =>
        prev.map((t) =>
          t.id === active.id
            ? { ...t, updatedAt: Date.now(), messages: [...t.messages, assistantMsg] }
            : t,
        ),
      );
    } catch (e: any) {
      const msg = e?.message ?? "Error al consultar al asesor IA";
      toast.error(msg);
      // Rollback: remove the optimistic user message so they can retry
      updateThreads((prev) =>
        prev.map((t) =>
          t.id === active.id
            ? { ...t, messages: t.messages.filter((m) => m !== userMsg) }
            : t,
        ),
      );
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Custom anchor renderer: internal app paths (start with "/") use react-router navigation
  // so the floating chat stays open while the user changes pages.
  const renderLink = ({ href, children, ...rest }: any) => {
    const isInternal = typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
    if (isInternal) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            navigate(href);
            onAfterNavigate?.();
          }}
          className="text-primary font-semibold underline underline-offset-2 hover:opacity-80"
          {...rest}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...rest}>
        {children}
      </a>
    );
  };

  return (
    <div className={cn(
      "grid grid-cols-1 overflow-hidden rounded-xl border bg-card shadow-sm",
      compact ? "h-full" : "h-[640px] md:grid-cols-[260px_1fr]",
      !compact && "md:grid-cols-[260px_1fr]",
    )}>
      {/* Threads sidebar */}
      {/* Threads sidebar (hidden in compact / floating mode) */}
      {!compact && (
      <aside className="hidden flex-col border-r bg-muted/30 md:flex">
        <div className="p-3 border-b">
          <Button onClick={createThread} className="w-full" size="sm">
            <Plus className="mr-2 h-4 w-4" /> Nueva conversación
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-start gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors",
                t.id === activeId ? "bg-primary/10 text-primary" : "hover:bg-card",
              )}
              onClick={() => selectThread(t.id)}
            >
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(t.updatedAt).toLocaleDateString("es-MX")}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("¿Eliminar esta conversación?")) deleteThread(t.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex flex-col min-h-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Asesor IA de Soporte</h3>
              <p className="text-[11px] text-muted-foreground">
                Experto en todos los módulos de RutApp · Disponible 24/7
              </p>
            </div>
          </div>
          {/* Mobile new chat */}
          <Button onClick={createThread} size="sm" variant="outline" className="md:hidden">
            <Plus className="h-4 w-4" />
          </Button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
          {(!active || active.messages.length === 0) && !sending && (
            <div className="mx-auto max-w-md py-8 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">¿En qué te ayudo hoy?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pregúntame sobre cualquier módulo de RutApp: ventas, cobranza, inventario,
                  rutas, facturación, configuración y más.
                </p>
              </div>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border bg-card px-3 py-2 text-left text-xs hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active?.messages.map((m, i) => {
            const msgs = active?.messages ?? [];
            const lastIdx = msgs.length - 1;
            // Mark the most recent USER message so we scroll it to the top
            // after sending (so the assistant reply starts at the top).
            const isLastUser =
              m.role === "user" &&
              (i === lastIdx ||
                (i === lastIdx - 1 && msgs[lastIdx]?.role === "assistant"));
            return (
              <div
                key={i}
                data-last-user={isLastUser ? "true" : undefined}
                className={cn(
                  "flex gap-2.5 scroll-mt-2",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "text-sm",
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl px-3.5 py-2.5 bg-primary text-primary-foreground"
                      : "max-w-[85%] text-foreground",
                  )}
                >
                  {m.role === "assistant" ? (
                    <article className={cn(
                      "prose prose-sm max-w-none",
                      "prose-p:my-1.5 prose-p:text-sm prose-p:leading-relaxed",
                      "prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-bold",
                      "prose-li:my-0.5 prose-li:text-sm",
                      "prose-strong:text-foreground prose-strong:font-bold",
                      "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px]",
                      "prose-table:text-xs prose-table:border prose-table:border-border prose-table:rounded",
                      "prose-th:bg-muted/50 prose-th:font-bold prose-th:px-2 prose-th:py-1.5 prose-th:border prose-th:border-border",
                      "prose-td:px-2 prose-td:py-1.5 prose-td:border prose-td:border-border",
                    )}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </article>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div className="flex gap-2.5 justify-start">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-muted px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pensando…
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t bg-card p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe tu pregunta…  (Enter para enviar, Shift+Enter para salto de línea)"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 max-h-32 min-h-[40px]"
              style={{ height: "auto" }}
            />
            <Button
              onClick={() => send()}
              disabled={!input.trim() || sending}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            El asesor IA puede cometer errores. Para temas urgentes contacta soporte humano por WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
