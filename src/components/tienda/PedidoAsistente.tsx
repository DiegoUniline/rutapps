import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Mic, MicOff, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import { formatMoney, fnPost, useTienda } from "@/tienda/TiendaContext";

type Candidate = {
  id: string;
  producto_id: string;
  nombre: string;
  sku: string | null;
  imagen_url: string | null;
  unidad: string | null;
  precio: number;
  stock: number;
  vender_sin_stock: boolean;
  presentacion_id: string | null;
  factor_base: number;
  confidence: number;
};

type ResultItem = {
  query: string;
  cantidad: number;
  match: Candidate | null;
  alternatives: Candidate[];
};

const MAX_AUDIO_MS = 45_000;

export default function PedidoAsistente() {
  const t = useTienda();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<ResultItem[]>([]);
  const [selected, setSelected] = useState<Record<number, Candidate>>({});
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  const consume = (data: any) => {
    const next: ResultItem[] = data?.items ?? [];
    setTranscript(data?.text ?? "");
    setItems(next);
    const s: Record<number, Candidate> = {};
    next.forEach((it, i) => {
      const c = it.match ?? (it.alternatives?.length === 1 ? it.alternatives[0] : null);
      if (c) s[i] = c;
    });
    setSelected(s);
  };

  const sendText = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); setError(null); setItems([]);
    try {
      const data = await fnPost("tienda-asistente-pedido", { action: "interpret", slug: t.slug, token: t.token, text: text.trim() });
      consume(data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result ?? "")); r.onerror = reject; r.readAsDataURL(blob);
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
        throw new Error("Tu navegador no permite grabar audio. Puedes escribir tu pedido.");
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
        setLoading(true); setItems([]);
        try {
          const audio = await blobToBase64(blob);
          const data = await fnPost("tienda-asistente-pedido", { action: "interpret", slug: t.slug, token: t.token, audio_base64: audio, mime_type: blob.type });
          consume(data);
          setText(data?.text ?? "");
        } catch (e) { setError((e as Error).message); }
        finally { setLoading(false); }
      };
      mediaRef.current = rec; rec.start(250); setRecording(true);
      timeoutRef.current = window.setTimeout(stopRecording, MAX_AUDIO_MS);
    } catch (e) { setError((e as Error).message); }
  };

  const addResolved = () => {
    let added = 0;
    items.forEach((it, i) => {
      const p = selected[i];
      if (!p) return;
      if (p.stock <= 0 && !p.vender_sin_stock) return;
      t.addToCart({
        producto_id: p.producto_id,
        nombre: p.nombre,
        imagen_url: p.imagen_url,
        precio_unitario: p.precio,
        cantidad: it.cantidad,
        unidad: p.unidad,
        presentacion_id: p.presentacion_id,
        factor_base: p.factor_base || 1,
      });
      added++;
    });
    if (added) { setItems([]); setSelected({}); setTranscript(""); setText(""); }
  };

  const resolvedCount = items.filter((_, i) => !!selected[i]).length;
  const moneda = t.empresa?.moneda ?? "MXN";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 right-4 bottom-5 md:right-7 md:bottom-7 rounded-full shadow-xl px-4 py-3 flex items-center gap-2 font-bold text-white"
        style={{ background: "var(--tienda-primary)" }}
      >
        <Sparkles size={18} /> <span className="hidden sm:inline">Pedir con IA</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/35 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92dvh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: "var(--tienda-primary)" }}><Bot size={21} /></div>
                <div><h2 className="font-extrabold text-lg">Asistente de pedido</h2><p className="text-sm text-gray-500">Escribe o graba lo que necesitas. Yo preparo el carrito para que tú lo revises.</p></div>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              <div className="rounded-xl border bg-gray-50 p-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendText(); }}
                  placeholder="Ejemplo: Mándame 5 cajas de aceite, 10 piezas de jabón y 2 bultos de azúcar"
                  className="w-full min-h-[84px] resize-none bg-transparent outline-none text-sm"
                  maxLength={4000}
                />
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <button onClick={startRecording} disabled={loading} className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${recording ? "bg-red-50 text-red-700" : "bg-white border text-gray-700"}`}>
                    {recording ? <><MicOff size={16} /> Terminar audio</> : <><Mic size={16} /> Grabar audio</>}
                  </button>
                  <button onClick={sendText} disabled={loading || !text.trim()} className="px-4 py-2 rounded-lg text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--tienda-primary)" }}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Interpretar
                  </button>
                </div>
                {recording && <div className="text-xs text-red-600 font-semibold mt-2 animate-pulse">● Grabando… máximo 45 segundos</div>}
              </div>

              {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
              {loading && <div className="py-8 flex items-center justify-center gap-2 text-gray-500"><Loader2 className="animate-spin" size={18} /> Entendiendo tu pedido…</div>}

              {!loading && transcript && items.length > 0 && (
                <div className="text-xs text-gray-500">Entendí: <span className="font-medium text-gray-700">“{transcript}”</span></div>
              )}

              {!loading && items.map((it, i) => {
                const chosen = selected[i];
                return (
                  <div key={`${it.query}-${i}`} className="rounded-xl border p-3 space-y-2">
                    <div className="flex justify-between gap-2"><div><span className="font-bold">{it.cantidad} ×</span> <span className="text-gray-700">{it.query}</span></div>{chosen && <Check size={17} className="text-green-600 shrink-0" />}</div>
                    {it.alternatives?.length ? (
                      <div className="space-y-2">
                        {it.alternatives.map((p) => {
                          const active = chosen?.id === p.id;
                          const available = p.stock > 0 || p.vender_sin_stock;
                          return (
                            <button key={p.id} onClick={() => setSelected((s) => ({ ...s, [i]: p }))} className={`w-full text-left rounded-lg border p-2.5 flex items-center justify-between gap-3 ${active ? "ring-2 ring-blue-500/30 border-blue-500 bg-blue-50/40" : "hover:bg-gray-50"}`}>
                              <div className="min-w-0"><div className="font-semibold text-sm truncate">{p.nombre}</div><div className="text-xs text-gray-500">{p.sku ? `${p.sku} · ` : ""}{available ? (p.stock > 0 ? `${p.stock} disponibles` : "Bajo pedido") : "Agotado"}</div></div>
                              <div className="font-extrabold whitespace-nowrap">{formatMoney(p.precio, moneda)}</div>
                            </button>
                          );
                        })}
                      </div>
                    ) : <div className="text-sm text-amber-700 bg-amber-50 p-2 rounded">No encontré un producto suficientemente parecido. Prueba usando el nombre o código.</div>}
                  </div>
                );
              })}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t bg-white flex items-center justify-between gap-3">
                <div className="text-sm text-gray-500">{resolvedCount} de {items.length} renglones listos</div>
                <button onClick={addResolved} disabled={!resolvedCount} className="px-4 py-2.5 rounded-lg text-white font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--tienda-primary)" }}>
                  <ShoppingCart size={17} /> Preparar carrito
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
