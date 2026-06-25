import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  WifiOff,
  ShoppingBag,
  ArrowRight,
  Check,
  X,
  FileText,
  Smartphone,
  RefreshCw,
  Package,
  Store,
  Sparkles,
  MessageCircle,
  MapPin,
  Boxes,
  AlertTriangle,
  TrendingUp,
  Radio,
  Users,
  DollarSign,
  ShoppingCart,
  Truck,
  Wallet,
  BarChart3,
  Brain,
  Award,
} from "lucide-react";
import rutappLogo from "@/assets/rutapp-logo.jpeg.asset.json";

const BRAND = {
  primary: "#0060e8",
  primarySoft: "#e6efff",
  accent: "#fe8c1a",
  ink: "#0a1530",
  ink2: "#3b4863",
  muted: "#6b7791",
  line: "#eef0f5",
  surface: "#f7f8fb",
};

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function CTAPrimary({ children, to = "/signup", className = "" }: { children: React.ReactNode; to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${className}`}
      style={{ background: BRAND.primary, boxShadow: `0 12px 30px -10px ${BRAND.primary}99` }}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function CTAGhost({ children, to = "#modulos", className = "" }: { children: React.ReactNode; to?: string; className?: string }) {
  const isHash = to.startsWith("#");
  const cls = `inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className}`;
  const style = { color: BRAND.ink, borderColor: BRAND.line };
  return isHash ? (
    <a href={to} className={cls} style={style}>{children}</a>
  ) : (
    <Link to={to} className={cls} style={style}>{children}</Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-white"
      style={{ borderColor: BRAND.line, color: BRAND.primary }}>
      {children}
    </div>
  );
}

const modulos = [
  { icon: ShoppingCart, t: "Ventas", d: "POS, preventa y pedidos sugeridos por cliente. El vendedor deja de improvisar." },
  { icon: DollarSign, t: "Cobranza", d: "Cobro multi-folio FIFO automático. Un pago aplica a las facturas más viejas." },
  { icon: Package, t: "Inventario", d: "Multi-almacén y kardex. Qué hay, dónde y cuánto, en tiempo real." },
  { icon: Truck, t: "Logística", d: "Surtido, carga y rutas con GPS optimizado. El camión sale con lo justo." },
  { icon: Boxes, t: "Compras", d: "Órdenes y proveedores con sugerencias de IA. Sin faltantes ni sobrecompras." },
  { icon: Users, t: "Clientes", d: "CRM con historial completo. Qué compra cada quien y qué dejó de comprar." },
  { icon: Wallet, t: "Finanzas", d: "Cuentas por cobrar, por pagar y gastos, en un solo lugar." },
  { icon: Award, t: "Comisiones", d: "Reglas por vendedor, calculadas solas." },
  { icon: BarChart3, t: "Reportes", d: "Operativos y auditables. Auditas en segundos lo que antes tardaba días." },
  { icon: Brain, t: "IA", d: "Tu asesor inteligente, trabajando 24/7." },
];

const asesores = [
  { icon: Boxes, t: "Reponer", d: "Coca 600ml caerá a crítico en 3 días. Comprar 240.", tone: BRAND.primary },
  { icon: AlertTriangle, t: "Riesgo de fuga", d: "Don Pepe bajó 38% sus compras. Visita prioritaria.", tone: "#dc2626" },
  { icon: TrendingUp, t: "Destacado", d: "Juan L. va 12% arriba de meta. Replica su ruta.", tone: "#16a34a" },
  { icon: Radio, t: "Anomalía", d: "3 ventas bajo costo en la última hora. Revisar.", tone: "#7c3aed" },
];

const planes = [
  { nombre: "Individual", precio: "$450", usuarios: "1 usuario", extra: "extra $300/mes", popular: false },
  { nombre: "Equipo", precio: "$900", usuarios: "3 usuarios", extra: "extra $300/mes", popular: true },
  { nombre: "Empresa", precio: "$1,500", usuarios: "5 usuarios", extra: "extra $300/mes", popular: false },
];

const comparativa = [
  ["Funciona sin internet", false, false, false, true],
  ["Sin recaptura", false, false, false, true],
  ["Inventario en tiempo real", false, "Parcial", false, true],
  ["Tienda en línea incluida", false, false, false, true],
  ["Hecho para vender en ruta", false, false, false, true],
  ["Implementación", "—", "Meses", "—", "Días"],
] as const;

export default function LandingV2Page() {
  return (
    <div className="min-h-screen font-[Lato] antialiased" style={{ background: "#fff", color: BRAND.ink }}>
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b backdrop-blur bg-white/85" style={{ borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={rutappLogo.url} alt="Rutapp" className="h-8 w-auto rounded-md" />
            <span className="text-[15px] font-bold tracking-tight">Rutapp</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium" style={{ color: BRAND.ink2 }}>
            <a href="#modulos" className="hover:text-[color:var(--brand-primary,#0060e8)]">Módulos</a>
            <a href="#ia" className="hover:text-[color:var(--brand-primary,#0060e8)]">IA</a>
            <a href="#tienda" className="hover:text-[color:var(--brand-primary,#0060e8)]">Tienda</a>
            <a href="#precios" className="hover:text-[color:var(--brand-primary,#0060e8)]">Precios</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-3 py-1.5 text-[13px] font-medium hidden sm:inline" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
            <Link to="/signup" className="px-3.5 py-1.5 text-[13px] font-semibold text-white rounded-lg" style={{ background: BRAND.primary }}>
              Probar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* 1. HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(65% 55% at 50% 0%, ${BRAND.primarySoft} 0%, transparent 65%)` }} />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <SectionLabel><WifiOff className="h-3 w-3" /> Funciona sin internet</SectionLabel>
            <h1 className="mt-4 text-[34px] sm:text-[44px] md:text-[56px] font-bold leading-[1.05] tracking-tight" style={{ letterSpacing: "-0.035em" }}>
              Vende en ruta{" "}
              <span className="relative inline-block">
                aunque no haya señal.
                <span className="absolute left-0 right-0 -bottom-1.5 h-1.5 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent})` }} />
              </span>
            </h1>
            <p className="mt-5 text-[16px] md:text-[18px] leading-relaxed" style={{ color: BRAND.ink2 }}>
              Tus vendedores toman pedidos, cobran y controlan inventario desde el celular —con o sin internet—. Todo se sincroniza solo al volver la señal.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <CTAPrimary to="/signup">Prueba Rutapp gratis</CTAPrimary>
              <CTAGhost to="#modulos">Ver cómo funciona</CTAGhost>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px]" style={{ color: BRAND.muted }}>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Sin tarjeta</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Listo en minutos</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Soporte en español</span>
            </div>
          </motion.div>

          {/* Hero visual mock */}
          <motion.div {...fadeUp} className="relative">
            <div className="relative rounded-2xl overflow-hidden border bg-white shadow-xl" style={{ borderColor: BRAND.line }}>
              <div className="aspect-[4/5] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <Smartphone className="h-32 w-32" style={{ color: BRAND.primary }} strokeWidth={1.2} />
              </div>
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-white shadow-md border" style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                  <WifiOff className="h-3 w-3 text-red-500" /> Sin señal · Pedido guardado
                </div>
                <div className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-white shadow-md" style={{ background: BRAND.accent }}>
                  Hoy +$12,480
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4 px-3 py-2.5 rounded-lg bg-white shadow-md border flex items-center gap-2" style={{ borderColor: BRAND.line }}>
                <RefreshCw className="h-4 w-4" style={{ color: BRAND.primary }} />
                <span className="text-[12px] font-medium" style={{ color: BRAND.ink2 }}>Se sincroniza al volver la señal</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. PROBLEMA */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <motion.div {...fadeUp} className="max-w-2xl">
            <SectionLabel>El problema</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Cada pedido en papel es dinero que se cae.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              El vendedor anda en zona sin señal, anota pedidos a mano, llega a la oficina a recapturar todo, alguien comete un error y el cliente no recibe lo que pidió. La venta se pierde. Otra vez.
            </p>
          </motion.div>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              { icon: FileText, t: "Pedidos en papel", d: "Se pierden, se mojan, se traspapelean." },
              { icon: WifiOff, t: "Ventas que se caen", d: "Sin señal, el sistema de siempre no sirve." },
              { icon: RefreshCw, t: "Recaptura en oficina", d: "Doble trabajo, doble error." },
            ].map((p, i) => (
              <motion.div key={p.t} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-xl p-5 bg-white border" style={{ borderColor: BRAND.line }}>
                <p.icon className="h-6 w-6" style={{ color: BRAND.accent }} />
                <h3 className="mt-3 text-[16px] font-semibold">{p.t}</h3>
                <p className="mt-1.5 text-[14px]" style={{ color: BRAND.ink2 }}>{p.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. CÓMO FUNCIONA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel>Cómo funciona</SectionLabel>
          <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Un plan simple. Tres pasos.
          </h2>
        </motion.div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {[
            { n: "01", t: "Vende desde el celular", d: "Tu vendedor levanta pedidos, cobra y descuenta inventario en su zona. Con o sin internet.", icon: Smartphone },
            { n: "02", t: "Rutapp lo guarda todo", d: "Pedido, cobro, entrega e inventario quedan registrados al instante en el celular.", icon: Package },
            { n: "03", t: "Se sincroniza solo", d: "Al volver la señal, todo sube a la nube. Cero recaptura, cero errores.", icon: RefreshCw },
          ].map((s, i) => (
            <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}
              className="rounded-2xl p-6 border bg-white" style={{ borderColor: BRAND.line }}>
              <div className="flex items-center justify-between">
                <span className="text-[36px] font-bold" style={{ color: BRAND.primarySoft }}>{s.n}</span>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: BRAND.primarySoft }}>
                  <s.icon className="h-5 w-5" style={{ color: BRAND.primary }} />
                </div>
              </div>
              <h3 className="mt-2 text-[18px] font-semibold">{s.t}</h3>
              <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 4. ANTES → DESPUÉS */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <motion.h2 {...fadeUp} className="text-[28px] md:text-[40px] font-bold tracking-tight text-center" style={{ letterSpacing: "-0.03em" }}>
            Antes → Después
          </motion.h2>
          <div className="mt-10 grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {[
              ["Pedidos perdidos en el block", "Cero pedidos perdidos"],
              ["Sin señal = sin ventas", "Vende sin señal, en cualquier lado"],
              ["Inventario que no cuadra", "Inventario al día, en tiempo real"],
              ["Horas de recaptura nocturna", "Sin recaptura: cierra el día y a casa"],
            ].map(([a, b], i) => (
              <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.05 }}
                className="rounded-xl bg-white border p-5 flex items-center gap-4" style={{ borderColor: BRAND.line }}>
                <div className="flex-1">
                  <div className="text-[12px] uppercase tracking-wider font-semibold text-red-600/80">Antes</div>
                  <div className="text-[14px] line-through" style={{ color: BRAND.muted }}>{a}</div>
                </div>
                <ArrowRight className="h-5 w-5" style={{ color: BRAND.primary }} />
                <div className="flex-1">
                  <div className="text-[12px] uppercase tracking-wider font-semibold" style={{ color: BRAND.primary }}>Después</div>
                  <div className="text-[14px] font-medium">{b}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. MÓDULOS */}
      <section id="modulos" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel>Módulos</SectionLabel>
          <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Toda tu distribuidora en una sola pantalla.
          </h2>
          <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
            No es una app de ventas más. Son 10 módulos que trabajan juntos —no 10 apps sueltas que no se hablan entre sí.
          </p>
        </motion.div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modulos.map((m, i) => (
            <motion.div key={m.t} {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 6) * 0.05 }}
              className="rounded-xl p-5 border bg-white hover:shadow-md transition-shadow" style={{ borderColor: BRAND.line }}>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center mb-3" style={{ background: BRAND.primarySoft }}>
                <m.icon className="h-5 w-5" style={{ color: BRAND.primary }} />
              </div>
              <h3 className="text-[16px] font-semibold">{m.t}</h3>
              <p className="mt-1.5 text-[13.5px]" style={{ color: BRAND.ink2 }}>{m.d}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <CTAPrimary>Probar gratis</CTAPrimary>
        </div>
      </section>

      {/* 6. AGENTE AI WHATSAPP */}
      <section id="ia" className="border-y" style={{ background: BRAND.ink, color: "#fff", borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/15 bg-white/5">
              <MessageCircle className="h-3 w-3" /> WhatsApp · IA
            </div>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Pídele reportes a tu negocio. Por WhatsApp.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px] text-white/75">
              Tu Agente AI vive en WhatsApp. Le escribes "ventas de hoy" o "cobranza de la semana" y te responde al instante. Y te manda reportes automáticos cuando tú lo decidas.
            </p>
            <ul className="mt-6 space-y-3 text-[14px] text-white/85">
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Chatea en lenguaje natural — "¿Cuánto vendí ayer?".</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Reportes automáticos diarios, semanales o programados.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Entiende ventas, cobranza, inventario y rutas.</li>
            </ul>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 items-start">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white" style={{ background: BRAND.accent }}>
                Yo lo quiero <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-[13px] text-white/70 self-center">Solo <b className="text-white">$69 MXN</b> extra al mes.</div>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <div className="h-9 w-9 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Rutapp AI</div>
                <div className="text-[11px] text-white/60">en línea</div>
              </div>
            </div>
            <div className="space-y-3 text-[13.5px]">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-[#005c4b] text-white">
                Mándame las ventas de hoy 📊
              </div>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white/10 text-white">
                Ventas de hoy: <b>💰 $48,250 MXN</b> · 🧾 23 tickets · 👥 18 clientes. Subiendo 12% vs ayer ↑
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 7. ASESOR IA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel><Sparkles className="h-3 w-3" /> Asesor IA</SectionLabel>
          <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            IA que te dice qué hacer hoy.
          </h2>
          <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
            Lee tus datos todos los días, detecta lo que importa y te avisa. Sin reportes que nadie lee.
          </p>
        </motion.div>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {asesores.map((a, i) => (
            <motion.div key={a.t} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              className="rounded-xl p-5 border bg-white flex gap-4" style={{ borderColor: BRAND.line }}>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.tone}15` }}>
                <a.icon className="h-5 w-5" style={{ color: a.tone }} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold">{a.t}</h3>
                <p className="mt-1 text-[14px]" style={{ color: BRAND.ink2 }}>{a.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div {...fadeUp} className="mt-10 max-w-2xl mx-auto text-center">
          <p className="text-[18px] md:text-[20px] font-medium italic" style={{ color: BRAND.ink }}>
            "Tienes un analista trabajando 24/7 sin contratarlo."
          </p>
        </motion.div>
      </section>

      {/* 8. TIENDA EN LÍNEA */}
      <section id="tienda" className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <SectionLabel><Store className="h-3 w-3" /> Incluida sin costo extra</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Vende en ruta de día, en línea las 24 horas.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              Rutapp incluye tu propia tienda en línea. Tus clientes entran, ven el catálogo con SUS precios y piden directo —hasta a las 3 am—. Más ventas sin contratar otro vendedor.
            </p>
            <ul className="mt-6 space-y-3 text-[14px]" style={{ color: BRAND.ink2 }}>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> Catálogo con los precios reales de cada cliente.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> El pedido entra como venta en tu sistema, listo para surtir.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> Sin llamadas, sin WhatsApp manual, sin errores.</li>
            </ul>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <CTAPrimary>Activar mi tienda</CTAPrimary>
              <CTAGhost to="/tienda/mi-empresa-demo">Ver tienda demo</CTAGhost>
            </div>
          </motion.div>
          <motion.div {...fadeUp} className="rounded-2xl border bg-white shadow-lg overflow-hidden" style={{ borderColor: BRAND.line }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between text-[12px]" style={{ borderColor: BRAND.line, color: BRAND.muted }}>
              <span>tu-tienda.rutapp.mx</span>
              <span className="px-2 py-0.5 rounded-full text-white font-bold text-[10px]" style={{ background: BRAND.accent }}>24/7</span>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
                  <div className="aspect-square rounded bg-slate-100 flex items-center justify-center mb-2">
                    <Package className="h-8 w-8" style={{ color: BRAND.primary }} />
                  </div>
                  <div className="text-[12px] font-semibold">Producto {n}</div>
                  <div className="text-[13px] font-bold" style={{ color: BRAND.primary }}>${(n * 87).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: BRAND.line }}>
              <div className="inline-flex items-center gap-2 text-[13px] font-medium">
                <ShoppingBag className="h-4 w-4" style={{ color: BRAND.primary }} /> 3 productos
              </div>
              <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold text-white" style={{ background: BRAND.primary }}>Pedir</button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 9. SUPERVISOR EN VIVO */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <SectionLabel><MapPin className="h-3 w-3" /> Supervisor en vivo</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Mira a todo tu equipo en un mapa.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              Ubicación, ventas del día, batería y última visita —sin llamarles ni mandar un solo WhatsApp.
            </p>
          </motion.div>
          <motion.div {...fadeUp} className="rounded-2xl border overflow-hidden shadow-lg aspect-[4/3] relative" style={{ borderColor: BRAND.line, background: "linear-gradient(135deg, #e6efff 0%, #f7f8fb 100%)" }}>
            <div className="absolute inset-0">
              {[
                { x: "25%", y: "30%", n: "Juan", s: "En cliente", b: 82 },
                { x: "65%", y: "45%", n: "Pedro", s: "En ruta", b: 64 },
                { x: "40%", y: "65%", n: "Ana", s: "Cobrando", b: 91 },
                { x: "78%", y: "75%", n: "Luis", s: "En ruta", b: 47 },
              ].map((p) => (
                <div key={p.n} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
                  <div className="px-2 py-1 rounded-md bg-white shadow-md border text-[10px] font-semibold mb-1" style={{ borderColor: BRAND.line }}>
                    {p.n} · {p.b}%
                  </div>
                  <div className="h-5 w-5 rounded-full border-2 border-white shadow mx-auto" style={{ background: BRAND.primary }} />
                  <div className="text-[10px] mt-1 text-center" style={{ color: BRAND.muted }}>{p.s}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 10. COMPARATIVA */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-5xl px-4 py-16 md:py-20">
          <motion.h2 {...fadeUp} className="text-[28px] md:text-[40px] font-bold tracking-tight text-center" style={{ letterSpacing: "-0.03em" }}>
            ¿Por qué Rutapp y no lo de siempre?
          </motion.h2>
          <motion.div {...fadeUp} className="mt-10 rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: BRAND.line }}>
            <table className="w-full text-[13.5px] min-w-[600px]">
              <thead>
                <tr style={{ color: BRAND.muted }}>
                  <th className="text-left p-4 font-semibold">Capacidad</th>
                  <th className="p-4 font-semibold">Papel/Excel</th>
                  <th className="p-4 font-semibold">Genérico</th>
                  <th className="p-4 font-semibold">WhatsApp</th>
                  <th className="p-4 font-semibold" style={{ color: BRAND.primary }}>Rutapp</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map((row, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: BRAND.line }}>
                    <td className="p-4 font-medium">{row[0]}</td>
                    {row.slice(1).map((cell, j) => (
                      <td key={j} className="p-4 text-center">
                        {cell === true ? <Check className="h-5 w-5 mx-auto" style={{ color: BRAND.primary }} />
                          : cell === false ? <X className="h-4 w-4 mx-auto" style={{ color: BRAND.muted }} />
                          : <span className="text-[12.5px]" style={{ color: BRAND.ink2 }}>{cell}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* 11. CONFIANZA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.h2 {...fadeUp} className="text-[28px] md:text-[40px] font-bold tracking-tight text-center" style={{ letterSpacing: "-0.03em" }}>
          Distribuidores que ya no vuelven al papel.
        </motion.h2>
        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            ["+500", "vendedores en ruta"],
            ["98%", "sync exitosa offline"],
            ["3 hrs", "ahorradas al día por vendedor"],
          ].map(([n, l], i) => (
            <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: BRAND.line }}>
              <div className="text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: BRAND.primary }}>{n}</div>
              <div className="mt-1 text-[13.5px]" style={{ color: BRAND.ink2 }}>{l}</div>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 grid md:grid-cols-2 gap-4">
          {[
            { q: "Antes perdía 4 o 5 pedidos al día por andar sin señal. Hoy mi vendedor levanta el pedido y al regresar a la oficina ya está todo capturado.", a: "Distribuidora del Norte" },
            { q: "La tienda en línea nos suma como 30% más pedidos a la semana sin contratar a nadie. Llegan solitos.", a: "Botanas Don Nacho" },
          ].map((t, i) => (
            <motion.figure key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              className="rounded-2xl border bg-white p-6" style={{ borderColor: BRAND.line }}>
              <blockquote className="text-[15px] md:text-[16px] leading-relaxed" style={{ color: BRAND.ink }}>"{t.q}"</blockquote>
              <figcaption className="mt-4 text-[13px] font-semibold" style={{ color: BRAND.primary }}>— {t.a}</figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* 12. PRECIOS */}
      <section id="precios" className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <SectionLabel>Precios</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Simple. Sin sorpresas.
            </h2>
            <p className="mt-3 text-[14px]" style={{ color: BRAND.ink2 }}>
              7 días gratis · cancela cuando quieras · sin tarjeta al registrarte.
            </p>
          </motion.div>
          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {planes.map((p, i) => (
              <motion.div key={p.nombre} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className={`relative rounded-2xl p-7 border bg-white ${p.popular ? "shadow-xl md:scale-[1.03]" : ""}`}
                style={{ borderColor: p.popular ? BRAND.primary : BRAND.line }}>
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: BRAND.accent }}>
                    ⭐ Más popular
                  </div>
                )}
                <h3 className="text-[18px] font-bold">{p.nombre}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[36px] font-bold tracking-tight" style={{ color: BRAND.ink }}>{p.precio}</span>
                  <span className="text-[13px]" style={{ color: BRAND.muted }}>MXN/mes</span>
                </div>
                <p className="mt-1 text-[13px]" style={{ color: BRAND.ink2 }}>{p.usuarios} · {p.extra}</p>
                <Link to="/signup" className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white"
                  style={{ background: p.popular ? BRAND.primary : BRAND.ink }}>
                  Empezar 7 días gratis
                </Link>
              </motion.div>
            ))}
          </div>
          <motion.p {...fadeUp} className="mt-8 text-center text-[13px]" style={{ color: BRAND.ink2 }}>
            Todos incluyen: acceso completo · app móvil tolerante a cortes · IA incluida · soporte por WhatsApp.<br />
            Agente AI por WhatsApp: <b>+$69 MXN/mes</b>.
          </motion.p>
        </div>
      </section>

      {/* 13. CTA FINAL */}
      <section className="relative overflow-hidden" style={{ background: BRAND.ink, color: "#fff" }}>
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ background: `radial-gradient(50% 60% at 50% 50%, ${BRAND.primary} 0%, transparent 70%)` }} />
        <div className="relative mx-auto max-w-3xl px-4 py-20 md:py-28 text-center">
          <motion.h2 {...fadeUp} className="text-[30px] md:text-[44px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Tu próximo pedido en ruta no se va a caer.
          </motion.h2>
          <motion.p {...fadeUp} className="mt-5 text-[15px] md:text-[17px] text-white/75">
            Empieza gratis hoy. En menos de 10 minutos tu primer vendedor está vendiendo offline.
          </motion.p>
          <motion.div {...fadeUp} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-[14px] font-semibold text-white"
              style={{ background: BRAND.primary, boxShadow: `0 12px 30px -10px ${BRAND.primary}` }}>
              Prueba Rutapp gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="https://wa.me/" target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-[14px] font-semibold border border-white/20 text-white hover:bg-white/5">
              Hablar con ventas
            </a>
          </motion.div>
          <p className="mt-5 text-[12.5px] text-white/60">
            7 días gratis · sin tarjeta al registrarte · si decides quedarte, cobramos el día 8.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 border-t" style={{ borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-[12.5px]" style={{ color: BRAND.muted }}>
          <div className="flex items-center gap-2">
            <img src={rutappLogo.url} alt="Rutapp" className="h-6 w-auto rounded" />
            <span className="font-semibold" style={{ color: BRAND.ink }}>Rutapp</span>
            <span>· © {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-5">
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/signup">Probar gratis</Link>
            <a href="#precios">Precios</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
