from pathlib import Path

p = Path('src/components/tienda/PedidoAsistente.tsx')
s = p.read_text()

old = 'import { Bot, ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Minus, Plus, Send, ShoppingCart, Sparkles, X } from "lucide-react";'
new = 'import { Bot, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Minus, Plus, Send, ShoppingCart, Sparkles, X } from "lucide-react";'
assert old in s
s = s.replace(old, new, 1)

old = '''const MAX_AUDIO_MS = 45_000;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;'''
new = '''const MAX_AUDIO_MS = 45_000;
const INTRO_VISIT_LIMIT = 5;
const ASSISTANT_NAME = "Juan López";
const ASSISTANT_ROLE = "Asesor de pedidos con IA";
// Lovable colocará aquí la foto final fotorealista de Juan López.
// Mientras no exista el archivo, la UI muestra un fallback limpio con sus iniciales.
const JUAN_AVATAR_SRC = "/juan-lopez-asesor.webp";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function JuanAvatar({ size = 44, className = "" }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative overflow-hidden rounded-full shrink-0 border-2 border-white shadow-sm bg-gradient-to-br from-gray-100 to-gray-200 ${className}`}
      style={{ width: size, height: size }}
      aria-label={ASSISTANT_NAME}
    >
      {!failed ? (
        <img
          src={JUAN_AVATAR_SRC}
          alt={ASSISTANT_NAME}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-black text-gray-700" style={{ fontSize: Math.max(12, size * .3) }}>
          JL
        </div>
      )}
    </div>
  );
}'''
assert old in s
s = s.replace(old, new, 1)

old = '''  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);'''
new = '''  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);'''
assert old in s
s = s.replace(old, new, 1)

old = '''  useEffect(() => {
    setMessages([]);
    welcomeKeyRef.current = null;
  }, [identityKey]);

  useEffect(() => () => {'''
new = '''  useEffect(() => {
    setMessages([]);
    welcomeKeyRef.current = null;
  }, [identityKey]);

  // Las primeras 5 sesiones de cada cliente/visitante presentan a Juan
  // proactivamente. Se cuenta una sola vez por sesión del navegador.
  useEffect(() => {
    const visitsKey = `tienda:juan-lopez:intro-visits:${identityKey}`;
    const sessionKey = `tienda:juan-lopez:intro-session:${identityKey}`;
    let visits = Number.parseInt(localStorage.getItem(visitsKey) ?? "0", 10);
    if (!Number.isFinite(visits) || visits < 0) visits = 0;

    if (!sessionStorage.getItem(sessionKey)) {
      visits += 1;
      localStorage.setItem(visitsKey, String(visits));
      sessionStorage.setItem(sessionKey, "1");
    }

    setShowHow(false);
    setIntroOpen(false);
    if (visits <= INTRO_VISIT_LIMIT) {
      const timer = window.setTimeout(() => setIntroOpen(true), 350);
      return () => window.clearTimeout(timer);
    }
  }, [identityKey]);

  useEffect(() => {
    if (open || introOpen) {
      setNudgeVisible(false);
      return;
    }
    const showTimer = window.setTimeout(() => setNudgeVisible(true), 1200);
    const hideTimer = window.setTimeout(() => setNudgeVisible(false), 10000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [open, introOpen, identityKey]);

  useEffect(() => () => {'''
assert old in s
s = s.replace(old, new, 1)

old = '''  const openSeller = () => {
    setOpen(true);
    window.setTimeout(loadWelcome, 0);
  };'''
new = '''  const openSeller = () => {
    setIntroOpen(false);
    setShowHow(false);
    setNudgeVisible(false);
    setOpen(true);
    window.setTimeout(loadWelcome, 0);
  };'''
assert old in s
s = s.replace(old, new, 1)

old = '''      <button
        onClick={openSeller}
        className="fixed z-40 right-4 bottom-5 md:right-7 md:bottom-7 rounded-full shadow-xl px-4 py-3 flex items-center gap-2 font-bold text-white"
        style={{ background: "var(--tienda-primary)" }}
      >
        <Bot size={18} /> <span className="hidden sm:inline">Asesor de pedidos</span>
      </button>

      {open && ('''
new = '''      {!open && nudgeVisible && !introOpen && (
        <div className="fixed z-40 right-4 md:right-7 bottom-[100px] md:bottom-[112px] max-w-[270px] rounded-2xl border bg-white px-3.5 py-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
          <button onClick={openSeller} className="text-left">
            <div className="text-sm font-bold text-gray-900">¿Te ayudo con tu pedido?</div>
            <div className="text-xs text-gray-500 mt-0.5">Escríbeme o mándame un audio y lo armamos juntos.</div>
          </button>
          <button onClick={() => setNudgeVisible(false)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border shadow-sm flex items-center justify-center text-gray-500" aria-label="Cerrar aviso"><X size={12}/></button>
        </div>
      )}

      <button
        onClick={openSeller}
        className="fixed z-40 right-4 bottom-5 md:right-7 md:bottom-7 max-w-[calc(100vw-2rem)] rounded-2xl border bg-white shadow-2xl px-2.5 py-2 flex items-center gap-3 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,0,0,.18)]"
        aria-label={`Hablar con ${ASSISTANT_NAME}`}
      >
        <div className="relative">
          <span className="absolute inset-0 rounded-full opacity-25 animate-ping" style={{ background: "var(--tienda-primary)" }} />
          <JuanAvatar size={48} />
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white" />
        </div>
        <div className="pr-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm text-gray-900 truncate">{ASSISTANT_NAME}</span>
            <Sparkles size={13} style={{ color: "var(--tienda-primary)" }} />
          </div>
          <div className="text-[11px] text-gray-600 truncate">{ASSISTANT_ROLE}</div>
          <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">● En línea · Responde al instante</div>
        </div>
      </button>

      {introOpen && !open && (
        <div className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-200" onMouseDown={(e) => { if (e.target === e.currentTarget) setIntroOpen(false); }}>
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl border animate-in zoom-in-95 slide-in-from-bottom-3 duration-300">
            <button onClick={() => setIntroOpen(false)} className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/90 border shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50" aria-label="Cerrar"><X size={17}/></button>

            <div className="px-6 pt-7 pb-5 text-center bg-gradient-to-b from-gray-50 to-white">
              <div className="relative w-fit mx-auto mb-3">
                <span className="absolute inset-0 rounded-full opacity-20 animate-ping" style={{ background: "var(--tienda-primary)" }} />
                <JuanAvatar size={92} className="ring-4 ring-white" />
                <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-emerald-500 border-[3px] border-white" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-gray-950">Hola, soy {ASSISTANT_NAME}</h2>
              <div className="mt-1 text-sm font-bold" style={{ color: "var(--tienda-primary)" }}>{ASSISTANT_ROLE}</div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 max-w-md mx-auto">
                Puedo ayudarte a encontrar productos, recomendarte opciones y preparar tu pedido más rápido. Escríbeme o mándame un audio y yo te ayudo.
              </p>
            </div>

            <div className="px-6 pb-6">
              <div className="grid gap-2.5 text-sm text-gray-700">
                {["Encuentro productos por nombre, código o descripción", "Te sugiero opciones según lo que necesitas", "Puedo agregar, quitar o ajustar cantidades", "También puedo ayudarte a repetir tu último pedido"].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {showHow && (
                <div className="mt-4 rounded-2xl border bg-gray-50 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-gray-500 mb-2">Así puedes pedirme</div>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>“Juan, ponme 5 cajas de aceite y 10 piezas de jabón.”</div>
                    <div>“Muéstrame opciones más económicas de este producto.”</div>
                    <div>“Repite mi último pedido, pero agrega 3 más del primero.”</div>
                    <div className="flex items-center gap-2 text-gray-500"><Mic size={15}/> También puedes mandarme el pedido por audio.</div>
                  </div>
                </div>
              )}

              <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
                <button onClick={openSeller} className="rounded-xl px-4 py-3 text-sm font-extrabold text-white shadow-sm" style={{ background: "var(--tienda-primary)" }}>
                  Quiero hacer mi pedido
                </button>
                <button onClick={() => setShowHow((v) => !v)} className="rounded-xl border px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
                  {showHow ? "Ocultar guía" : "Ver cómo funciona"}
                </button>
              </div>
              <button onClick={() => setIntroOpen(false)} className="w-full mt-2 text-xs font-semibold text-gray-400 hover:text-gray-600 py-1">Cerrar por ahora</button>
            </div>
          </div>
        </div>
      )}

      {open && ('''
assert old in s
s = s.replace(old, new, 1)

old = '''                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "var(--tienda-primary)" }}>
                  <Bot size={20} />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[15px] truncate">Tu asesor de ventas</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1"><Sparkles size={11} /> Productos, pedido y carrito</div>
                </div>'''
new = '''                <div className="relative shrink-0">
                  <JuanAvatar size={44} />
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[15px] truncate">{ASSISTANT_NAME}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1"><Sparkles size={11} /> {ASSISTANT_ROLE} · <span className="text-emerald-600 font-semibold">En línea</span></div>
                </div>'''
assert old in s
s = s.replace(old, new, 1)

old = '''                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={m.role === "user" ? "max-w-[84%]" : "w-full max-w-[94%]"}>'''
new = '''                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start items-start"}>
                  {m.role === "assistant" && <div className="mr-2 pt-0.5"><JuanAvatar size={28} /></div>}
                  <div className={m.role === "user" ? "max-w-[84%]" : "w-full max-w-[88%]"}>'''
assert old in s
s = s.replace(old, new, 1)

s = s.replace('Revisando productos y tu pedido…', 'Juan está revisando productos y tu pedido…')
s = s.replace('Dile qué necesitas, pregunta por un producto…', 'Escríbele a Juan qué necesitas o pregunta por un producto…')

p.write_text(s)

p = Path('supabase/functions/tienda-asistente-pedido/seller.ts')
s = p.read_text()
old = 'return `Hola${input.cliente?.contacto ? `, ${input.cliente.contacto}` : input.cliente?.nombre ? `, ${input.cliente.nombre}` : ""}. Claro, te ayudo a preparar tu pedido. ¿Qué necesitas hoy?`;'
new = 'return `Hola${input.cliente?.contacto ? `, ${input.cliente.contacto}` : input.cliente?.nombre ? `, ${input.cliente.nombre}` : ""}. Soy Juan López, tu asesor de pedidos con IA. Claro, te ayudo a preparar tu pedido. ¿Qué necesitas hoy?`;'
assert old in s
s = s.replace(old, new, 1)

old = 'Actúa como un vendedor senior B2B de la tienda indicada. Eres atento, claro, ágil y conoces el catálogo a detalle. Tu objetivo es ayudar al cliente a comprar bien, no presionarlo.'
new = 'Eres Juan López, vendedor senior B2B y asesor de pedidos con IA de la tienda indicada. Eres atento, claro, ágil, humano en el trato y conoces el catálogo a detalle. Tu objetivo es ayudar al cliente a comprar bien, detectar oportunidades útiles y acompañarlo hasta dejar su pedido listo, sin presionarlo.'
assert old in s
s = s.replace(old, new, 1)

old = 'message: `${greeting} Soy tu asesor de ${storeName}.${last}`,'
new = 'message: `${greeting} Soy Juan López, tu asesor de pedidos con IA de ${storeName}.${last}`,'
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
