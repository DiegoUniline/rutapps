import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowRight,
  BarChart3,
  BadgeCheck,
  Beaker,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  DollarSign,
  Gift,
  Globe2,
  Handshake,
  Infinity as InfinityIcon,
  LineChart,
  Link2,
  MessageCircle,
  MousePointerClick,
  Rocket,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import heroImg from '@/assets/partners-hero.jpg';
import dashboardImg from '@/assets/partners-dashboard.jpg';
import couponImg from '@/assets/partners-coupon.jpg';
import { Seo } from '@/components/seo/Seo';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { PARTNER_LEVELS_PUBLIC, PARTNER_TERMS_VERSION } from '@/lib/partnerProgram';

const WHATSAPP_URL =
  'https://wa.me/5213171035768?text=' + encodeURIComponent('Hola, quiero ser partner de Rutapp');

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
] as const;

const BRAND = {
  ink: '#0B1327',
  inkSoft: '#344054',
  primary: '#445BD8',
  primaryDark: '#3146B8',
  primarySoft: '#EEF1FF',
  accent: '#FF6B1A',
  accentSoft: '#FFF2EA',
  green: '#0FAE78',
  greenSoft: '#EAFBF5',
  line: '#E7EAF0',
  canvas: '#F7F8FC',
} as const;

type PartnerLevel = {
  name: string;
  pct: number;
  min: number;
  max: number | null;
  range: string;
  bonus: string | null;
  tone: string;
  icon: string;
  featured?: boolean;
};

const PARTNER_LEVELS: PartnerLevel[] = PARTNER_LEVELS_PUBLIC.map((level) => ({
  name: level.nombre,
  pct: level.pct,
  min: level.min,
  max: level.max,
  range: level.max === null ? `${level.min}+ empresas` : `${level.min}–${level.max} empresas`,
  bonus: level.bono > 0 ? `+$${level.bono.toLocaleString('es-MX')} bono único` : null,
  tone: level.color,
  icon: level.emoji,
  featured: level.popular,
}));

const BENEFITS = [
  { icon: CircleDollarSign, title: 'Comisión que vuelve cada mes', text: 'Ganas un porcentaje de cada pago mensual efectivamente cobrado de tus empresas referidas.' },
  { icon: Tag, title: 'Cupones con tu estrategia', text: 'Tú decides cuánto descuento ofrecer y ves con claridad cómo impacta tu comisión.' },
  { icon: BarChart3, title: 'Panel completo', text: 'Referidos, conversiones, comisiones generadas, pendientes y pagadas en una sola vista.' },
  { icon: Link2, title: 'Link único rastreable', text: 'Comparte por WhatsApp, redes, correo o tu sitio. La atribución se registra automáticamente.' },
  { icon: Wallet, title: 'Pagos mensuales', text: 'Recibe tus comisiones por transferencia cuando superes el mínimo acumulado de $500 MXN.' },
  { icon: ShieldCheck, title: 'Atribución permanente', text: 'Una empresa correctamente atribuida permanece vinculada a tu cartera mientras siga siendo elegible.' },
] as const;

const FAQS = [
  { q: '¿Cuánto cuesta entrar al programa?', a: 'Nada. El programa de Partners tiene $0 de costo de entrada. La aprobación sí es manual para cuidar la calidad de la red.' },
  { q: '¿Necesito contratar Rutapp para ser Partner?', a: 'No. Al ser aprobado recibes un Sandbox personal para aprender, hacer demos y resolver dudas sin usar una cuenta productiva.' },
  { q: '¿Cómo se reconoce que una empresa es mi referida?', a: 'Por tu link único o por uno de tus cupones al momento del registro. La atribución queda registrada en el sistema.' },
  { q: '¿Cuándo se genera mi comisión?', a: 'Sólo cuando Rutapp recibe un pago elegible de la empresa referida. Pagos cancelados o reembolsados no generan comisión.' },
  { q: '¿Cuándo recibo mi dinero?', a: 'Los pagos a Partners se realizan una vez al mes vía transferencia, cuando el saldo acumulado supera $500 MXN.' },
  { q: '¿Puedo regalar parte de mi comisión con un cupón?', a: 'Sí. El descuento sale de tu porcentaje de comisión. El cupón nunca puede exceder tu porcentaje vigente.' },
  { q: '¿Qué pasa si una empresa deja de pagar?', a: 'Deja de generar comisión durante el tiempo en que no existan pagos elegibles. La atribución no se reasigna por ese motivo.' },
] as const;

const POLICIES = [
  'La atribución se registra por link único o cupón al momento del alta y permanece vinculada al Partner.',
  'Las comisiones se generan únicamente sobre pagos efectivamente cobrados y elegibles.',
  'Pagos cancelados o reembolsados no generan comisión.',
  'El cupón no puede superar tu porcentaje de comisión; si lo iguala, esa comisión queda en cero.',
  'Los bonos Pro, Elite y Legend se generan una sola vez al alcanzar por primera vez cada nivel.',
  'Los pagos a Partners se realizan por transferencia, con mínimo acumulado de $500 MXN, conforme al calendario del programa.',
  'Un mismo correo no puede operar simultáneamente como cliente de Rutapp y como Partner.',
  'No se permiten autoreferidos ni cupones aplicados a empresas controladas por el mismo Partner.',
  'La participación es comercial e independiente: sin horario, exclusividad, salario fijo ni facultad para representar a Rutapp.',
  'Rutapp puede suspender Partners por fraude, prácticas engañosas o incumplimiento de las políticas.',
  'Los cambios económicos se comunican con 30 días de anticipación y se aplican hacia el futuro.',
] as const;

const PROCESS = [
  { icon: Send, step: '01', title: 'Aplica', text: 'Cuéntanos quién eres y cómo planeas crecer con Rutapp.' },
  { icon: BadgeCheck, step: '02', title: 'Aprobamos', text: 'Revisamos tu solicitud manualmente, normalmente en 1–3 días.' },
  { icon: Share2, step: '03', title: 'Comparte', text: 'Obtén tu link, crea cupones y empieza a referir empresas.' },
  { icon: Wallet, step: '04', title: 'Cobra', text: 'Ve tus comisiones en el panel y recibe tu pago mensual.' },
] as const;

function levelForCompanies(companies: number): PartnerLevel {
  return [...PARTNER_LEVELS].reverse().find((level) => companies >= level.min) ?? PARTNER_LEVELS[0];
}

function money(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, description, center = false }: { eyebrow: string; title: ReactNode; description?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-indigo-700">
        <Sparkles className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h2 className="text-3xl font-black leading-[1.05] tracking-[-0.035em] text-[#0B1327] sm:text-4xl lg:text-[48px]">
        {title}
      </h2>
      {description && <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{description}</p>}
    </div>
  );
}

function FloatingDot({ className, delay = 0 }: { className: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={className}
      animate={reduceMotion ? undefined : { y: [0, -12, 0], x: [0, 5, 0] }}
      transition={{ duration: 6, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export default function PartnersLandingPage() {
  const reduceMotion = useReducedMotion();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [lada, setLada] = useState('+52');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [calcCompanies, setCalcCompanies] = useState(15);
  const [calcTicket, setCalcTicket] = useState(500);
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    motivo: '',
    experiencia: '',
    redes: '',
  });

  useEffect(() => {
    void import('@/pwa/registerSW')
      .then(({ ensureNoSWForPublicPage }) => ensureNoSWForPublicPage())
      .catch((error: unknown) => console.warn('No se pudo validar el Service Worker de la página pública', error));
  }, []);

  const calculatedLevel = useMemo(() => levelForCompanies(calcCompanies), [calcCompanies]);
  const estimatedMonthly = (calcCompanies * calcTicket * calculatedLevel.pct) / 100;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    if (!acceptedTerms) {
      toast.error('Debes leer y aceptar los términos del Programa de Partners');
      return;
    }

    setLoading(true);
    try {
      const fullPhone = form.telefono.trim() ? `${lada} ${form.telefono.trim()}` : null;
      const normalizedEmail = form.email.trim().toLowerCase();
      const { error } = await supabase.from('partner_solicitudes').insert({
        nombre: form.nombre.trim(),
        email: normalizedEmail,
        telefono: fullPhone,
        motivo: form.motivo.trim() || null,
        experiencia: form.experiencia.trim() || null,
        redes: form.redes.trim() || null,
        terms_accepted_at: new Date().toISOString(),
        terms_version: PARTNER_TERMS_VERSION,
      });
      if (error) throw error;

      if (fullPhone) {
        void supabase.functions
          .invoke('partner-welcome', {
            body: { nombre: form.nombre.trim(), telefono: fullPhone, email: normalizedEmail },
          })
          .then(({ error: welcomeError }) => {
            if (welcomeError) console.warn('La solicitud se guardó, pero falló el mensaje de bienvenida', welcomeError);
          })
          .catch((welcomeError: unknown) => {
            console.warn('La solicitud se guardó, pero falló el mensaje de bienvenida', welcomeError);
          });
      }

      setSent(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la solicitud';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketingShell>
      <Seo
        title="Programa de Partners · Rutapp"
        description="Convierte empresas que recomiendas en ingresos recurrentes. Hasta 30% de comisión, cupones propios, panel completo y Sandbox incluido."
        path="/partners"
      />

      <div className="overflow-hidden bg-white text-[#0B1327]">
        {/* HERO */}
        <section className="relative isolate min-h-[760px] overflow-hidden border-b border-slate-100 px-5 pb-20 pt-14 sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_20%,rgba(68,91,216,0.13),transparent_32%),radial-gradient(circle_at_82%_20%,rgba(255,107,26,0.12),transparent_30%),linear-gradient(180deg,#fff_0%,#fafbff_100%)]" />
          <img
            src={heroImg}
            alt=""
            aria-hidden
            className="absolute right-[-16%] top-[-5%] -z-10 h-[620px] w-[760px] rounded-full object-cover opacity-[0.10] blur-[2px]"
          />
          <FloatingDot className="absolute left-[7%] top-36 h-3 w-3 rounded-full bg-indigo-400/50 blur-[1px]" />
          <FloatingDot className="absolute right-[11%] top-28 h-4 w-4 rounded-full bg-orange-400/50 blur-[1px]" delay={1.2} />
          <FloatingDot className="absolute right-[30%] top-[42%] h-2 w-2 rounded-full bg-emerald-400/60" delay={2.1} />

          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/90 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-sm backdrop-blur">
                <Handshake className="h-4 w-4" /> Programa oficial de Partners Rutapp
              </div>
              <h1 className="max-w-3xl text-[44px] font-black leading-[0.98] tracking-[-0.05em] text-[#0B1327] sm:text-6xl lg:text-[72px]">
                Convierte empresas que recomiendas en{' '}
                <span className="bg-gradient-to-r from-[#445BD8] via-[#5C5FE4] to-[#FF6B1A] bg-clip-text text-transparent">
                  ingresos recurrentes.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                Refiere negocios a Rutapp y gana cada mes mientras sus pagos sigan activos. Nosotros construimos el software; tú construyes una cartera que puede seguir produciendo.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#aplicar"
                  className="group inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#0B1327] px-6 text-sm font-bold text-white shadow-[0_14px_40px_-18px_rgba(11,19,39,0.65)] transition-all hover:-translate-y-0.5 hover:bg-[#182440]"
                >
                  Aplicar como Partner
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-6 text-sm font-bold text-emerald-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-50"
                >
                  <MessageCircle className="h-4 w-4" /> Resolver una duda
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                {['$0 para entrar', 'Sandbox incluido', 'Atribución permanente'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="relative mx-auto w-full max-w-[690px]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, x: 30 }}
              animate={reduceMotion ? undefined : { opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="relative overflow-hidden rounded-[28px] border border-white bg-white/70 p-2 shadow-[0_35px_100px_-35px_rgba(43,58,128,0.45)] backdrop-blur-xl"
                animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img src={dashboardImg} alt="Dashboard del programa de Partners Rutapp" className="aspect-[1.22/1] w-full rounded-[22px] object-cover" />
                <div className="pointer-events-none absolute inset-2 rounded-[22px] ring-1 ring-inset ring-black/5" />
              </motion.div>

              <motion.div
                className="absolute -bottom-7 -left-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl sm:-left-7"
                animate={reduceMotion ? undefined : { y: [0, 6, 0] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Comisión potencial</p>
                <p className="mt-1 text-xl font-black text-[#0B1327]">Hasta 30%</p>
                <p className="text-xs font-medium text-emerald-600">recurrente</p>
              </motion.div>

              <motion.div
                className="absolute -right-2 top-8 hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-xl sm:block"
                animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
                transition={{ duration: 5, delay: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Este mes</p>
                    <p className="font-black">+$3,420 MXN</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          <Reveal className="mx-auto mt-24 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-4">
            {[
              { icon: TrendingUp, value: 'Hasta 30%', label: 'comisión recurrente' },
              { icon: InfinityIcon, value: 'Cada mes', label: 'mientras existan pagos elegibles' },
              { icon: CircleDollarSign, value: '$0', label: 'costo de entrada' },
              { icon: Beaker, value: 'Sandbox', label: 'incluido al aprobarte' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={value} className="bg-white px-5 py-5 sm:px-6">
                <Icon className="mb-3 h-5 w-5 text-indigo-600" />
                <p className="text-xl font-black tracking-tight sm:text-2xl">{value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{label}</p>
              </div>
            ))}
          </Reveal>
        </section>

        {/* VALUE / BUSINESS MODEL */}
        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading
                eyebrow="El modelo"
                title={<>Una recomendación puede convertirse en <span className="text-[#445BD8]">una cartera.</span></>}
                description="No es una comisión de una sola venta. El valor está en acumular empresas activas y construir un ingreso mensual que crece contigo."
                center
              />
            </Reveal>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {[
                { icon: MousePointerClick, number: '01', title: 'Tú abres la puerta', text: 'Compartes tu link, haces una demo o recomiendas Rutapp a una empresa que realmente puede usarlo.' },
                { icon: Building2, number: '02', title: 'Rutapp opera el producto', text: 'La empresa contrata, usa la plataforma y paga su suscripción. Tú puedes seguir acompañando la relación.' },
                { icon: TrendingUp, number: '03', title: 'Tu cartera acumula valor', text: 'Cada pago elegible genera la comisión correspondiente a tu nivel. Más empresas activas, mayor porcentaje.' },
              ].map((item, index) => (
                <Reveal key={item.number} delay={index * 0.08}>
                  <motion.div
                    className="group relative h-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_16px_50px_-34px_rgba(15,23,42,0.35)]"
                    whileHover={reduceMotion ? undefined : { y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="absolute right-4 top-1 text-[74px] font-black tracking-[-0.08em] text-slate-50">{item.number}</div>
                    <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <h3 className="relative mt-8 text-xl font-black tracking-tight">{item.title}</h3>
                    <p className="relative mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CALCULATOR */}
        <section className="border-y border-slate-200 bg-[#0B1327] px-5 py-20 text-white sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-indigo-200">
                <Calculator className="h-3.5 w-3.5" /> Simulador de potencial
              </div>
              <h2 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl">
                Visualiza lo que pasa cuando tu cartera crece.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                Mueve los controles. El simulador usa los niveles publicados y muestra una estimación simple antes de cupones, bajas, reembolsos o impuestos.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-400">Nivel estimado</p>
                  <p className="mt-1 text-2xl font-black" style={{ color: calculatedLevel.tone }}>{calculatedLevel.name}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-400">Comisión</p>
                  <p className="mt-1 text-2xl font-black">{calculatedLevel.pct}%</p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-300">Empresas activas referidas</p>
                      <p className="mt-1 text-3xl font-black">{calcCompanies}</p>
                    </div>
                    <p className="text-xs text-slate-400">1–80</p>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={80}
                    value={calcCompanies}
                    onChange={(event) => setCalcCompanies(Number(event.target.value))}
                    className="mt-5 w-full accent-[#6C7CF0]"
                    aria-label="Empresas activas referidas"
                  />
                </div>

                <div className="mt-7 border-t border-white/10 pt-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-300">Pago mensual promedio ilustrativo</p>
                      <p className="mt-1 text-3xl font-black">{money(calcTicket)}</p>
                    </div>
                    <p className="text-xs text-slate-400">$300–$2,000</p>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={2000}
                    step={50}
                    value={calcTicket}
                    onChange={(event) => setCalcTicket(Number(event.target.value))}
                    className="mt-5 w-full accent-[#FF7C35]"
                    aria-label="Pago mensual promedio ilustrativo"
                  />
                </div>

                <div className="mt-8 rounded-2xl bg-white p-5 text-[#0B1327] sm:p-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Comisión mensual estimada</p>
                  <motion.p
                    key={estimatedMonthly}
                    initial={reduceMotion ? false : { opacity: 0.4, y: 6 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    className="mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl"
                  >
                    {money(estimatedMonthly)}
                  </motion.p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Ejemplo orientativo: {calcCompanies} empresas × {money(calcTicket)} × {calculatedLevel.pct}%. No constituye promesa de ingresos.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading
                eyebrow="Tu sistema de ventas"
                title={<>No sólo te damos una comisión. Te damos <span className="text-[#445BD8]">herramientas para vender.</span></>}
                description="Todo lo esencial para prospectar, atribuir, medir y cobrar sin trabajar con hojas sueltas o cálculos improvisados."
              />
            </Reveal>

            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((benefit, index) => (
                <Reveal key={benefit.title} delay={(index % 3) * 0.06}>
                  <motion.article
                    whileHover={reduceMotion ? undefined : { y: -5 }}
                    className="group h-full rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-[0_20px_50px_-32px_rgba(68,91,216,0.45)]"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-[#445BD8] transition-all group-hover:bg-indigo-50 group-hover:scale-105">
                      <benefit.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-black tracking-tight">{benefit.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.text}</p>
                  </motion.article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* DASHBOARD */}
        <section className="relative overflow-hidden bg-[#F6F7FD] px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <SectionHeading
                eyebrow="Tu panel"
                title={<>Tu negocio de referidos, <span className="text-[#445BD8]">visible de verdad.</span></>}
                description="No tienes que preguntarnos cuánto llevas. El panel concentra las empresas que referiste, su avance y el dinero que se está generando."
              />
              <div className="mt-8 space-y-4">
                {[
                  { icon: Users, text: 'Empresas referidas y estado de suscripción.' },
                  { icon: LineChart, text: 'Comisiones generadas, pendientes y pagadas mes a mes.' },
                  { icon: Tag, text: 'Cupones creados, uso y control desde tu cuenta.' },
                  { icon: TrendingUp, text: 'Gráficas para entender crecimiento y conversión.' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    {text}
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <motion.div
                className="relative"
                whileHover={reduceMotion ? undefined : { scale: 1.012 }}
                transition={{ duration: 0.35 }}
              >
                <div className="absolute -inset-8 -z-10 rounded-full bg-indigo-300/20 blur-3xl" />
                <img
                  src={dashboardImg}
                  alt="Panel de Partners Rutapp con empresas referidas, comisiones y gráficas"
                  loading="lazy"
                  className="w-full rounded-[28px] border border-white shadow-[0_35px_90px_-36px_rgba(54,67,139,0.42)]"
                />
                <motion.div
                  className="absolute -bottom-7 left-5 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-xl sm:left-auto sm:right-5"
                  animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Comisión este mes</p>
                  <p className="mt-1 text-xl font-black text-emerald-600">+$3,420 MXN</p>
                </motion.div>
              </motion.div>
            </Reveal>
          </div>
        </section>

        {/* LEVELS */}
        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading
                eyebrow="Niveles"
                title={<>Tu porcentaje no se queda quieto. <span className="text-[#445BD8]">Crece contigo.</span></>}
                description="El nivel se determina por empresas activas. Alcanzas el siguiente umbral y la nueva comisión se utiliza en cobros posteriores."
                center
              />
            </Reveal>

            <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PARTNER_LEVELS.map((level, index) => (
                <Reveal key={level.name} delay={index * 0.055}>
                  <motion.article
                    whileHover={reduceMotion ? undefined : { y: -7 }}
                    className={`relative h-full overflow-hidden rounded-2xl border bg-white p-5 ${level.featured ? 'border-cyan-400 shadow-[0_20px_55px_-30px_rgba(6,175,201,0.55)]' : 'border-slate-200'}`}
                  >
                    {level.featured && (
                      <div className="absolute right-0 top-0 rounded-bl-xl bg-cyan-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white">
                        Más popular
                      </div>
                    )}
                    <div className="text-3xl">{level.icon}</div>
                    <h3 className="mt-4 font-black" style={{ color: level.tone }}>{level.name}</h3>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-4xl font-black tracking-[-0.04em]">{level.pct}%</span>
                      <span className="pb-1 text-xs text-slate-400">recurrente</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-500">{level.range}</p>
                    {level.bonus && (
                      <div className="mt-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold" style={{ color: level.tone, backgroundColor: `${level.tone}14` }}>
                        <Gift className="h-3 w-3" /> {level.bonus}
                      </div>
                    )}
                  </motion.article>
                </Reveal>
              ))}
            </div>

            <div className="mt-7 grid gap-3 md:grid-cols-3">
              {[
                { icon: TrendingUp, title: 'Sube automático', text: 'Al alcanzar el umbral, el sistema reconoce tu nuevo nivel.' },
                { icon: ShieldCheck, title: '60 días de gracia', text: 'Si pierdes empresas, conservas temporalmente tu nivel antes de una posible baja.' },
                { icon: Rocket, title: 'Aplica a cobros posteriores', text: 'La nueva tasa se utiliza en las facturas elegibles que ocurren después del cambio.' },
              ].map(({ icon: Icon, title, text }, index) => (
                <Reveal key={title} delay={index * 0.06}>
                  <div className="flex h-full gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                    <div>
                      <p className="text-sm font-black">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* COUPONS */}
        <section className="overflow-hidden border-y border-orange-100 bg-[#FFF9F5] px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
            <Reveal className="order-2 lg:order-1">
              <motion.div className="relative mx-auto max-w-[520px]" whileHover={reduceMotion ? undefined : { rotate: -1.2, scale: 1.02 }}>
                <div className="absolute inset-12 -z-10 rounded-full bg-orange-300/25 blur-3xl" />
                <img src={couponImg} alt="Cupones personalizados para Partners Rutapp" loading="lazy" className="w-full rounded-[28px]" />
              </motion.div>
            </Reveal>

            <Reveal className="order-1 lg:order-2" delay={0.06}>
              <SectionHeading
                eyebrow="Cupones"
                title={<>Convierte parte de tu comisión en <span className="text-[#FF6B1A]">una herramienta de cierre.</span></>}
                description="El descuento no sale de una caja negra: sale de tu porcentaje. Tú eliges cuánto ofrecer y el cálculo permanece visible."
              />

              <div className="mt-8 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
                <div className="border-b border-orange-100 bg-orange-50 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-600">Fórmula</p>
                  <p className="mt-1 font-mono text-lg font-black sm:text-xl">(% Partner − % Cupón) × Monto pagado</p>
                </div>
                <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
                  <div className="bg-white p-5">
                    <p className="text-xs text-slate-400">Sin cupón</p>
                    <p className="mt-2 font-bold">20% × $500 = <span className="text-emerald-600">$100</span></p>
                  </div>
                  <div className="bg-white p-5">
                    <p className="text-xs text-slate-400">Con cupón 5%</p>
                    <p className="mt-2 font-bold">15% × $475 = <span className="text-emerald-600">$71.25</span></p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* SANDBOX */}
        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <div className="relative overflow-hidden rounded-[32px] bg-[#101A35] p-7 text-white shadow-[0_35px_90px_-45px_rgba(16,26,53,0.7)] sm:p-10 lg:p-14">
                <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
                <div className="absolute -bottom-36 left-[30%] h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-200">
                      <Beaker className="h-3.5 w-3.5" /> Exclusivo Partners
                    </div>
                    <h2 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl">
                      No promociones algo que no conoces. <span className="text-orange-400">Pruébalo primero.</span>
                    </h2>
                    <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                      Al aprobarte recibes un Sandbox personal para aprender Rutapp, preparar demos y responder preguntas básicas sin contratar una cuenta productiva.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
                      <p className="text-xs font-black uppercase tracking-[0.13em] text-emerald-300">Incluye</p>
                      <ul className="mt-4 space-y-3 text-sm text-slate-200">
                        {['Hasta 10 clientes de prueba', 'Hasta 20 productos', 'Hasta 50 ventas', 'POS, App Móvil, Logística y Reportes', 'Activo mientras seas Partner'].map((item) => (
                          <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
                      <p className="text-xs font-black uppercase tracking-[0.13em] text-orange-300">No es una cuenta productiva</p>
                      <p className="mt-4 text-sm leading-6 text-slate-300">El Sandbox es tu laboratorio. Tiene límites deliberados para demos y aprendizaje.</p>
                      <ul className="mt-4 space-y-2 text-sm text-slate-300">
                        <li>— Sin facturación CFDI</li>
                        <li>— Sin envíos masivos de WhatsApp</li>
                        <li>— Sin catálogo público compartible</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PROCESS */}
        <section className="bg-[#F7F8FC] px-5 py-24 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <SectionHeading eyebrow="Cómo empezar" title={<>De “me interesa” a tu primer referido en <span className="text-[#445BD8]">cuatro pasos.</span></>} center />
            </Reveal>
            <div className="relative mt-14 grid gap-4 md:grid-cols-4">
              <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-gradient-to-r from-indigo-200 via-orange-200 to-indigo-200 md:block" />
              {PROCESS.map((item, index) => (
                <Reveal key={item.step} delay={index * 0.08}>
                  <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-[#0B1327] text-white shadow-lg">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Paso {item.step}</p>
                    <h3 className="mt-2 text-xl font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ + POLICIES */}
        <section className="px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <Reveal>
                <SectionHeading eyebrow="Preguntas frecuentes" title={<>Lo importante, <span className="text-[#445BD8]">sin letra chiquita.</span></>} />
              </Reveal>
              <div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">
                {FAQS.map((faq, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <div key={faq.q}>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : index)}
                        className="flex w-full items-center justify-between gap-5 py-5 text-left"
                        aria-expanded={isOpen}
                      >
                        <span className="font-bold text-[#0B1327]">{faq.q}</span>
                        <motion.span animate={reduceMotion ? undefined : { rotate: isOpen ? 180 : 0 }}>
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        </motion.span>
                      </button>
                      <motion.div
                        initial={false}
                        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.28 }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-5 pr-8 text-sm leading-6 text-slate-600">{faq.a}</p>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Reveal delay={0.08}>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.13em] text-slate-400">Reglas del programa</p>
                    <h3 className="text-xl font-black">Políticas claras desde el inicio</h3>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {POLICIES.map((policy) => (
                    <div key={policy} className="flex gap-3 rounded-xl bg-white p-3.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {policy}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="px-5 pb-10 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-7xl">
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#445BD8] via-[#445BD8] to-[#FF6B1A] px-7 py-12 text-center text-white shadow-[0_28px_80px_-35px_rgba(68,91,216,0.65)] sm:px-10 lg:py-16">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,.18),transparent_25%),radial-gradient(circle_at_90%_80%,rgba(255,255,255,.12),transparent_30%)]" />
              <div className="relative mx-auto max-w-3xl">
                <Trophy className="mx-auto h-9 w-9 text-white/90" />
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Tu próxima recomendación puede ser el inicio de una cartera.</h2>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/80">Aplica al programa o pregúntanos primero. No necesitas pagar para empezar.</p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <a href="#aplicar" className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#0B1327] shadow-lg transition hover:-translate-y-0.5">
                    Aplicar como Partner <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                  <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">
                    <MessageCircle className="h-4 w-4" /> Hablar por WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* APPLICATION FORM */}
        <section id="aplicar" className="scroll-mt-20 bg-[#F7F8FC] px-5 py-24 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <Reveal>
              <div className="lg:sticky lg:top-24">
                <div className="grid h-13 w-13 place-items-center rounded-2xl bg-[#0B1327] text-white shadow-lg">
                  <Handshake className="h-6 w-6" />
                </div>
                <h2 className="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl">Aplica para ser Partner.</h2>
                <p className="mt-4 max-w-md text-base leading-7 text-slate-600">Revisamos cada solicitud manualmente. Si tu perfil encaja, recibirás acceso al panel y a tu Sandbox.</p>
                <div className="mt-7 space-y-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-600" /> Revisión habitual en 1–3 días.</p>
                  <p className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-indigo-600" /> Programa abierto a múltiples países.</p>
                  <p className="flex items-center gap-2"><Zap className="h-4 w-4 text-indigo-600" /> Sin costo de activación.</p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.06}>
              {sent ? (
                <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center shadow-sm">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="mt-5 text-2xl font-black">Solicitud enviada</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Te avisaremos por correo cuando revisemos tu solicitud. Normalmente ocurre en 1–3 días.</p>
                  <Link to="/" className="mt-6 inline-flex text-sm font-bold text-indigo-600 hover:underline">Volver al inicio</Link>
                </div>
              ) : (
                <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.4)] sm:p-8">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="partner-name">Nombre completo *</Label>
                      <Input id="partner-name" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required className="mt-1.5 h-11" autoComplete="name" />
                    </div>
                    <div>
                      <Label htmlFor="partner-email">Correo electrónico *</Label>
                      <Input id="partner-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required className="mt-1.5 h-11" autoComplete="email" />
                    </div>
                  </div>

                  <div className="mt-5">
                    <Label htmlFor="partner-phone">Teléfono / WhatsApp</Label>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={lada}
                        onChange={(event) => setLada(event.target.value)}
                        className="h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-[205px]"
                        aria-label="Código de país"
                      >
                        {LADAS.map((option, index) => (
                          <option key={`${option.code}-${option.name}-${index}`} value={option.code}>{option.flag} {option.name} ({option.code})</option>
                        ))}
                      </select>
                      <Input
                        id="partner-phone"
                        type="tel"
                        value={form.telefono}
                        onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value.replace(/[^0-9 ]/g, '') }))}
                        placeholder="55 1234 5678"
                        className="h-11 flex-1"
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <Label htmlFor="partner-why">¿Por qué quieres ser Partner?</Label>
                    <Textarea id="partner-why" rows={3} value={form.motivo} onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))} placeholder="Cuéntanos qué te motiva y a quién planeas referir..." className="mt-1.5" />
                  </div>

                  <div className="mt-5">
                    <Label htmlFor="partner-experience">Experiencia previa</Label>
                    <Textarea id="partner-experience" rows={3} value={form.experiencia} onChange={(event) => setForm((current) => ({ ...current, experiencia: event.target.value }))} placeholder="¿Vendes software? ¿Eres consultor? ¿Tienes una agencia o comunidad?" className="mt-1.5" />
                  </div>

                  <div className="mt-5">
                    <Label htmlFor="partner-social">Redes / sitio web</Label>
                    <Input id="partner-social" value={form.redes} onChange={(event) => setForm((current) => ({ ...current, redes: event.target.value }))} placeholder="@usuario, https://..., etc." className="mt-1.5 h-11" />
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
                    <span>
                      Leí y acepto los <Link to="/partners/terminos" target="_blank" className="font-bold text-indigo-700 underline">Términos del Programa de Partners</Link> versión {PARTNER_TERMS_VERSION}. Entiendo que se trata de una colaboración comercial independiente, que las comisiones sólo nacen sobre pagos elegibles y autorizo expresamente el tratamiento de los datos fiscales y bancarios que proporcione para operar mis pagos.
                    </span>
                  </label>

                  <Button type="submit" disabled={loading} className="mt-7 h-12 w-full bg-[#0B1327] text-base font-black text-white hover:bg-[#182440]">
                    {loading ? 'Enviando solicitud...' : 'Enviar solicitud'}
                  </Button>
                  <p className="mt-4 text-center text-xs text-slate-500">
                    ¿Prefieres preguntar primero?{' '}
                    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 hover:underline">Escríbenos por WhatsApp</a>
                  </p>
                </form>
              )}
            </Reveal>
          </div>
        </section>

        <motion.a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Hablar por WhatsApp"
          className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_14px_35px_-10px_rgba(16,185,129,0.65)]"
          whileHover={reduceMotion ? undefined : { scale: 1.08, y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        >
          <MessageCircle className="h-6 w-6" />
        </motion.a>
      </div>
    </MarketingShell>
  );
}
