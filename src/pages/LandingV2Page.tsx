import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
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
  Zap,
  Eye,
  ShieldAlert,
  PiggyBank,
  Percent,
  Clock,
  ClipboardX,
  TrendingDown,
  Receipt,
} from "lucide-react";
import rutappLogo from "@/assets/rutapp-logo.jpeg.asset.json";

import imgPapel from "@/assets/landing/papel-vendedor.jpg";
import imgHeroReal from "@/assets/landing/hero-vendedor-real.jpg";
import imgVentas from "@/assets/landing/mod-ventas.jpg";
import imgCobranza from "@/assets/landing/mod-cobranza.jpg";
import imgInventario from "@/assets/landing/mod-inventario.jpg";
import imgLogistica from "@/assets/landing/mod-logistica.jpg";
import imgClientes from "@/assets/landing/mod-clientes.jpg";
import imgComprasIA from "@/assets/landing/compras-ia.jpg";
import imgTienda from "@/assets/landing/tienda-online.jpg";
import imgAIAnalisis from "@/assets/landing/ai-analisis.jpg";
import imgWhatsapp from "@/assets/landing/whatsapp-ai.jpg";
import imgMapa from "@/assets/landing/supervisor-mapa.jpg";
import {
  MobileVentasScreen, DashboardScreen, POSScreen, KardexScreen,
  TiendaScreen, ComprasIAScreen, SupervisorScreen,
} from "@/components/landing/SystemMocks";
import { Counter } from "@/components/landing/Counter";

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
    <Link to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${className}`}
      style={{ background: BRAND.primary, boxShadow: `0 12px 30px -10px ${BRAND.primary}99` }}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
function CTAGhost({ children, to = "#modulos", className = "" }: { children: React.ReactNode; to?: string; className?: string }) {
  const isHash = to.startsWith("#");
  const cls = `inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className}`;
  const style = { color: BRAND.ink, borderColor: BRAND.line };
  return isHash ? <a href={to} className={cls} style={style}>{children}</a>
    : <Link to={to} className={cls} style={style}>{children}</Link>;
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-white"
      style={{ borderColor: BRAND.line, color: BRAND.primary }}>{children}</div>
  );
}

type Modulo = {
  icon: any; t: string; d: string; img: string;
  bullets: string[];
};

const modulos: Modulo[] = [
  { icon: ShoppingCart, t: "Ventas", img: imgVentas,
    d: "POS, preventa y pedidos sugeridos por cliente.",
    bullets: ["Pedido sugerido por historial", "Lista de precios por cliente", "Promociones automáticas", "Funciona offline al 100%"] },
  { icon: DollarSign, t: "Cobranza", img: imgCobranza,
    d: "Cobro multi-folio FIFO automático.",
    bullets: ["Un pago aplica a varias facturas", "Recibos térmicos al instante", "Liquidación de ruta automática", "Saldo del cliente en tiempo real"] },
  { icon: Package, t: "Inventario", img: imgInventario,
    d: "Multi-almacén y kardex completo.",
    bullets: ["Stock por almacén y ruta", "Kardex con cada movimiento", "Conteos físicos desde móvil", "Traspasos con doble confirmación"] },
  { icon: Truck, t: "Logística", img: imgLogistica,
    d: "Surtido, carga y rutas con GPS.",
    bullets: ["Ruta optimizada (vecino + 2-opt)", "Carga/descarga con tolerancias", "Entregas con firma y foto", "Devoluciones documentadas"] },
  { icon: Boxes, t: "Compras inteligentes", img: imgComprasIA,
    d: "Sugerencias de IA por demanda y temporada.",
    bullets: ["IA detecta faltantes 3 días antes", "Sugiere cantidad por proveedor", "Histórico de costos por OC", "Saldo a proveedor automático"] },
  { icon: Users, t: "Clientes", img: imgClientes,
    d: "CRM con historial completo y geolocalización.",
    bullets: ["Mapa de cobertura", "Última compra y producto top", "Frecuencia y ticket promedio", "Visita programada"] },
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
  ["Compras sugeridas por IA", false, false, false, true],
  ["Tienda en línea incluida", false, false, false, true],
  ["Asesor IA + WhatsApp", false, false, false, true],
  ["Hecho para vender en ruta", false, false, false, true],
  ["Implementación", "—", "Meses", "—", "Días"],
] as const;

const unicas = [
  { icon: WifiOff, t: "Vende sin señal", d: "El único POS de ruta que sigue trabajando cuando se cae el internet. Tus pedidos, cobros y entregas quedan guardados y suben solos al regresar.", color: BRAND.primary },
  { icon: Brain, t: "Compras inteligentes con IA", d: "La IA analiza tu venta histórica, estacionalidad y stock, y te dice qué comprar y cuánto. Adiós a sobrecompras y faltantes en días pico.", color: "#7c3aed" },
  { icon: MessageCircle, t: "Reportes por WhatsApp", d: "Pídele a tu negocio cualquier dato por WhatsApp y te responde al instante. Cobranza, ventas, top clientes. Nadie más lo tiene.", color: "#16a34a" },
  { icon: Store, t: "Tienda en línea incluida", d: "Tus clientes piden 24/7 con SUS precios reales, y el pedido entra directo a tu sistema. Sin costo extra.", color: BRAND.accent },
];

function ModuloCard({ m, i }: { m: Modulo; i: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 6) * 0.05 }}
      className="group rounded-2xl border bg-white overflow-hidden hover:shadow-xl transition-all flex flex-col"
      style={{ borderColor: BRAND.line }}>
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        <img src={m.img} alt={m.t} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute top-3 left-3 h-9 w-9 rounded-lg bg-white/95 backdrop-blur flex items-center justify-center shadow">
          <m.icon className="h-4.5 w-4.5" style={{ color: BRAND.primary }} />
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-[17px] font-bold">{m.t}</h3>
        <p className="mt-1.5 text-[13.5px] flex-1" style={{ color: BRAND.ink2 }}>{m.d}</p>
        {open && (
          <ul className="mt-3 space-y-1.5 text-[13px]" style={{ color: BRAND.ink2 }}>
            {m.bullets.map((b) => (
              <li key={b} className="flex gap-2"><Check className="h-4 w-4 shrink-0 mt-0.5" style={{ color: BRAND.primary }} />{b}</li>
            ))}
          </ul>
        )}
        <button onClick={() => setOpen((o) => !o)}
          className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold self-start"
          style={{ color: BRAND.primary }}>
          {open ? "Ver menos" : "Ver más"} <ArrowRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </div>
    </motion.div>
  );
}

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
            <a href="#unicas">Lo que nadie tiene</a>
            <a href="#modulos">Módulos</a>
            <a href="#ia">IA</a>
            <a href="#tienda">Tienda</a>
            <a href="#precios">Precios</a>
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
        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-20 md:pt-20 md:pb-28 grid md:grid-cols-2 gap-12 items-center">
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
              <CTAGhost to="#unicas">Ver lo que nadie tiene</CTAGhost>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px]" style={{ color: BRAND.muted }}>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Sin tarjeta</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Listo en minutos</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Soporte en español</span>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="relative">
            {/* Real vendor photo — protagonista */}
            <div className="relative">
              <div className="rounded-3xl overflow-hidden border shadow-2xl" style={{ borderColor: BRAND.line }}>
                <img
                  src={imgHeroReal}
                  alt="Vendedor real usando Rutapp en su celular en una tienda de abarrotes"
                  width={1280}
                  height={960}
                  className="w-full h-auto object-cover aspect-[4/3]"
                />
              </div>
              <div className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shadow-lg" style={{ background: BRAND.accent }}>
                Hoy +$12,480
              </div>
              <div className="absolute bottom-3 left-3 z-30 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shadow-lg backdrop-blur" style={{ background: `${BRAND.primary}ee` }}>
                <span className="inline-flex items-center gap-1"><WifiOff className="h-3 w-3" /> Sin señal · funcionando</span>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* STATS BAND — animated counters */}
      <section className="relative overflow-hidden" style={{ background: BRAND.ink }}>
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: `radial-gradient(45% 80% at 20% 50%, ${BRAND.primary}55 0%, transparent 60%), radial-gradient(40% 80% at 85% 50%, ${BRAND.accent}40 0%, transparent 60%)`,
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-white text-center">
          {[
            { end: 1200, suffix: "+", label: "Empresas activas" },
            { end: 4.8, decimals: 1, suffix: "M", prefix: "$", label: "Vendidos al mes" },
            { end: 99.9, decimals: 1, suffix: "%", label: "Uptime ruta offline" },
            { end: 32, suffix: "%", label: "Menos faltantes con IA" },
          ].map((s) => (
            <motion.div
              key={s.label}
              {...fadeUp}
              className="flex flex-col items-center"
            >
              <div
                className="text-[34px] md:text-[48px] font-bold leading-none tracking-tight"
                style={{ letterSpacing: "-0.035em" }}
              >
                <Counter
                  end={s.end}
                  prefix={s.prefix}
                  suffix={s.suffix}
                  decimals={s.decimals ?? 0}
                />
              </div>
              <div className="mt-2 text-[12.5px] uppercase tracking-wider text-white/70">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
        {/* Países */}
        <div className="relative border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-white/85">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/55">Ya nos usan en</span>
            {[
              { f: "🇲🇽", n: "México" },
              { f: "🇵🇪", n: "Perú" },
              { f: "🇨🇴", n: "Colombia" },
              { f: "🇨🇱", n: "Chile" },
            ].map((c) => (
              <span key={c.n} className="inline-flex items-center gap-2 text-[14px] font-medium">
                <span className="text-[20px] leading-none">{c.f}</span> {c.n}
              </span>
            ))}
          </div>
        </div>
      </section>




      {/* 2. ADIÓS AL PAPEL */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp} className="relative">
            <div className="rounded-2xl overflow-hidden border shadow-xl" style={{ borderColor: BRAND.line }}>
              <img src={imgPapel} alt="Vendedor anotando pedidos en papel" loading="lazy" className="w-full h-auto object-cover aspect-[4/3]" width={1280} height={896} />
            </div>
            <div className="absolute -top-3 -left-3 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white shadow-lg" style={{ background: "#dc2626" }}>
              😩 Así NO
            </div>
          </motion.div>
          <motion.div {...fadeUp}>
            <SectionLabel>Lo que te está costando dinero hoy</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Cada día sin control es dinero que se te escapa.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              El vendedor en zona sin señal, mercancía que desaparece sin explicación, precios que nadie respeta, y al final del mes nadie sabe cuánto se ganó de verdad. ¿Te suena?
            </p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3">
              {[
                ["Pedidos en papel", "Se pierden, se mojan, se traspapelean.", FileText],
                ["Ventas que se caen sin señal", "El sistema de siempre no sirve fuera de oficina.", WifiOff],
                ["Recaptura en oficina", "Doble trabajo, doble error, doble costo.", RefreshCw],
                ["Robo hormiga", "Producto que sale del almacén y nadie sabe a dónde fue.", ShieldAlert],
                ["No conoces tu utilidad real", "Vendes mucho pero al final del mes no queda nada.", PiggyBank],
                ["Descuentos sin control", "Cada vendedor regala precios y nadie revisa.", Percent],
                ["Sobrecompras y faltantes", "Compras lo que no se vende y te falta lo que sí.", TrendingDown],
                ["Cobranza olvidada", "Clientes que deben hace meses y nadie los persigue.", Clock],
                ["Inventario que no cuadra", "El sistema dice una cosa, el almacén otra.", ClipboardX],
                ["Tickets sin folio ni control", "No hay forma de auditar nada después.", Receipt],
              ].map(([t, d, Icon]: any) => (
                <li key={t} className="flex gap-3 rounded-xl bg-white p-4 border" style={{ borderColor: BRAND.line }}>
                  <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: BRAND.accent }} />
                  <div>
                    <div className="text-[14px] font-semibold">{t}</div>
                    <div className="text-[13px]" style={{ color: BRAND.ink2 }}>{d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

        </div>
      </section>

      {/* 3. LO QUE NADIE TIENE */}
      <section id="unicas" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel><Zap className="h-3 w-3" /> Lo que nadie más tiene</SectionLabel>
          <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Funciones que sí mueven la aguja.
          </h2>
          <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
            No es "otro sistema más". Esto es lo que te va a hacer ganar dinero desde el día 1.
          </p>
        </motion.div>
        <div className="mt-12 grid sm:grid-cols-2 gap-5">
          {unicas.map((u, i) => (
            <motion.div key={u.t} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              className="rounded-2xl p-6 border bg-white hover:shadow-lg transition-shadow" style={{ borderColor: BRAND.line }}>
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: `${u.color}15` }}>
                <u.icon className="h-6 w-6" style={{ color: u.color }} />
              </div>
              <h3 className="mt-4 text-[18px] font-bold">{u.t}</h3>
              <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>{u.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 4. CÓMO FUNCIONA */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <SectionLabel>Cómo funciona</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>Un plan simple. Tres pasos.</h2>
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
            6 módulos centrales + finanzas, comisiones, reportes e IA. Todo conectado, no 10 apps sueltas.
          </p>
        </motion.div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {modulos.map((m, i) => <ModuloCard key={m.t} m={m} i={i} />)}
        </div>
        <div className="mt-10 grid sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
          {[
            { icon: Wallet, t: "Finanzas" },
            { icon: Award, t: "Comisiones" },
            { icon: BarChart3, t: "Reportes" },
            { icon: Brain, t: "IA 24/7" },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border bg-white p-4 text-center" style={{ borderColor: BRAND.line }}>
              <x.icon className="h-5 w-5 mx-auto" style={{ color: BRAND.primary }} />
              <div className="mt-1.5 text-[13px] font-semibold">{x.t}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <CTAPrimary>Probar gratis</CTAPrimary>
        </div>
      </section>

      {/* 6. ASESOR IA + DATOS */}
      <section id="ia" className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <SectionLabel><Sparkles className="h-3 w-3" /> Asesor IA integrado</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              IA que analiza tus datos y te dice qué hacer hoy.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              Lee tus ventas, cobranza e inventario todos los días, detecta lo que importa y te avisa. Sin reportes que nadie lee.
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              {asesores.map((a) => (
                <div key={a.t} className="rounded-xl p-4 border bg-white flex gap-3" style={{ borderColor: BRAND.line }}>
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.tone}15` }}>
                    <a.icon className="h-4.5 w-4.5" style={{ color: a.tone }} />
                  </div>
                  <div>
                    <h3 className="text-[13.5px] font-semibold">{a.t}</h3>
                    <p className="mt-0.5 text-[12.5px]" style={{ color: BRAND.ink2 }}>{a.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[16px] font-medium italic" style={{ color: BRAND.ink }}>
              "Tienes un analista trabajando 24/7 sin contratarlo."
            </p>
          </motion.div>
          <motion.div {...fadeUp}>
            <DashboardScreen />
          </motion.div>

        </div>
      </section>

      {/* 7. AGENTE AI WHATSAPP */}
      <section className="relative overflow-hidden" style={{ background: BRAND.ink, color: "#fff" }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/15 bg-white/5">
              <MessageCircle className="h-3 w-3" /> WhatsApp · IA
            </div>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Pídele reportes a tu negocio. Por WhatsApp.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px] text-white/75">
              Tu Agente AI vive en WhatsApp. Le escribes "ventas de hoy" o "cobranza de la semana" y te responde al instante.
            </p>
            <ul className="mt-6 space-y-3 text-[14px] text-white/85">
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Chatea en lenguaje natural.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Reportes automáticos diarios o programados.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.accent }} /> Entiende ventas, cobranza, inventario y rutas.</li>
            </ul>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 items-start">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white" style={{ background: BRAND.accent }}>
                Yo lo quiero <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-[13px] text-white/70 self-center">Solo <b className="text-white">$69 MXN</b> extra al mes.</div>
            </div>
          </motion.div>
          <motion.div {...fadeUp} className="grid gap-4">
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-xl">
              <img src={imgWhatsapp} alt="Dueño de tienda recibiendo reportes por WhatsApp" loading="lazy" className="w-full h-auto object-cover aspect-[4/3]" width={1024} height={768} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="space-y-2.5 text-[13.5px]">
                <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-[#005c4b] text-white">
                  Mándame las ventas de hoy 📊
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white/10 text-white">
                  <b>💰 $48,250 MXN</b> · 🧾 23 tickets · 👥 18 clientes. Subiendo 12% vs ayer ↑
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 8. TIENDA EN LÍNEA */}
      <section id="tienda" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp} className="order-2 md:order-1">
            <SectionLabel><Store className="h-3 w-3" /> Incluida sin costo extra</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Vende en ruta de día, en línea las 24 horas.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              Rutapp incluye tu propia tienda en línea. Tus clientes entran, ven el catálogo con SUS precios y piden directo —hasta a las 3 am—.
            </p>
            <ul className="mt-6 space-y-3 text-[14px]" style={{ color: BRAND.ink2 }}>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> Catálogo con los precios reales de cada cliente.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> El pedido entra como venta en tu sistema, listo para surtir.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> Sin llamadas, sin WhatsApp manual, sin errores.</li>
              <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} /> Tu logo, tu banner, tu dominio.</li>
            </ul>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <CTAPrimary>Activar mi tienda</CTAPrimary>
              <CTAGhost to="/tienda/mi-empresa-demo">Ver tienda demo</CTAGhost>
            </div>
          </motion.div>
          <motion.div {...fadeUp} className="order-1 md:order-2 relative">
            <TiendaScreen />
            <div className="absolute -top-3 -right-3 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shadow-lg z-10" style={{ background: BRAND.accent }}>
              ⚡ Abierto 24/7
            </div>
          </motion.div>

        </div>
      </section>

      {/* 9. SUPERVISOR */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <SectionLabel><MapPin className="h-3 w-3" /> Supervisor en vivo</SectionLabel>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              Mira a todo tu equipo en un mapa.
            </h2>
            <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
              Ubicación, ventas del día, batería y última visita —sin llamarles ni mandar un solo WhatsApp—.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[["Vendedores", "8"], ["En ruta", "5"], ["Cerrados", "47"]].map(([t, n]) => (
                <div key={t} className="rounded-xl bg-white border p-3 text-center" style={{ borderColor: BRAND.line }}>
                  <div className="text-[22px] font-bold" style={{ color: BRAND.primary }}>{n}</div>
                  <div className="text-[11.5px]" style={{ color: BRAND.muted }}>{t}</div>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div {...fadeUp}>
            <SupervisorScreen />
          </motion.div>

        </div>
      </section>

      {/* 9.5 CAPTURAS DEL SISTEMA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
          <SectionLabel><Eye className="h-3 w-3" /> Capturas del sistema</SectionLabel>
          <h2 className="mt-3 text-[28px] md:text-[40px] font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Así se ve Rutapp por dentro.
          </h2>
          <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: BRAND.ink2 }}>
            Pantallas reales del sistema. POS rápido, Kardex granular y compras sugeridas por IA.
          </p>
        </motion.div>
        <div className="mt-12 space-y-10">
          <motion.div {...fadeUp} className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <SectionLabel>POS · Punto de venta</SectionLabel>
              <h3 className="mt-2 text-[22px] font-bold">Cobra en segundos, con o sin internet.</h3>
              <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                Promociones 2x1 automáticas, lista de precios por cliente, lector de código de barras y recibo térmico al instante.
              </p>
            </div>
            <div className="order-1 md:order-2"><POSScreen /></div>
          </motion.div>

          <motion.div {...fadeUp} className="grid md:grid-cols-2 gap-8 items-center">
            <div><KardexScreen /></div>
            <div>
              <SectionLabel>Kardex granular</SectionLabel>
              <h3 className="mt-2 text-[22px] font-bold">Cada movimiento, rastreable.</h3>
              <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                Ventas, compras, traspasos, devoluciones y conteos físicos — con folio y saldo después de cada movimiento. Auditas en segundos.
              </p>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <SectionLabel><Brain className="h-3 w-3" /> Compras con IA</SectionLabel>
              <h3 className="mt-2 text-[22px] font-bold">La IA te dice qué comprar y cuánto.</h3>
              <p className="mt-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                Analiza 90 días de venta, estacionalidad y stock. Te genera la OC sugerida por proveedor con cantidad óptima. Adiós a sobrecompras y faltantes.
              </p>
            </div>
            <div className="order-1 md:order-2"><ComprasIAScreen /></div>
          </motion.div>
        </div>
      </section>

      {/* 10. COMPARATIVA */}
      <section className="mx-auto max-w-5xl px-4 py-16 md:py-20">
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
      </section>

      {/* 11. CONFIANZA */}
      <section className="border-y" style={{ background: BRAND.surface, borderColor: BRAND.line }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
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
        </div>
      </section>

      {/* 12. PRECIOS */}
      <section id="precios" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
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
          Todos incluyen: acceso completo · app móvil offline · IA · soporte por WhatsApp · tienda en línea.<br />
          Agente AI por WhatsApp: <b>+$69 MXN/mes</b>.
        </motion.p>
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
