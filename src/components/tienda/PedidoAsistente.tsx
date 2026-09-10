import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Minus, Plus, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import { cartKeyOf, formatMoney, fnPost, useTienda } from "@/tienda/TiendaContext";

type SellerProduct = {
  id: string;
  producto_id: string;
  presentacion_id: string | null;
  factor_base: number;
  nombre: string;
  sku: string | null;
  imagen_url: string | null;
  unidad: string | null;
  precio: number;
  stock: number;
  vender_sin_stock: boolean;
  descripcion?: string | null;
  formula?: string | null;
  marca?: string | null;
  categoria?: string | null;
  cantidad_sugerida?: number;
  origen?: "catalogo" | "ultimo_pedido";
};

type SellerOperation =
  | { type: "add"; product: SellerProduct; quantity: number }
  | { type: "set_qty"; line_key: string; quantity: number }
  | { type: "remove"; line_key: string }
  | { type: "clear" };

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  products?: SellerProduct[];
  contextLabel?: string | null;
  quickReplies?: string[];
};

const MAX_AUDIO_MS = 45_000;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function PedidoAsistente() {
  const t = useTienda();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const welcomeKeyRef = useRef<string | null>(null);

  const moneda = t.empresa?.moneda ?? "MXN";
  const base = `/tienda/${t.slug}`;
  const identityKey = `${t.slug}:${t.email ?? "guest"}`;

  const cartPayload = useMemo(() => t.cart.map((item) => ({
    line_key: cartKeyOf(item.producto_id, item.presentacion_id),
    producto_id: item.producto_id,
    presentacion_id: item.presentacion_id ?? null,
    nombre: item.nombre,
    unidad: item.unidad,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
  })), [t.cart]);

  useEffect(() => {
    setMessages([]);
    welcomeKeyRef.current = null;
  }, [identityKey]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, [open, messages, loading]);

  const appendAssistant = (data: any) => {
    setMessages((prev) => [...prev, {
      id: uid(),
      role: "assistant",
      text: String(data?.message ?? "¿En qué te ayudo con tu pedido?"),
      products: Array.isArray(data?.products) ? data.products : [],
      contextLabel: data?.context_label ?? null,
      quickReplies: Array.isArray(data?.quick_replies) ? data.quick_replies : [],
    }]);
  };

  const loadWelcome = async () => {
    if (welcomeKeyRef.current === identityKey || loading) return;
    welcomeKeyRef.current = identityKey;
    setLoading(true);
    setError(null);
    try {
      const data = await fnPost("tienda-asistente-pedido", {
        action: "welcome",
        slug: t.slug,
        token: t.token,
      });
      appendAssistant(data);
    } catch (e) {
      const fallback = t.isAuth
        ? `Hola. Soy tu asesor de ${t.config?.nombre_tienda ?? "la tienda"}. Puedo ayudarte a preparar tu pedido, buscar productos o revisar opciones.`
        : `Hola. Soy tu asesor de ${t.config?.nombre_tienda ?? "la tienda"}. Cuéntame qué necesitas y te ayudo a encontrarlo.`;
      setMessages([{ id: uid(), role: "assistant", text: fallback, quickReplies: ["Quiero hacer un pedido", "Ayúdame a elegir productos"] }]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openSeller = () => {
    setOpen(true);
    window.setTimeout(loadWelcome, 0);
  };

  const latestShownProducts = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].products?.length) return messages[i].products!;
    }
    return [];
  };

  const applyOperations = (operations: SellerOperation[]) => {
    for (const op of operations ?? []) {
      if (op.type === "clear") {
        t.clearCart();
      } else if (op.type === "remove") {
        t.removeFromCart(op.line_key);
      } else if (op.type === "set_qty") {
        t.updateQty(op.line_key, op.quantity);
      } else if (op.type === "add" && op.product) {
        const p = op.product;
        t.addToCart({
          producto_id: p.producto_id,
          nombre: p.nombre,
          imagen_url: p.imagen_url,
          precio_unitario: p.precio,
          cantidad: Math.max(.01, Number(op.quantity) || 1),
          unidad: p.unidad,
          presentacion_id: p.presentacion_id,
          factor_base: p.factor_base || 1,
        });
      }
    }
  };

  const sendSeller = async (messageText?: string, audio?: { base64: string; mimeType: string }) => {
    const clean = String(messageText ?? "").trim();
    if ((!clean && !audio) || loading) return;

    const priorMessages = messages;
    if (clean) {
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: clean }]);
      setText("");
    }
    setLoading(true);
    setError(null);

    try {
      const shown = latestShownProducts();
      const history = priorMessages.slice(-12).map((m) => ({ role: m.role, text: m.text }));
      if (clean) history.push({ role: "user", text: clean });
      const data = await fnPost("tienda-asistente-pedido", {
        action: "chat",
        slug: t.slug,
        token: t.token,
        ...(clean ? { text: clean } : {}),
        ...(audio ? { audio_base64: audio.base64, mime_type: audio.mimeType } : {}),
        cart: cartPayload,
        history,
        shown_products: shown.map((p) => ({ nombre: p.nombre, producto_id: p.producto_id, presentacion_id: p.presentacion_id })),
      });

      if (audio) {
        setMessages((prev) => [...prev, { id: uid(), role: "user", text: data?.transcript ? `🎙️ ${data.transcript}` : "🎙️ Audio" }]);
      }
      applyOperations((data?.operations ?? []) as SellerOperation[]);
      appendAssistant(data);
    } catch (e) {
      setError((e as Error).message);
      setMessages((prev) => [...prev, {
        id: uid(), role: "assistant",
        text: "No pude procesar ese mensaje en este momento. Intenta de nuevo o dime el producto por nombre.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  const stopRecording = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  };

  const startRecording = async () => {
    if (recording) { stopRecording(); return; }
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Tu navegador no permite grabar audio. Puedes escribirle al vendedor.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return;
        try {
          const base64 = await blobToBase64(blob);
          await sendSeller(undefined, { base64, mimeType: blob.type || "audio/webm" });
        } catch (e) {
          setError((e as Error).message);
        }
      };
      mediaRef.current = rec;
      rec.start(250);
      setRecording(true);
      timeoutRef.current = window.setTimeout(stopRecording, MAX_AUDIO_MS);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addFromCard = (p: SellerProduct) => {
    if (p.stock <= 0 && !p.vender_sin_stock) return;
    const desired = Math.max(.01, Number(p.cantidad_sugerida) || 1);
    const qty = p.vender_sin_stock ? desired : Math.min(desired, Math.max(.01, p.stock));
    t.addToCart({
      producto_id: p.producto_id,
      nombre: p.nombre,
      imagen_url: p.imagen_url,
      precio_unitario: p.precio,
      cantidad: qty,
      unidad: p.unidad,
      presentacion_id: p.presentacion_id,
      factor_base: p.factor_base || 1,
    });
  };

  return (
    <>
      <button
        onClick={openSeller}
        className="fixed z-40 right-4 bottom-5 md:right-7 md:bottom-7 rounded-full shadow-xl px-4 py-3 flex items-center gap-2 font-bold text-white"
        style={{ background: "var(--tienda-primary)" }}
      >
        <Bot size={18} /> <span className="hidden sm:inline">Asesor de pedidos</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/25 sm:bg-transparent pointer-events-none">
          <section className="pointer-events-auto fixed inset-x-0 bottom-0 h-[92dvh] sm:inset-auto sm:right-5 sm:bottom-5 sm:w-[470px] sm:h-[min(760px,88dvh)] bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border overflow-hidden flex flex-col">
            <header className="px-4 py-3.5 border-b bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "var(--tienda-primary)" }}>
                  <Bot size={20} />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[15px] truncate">Tu asesor de ventas</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1"><Sparkles size={11} /> Productos, pedido y carrito</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-full hover:bg-gray-100" aria-label="Cerrar"><X size={18} /></button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50/70 px-3 sm:px-4 py-4 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={m.role === "user" ? "max-w-[84%]" : "w-full max-w-[94%]"}>
                    <div
                      className={m.role === "user"
                        ? "rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-white shadow-sm"
                        : "rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm bg-white border text-gray-800 shadow-sm"}
                      style={m.role === "user" ? { background: "var(--tienda-primary)" } : undefined}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                    </div>

                    {!!m.products?.length && (
                      <ProductCarousel
                        products={m.products}
                        label={m.contextLabel}
                        moneda={moneda}
                        base={base}
                        cart={t.cart}
                        addFromCard={addFromCard}
                        updateQty={t.updateQty}
                      />
                    )}

                    {m.role === "assistant" && !!m.quickReplies?.length && (
                      <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
                        {m.quickReplies.map((q) => (
                          <button key={q} onClick={() => sendSeller(q)} disabled={loading} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-50">
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm text-gray-500 shadow-sm flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> Revisando productos y tu pedido…
                  </div>
                </div>
              )}
              {error && <div className="text-[11px] text-red-600 px-1">{error}</div>}
            </div>

            <div className="shrink-0 bg-white border-t">
              {t.cartCount > 0 && (
                <Link to={`${base}/carrito`} onClick={() => setOpen(false)} className="px-4 py-2.5 border-b flex items-center justify-between gap-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingCart size={16} style={{ color: "var(--tienda-primary)" }} />
                    <span className="text-sm font-semibold truncate">Tu carrito · {t.cartCount} {t.cartCount === 1 ? "unidad" : "unidades"}</span>
                  </div>
                  <span className="text-sm font-extrabold whitespace-nowrap">{formatMoney(t.cartTotal, moneda)}</span>
                </Link>
              )}

              <div className="p-3 flex items-end gap-2">
                <button
                  onClick={startRecording}
                  disabled={loading}
                  className={`h-11 w-11 rounded-full border flex items-center justify-center shrink-0 ${recording ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  title={recording ? "Terminar audio" : "Enviar audio"}
                >
                  {recording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendSeller(text);
                    }
                  }}
                  placeholder={recording ? "Grabando audio…" : "Dile qué necesitas, pregunta por un producto…"}
                  disabled={recording}
                  rows={1}
                  maxLength={4000}
                  className="flex-1 min-h-11 max-h-28 resize-none rounded-2xl border bg-gray-50 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 disabled:opacity-50"
                />
                <button
                  onClick={() => sendSeller(text)}
                  disabled={loading || recording || !text.trim()}
                  className="h-11 w-11 rounded-full text-white flex items-center justify-center shrink-0 disabled:opacity-40"
                  style={{ background: "var(--tienda-primary)" }}
                  title="Enviar"
                >
                  <Send size={17} />
                </button>
              </div>
              {recording && <div className="px-4 pb-2.5 text-xs text-red-600 font-semibold animate-pulse">● Escuchando… vuelve a tocar el micrófono para enviar</div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ProductCarousel({
  products,
  label,
  moneda,
  base,
  cart,
  addFromCard,
  updateQty,
}: {
  products: SellerProduct[];
  label?: string | null;
  moneda: string;
  base: string;
  cart: ReturnType<typeof useTienda>["cart"];
  addFromCard: (p: SellerProduct) => void;
  updateQty: (lineKey: string, cantidad: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const scroll = (dir: number) => rowRef.current?.scrollBy({ left: dir * 230, behavior: "smooth" });

  return (
    <div className="mt-2.5 rounded-xl border bg-white p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="text-xs font-bold text-gray-700">{label || "Productos"}</div>
        {products.length > 2 && (
          <div className="hidden sm:flex gap-1">
            <button onClick={() => scroll(-1)} className="p-1 rounded border hover:bg-gray-50"><ChevronLeft size={13}/></button>
            <button onClick={() => scroll(1)} className="p-1 rounded border hover:bg-gray-50"><ChevronRight size={13}/></button>
          </div>
        )}
      </div>
      <div ref={rowRef} className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1">
        {products.map((p) => {
          const lineKey = cartKeyOf(p.producto_id, p.presentacion_id);
          const inCart = cart.find((x) => cartKeyOf(x.producto_id, x.presentacion_id) === lineKey);
          const available = p.stock > 0 || p.vender_sin_stock;
          const desc = p.descripcion || p.formula;
          return (
            <article key={p.id} className="w-[205px] min-w-[205px] snap-start rounded-xl border bg-white overflow-hidden flex flex-col">
              <Link to={`${base}/productos/${p.producto_id}`} className="block h-28 bg-gray-50 border-b overflow-hidden">
                {p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-contain" /> : <div className="h-full flex items-center justify-center text-3xl">📦</div>}
              </Link>
              <div className="p-2.5 flex-1 flex flex-col">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 truncate">{p.marca || p.categoria || p.sku || "Producto"}</div>
                <Link to={`${base}/productos/${p.producto_id}`} className="font-bold text-[13px] leading-snug mt-0.5 hover:underline" title={p.nombre}>{p.nombre}</Link>
                {desc && (
                  <div className="text-[10px] text-gray-500 leading-snug mt-1 overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{desc}</div>
                )}
                <div className="mt-auto pt-2">
                  <div className="font-extrabold text-sm">{formatMoney(p.precio, moneda)}</div>
                  <div className={`text-[10px] mt-0.5 ${available ? "text-green-700" : "text-red-600"}`}>
                    {available ? (p.stock > 0 ? `${p.stock} disponibles${p.unidad ? ` · ${p.unidad}` : ""}` : "Disponible bajo pedido") : "Agotado"}
                  </div>
                  {p.origen === "ultimo_pedido" && p.cantidad_sugerida != null && (
                    <div className="text-[10px] text-gray-500 mt-1">Último pedido: <strong>{p.cantidad_sugerida}</strong></div>
                  )}

                  {inCart ? (
                    <div className="mt-2 flex items-center justify-between rounded-lg border overflow-hidden">
                      <button onClick={() => updateQty(lineKey, inCart.cantidad - 1)} className="p-1.5 hover:bg-gray-50"><Minus size={13}/></button>
                      <span className="text-xs font-bold">{inCart.cantidad}</span>
                      <button
                        onClick={() => updateQty(lineKey, inCart.cantidad + 1)}
                        disabled={!p.vender_sin_stock && inCart.cantidad >= p.stock}
                        className="p-1.5 hover:bg-gray-50 disabled:opacity-30"
                      ><Plus size={13}/></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addFromCard(p)}
                      disabled={!available}
                      className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      style={{ background: "var(--tienda-primary)" }}
                    >
                      {p.cantidad_sugerida && p.cantidad_sugerida > 1 ? `Agregar ${p.cantidad_sugerida}` : "Agregar"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
