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
  TrendingUp,
  Package,
  DollarSign,
  Clock,
  Store,
  Sparkles,
} from "lucide-react";
import heroImg from "@/assets/landing-v2-hero.jpg";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function CTA({
  children,
  variant = "primary",
  to = "/signup",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  to?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold tracking-wide transition-all duration-300";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white shadow-[0_10px_40px_-10px_rgba(124,92,255,0.6)] hover:shadow-[0_20px_60px_-10px_rgba(124,92,255,0.8)] hover:-translate-y-0.5"
      : "border border-white/15 text-white/90 hover:bg-white/5 hover:border-white/30";
  return (
    <Link to={to} className={`${base} ${styles} ${className}`}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export default function LandingV2Page() {
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white antialiased overflow-x-hidden">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#7C5CFF]/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-[#22D3EE]/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-[#F472B6]/10 blur-[120px]" />
      </div>

      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#1a1a2e]/70 border-b border-white/5">
        <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] grid place-items-center">
              <span className="font-black text-sm">R</span>
            </div>
            <span className="font-bold tracking-tight">Rutapp</span>
            <span className="ml-2 hidden sm:inline text-[10px] uppercase tracking-widest text-white/40 border border-white/10 rounded-full px-2 py-0.5">
              v2 preview
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#como" className="hover:text-white transition">Cómo funciona</a>
            <a href="#tienda" className="hover:text-white transition">Tienda en línea</a>
            <a href="#comparativa" className="hover:text-white transition">Comparativa</a>
            <Link to="/login" className="hover:text-white transition">Entrar</Link>
          </div>
          <CTA className="!px-5 !py-2 text-xs">Prueba gratis</CTA>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative pt-16 pb-24 sm:pt-24 sm:pb-32">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 mb-6"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Funciona sin internet
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="font-black tracking-tight text-[44px] leading-[1.02] sm:text-6xl lg:text-7xl"
            >
              Vende en ruta
              <br />
              <span className="bg-gradient-to-r from-[#7C5CFF] via-[#22D3EE] to-[#22D3EE] bg-clip-text text-transparent">
                aunque no haya señal.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-6 text-lg sm:text-xl text-white/70 max-w-xl leading-relaxed"
            >
              Tus vendedores toman pedidos, cobran y controlan inventario desde el celular,
              con o sin internet. Todo se sincroniza solo al volver la señal.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <CTA>Prueba Rutapp gratis</CTA>
              <CTA to="#como" variant="ghost">Ver cómo funciona</CTA>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="mt-8 flex flex-wrap items-center gap-6 text-xs text-white/50"
            >
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Sin tarjeta</span>
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Listo en minutos</span>
              <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Soporte en español</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-6 relative"
          >
            <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              <img
                src={heroImg}
                alt="Vendedor en ruta usando Rutapp en el celular"
                width={1536}
                height={1152}
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#1a1a2e] via-transparent to-transparent" />
            </div>

            {/* Floating offline badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="absolute -bottom-5 -left-5 sm:left-6 rounded-2xl bg-[#0f0f1e]/95 backdrop-blur border border-white/10 px-4 py-3 shadow-xl flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center">
                <WifiOff className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-xs text-white/50">Sin señal · Pedido guardado</div>
                <div className="text-sm font-semibold">Se sincroniza al volver</div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute -top-5 -right-5 sm:right-6 rounded-2xl bg-[#0f0f1e]/95 backdrop-blur border border-white/10 px-4 py-3 shadow-xl"
            >
              <div className="flex items-center gap-2 text-xs text-white/50">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Hoy
              </div>
              <div className="text-lg font-bold mt-0.5">+$12,480</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* VILLANO / PROBLEMA */}
      <section className="py-20 sm:py-28 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <motion.div {...fadeUp} className="text-center mb-14">
            <span className="text-xs uppercase tracking-[0.3em] text-rose-400/80">El día de hoy</span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              Cada pedido en papel es <span className="text-rose-400">dinero que se cae.</span>
            </h2>
            <p className="mt-5 text-white/60 text-lg max-w-2xl mx-auto">
              El vendedor anda en zona sin señal, anota pedidos a mano, llega a la oficina a
              recapturar todo, alguien comete un error y el cliente no recibe lo que pidió.
              La venta se pierde. Otra vez.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: FileText, t: "Pedidos en papel", d: "Se pierden, se mojan, se traspapelean." },
              { icon: WifiOff, t: "Ventas que se caen", d: "Sin señal el sistema no sirve." },
              { icon: RefreshCw, t: "Recaptura en oficina", d: "Doble trabajo, doble error." },
            ].map((it, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-2xl border border-rose-500/10 bg-rose-500/[0.03] p-6"
              >
                <it.icon className="h-6 w-6 text-rose-400/80 mb-3" />
                <div className="font-semibold">{it.t}</div>
                <div className="text-sm text-white/50 mt-1">{it.d}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como" className="py-20 sm:py-32 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div {...fadeUp} className="text-center mb-16">
            <span className="text-xs uppercase tracking-[0.3em] text-[#22D3EE]">Cómo funciona</span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              Un plan simple. Tres pasos.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: "01",
                icon: Smartphone,
                t: "Vende desde el celular",
                d: "Tu vendedor levanta pedidos, cobra y descuenta inventario en su zona. Con o sin internet.",
                grad: "from-[#7C5CFF] to-[#A78BFA]",
              },
              {
                n: "02",
                icon: Package,
                t: "Rutapp lo guarda todo",
                d: "Pedido, cobro, entrega e inventario quedan registrados al instante en el celular.",
                grad: "from-[#22D3EE] to-[#7C5CFF]",
              },
              {
                n: "03",
                icon: RefreshCw,
                t: "Se sincroniza solo",
                d: "Al volver la señal, todo sube a la nube. Cero recaptura, cero errores.",
                grad: "from-emerald-400 to-[#22D3EE]",
              },
            ].map((s, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-7 hover:border-white/20 transition"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${s.grad} grid place-items-center shadow-lg`}>
                    <s.icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-5xl font-black text-white/5">{s.n}</span>
                </div>
                <div className="text-lg font-semibold">{s.t}</div>
                <p className="mt-2 text-white/60 text-sm leading-relaxed">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ANTES / DESPUÉS */}
      <section className="py-20 sm:py-32 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div {...fadeUp} className="text-center mb-14">
            <span className="text-xs uppercase tracking-[0.3em] text-emerald-400">Antes → Después</span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              Así cambia tu operación.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              { before: "Pedidos perdidos en el block", after: "Cero pedidos perdidos", icon: FileText },
              { before: "Sin señal = sin ventas", after: "Vende sin señal, en cualquier lado", icon: WifiOff },
              { before: "Inventario que no cuadra", after: "Inventario al día, en tiempo real", icon: Package },
              { before: "Horas de recaptura nocturna", after: "Sin recaptura. Cierra el día y a casa", icon: Clock },
            ].map((b, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex items-center gap-5"
              >
                <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-[#7C5CFF]/30 to-[#22D3EE]/20 grid place-items-center">
                  <b.icon className="h-6 w-6 text-[#22D3EE]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-rose-400/70 line-through truncate">{b.before}</div>
                  <div className="text-base sm:text-lg font-semibold mt-0.5">{b.after}</div>
                </div>
                <Check className="h-5 w-5 text-emerald-400 shrink-0" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TIENDA EN LÍNEA */}
      <section id="tienda" className="py-20 sm:py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="relative rounded-[2rem] overflow-hidden border border-white/10 bg-gradient-to-br from-[#7C5CFF]/15 via-[#1a1a2e] to-[#22D3EE]/10 p-8 sm:p-14">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <motion.div {...fadeUp} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/80 mb-6">
                  <Sparkles className="h-3 w-3 text-[#22D3EE]" /> Incluido sin costo extra
                </motion.div>
                <motion.h2 {...fadeUp} className="text-3xl sm:text-5xl font-bold tracking-tight">
                  Vende en ruta de día,
                  <br />
                  <span className="bg-gradient-to-r from-[#22D3EE] to-[#7C5CFF] bg-clip-text text-transparent">
                    en línea las 24 horas.
                  </span>
                </motion.h2>
                <motion.p {...fadeUp} className="mt-5 text-white/70 text-lg max-w-lg leading-relaxed">
                  Rutapp incluye tu propia <strong className="text-white">tienda en línea</strong>:
                  tus clientes pasan, ven catálogo con sus precios y piden directo, hasta a las 3 am.
                  Más ventas sin contratar otro vendedor.
                </motion.p>

                <motion.ul {...fadeUp} className="mt-7 space-y-3 text-sm text-white/80">
                  {[
                    "Catálogo con los precios reales de cada cliente",
                    "Pedido entra como venta en tu sistema, listo para surtir",
                    "Tus clientes piden sin llamadas, sin WhatsApp, sin errores",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-[#22D3EE] mt-0.5 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </motion.ul>

                <motion.div {...fadeUp} className="mt-8 flex flex-wrap gap-3">
                  <CTA>Activar mi tienda</CTA>
                  <CTA to="/tienda/mi-empresa-demo" variant="ghost">Ver tienda demo</CTA>
                </motion.div>
              </div>

              {/* Mock store card */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="relative"
              >
                <div className="rounded-3xl bg-[#0a0a18] border border-white/10 p-5 shadow-2xl">
                  <div className="flex items-center gap-2 pb-4 border-b border-white/5">
                    <Store className="h-4 w-4 text-[#22D3EE]" />
                    <span className="text-xs text-white/60">tu-tienda.rutapp.mx</span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                      24/7
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {[
                      { n: "Coca Cola 600ml", p: "$29.00", c: "from-rose-500 to-rose-700" },
                      { n: "Sabritas Original", p: "$18.00", c: "from-amber-500 to-orange-600" },
                      { n: "Bonafont 1L", p: "$21.00", c: "from-sky-500 to-blue-700" },
                      { n: "Galletas Marías", p: "$28.00", c: "from-yellow-500 to-amber-600" },
                    ].map((p, i) => (
                      <div key={i} className="rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden">
                        <div className={`aspect-square bg-gradient-to-br ${p.c} opacity-80`} />
                        <div className="p-2">
                          <div className="text-[11px] text-white/70 truncate">{p.n}</div>
                          <div className="text-sm font-bold">{p.p}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-[#7C5CFF]/20 to-[#22D3EE]/20 border border-white/10 p-3">
                    <div className="text-xs text-white/70">Carrito · 4 productos</div>
                    <div className="text-sm font-bold">$96.00</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section id="comparativa" className="py-20 sm:py-32 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <motion.div {...fadeUp} className="text-center mb-14">
            <span className="text-xs uppercase tracking-[0.3em] text-[#7C5CFF]">Comparativa</span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              ¿Por qué Rutapp y no lo de siempre?
            </h2>
          </motion.div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left">
                  <th className="p-4 sm:p-5 font-medium text-white/60"></th>
                  <th className="p-4 sm:p-5 font-medium text-white/60">Papel / Excel</th>
                  <th className="p-4 sm:p-5 font-medium text-white/60">Software genérico</th>
                  <th className="p-4 sm:p-5 font-medium text-white/60">WhatsApp manual</th>
                  <th className="p-4 sm:p-5 font-semibold bg-gradient-to-r from-[#7C5CFF]/20 to-[#22D3EE]/20 text-white">Rutapp</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                {[
                  ["Funciona sin internet", false, false, false, true],
                  ["Sin recaptura", false, true, false, true],
                  ["Inventario en tiempo real", false, true, false, true],
                  ["Tienda en línea incluida", false, false, false, true],
                  ["Hecho para vender en ruta", false, false, false, true],
                ].map((row, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-4 sm:p-5 text-white/80 font-medium">{row[0]}</td>
                    {(row.slice(1) as boolean[]).map((v, j) => (
                      <td key={j} className={`p-4 sm:p-5 ${j === 3 ? "bg-gradient-to-r from-[#7C5CFF]/10 to-[#22D3EE]/10" : ""}`}>
                        {v ? (
                          <Check className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <X className="h-5 w-5 text-rose-400/60" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PRUEBA SOCIAL */}
      <section className="py-20 sm:py-28 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div {...fadeUp} className="text-center mb-14">
            <span className="text-xs uppercase tracking-[0.3em] text-emerald-400">Confianza</span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">
              Distribuidores que ya no vuelven al papel.
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-5 mb-10">
            {[
              { n: "+500", l: "Vendedores en ruta" },
              { n: "98%", l: "Sincronización exitosa offline" },
              { n: "3 hrs", l: "Ahorradas al día por vendedor" },
            ].map((s, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center"
              >
                <div className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text text-transparent">
                  {s.n}
                </div>
                <div className="mt-2 text-sm text-white/60">{s.l}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                q: "Antes perdía 4 o 5 pedidos al día por andar sin señal. Hoy mi vendedor levanta el pedido y al regresar a la oficina ya está todo capturado.",
                a: "Distribuidora del Norte",
              },
              {
                q: "La tienda en línea nos suma como 30% más pedidos a la semana sin contratar a nadie. Llegan solitos.",
                a: "Botanas Don Nacho",
              },
            ].map((t, i) => (
              <motion.blockquote
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-7"
              >
                <DollarSign className="h-5 w-5 text-emerald-400 mb-3" />
                <p className="text-white/85 text-lg leading-relaxed">"{t.q}"</p>
                <footer className="mt-4 text-sm text-white/50">— {t.a}</footer>
              </motion.blockquote>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-white/40">
            Placeholders mientras juntamos casos reales · pídeles a 2 o 3 clientes 1 frase + nombre comercial.
          </p>
        </div>
      </section>

      {/* CIERRE */}
      <section className="py-24 sm:py-36 border-t border-white/5 relative">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <motion.h2 {...fadeUp} className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
            Tu próximo pedido en ruta
            <br />
            <span className="bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text text-transparent">
              no se va a caer.
            </span>
          </motion.h2>
          <motion.p {...fadeUp} className="mt-6 text-white/60 text-lg">
            Empieza gratis hoy. En menos de 10 minutos tu primer vendedor está vendiendo offline.
          </motion.p>
          <motion.div {...fadeUp} className="mt-10 flex flex-wrap justify-center gap-3">
            <CTA>Prueba Rutapp gratis</CTA>
            <CTA to="https://wa.me/" variant="ghost">Hablar con ventas</CTA>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] grid place-items-center">
              <span className="font-black text-[10px]">R</span>
            </div>
            <span>© {new Date().getFullYear()} Rutapp · Vende en ruta, sin perder ventas.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/" className="hover:text-white/70">Landing original</Link>
            <Link to="/terminos" className="hover:text-white/70">Términos</Link>
            <Link to="/privacidad" className="hover:text-white/70">Privacidad</Link>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden p-3 bg-gradient-to-t from-[#1a1a2e] via-[#1a1a2e]/95 to-transparent">
        <CTA className="w-full !py-4">Prueba Rutapp gratis</CTA>
      </div>
    </div>
  );
}
