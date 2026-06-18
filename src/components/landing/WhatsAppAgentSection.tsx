import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, MessageCircle, Mic, Send, Sparkles } from 'lucide-react';

const BRAND = { primary: '#0060e8', line: '#eef0f5' };
const WA = '#25D366';

export function WhatsAppAgentSection() {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="max-w-7xl mx-auto mt-16 md:mt-24">
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-3xl border p-6 md:p-12 wa-section-bg ${inView ? 'wa-in-view' : ''}`}
        style={{ borderColor: BRAND.line }}
      >
        <style>{`
          .wa-section-bg {
            background: linear-gradient(135deg, #0b1d14 0%, #0f2e1f 45%, #123d28 100%);
            background-size: 200% 200%;
            animation: waGradient 10s ease infinite;
          }
          @keyframes waGradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes waPhoneFloat {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-14px) rotate(1.2deg); }
          }
          .wa-phone-float {
            animation: waPhoneFloat 5.5s ease-in-out infinite;
          }
          .wa-left {
            opacity: 0;
            transform: translateY(24px);
            transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
          }
          .wa-right {
            opacity: 0;
            transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.25s;
          }
          .wa-in-view .wa-left {
            opacity: 1;
            transform: translateY(0);
            transition-delay: 0.1s;
          }
          .wa-in-view .wa-right {
            opacity: 1;
          }
          .wa-bubble {
            opacity: 0;
            transform: translateY(16px) scale(0.86);
            transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
          }
          .wa-in-view .wa-bubble.b1 { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.45s; }
          .wa-in-view .wa-bubble.b2 { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.7s; }
          .wa-in-view .wa-bubble.b3 { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.95s; }
          .wa-in-view .wa-bubble.b4 { opacity: 1; transform: translateY(0) scale(1); transition-delay: 1.15s; }
          .wa-jarvis {
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.5s ease 0.35s;
          }
          .wa-in-view .wa-jarvis {
            opacity: 1;
            transform: translateY(0);
          }
          .wa-price {
            opacity: 0;
            transform: translateX(-12px);
            transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.85s;
            box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.35);
            animation: waPricePulse 2.2s ease-in-out infinite 1.5s;
          }
          .wa-in-view .wa-price {
            opacity: 1;
            transform: translateX(0);
          }
          @keyframes waPricePulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.35); }
            50% { box-shadow: 0 0 18px 4px rgba(37, 211, 102, 0.22); }
          }
          .wa-price-dot {
            box-shadow: 0 0 8px rgba(37, 211, 102, 0.6);
          }
        `}</style>

        {/* glow blobs */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-30 blur-3xl animate-pulse" style={{ background: WA }} />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full opacity-20 blur-3xl animate-pulse" style={{ background: BRAND.primary }} />

        <div className="relative grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          {/* Left copy */}
          <div className="wa-left text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 backdrop-blur px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: WA }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: WA }} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Nuevo · Agente AI por WhatsApp</span>
            </div>

            <div className="wa-jarvis mt-3 flex items-center gap-2 text-[11px] text-white/70">
              <Sparkles className="h-3 w-3" style={{ color: WA }} />
              <span>Potenciado por AI de</span>
              <a
                href="https://JarvisAi.mx"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white underline decoration-[#25D366]/60 hover:text-[#25D366] transition-colors"
              >
                JarvisAi.mx
              </a>
            </div>

            <h2 className="mt-4 text-[30px] md:text-[44px] font-semibold leading-[1.05] tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              Pídele reportes a tu negocio.{' '}
              <span style={{ color: WA }}>Por WhatsApp.</span>
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px] text-white/75 max-w-xl leading-relaxed">
              Tu Agente AI vive en WhatsApp. Le escribes "ventas de hoy" o "cobranza de la semana" y te responde al instante. Además te envía reportes automáticos cuando tú decides.
            </p>

            <ul className="mt-6 space-y-3">
              {[
                { icon: MessageCircle, t: 'Chatea en lenguaje natural', d: '"¿Cuánto vendí ayer?", "Top 5 clientes del mes"' },
                { icon: Send, t: 'Reportes automáticos a tu WA', d: 'Diario, semanal o cuando lo programes' },
                { icon: Bot, t: 'Entiende tu negocio', d: 'Ventas, cobranza, inventario, rutas y más' },
              ].map((f) => (
                <li key={f.t} className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg grid place-items-center" style={{ background: 'rgba(37,211,102,0.18)' }}>
                    <f.icon className="h-4 w-4" style={{ color: WA }} />
                  </div>
                  <div>
                    <div className="text-[14.5px] font-semibold text-white">{f.t}</div>
                    <div className="text-[12.5px] text-white/60">{f.d}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                style={{ background: WA }}
              >
                Yo lo quiero <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <div className="wa-price inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm">
                <span className="inline-flex h-2 w-2 rounded-full bg-[#25D366] animate-pulse" />
                Solo $69 pesos extras al mes
              </div>
            </div>
          </div>

          {/* Right phone mockup */}
          <div className="wa-right relative mx-auto w-full max-w-[340px]">
            <div className="wa-phone-float relative rounded-[36px] border-[10px] border-black/80 bg-[#0b141a] shadow-2xl overflow-hidden" style={{ aspectRatio: '9 / 18' }}>
              {/* WA header */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#075E54' }}>
                <div className="h-9 w-9 rounded-full grid place-items-center" style={{ background: BRAND.primary }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-white leading-tight">Rutapp AI</div>
                  <div className="text-[10.5px] text-white/70">en línea</div>
                </div>
              </div>

              {/* chat body */}
              <div className="px-3 py-4 space-y-2.5" style={{ background: '#0b141a', minHeight: '70%' }}>
                <div className="wa-bubble b1 ml-auto max-w-[78%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px] text-[#111] shadow" style={{ background: '#DCF8C6' }}>
                  Mándame las ventas de hoy 📊
                </div>
                <div className="wa-bubble b2 max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-[12.5px] text-white/95 shadow" style={{ background: '#1f2c34' }}>
                  <div className="font-semibold mb-1" style={{ color: WA }}>Ventas de hoy</div>
                  <div className="text-white/80">💰 $48,250 MXN</div>
                  <div className="text-white/80">🧾 23 tickets</div>
                  <div className="text-white/80">👥 18 clientes</div>
                  <div className="mt-1.5 text-[11px] text-white/55">Subiendo 12% vs ayer ↑</div>
                </div>
                <div className="wa-bubble b3 ml-auto max-w-[78%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12.5px] text-[#111] shadow" style={{ background: '#DCF8C6' }}>
                  Y cobranza pendiente?
                </div>
                <div className="wa-bubble b4 max-w-[80%] rounded-2xl rounded-tl-sm px-3 py-2 text-[12.5px] text-white/95 shadow" style={{ background: '#1f2c34' }}>
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>

              {/* WA input bar */}
              <div className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-2.5" style={{ background: '#1f2c34' }}>
                <div className="flex-1 rounded-full px-3 py-1.5 text-[11.5px] text-white/50" style={{ background: '#2a3942' }}>
                  Escribe a tu Agente AI…
                </div>
                <div className="h-8 w-8 rounded-full grid place-items-center" style={{ background: WA }}>
                  <Mic className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
