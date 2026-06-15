import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Funciona sin internet?",
  "¿Cuánto cuesta?",
  "¿Hace facturas CFDI?",
  "Quiero una demo",
];

const WELCOME =
  "¡Hola! Soy **Cristóbal**, asesor de RutApp 👋 ¿Tienes dudas sobre cómo digitalizar tu distribuidora? Pregúntame lo que quieras.";

export default function LandingChatWidget() {
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTeaser(true), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open) {
      setTeaser(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("landing-chat", {
        body: { messages: next.map(({ role, content }) => ({ role, content })) },
      });
      if (error) throw error;
      const reply = (data as any)?.reply ?? "Disculpa, no pude responder. Intenta de nuevo.";
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Tuve un problema técnico. ¿Puedes intentar de nuevo? También puedes escribirnos a WhatsApp: +52 1 317 104 5954.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && teaser && (
        <div className="fixed bottom-24 right-5 z-[60] max-w-[260px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            onClick={() => setOpen(true)}
            className="relative block rounded-2xl rounded-br-sm bg-white text-left text-sm shadow-2xl ring-1 ring-black/5 px-4 py-3 hover:shadow-xl transition"
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                setTeaser(false);
              }}
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 grid place-items-center text-[10px] cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="h-3 w-3" />
            </span>
            <p className="font-semibold text-gray-900 leading-tight">¿Tienes dudas? 👋</p>
            <p className="text-gray-600 text-[13px] mt-0.5 leading-snug">
              Nuestro agente de IA <span className="font-semibold text-[#0060e8]">Cristóbal</span> te responde al instante.
            </p>
          </button>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-gradient-to-br from-[#0060e8] to-[#0048b3] text-white shadow-2xl hover:shadow-[0_10px_40px_rgba(0,96,232,0.45)] pl-3 pr-5 py-3 transition-all hover:scale-105"
          aria-label="Abrir chat con Cristóbal"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Bot className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 ring-2 ring-[#0060e8] animate-pulse" />
          </span>
          <span className="text-sm font-bold whitespace-nowrap">Chat con Cristóbal</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[70] flex flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300
                     sm:bottom-5 sm:right-5 sm:left-auto sm:inset-x-auto
                     sm:w-[400px] sm:h-[620px] sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-2xl
                     h-[92vh] rounded-t-2xl"
          role="dialog"
          aria-label="Chat con Cristóbal de RutApp"
        >
          <div className="flex items-center justify-between bg-gradient-to-br from-[#0060e8] to-[#0048b3] text-white px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-full bg-white/15 grid place-items-center">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 ring-2 ring-[#0060e8]" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  Cristóbal <Sparkles className="h-3 w-3 text-yellow-300" />
                </p>
                <p className="text-[11px] text-white/80">Asesor RutApp · En línea</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg hover:bg-white/15 transition"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f7f8fb] px-3 py-4 space-y-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-[#0060e8] text-white rounded-br-sm"
                      : "bg-white text-gray-900 rounded-bl-sm ring-1 ring-black/5"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-a:text-[#0060e8] prose-a:font-semibold prose-strong:text-gray-900">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="underline"
                              target={href?.startsWith("http") ? "_blank" : undefined}
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm ring-1 ring-black/5">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {msgs.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs bg-white border border-[#0060e8]/30 text-[#0060e8] rounded-full px-3 py-1.5 hover:bg-[#0060e8] hover:text-white transition font-medium"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t bg-white p-3 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Escribe tu pregunta…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0060e8]/40 focus:border-[#0060e8] max-h-28"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-10 w-10 shrink-0 rounded-xl bg-[#0060e8] text-white grid place-items-center hover:bg-[#0048b3] disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="text-[10px] text-gray-400 text-center pb-2 px-3 bg-white">
            Cristóbal es un asistente IA. Para soporte humano: WhatsApp +52 1 317 104 5954
          </p>
        </div>
      )}
    </>
  );
}
