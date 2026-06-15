import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Handshake, DollarSign, Tag, BarChart3, ShieldCheck, CheckCircle2, ArrowRight,
  MessageCircle, Sparkles, Users, Wallet, LineChart, Link2, Gift, Rocket, TrendingUp,
} from 'lucide-react';
import heroImg from '@/assets/partners-hero.jpg';
import dashboardImg from '@/assets/partners-dashboard.jpg';
import couponImg from '@/assets/partners-coupon.jpg';
import { Seo } from '@/components/seo/Seo';

const WHATSAPP_URL = 'https://wa.me/5213171035768?text=' + encodeURIComponent('Hola, quiero ser partner de Rutapp');

const LADAS = [
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+1', flag: '🇺🇸', name: 'EE.UU. / Canadá' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+1', flag: '🇩🇴', name: 'Rep. Dominicana' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
];

const PRIMARY = 'hsl(230, 55%, 52%)';
const PRIMARY_DARK = 'hsl(230, 60%, 38%)';
const ACCENT = 'hsl(25, 100%, 55%)';

export default function PartnersLandingPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lada, setLada] = useState('+52');
  const [form, setForm] = useState({
    nombre: '', email: '', telefono: '', motivo: '', experiencia: '', redes: '',
  });

  // Página pública: limpia SW antiguo si existe para que se vean los últimos cambios.
  useEffect(() => {
    import('@/pwa/registerSW').then(({ ensureNoSWForPublicPage }) =>
      ensureNoSWForPublicPage()
    );
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    setLoading(true);
    const fullPhone = form.telefono.trim() ? `${lada} ${form.telefono.trim()}` : null;
    const { error } = await supabase.from('partner_solicitudes').insert({
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      telefono: fullPhone,
      motivo: form.motivo.trim() || null,
      experiencia: form.experiencia.trim() || null,
      redes: form.redes.trim() || null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }

    // Fire-and-forget WhatsApp welcome message (no bloquea el flujo)
    if (fullPhone) {
      supabase.functions.invoke('partner-welcome', {
        body: {
          nombre: form.nombre.trim(),
          telefono: fullPhone,
          email: form.email.trim().toLowerCase(),
        },
      }).catch(() => { /* silent */ });
    }

    setSent(true);
  };

  return (
    <div className="min-h-[100dvh] text-gray-900 bg-white">
      <Seo
        title="Programa de Partners · Rutapp"
        description="Únete al programa de partners de Rutapp: comisiones recurrentes, cupones personalizados y dashboard de ventas para socios e integradores."
        path="/partners"
      />
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-black tracking-tight" style={{ color: PRIMARY }}>Rutapp</span>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full text-white font-bold" style={{ background: ACCENT }}>PARTNERS</span>
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            <Link to="/" className="hidden sm:inline text-sm text-gray-600 hover:text-gray-900">Inicio</Link>
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900">Iniciar sesión</Link>
            <a href="#aplicar" className="px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-md hover:shadow-lg transition"
               style={{ background: PRIMARY }}>Unirme</a>
          </div>
        </div>
      </nav>

      {/* Hero con banner AI */}
      <section className="relative pt-24 pb-20 px-6 overflow-hidden">
        {/* Banner imagen de fondo */}
        <div className="absolute inset-0 -z-10">
          <img src={heroImg} alt="" width={1920} height={1080} className="w-full h-full object-cover opacity-95" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.45) 60%, rgba(255,255,255,0.95) 100%)' }} />
        </div>

        <div className="max-w-5xl mx-auto text-center pt-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur border border-indigo-100 text-indigo-700 text-xs font-semibold mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" /> Programa oficial de Partners Rutapp
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.02] mb-6 text-gray-900 drop-shadow-sm">
            Gana <span style={{ color: PRIMARY }}>comisiones</span><br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})` }}>recurrentes de por vida</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto mb-8 font-medium">
            Refiere empresas a Rutapp y cobra cada mes mientras sigan activas. Crea tus propios cupones, comparte tu link único y administra todo desde tu panel.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a href="#aplicar"
               className="inline-flex items-center gap-2 px-8 py-4 text-base font-bold text-white rounded-xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition"
               style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})` }}>
              Aplicar como Partner <ArrowRight className="h-4 w-4" />
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 px-6 py-4 text-base font-semibold rounded-xl border-2 border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50 transition">
              <MessageCircle className="h-5 w-5" /> Tengo dudas, escribir por WhatsApp
            </a>
          </div>

          {/* Stats strip */}
          <div className="mt-14 grid grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { v: 'Hasta 30%', l: 'comisión recurrente' },
              { v: 'De por vida', l: 'mientras paguen' },
              { v: '0$', l: 'costo de entrada' },
            ].map((s, i) => (
              <div key={i} className="bg-white/90 backdrop-blur rounded-2xl px-4 py-5 border border-gray-100 shadow-sm">
                <div className="text-2xl md:text-3xl font-black" style={{ color: PRIMARY }}>{s.v}</div>
                <div className="text-xs md:text-sm text-gray-600 mt-1 font-medium">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beneficios principales */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: 'hsl(230,55%,96%)', color: PRIMARY }}>BENEFICIOS</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Todo lo que necesitas para crecer</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: DollarSign, title: 'Comisión recurrente', text: 'Ganas un % de cada pago mensual de tus referidos. Mientras sigan activos, sigues cobrando.', color: PRIMARY },
              { icon: Tag, title: 'Cupones a tu marca', text: 'Crea cupones personalizados con descuentos. El descuento sale de tu comisión, tú decides cuánto regalas.', color: ACCENT },
              { icon: BarChart3, title: 'Panel completo', text: 'Dashboard con tus empresas referidas, comisiones generadas, pagadas y pendientes en tiempo real.', color: PRIMARY },
              { icon: Link2, title: 'Link único de referido', text: 'Tu link rastreable para compartir en redes, blog o WhatsApp. Atribución automática y permanente.', color: ACCENT },
              { icon: Wallet, title: 'Pagos puntuales', text: 'Transferencias mensuales una vez superes los $500 MXN acumulados. Sin trabas.', color: PRIMARY },
              { icon: ShieldCheck, title: 'Atribución de por vida', text: 'Una vez que una empresa es tuya, lo es para siempre. Sin fechas de vencimiento ni letras chicas.', color: ACCENT },
            ].map((b, i) => (
              <Card key={i} className="p-6 border-gray-100 hover:shadow-xl hover:-translate-y-1 transition group">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition"
                     style={{ background: `${b.color}15`, color: b.color }}>
                  <b.icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">{b.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{b.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Panel preview con imagen */}
      <section className="py-20 px-6" style={{ background: 'linear-gradient(135deg, hsl(230,55%,97%), hsl(25,100%,97%))' }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 bg-white" style={{ color: PRIMARY }}>TU PANEL</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-5">
              Un dashboard pensado para <span style={{ color: PRIMARY }}>partners</span>
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              Controla tu negocio de referidos como un profesional. Mide, optimiza y escala.
            </p>
            <ul className="space-y-3">
              {[
                { icon: Users, t: 'Lista de empresas referidas con su estatus de suscripción.' },
                { icon: TrendingUp, t: 'Comisiones generadas, pagadas y pendientes mes a mes.' },
                { icon: Tag, t: 'Crea, edita y desactiva tus cupones en segundos.' },
                { icon: LineChart, t: 'Reportes con gráficos de crecimiento y conversión.' },
              ].map((it, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${PRIMARY}15`, color: PRIMARY }}>
                    <it.icon className="h-4 w-4" />
                  </div>
                  <span className="text-gray-700 pt-1">{it.t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <img src={dashboardImg} alt="Panel Partners Rutapp" width={1024} height={1024} loading="lazy"
                 className="w-full rounded-3xl shadow-2xl" />
            <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl p-4 border border-gray-100 hidden sm:flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: '#10B98115', color: '#10B981' }}>
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold">Este mes</div>
                <div className="text-lg font-black text-gray-900">+$3,420 MXN</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cupones — con imagen */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="md:order-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: `${ACCENT}15`, color: ACCENT }}>CUPONES</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-5">
              Crea cupones <span style={{ color: ACCENT }}>con tu marca</span>
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              Usa cupones como herramienta de venta. Tú eliges cuánto descuento ofrecer y cuánto sacrificas de tu comisión.
            </p>
            <Card className="p-6 border-2" style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}05` }}>
              <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: ACCENT }}>Fórmula</div>
              <div className="font-mono text-xl md:text-2xl font-bold text-gray-900">
                (% Partner − % Cupón) × Monto pagado
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                  <div className="text-gray-500 text-xs">Sin cupón</div>
                  <div className="font-bold">20% × $500 = <span className="text-emerald-600">$100</span></div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                  <div className="text-gray-500 text-xs">Con cupón 5%</div>
                  <div className="font-bold">15% × $475 = <span className="text-emerald-600">$71.25</span></div>
                </div>
              </div>
            </Card>
          </div>
          <div className="md:order-1 flex justify-center">
            <img src={couponImg} alt="Cupones Partners" width={1024} height={1024} loading="lazy"
                 className="w-full max-w-md rounded-3xl" />
          </div>
        </div>
      </section>

      {/* NIVELES — Sube de comisión */}
      <section className="py-20 px-6" style={{ background: 'linear-gradient(180deg, #ffffff, hsl(230,55%,97%))' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: `${ACCENT}15`, color: ACCENT }}>NIVELES DE PARTNER</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
              Sube de nivel, <span style={{ color: PRIMARY }}>gana más</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Tu comisión crece con cada empresa activa que refieras. Empiezas en 10% y puedes llegar hasta <strong>30% recurrente</strong>.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { emoji: '🥉', nombre: 'Starter',  pct: 10, rango: '1 – 4 empresas',   color: '#CD7F32', bono: null },
              { emoji: '🥈', nombre: 'Growth',   pct: 15, rango: '5 – 14 empresas',  color: '#9CA3AF', bono: null },
              { emoji: '🥇', nombre: 'Pro',      pct: 20, rango: '15 – 29 empresas', color: '#FCD34D', bono: '+$500 bono' },
              { emoji: '💎', nombre: 'Elite',    pct: 25, rango: '30 – 59 empresas', color: '#06B6D4', bono: '+$1,500 bono', popular: true },
              { emoji: '👑', nombre: 'Legend',   pct: 30, rango: '60+ empresas',     color: '#A855F7', bono: '+$5,000 bono' },
            ].map((n, i) => (
              <Card key={i} className="relative p-5 hover:-translate-y-1 transition border-2" style={{ borderColor: n.popular ? n.color : 'transparent', background: n.popular ? `${n.color}08` : 'white' }}>
                {n.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-white shadow whitespace-nowrap" style={{ background: n.color }}>
                    MÁS POPULAR
                  </div>
                )}
                <div className="text-4xl mb-2">{n.emoji}</div>
                <div className="font-black text-lg" style={{ color: n.color }}>{n.nombre}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-black">{n.pct}%</span>
                  <span className="text-xs text-gray-500">recurrente</span>
                </div>
                <div className="text-xs text-gray-600 mt-2 font-medium">{n.rango}</div>
                {n.bono && (
                  <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${n.color}20`, color: n.color }}>
                    <Gift className="h-3 w-3" /> {n.bono}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { icon: TrendingUp, t: 'Sube automático', d: 'Al cierre de mes, si alcanzas el umbral, subes de nivel solo.' },
              { icon: ShieldCheck, t: 'Período de gracia', d: 'Si pierdes empresas, mantienes tu nivel 60 días.' },
              { icon: Rocket, t: 'Aplica al siguiente cobro', d: 'La nueva comisión se usa en las facturas posteriores.' },
            ].map((it, i) => (
              <div key={i} className="flex gap-3 bg-white p-4 rounded-xl border border-gray-100">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${PRIMARY}15`, color: PRIMARY }}>
                  <it.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">{it.t}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{it.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo empezar — pasos */}
      <section className="py-20 px-6" style={{ background: 'hsl(230, 55%, 97%)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 bg-white" style={{ color: PRIMARY }}>PROCESO</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Empezar es <span style={{ color: PRIMARY }}>muy fácil</span></h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { n: '1', icon: Rocket, t: 'Aplica', d: 'Llena el formulario o escríbenos por WhatsApp.' },
              { n: '2', icon: ShieldCheck, t: 'Aprobamos', d: 'Revisamos en 1-3 días y te damos acceso.' },
              { n: '3', icon: Gift, t: 'Comparte', d: 'Usa tu link único y crea tus cupones.' },
              { n: '4', icon: Wallet, t: 'Cobra', d: 'Recibe tu comisión cada mes por transferencia.' },
            ].map((s, i) => (
              <div key={i} className="relative">
                <Card className="p-6 h-full border-gray-100 bg-white hover:shadow-lg transition">
                  <div className="absolute -top-3 -left-3 h-9 w-9 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg"
                       style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})` }}>
                    {s.n}
                  </div>
                  <s.icon className="h-7 w-7 mb-3" style={{ color: PRIMARY }} />
                  <h3 className="font-bold text-lg mb-1">{s.t}</h3>
                  <p className="text-sm text-gray-600">{s.d}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Políticas */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: 'hsl(230,55%,96%)', color: PRIMARY }}>REGLAS DEL JUEGO</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Políticas del programa</h2>
          </div>
          <div className="space-y-3">
            {[
              'Atribución por link único de referido o cupón al momento del registro. La empresa queda asignada de forma permanente al partner.',
              'Las comisiones se generan únicamente sobre pagos efectivamente cobrados (suscripción mensual). Pagos cancelados o reembolsados no generan comisión.',
              'El cupón nunca puede ser mayor que tu porcentaje de comisión. Si lo iguala, tu comisión en esa venta es cero.',
              'Los pagos a partners se hacen manualmente vía transferencia, mínimo $500 MXN acumulados, una vez al mes.',
              'Un usuario sólo puede tener un rol: o eres cliente de Rutapp, o eres Partner. No ambos con el mismo correo.',
              'No está permitido aplicar tu propio cupón a una empresa que tú mismo controles (autoreferido). Estas comisiones se cancelan.',
              'Rutapp se reserva el derecho de suspender o dar de baja partners que incumplan estas políticas o realicen prácticas engañosas.',
              'El programa puede cambiar términos con aviso previo de 30 días para partners activos.',
            ].map((p, i) => (
              <div key={i} className="flex gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: PRIMARY }} />
                <p className="text-sm text-gray-700">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sandbox Partner */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-wider mb-3">
              🧪 Exclusivo Partners
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-3">Pruébalo antes de promocionarlo</h2>
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
              Al aprobarte como Partner recibes un <strong>Sandbox personal</strong> con todo Rutapp desbloqueado. Aprende el sistema, ensaya demos y resuelve dudas básicas de tus referidos sin necesidad de tu propia suscripción.
            </p>
          </div>

          <div className="rounded-3xl p-8 md:p-10 border-2 border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-xl">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-black mb-4 text-gray-900">¿Qué incluye tu Sandbox?</h3>
                <ul className="space-y-3 text-sm">
                  {[
                    'Hasta 10 clientes de prueba',
                    'Hasta 20 productos en tu catálogo',
                    'Hasta 50 ventas registradas',
                    'POS, App Móvil, Logística y Reportes activos',
                    'Permanente mientras seas Partner activo',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">✓</div>
                      <span className="text-gray-700">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-orange-100">
                <h4 className="text-sm font-bold text-orange-700 uppercase tracking-wider mb-3">¿Por qué con límites?</h4>
                <p className="text-sm text-gray-600 mb-4">
                  Para que ningún Partner use el Sandbox como sistema productivo gratis. Tu sandbox es tu <strong>laboratorio</strong>: aquí pruebas todo, pero los clientes reales necesitan su propia cuenta Rutapp.
                </p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>❌ Sin facturación CFDI</div>
                  <div>❌ Sin envíos masivos de WhatsApp</div>
                  <div>❌ Sin catálogo público compartible</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA WhatsApp */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl p-8 md:p-12 text-center text-white shadow-2xl"
             style={{ background: `linear-gradient(135deg, #10B981, #059669)` }}>
          <MessageCircle className="h-12 w-12 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-black mb-3">¿Tienes dudas antes de aplicar?</h2>
          <p className="text-emerald-50 mb-6 text-lg">Escríbenos directo por WhatsApp y te respondemos personalmente.</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-700 rounded-xl font-bold text-base shadow-lg hover:scale-105 transition">
            <MessageCircle className="h-5 w-5" /> Hablar por WhatsApp
          </a>
        </div>
      </section>

      {/* Form */}
      <section id="aplicar" className="py-20 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4 shadow-lg"
                 style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${ACCENT})`, color: 'white' }}>
              <Handshake className="h-7 w-7" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black mb-3">Aplica para ser Partner</h2>
            <p className="text-gray-600">Revisamos cada solicitud manualmente. Te avisaremos por correo cuando sea aprobada.</p>
          </div>

          {sent ? (
            <Card className="p-10 text-center border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">¡Solicitud enviada!</h3>
              <p className="text-gray-700 mb-6">Te enviaremos un correo cuando tu solicitud sea revisada (normalmente en 1-3 días).</p>
              <Link to="/" className="text-sm font-semibold underline" style={{ color: PRIMARY }}>Volver al inicio</Link>
            </Card>
          ) : (
            <Card className="p-8 shadow-xl border-gray-100">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre completo *</Label>
                    <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Correo electrónico *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <Label>Teléfono / WhatsApp</Label>
                  <div className="flex gap-2">
                    <select
                      value={lada}
                      onChange={e => setLada(e.target.value)}
                      className="h-10 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[130px]"
                      aria-label="Lada"
                    >
                      {LADAS.map((l, i) => (
                        <option key={`${l.code}-${i}`} value={l.code}>{l.flag} {l.name} ({l.code})</option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      value={form.telefono}
                      onChange={e => setForm({ ...form, telefono: e.target.value.replace(/[^0-9 ]/g, '') })}
                      placeholder="55 1234 5678"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>¿Por qué quieres ser Partner?</Label>
                  <Textarea rows={3} value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}
                    placeholder="Cuéntanos qué te motiva, a quién planeas referir..." />
                </div>
                <div>
                  <Label>Experiencia previa</Label>
                  <Textarea rows={2} value={form.experiencia} onChange={e => setForm({ ...form, experiencia: e.target.value })}
                    placeholder="¿Vendes software? ¿Eres consultor? ¿Tienes una agencia?" />
                </div>
                <div>
                  <Label>Redes / Sitio web</Label>
                  <Input value={form.redes} onChange={e => setForm({ ...form, redes: e.target.value })} placeholder="@usuario, link, etc." />
                </div>
                <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold text-white shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})` }}>
                  {loading ? 'Enviando...' : 'Enviar solicitud'}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  ¿Prefieres preguntar primero?{' '}
                  <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold underline">
                    Escríbenos por WhatsApp
                  </a>
                </p>
              </form>
            </Card>
          )}
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Rutapp · <Link to="/" className="hover:underline">Inicio</Link> · <Link to="/terminos" className="hover:underline">Términos</Link>
      </footer>

      {/* Floating WhatsApp */}
      <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
         className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition"
         aria-label="WhatsApp">
        <MessageCircle className="h-7 w-7" />
      </a>
    </div>
  );
}
