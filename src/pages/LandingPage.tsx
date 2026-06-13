import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, Users, MapPin, BarChart3, Package, Wallet,
  Truck, Smartphone, Shield, ChevronRight, Check, X,
  ArrowRight, Menu, Route, CreditCard, Radio, FileText,
  Bell, WifiOff, MessageCircle, TrendingUp, Eye, Layers,
  Building2, Calculator, Activity, Sparkles, Brain, Lightbulb,
  MessageSquare, Boxes, ClipboardList, LineChart, Zap,
  AlertTriangle, Award, ShieldCheck, Receipt, ScanLine,
} from 'lucide-react';
import { LiveSupervisorMap, LiveMobileApp, LiveDashboardMockup } from '@/components/landing/LiveMockups';
import { Seo } from '@/components/seo/Seo';
import { useFacebookPixel } from '@/hooks/useFacebookPixel';

/* ============================================================
   Brand tokens
   ============================================================ */
const BRAND = {
  primary: '#0060e8',
  primaryDark: '#0049b3',
  primarySoft: '#e6efff',
  accent: '#fe8c1a',
  accentSoft: '#fff1e2',
  ink: '#0a1530',
  ink2: '#3b4863',
  muted: '#6b7791',
  line: '#eef0f5',
  surface: '#f7f8fb',
};

const LANDING_JSON_LD = [
  { '@context': 'https://schema.org', '@type': 'Organization', name: 'Rutapp', url: 'https://rutapp.mx',
    logo: 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png',
    sameAs: ['https://www.youtube.com/@RutAppMx'] },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Rutapp', url: 'https://rutapp.mx' },
  { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Rutapp',
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, iOS',
    description: 'ERP para distribuidoras: ventas, cobranza, inventario, logística, compras, finanzas, comisiones e IA. Operación móvil offline en tiempo real.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN', description: '7 días de prueba gratis' } },
];

/* ============================================================
   Content
   ============================================================ */
const PROBLEMS = [
  { icon: Eye, t: 'No sabes dónde están tus vendedores', d: 'Llamadas, audios y mentiras. Cero visibilidad de la ruta real.' },
  { icon: Boxes, t: 'No sabes qué inventario queda', d: 'Conteos a mano, faltantes sorpresa y mermas que nadie explica.' },
  { icon: Wallet, t: 'Cobranza atrasada y desordenada', d: 'Facturas viejas, abonos perdidos, saldos que no cuadran.' },
  { icon: ClipboardList, t: 'Pedidos perdidos en WhatsApp', d: 'Capturas sueltas, errores de surtido y clientes molestos.' },
  { icon: Route, t: 'Rutas mal optimizadas', d: 'Vendedores cruzando la ciudad y gastando gasolina de más.' },
  { icon: AlertTriangle, t: 'Decisiones a ciegas', d: 'Excel desactualizado y sin alertas cuando algo va mal.' },
];

const FLOW = [
  { icon: Users, label: 'Cliente' },
  { icon: ShoppingCart, label: 'Pedido' },
  { icon: Package, label: 'Inventario' },
  { icon: Truck, label: 'Entrega' },
  { icon: Wallet, label: 'Cobranza' },
  { icon: BarChart3, label: 'Reportes' },
  { icon: Brain, label: 'IA' },
];

const PILLARS = [
  { icon: WifiOff, t: 'Vende sin internet', d: 'App offline real. Captura, cobra y entrega sin señal. Sincroniza sola al volver.' },
  { icon: Radio, t: 'Tus vendedores en vivo', d: 'GPS y supervisor en tiempo real. Mira la ruta, batería y la visita actual.' },
  { icon: Boxes, t: 'Inventario inteligente', d: 'Control por almacén y por camión. Kardex, traspasos y conteos auditables.' },
  { icon: Wallet, t: 'Cobranza automática', d: 'Aplicación FIFO, recordatorios por WhatsApp y conciliación al instante.' },
  { icon: Truck, t: 'Logística integrada', d: 'Pedidos, cargas y entregas conectados. Sin papel, sin recapturar.' },
  { icon: Brain, t: 'IA integrada', d: 'Recomendaciones automáticas de compra, riesgos y oportunidades del día.' },
];

const MODULES = [
  { icon: Users, t: 'Clientes', d: 'CRM con GPS, historial y estado de cuenta.' },
  { icon: ShoppingCart, t: 'Ventas', d: 'POS, preventa, venta directa y pedidos.' },
  { icon: Wallet, t: 'Cobranza', d: 'FIFO, recibos y aplicación multi-folio.' },
  { icon: Package, t: 'Inventario', d: 'Multi-almacén, kardex y conteos.' },
  { icon: CreditCard, t: 'Compras', d: 'Órdenes, recepción y pagos a proveedores.' },
  { icon: Truck, t: 'Logística', d: 'Cargas, rutas y entregas optimizadas.' },
  { icon: LineChart, t: 'Finanzas', d: 'CxC, CxP, gastos y liquidación de ruta.' },
  { icon: Award, t: 'Comisiones', d: 'Reglas por vendedor, producto o ruta.' },
  { icon: FileText, t: 'Reportes', d: 'Operativos, ejecutivos y de auditoría.' },
  { icon: Brain, t: 'IA', d: 'Asesor, sugerencias y detección de anomalías.' },
];

const MOBILE_FEATURES = [
  'Venta y preventa en segundos',
  'Cobro con recibo térmico o WhatsApp',
  'GPS y navegación a cada cliente',
  'Entrega con firma y evidencia',
  'Inventario del camión en vivo',
  'Funciona sin internet',
];

const AI_EXAMPLES = [
  { icon: Boxes, tone: BRAND.primary, t: 'Producto por reponer', d: 'Coca 600ml caerá a stock crítico en 3 días al ritmo actual. Sugerimos comprar 240 piezas.' },
  { icon: AlertTriangle, tone: '#dc2626', t: 'Cliente en riesgo', d: 'Abarrotes Don Pepe redujo 38% sus compras este mes. Visita prioritaria mañana.' },
  { icon: Award, tone: BRAND.accent, t: 'Vendedor destacado', d: 'Juan L. lleva 12% arriba de su meta semanal. Considera replicar su ruta.' },
  { icon: Activity, tone: '#7c3aed', t: 'Anomalía detectada', d: '3 ventas por debajo del costo en la última hora. Revisar autorizaciones.' },
];

const USE_CASES = [
  'Abarrotes', 'Bebidas', 'Botanas', 'Lácteos', 'Cárnicos',
  'Ferreterías', 'Papelerías', 'Mayoristas', 'Panificadoras', 'Limpieza',
];

const COMPARE = [
  { feat: 'Operación en tiempo real', rut: true, excel: false, wa: false, erp: 'Parcial' },
  { feat: 'App móvil offline', rut: true, excel: false, wa: false, erp: false },
  { feat: 'GPS y ruta optimizada', rut: true, excel: false, wa: false, erp: false },
  { feat: 'Inventario por camión', rut: true, excel: 'Manual', wa: false, erp: 'Parcial' },
  { feat: 'Cobranza FIFO automática', rut: true, excel: false, wa: false, erp: true },
  { feat: 'IA integrada', rut: true, excel: false, wa: false, erp: false },
  { feat: 'Implementación en días', rut: true, excel: '—', wa: '—', erp: 'Meses' },
];

const TESTIMONIALS = [
  { name: 'Carlos M.', role: 'Director comercial', company: 'Distribuidora Norte', text: 'El seguimiento en tiempo real cambió todo. Sé exactamente dónde está cada vendedor y reacciono al instante.' },
  { name: 'Ana R.', role: 'Gerente de ventas', company: 'Lácteos del Valle', text: 'Mis vendedores venden desde el celular sin internet. Cero papelitos, cero errores de pedido.' },
  { name: 'Roberto S.', role: 'Fundador', company: 'Botanas Express', text: 'La optimización de rutas nos ahorró miles de pesos en gasolina el primer mes. Se pagó solo.' },
];

const EXTRA_USER_PRICE = 300;
const PLANS = [
  { slug: 'individual', name: 'Individual', price: 450, includedUsers: 1, idealFor: 'Personas o negocios pequeños', popular: false, features: [
    '1 usuario incluido', 'Acceso completo a Rutapp', 'App móvil offline', 'Panel básico', 'Soporte por WhatsApp', 'Capacitación inicial (1 sesión)',
  ]},
  { slug: 'equipo', name: 'Equipo', price: 900, includedUsers: 3, idealFor: 'Equipos de ventas y reparto', popular: true, features: [
    '3 usuarios incluidos', 'Todo lo del plan Individual', 'Reportes por usuario y ruta', 'Roles y permisos', 'Soporte prioritario', 'Capacitación (2 sesiones)',
  ]},
  { slug: 'empresa', name: 'Empresa', price: 1500, includedUsers: 5, idealFor: 'Empresas con varias rutas o almacenes', popular: false, features: [
    '5 usuarios incluidos', 'Todo lo del plan Equipo', 'Múltiples almacenes', 'Reportes avanzados', 'Soporte preferente', 'Capacitación (3 sesiones)',
  ]},
];

const fmtMX = (n: number) => `$${n.toLocaleString('es-MX')}`;

/* ============================================================
   Small UI helpers
   ============================================================ */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: BRAND.primary }}>
      <span className="h-1 w-1 rounded-full" style={{ background: BRAND.primary }} />
      {children}
    </span>
  );
}

function SectionTitle({ kicker, title, sub }: { kicker?: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="max-w-3xl">
      {kicker && <div className="mb-4"><Eyebrow>{kicker}</Eyebrow></div>}
      <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05]" style={{ color: BRAND.ink, letterSpacing: '-0.025em' }}>
        {title}
      </h2>
      {sub && <p className="mt-5 text-lg md:text-xl leading-relaxed" style={{ color: BRAND.ink2 }}>{sub}</p>}
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */
export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchParams] = useSearchParams();
  useFacebookPixel();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) localStorage.setItem('rutapp_partner_ref', ref);
  }, [searchParams]);

  useEffect(() => {
    import('@/pwa/registerSW').then(({ ensureNoSWForPublicPage }) => ensureNoSWForPublicPage());
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden antialiased"
      style={{ color: BRAND.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', fontFeatureSettings: '"cv11","ss01","ss03"' }}>
      <Seo
        title="Rutapp · El sistema operativo para distribuidoras"
        description="ERP en tiempo real para distribuidoras: ventas, cobranza, inventario, logística, compras, finanzas e IA. App móvil offline para tu equipo en ruta."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      {/* ============================================================
          Navigation
          ============================================================ */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b pt-[env(safe-area-inset-top)]"
        style={{ borderColor: BRAND.line }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg grid place-items-center text-white font-black text-sm"
              style={{ background: BRAND.primary }}>R</div>
            <span className="text-[17px] font-bold tracking-tight" style={{ color: BRAND.ink }}>Rutapp</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[14px]" style={{ color: BRAND.ink2 }}>
            <a href="#producto" className="hover:text-black transition-colors">Producto</a>
            <a href="#modulos" className="hover:text-black transition-colors">Módulos</a>
            <a href="#movil" className="hover:text-black transition-colors">App móvil</a>
            <a href="#ia" className="hover:text-black transition-colors inline-flex items-center gap-1.5">
              IA <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ background: BRAND.accent }}>NEW</span>
            </a>
            <a href="#precios" className="hover:text-black transition-colors">Precios</a>
            <Link to="/partners" className="hover:text-black transition-colors">Partners</Link>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className="px-3.5 py-2 text-[14px] font-medium hover:text-black transition-colors" style={{ color: BRAND.ink2 }}>
              Iniciar sesión
            </Link>
            <Link to="/signup" className="px-4 py-2 text-[14px] font-semibold text-white rounded-lg transition-all hover:opacity-90 inline-flex items-center gap-1.5"
              style={{ background: BRAND.ink }}>
              Empezar gratis <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <Link to="/signup" className="px-3 py-1.5 text-xs font-semibold text-white rounded-md" style={{ background: BRAND.ink }}>
              Probar
            </Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2" aria-label="Menú">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-6 py-4 space-y-3" style={{ borderColor: BRAND.line }}>
            {[['#producto', 'Producto'], ['#modulos', 'Módulos'], ['#movil', 'App móvil'], ['#ia', 'IA'], ['#precios', 'Precios']].map(([h, l]) => (
              <a key={h} href={h} onClick={() => setMobileMenu(false)} className="block text-sm font-medium" style={{ color: BRAND.ink2 }}>{l}</a>
            ))}
            <Link to="/partners" onClick={() => setMobileMenu(false)} className="block text-sm font-medium" style={{ color: BRAND.ink2 }}>Partners</Link>
            <Link to="/login" onClick={() => setMobileMenu(false)} className="block text-sm font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      {/* ============================================================
          HERO
          ============================================================ */}
      <section className="relative pt-32 md:pt-40 pb-20 md:pb-28 px-6">
        {/* Subtle background grid */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute inset-x-0 top-0 h-[600px]"
            style={{ background: `radial-gradient(60% 50% at 50% 0%, ${BRAND.primarySoft} 0%, transparent 70%)` }} />
          <svg className="absolute inset-0 w-full h-full opacity-[0.35]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="heroGrid" width="56" height="56" patternUnits="userSpaceOnUse">
                <path d="M 56 0 L 0 0 0 56" fill="none" stroke={BRAND.line} strokeWidth="1" />
              </pattern>
              <linearGradient id="fadeMask" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0" />
                <stop offset="40%" stopColor="white" stopOpacity="1" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#heroGrid)" mask="url(#fade)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium border bg-white"
              style={{ borderColor: BRAND.line, color: BRAND.ink2 }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND.accent }} />
              Nuevo · Asesor con IA dentro de tu operación
            </div>
            <h1 className="mt-6 text-[44px] md:text-[68px] font-semibold leading-[1.02] tracking-tight"
              style={{ color: BRAND.ink, letterSpacing: '-0.035em' }}>
              Controla toda tu distribuidora<br className="hidden md:block" />
              <span className="relative inline-block">
                desde una sola plataforma.
                <span className="absolute left-0 -bottom-1 h-[6px] w-full rounded-full opacity-80"
                  style={{ background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent})` }} />
              </span>
            </h1>
            <p className="mt-7 text-lg md:text-xl max-w-2xl leading-relaxed" style={{ color: BRAND.ink2 }}>
              Ventas, cobranza, inventario, reparto, compras, finanzas e <span style={{ color: BRAND.ink, fontWeight: 600 }}>inteligencia artificial</span> en tiempo real. La operación completa de tu distribuidora en un solo sistema.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link to="/signup" className="px-6 py-3.5 text-[15px] font-semibold text-white rounded-xl inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-lg"
                style={{ background: BRAND.primary, boxShadow: `0 10px 30px -10px ${BRAND.primary}80` }}>
                Solicitar demostración <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#producto" className="px-6 py-3.5 text-[15px] font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-all border bg-white hover:bg-gray-50"
                style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                <span className="grid place-items-center h-6 w-6 rounded-full text-white" style={{ background: BRAND.accent }}>
                  <svg viewBox="0 0 24 24" className="h-3 w-3 ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
                Ver video de 2 minutos
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]" style={{ color: BRAND.muted }}>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> 7 días gratis</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> Sin tarjeta</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> Implementación en días</span>
            </div>
          </div>

          {/* Hero composition: dashboard + phone + map */}
          <div className="relative mt-16 md:mt-20">
            <div className="absolute inset-0 -z-10 blur-3xl opacity-50"
              style={{ background: `radial-gradient(50% 60% at 50% 40%, ${BRAND.primarySoft}, transparent)` }} />
            <div className="grid grid-cols-12 gap-4 md:gap-6 items-end">
              <div className="col-span-12 lg:col-span-8 rounded-2xl overflow-hidden border bg-white"
                style={{ borderColor: BRAND.line, boxShadow: '0 30px 80px -20px rgba(10,21,48,0.18)' }}>
                <LiveDashboardMockup />
              </div>
              <div className="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4 md:gap-6">
                <div className="rounded-2xl overflow-hidden border bg-white"
                  style={{ borderColor: BRAND.line, boxShadow: '0 20px 50px -15px rgba(10,21,48,0.15)' }}>
                  <LiveSupervisorMap />
                </div>
                <div className="rounded-2xl bg-white p-6 grid place-items-center border"
                  style={{ borderColor: BRAND.line, boxShadow: '0 20px 50px -15px rgba(10,21,48,0.15)' }}>
                  <div className="scale-90 origin-center"><LiveMobileApp /></div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mt-16 pt-8 border-t" style={{ borderColor: BRAND.line }}>
            <p className="text-center text-[12px] font-medium uppercase tracking-[0.18em]" style={{ color: BRAND.muted }}>
              Operadores de distribución usan Rutapp para sustituir Excel, WhatsApp y cuadernos
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
              {USE_CASES.slice(0, 8).map(c => (
                <span key={c} className="text-sm font-semibold" style={{ color: BRAND.ink2 }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          PROBLEM
          ============================================================ */}
      <section className="px-6 py-24 md:py-32" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="El problema"
            title={<>¿Tu operación depende de <span style={{ color: BRAND.accent }}>Excel, WhatsApp y papel</span>?</>}
            sub="Tu negocio crece, pero tu visibilidad no. Cada vendedor opera en su isla y los problemas los descubres al final del día —  o peor, al final del mes."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROBLEMS.map(p => (
              <div key={p.t} className="rounded-2xl bg-white p-6 border transition-all hover:-translate-y-0.5"
                style={{ borderColor: BRAND.line }}>
                <div className="h-10 w-10 rounded-xl grid place-items-center mb-4"
                  style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: BRAND.ink }}>{p.t}</h3>
                <p className="text-[14px] leading-relaxed" style={{ color: BRAND.ink2 }}>{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          SOLUTION FLOW
          ============================================================ */}
      <section id="producto" className="px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="La solución"
            title={<>Todo conectado. <span style={{ color: BRAND.primary }}>Todo en tiempo real.</span></>}
            sub="Una sola plataforma donde el cliente, el pedido, el inventario, la entrega y la cobranza viven en el mismo flujo. Sin capturar dos veces. Sin sorpresas."
          />
          <div className="mt-16 rounded-3xl border bg-white p-6 md:p-10" style={{ borderColor: BRAND.line }}>
            <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-4">
              {FLOW.map((s, i) => (
                <div key={s.label} className="flex items-center gap-3 md:flex-1">
                  <div className="flex flex-col items-center text-center md:flex-1">
                    <div className="h-14 w-14 rounded-2xl grid place-items-center border transition-all"
                      style={{
                        borderColor: BRAND.line,
                        background: i === FLOW.length - 1 ? BRAND.accent : 'white',
                        color: i === FLOW.length - 1 ? 'white' : BRAND.primary,
                      }}>
                      <s.icon className="h-6 w-6" />
                    </div>
                    <span className="mt-2 text-[12px] font-semibold" style={{ color: BRAND.ink }}>{s.label}</span>
                  </div>
                  {i < FLOW.length - 1 && (
                    <div className="hidden md:block flex-1 h-px relative">
                      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${BRAND.line}, ${BRAND.primary}40, ${BRAND.line})` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t" style={{ borderColor: BRAND.line }}>
              {[
                { icon: Zap, t: 'Sin recapturar', d: 'Lo que se vende, descuenta inventario, genera cuenta por cobrar y aparece en reportes. Al instante.' },
                { icon: ShieldCheck, t: 'Auditable de punta a punta', d: 'Cada cambio queda registrado: quién, cuándo, dónde y desde qué dispositivo.' },
                { icon: Brain, t: 'IA observando', d: 'El asesor revisa el flujo entero y te avisa donde hay riesgo, fuga o oportunidad.' },
              ].map(b => (
                <div key={b.t}>
                  <div className="h-9 w-9 rounded-lg grid place-items-center mb-3"
                    style={{ background: BRAND.primarySoft, color: BRAND.primary }}><b.icon className="h-4 w-4" /></div>
                  <h4 className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>{b.t}</h4>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: BRAND.ink2 }}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          PILLARS / BENEFITS
          ============================================================ */}
      <section className="px-6 py-24 md:py-32" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <SectionTitle
              kicker="Por qué Rutapp"
              title="El sistema operativo para distribuidoras."
              sub="No es una app de ventas. Es la columna vertebral que sustituye Excel, WhatsApp y los procesos manuales — con la potencia de un ERP y la simpleza de una herramienta moderna."
            />
          </div>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PILLARS.map((p, i) => (
              <div key={p.t} className="group rounded-2xl bg-white p-7 border transition-all hover:-translate-y-1 hover:shadow-xl"
                style={{ borderColor: BRAND.line, boxShadow: '0 1px 0 0 rgba(10,21,48,0.02)' }}>
                <div className="h-12 w-12 rounded-2xl grid place-items-center mb-5 transition-transform group-hover:scale-110"
                  style={{
                    background: i % 2 === 0 ? BRAND.primary : BRAND.accent,
                    color: 'white',
                  }}>
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[17px] font-semibold mb-2" style={{ color: BRAND.ink }}>{p.t}</h3>
                <p className="text-[14px] leading-relaxed" style={{ color: BRAND.ink2 }}>{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          MODULES
          ============================================================ */}
      <section id="modulos" className="px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="Módulos"
            title={<>10 módulos. <span style={{ color: BRAND.primary }}>Una sola plataforma.</span></>}
            sub="Cada área de tu distribuidora con la profundidad que necesita, conectada con todo lo demás."
          />
          <div className="mt-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {MODULES.map(m => (
              <div key={m.t} className="rounded-2xl border bg-white p-5 transition-all hover:border-transparent hover:shadow-lg"
                style={{ borderColor: BRAND.line }}>
                <m.icon className="h-5 w-5 mb-3" style={{ color: BRAND.primary }} />
                <div className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>{m.t}</div>
                <div className="text-[12px] mt-1 leading-snug" style={{ color: BRAND.muted }}>{m.d}</div>
              </div>
            ))}
          </div>

          {/* Module showcase: Dashboard real */}
          <div className="mt-16 rounded-3xl overflow-hidden border bg-white"
            style={{ borderColor: BRAND.line, boxShadow: '0 30px 80px -30px rgba(10,21,48,0.25)' }}>
            <div className="grid grid-cols-1 lg:grid-cols-5">
              <div className="lg:col-span-2 p-8 md:p-12 flex flex-col justify-center">
                <Eyebrow>Módulo destacado</Eyebrow>
                <h3 className="mt-4 text-2xl md:text-4xl font-semibold tracking-tight leading-[1.1]" style={{ color: BRAND.ink, letterSpacing: '-0.02em' }}>
                  Dashboard ejecutivo con KPIs en vivo.
                </h3>
                <p className="mt-4 text-[15px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                  Ventas, cobranza, utilidad, ranking de vendedores y alertas. Todo actualizado al instante mientras tu equipo opera en la calle.
                </p>
                <ul className="mt-5 space-y-2">
                  {['Ventas y cobros del día', 'Top vendedores y productos', 'Alertas de stock crítico', 'Comparativos vs meta'].map(x => (
                    <li key={x} className="flex items-center gap-2 text-[14px]" style={{ color: BRAND.ink }}>
                      <Check className="h-4 w-4" style={{ color: BRAND.primary }} /> {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:col-span-3 p-6 md:p-8" style={{ background: BRAND.surface }}>
                <LiveDashboardMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          MOBILE APP
          ============================================================ */}
      <section id="movil" className="px-6 py-24 md:py-32" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative">
                <div className="absolute -inset-8 blur-3xl opacity-40 -z-10"
                  style={{ background: `radial-gradient(circle, ${BRAND.primarySoft}, transparent)` }} />
                <div className="grid grid-cols-2 gap-6 items-center">
                  <div className="rounded-2xl overflow-hidden border bg-white"
                    style={{ borderColor: BRAND.line, boxShadow: '0 30px 60px -20px rgba(10,21,48,0.25)' }}>
                    <LiveSupervisorMap />
                  </div>
                  <div className="rounded-2xl bg-white p-4 border grid place-items-center"
                    style={{ borderColor: BRAND.line, boxShadow: '0 30px 60px -20px rgba(10,21,48,0.25)' }}>
                    <div className="scale-90 -my-6 origin-center"><LiveMobileApp /></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <Eyebrow>App móvil</Eyebrow>
              <h2 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05]"
                style={{ color: BRAND.ink, letterSpacing: '-0.025em' }}>
                Tu equipo trabaja desde <span style={{ color: BRAND.primary }}>cualquier lugar.</span>
              </h2>
              <p className="mt-5 text-lg leading-relaxed" style={{ color: BRAND.ink2 }}>
                Vendedores y repartidores levantan pedidos, cobran, entregan y registran GPS —
                <span style={{ color: BRAND.ink, fontWeight: 600 }}> incluso sin internet.</span> Todo sincroniza solo al volver a línea.
              </p>
              <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MOBILE_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px]" style={{ color: BRAND.ink }}>
                    <span className="mt-0.5 h-5 w-5 rounded-md grid place-items-center shrink-0"
                      style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-[13px] font-medium"
                style={{ borderColor: BRAND.line, color: BRAND.ink2 }}>
                <WifiOff className="h-4 w-4" style={{ color: BRAND.accent }} />
                Diseñada offline-first. La app no se cae cuando se cae la señal.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          AI
          ============================================================ */}
      <section id="ia" className="px-6 py-24 md:py-32 relative overflow-hidden" style={{ background: BRAND.ink }}>
        <div className="absolute inset-0 -z-0 opacity-40"
          style={{ background: `radial-gradient(50% 60% at 70% 30%, ${BRAND.primary}55, transparent), radial-gradient(40% 50% at 20% 80%, ${BRAND.accent}33, transparent)` }} />
        <div className="max-w-7xl mx-auto relative">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
              <Sparkles className="h-3.5 w-3.5" style={{ color: BRAND.accent }} />
              Asesor Rutapp IA
            </span>
            <h2 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-white" style={{ letterSpacing: '-0.025em' }}>
              Tu distribuidora ahora tiene un <span style={{ color: BRAND.accent }}>asesor inteligente.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/70">
              La IA lee tus datos en tiempo real, detecta lo que importa y te dice exactamente qué hacer hoy. Sin reportes que nadie lee.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-4">
            {AI_EXAMPLES.map(ex => (
              <div key={ex.t} className="rounded-2xl p-6 backdrop-blur-sm border"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0"
                    style={{ background: `${ex.tone}22`, color: ex.tone }}>
                    <ex.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">{ex.t}</div>
                    <p className="text-[15px] leading-relaxed text-white">{ex.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="px-5 py-3 text-[14px] font-semibold rounded-xl inline-flex items-center gap-2 text-white"
              style={{ background: BRAND.primary }}>
              Probar la IA gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-[13px] text-white/60">Incluida en todos los planes.</span>
          </div>
        </div>
      </section>

      {/* ============================================================
          USE CASES
          ============================================================ */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="Para quién es"
            title="Pensado para distribuidoras de cualquier giro."
            sub="Si tienes vendedores en ruta, almacén, cobranza y un catálogo que mover — Rutapp encaja desde el día uno."
          />
          <div className="mt-12 flex flex-wrap gap-3">
            {USE_CASES.map(u => (
              <span key={u} className="px-4 py-2.5 rounded-full text-[14px] font-semibold border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                {u}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          COMPARISON
          ============================================================ */}
      <section className="px-6 py-24 md:py-32" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="Comparativa"
            title="Rutapp vs el caos actual."
          />
          <div className="mt-12 rounded-2xl bg-white border overflow-hidden" style={{ borderColor: BRAND.line }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr style={{ background: BRAND.surface }}>
                    <th className="text-left p-4 font-semibold" style={{ color: BRAND.ink }}>Capacidad</th>
                    <th className="p-4 text-center font-bold" style={{ color: BRAND.primary }}>Rutapp</th>
                    <th className="p-4 text-center font-medium" style={{ color: BRAND.muted }}>Excel</th>
                    <th className="p-4 text-center font-medium" style={{ color: BRAND.muted }}>WhatsApp</th>
                    <th className="p-4 text-center font-medium" style={{ color: BRAND.muted }}>ERP tradicional</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row, i) => (
                    <tr key={row.feat} className={i % 2 ? '' : ''} style={{ borderTop: `1px solid ${BRAND.line}` }}>
                      <td className="p-4 font-medium" style={{ color: BRAND.ink }}>{row.feat}</td>
                      {[row.rut, row.excel, row.wa, row.erp].map((v, j) => (
                        <td key={j} className="p-4 text-center">
                          {v === true ? (
                            <Check className="h-5 w-5 mx-auto" style={{ color: j === 0 ? BRAND.primary : BRAND.muted }} strokeWidth={3} />
                          ) : v === false ? (
                            <X className="h-5 w-5 mx-auto" style={{ color: '#cbd5e1' }} />
                          ) : (
                            <span className="text-[12px] font-medium" style={{ color: BRAND.muted }}>{v}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          TESTIMONIALS
          ============================================================ */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="Clientes"
            title="Lo que dicen quienes ya operan con Rutapp."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <figure key={t.name} className="rounded-2xl border bg-white p-7 flex flex-col"
                style={{ borderColor: BRAND.line }}>
                <blockquote className="text-[16px] leading-relaxed flex-1" style={{ color: BRAND.ink }}>
                  "{t.text}"
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 pt-5 border-t" style={{ borderColor: BRAND.line }}>
                  <div className="h-10 w-10 rounded-full grid place-items-center text-white font-bold text-sm"
                    style={{ background: i % 2 ? BRAND.accent : BRAND.primary }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>{t.name}</div>
                    <div className="text-[12px]" style={{ color: BRAND.muted }}>{t.role} · {t.company}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          PRICING
          ============================================================ */}
      <section id="precios" className="px-6 py-24 md:py-32" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto">
          <SectionTitle
            kicker="Precios"
            title="Simple, predecible, sin sorpresas."
            sub="Empieza gratis 7 días. Cancela cuando quieras. Sin contratos largos."
          />
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map(plan => (
              <div key={plan.slug}
                className="relative rounded-2xl p-7 bg-white border flex flex-col"
                style={{
                  borderColor: plan.popular ? BRAND.primary : BRAND.line,
                  boxShadow: plan.popular ? `0 20px 50px -20px ${BRAND.primary}55` : 'none',
                }}>
                {plan.popular && (
                  <div className="absolute -top-3 left-7 px-3 py-1 rounded-full text-[11px] font-bold text-white"
                    style={{ background: BRAND.primary }}>
                    Más popular
                  </div>
                )}
                <h3 className="text-[20px] font-semibold" style={{ color: BRAND.ink }}>{plan.name}</h3>
                <p className="mt-1 text-[13px]" style={{ color: BRAND.muted }}>{plan.idealFor}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-[44px] font-bold tracking-tight" style={{ color: BRAND.ink, letterSpacing: '-0.02em' }}>
                    {fmtMX(plan.price)}
                  </span>
                  <span className="text-[14px]" style={{ color: BRAND.muted }}>MXN / mes</span>
                </div>
                <p className="mt-1 text-[12px]" style={{ color: BRAND.muted }}>
                  Usuario extra: {fmtMX(EXTRA_USER_PRICE)}/mes
                </p>
                <Link to="/signup" className="mt-6 w-full text-center px-4 py-3 rounded-xl font-semibold text-[14px] transition-all"
                  style={{
                    background: plan.popular ? BRAND.primary : BRAND.ink,
                    color: 'white',
                  }}>
                  Empezar gratis
                </Link>
                <ul className="mt-7 space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: BRAND.ink2 }}>
                      <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BRAND.primary }} strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FINAL CTA
          ============================================================ */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-[32px] overflow-hidden p-10 md:p-16 text-center"
            style={{ background: BRAND.ink }}>
            <div className="absolute inset-0 opacity-50"
              style={{ background: `radial-gradient(60% 80% at 50% 0%, ${BRAND.primary}60, transparent), radial-gradient(40% 60% at 80% 100%, ${BRAND.accent}40, transparent)` }} />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-white leading-[1.05]" style={{ letterSpacing: '-0.025em' }}>
                ¿Listo para controlar toda tu distribuidora?
              </h2>
              <p className="mt-5 text-lg text-white/70 max-w-2xl mx-auto">
                Empieza hoy. Configura tu cuenta en minutos y mira el cambio en la primera ruta.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/signup" className="w-full sm:w-auto px-7 py-4 rounded-xl font-semibold text-[15px] text-white inline-flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                  style={{ background: BRAND.primary, boxShadow: `0 15px 40px -10px ${BRAND.primary}` }}>
                  Solicitar demostración <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/login" className="w-full sm:w-auto px-7 py-4 rounded-xl font-semibold text-[15px] text-white border border-white/15 hover:bg-white/5 transition-all">
                  Iniciar sesión
                </Link>
              </div>
              <p className="mt-6 text-[12px] text-white/50">7 días gratis · sin tarjeta · cancela cuando quieras</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="px-6 pt-16 pb-10 border-t" style={{ borderColor: BRAND.line }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg grid place-items-center text-white font-black" style={{ background: BRAND.primary }}>R</div>
                <span className="text-[17px] font-bold" style={{ color: BRAND.ink }}>Rutapp</span>
              </div>
              <p className="mt-4 text-[14px] max-w-xs leading-relaxed" style={{ color: BRAND.muted }}>
                El sistema operativo para distribuidoras. Ventas, cobranza, inventario, logística e IA — en tiempo real.
              </p>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.ink }}>Producto</div>
              <ul className="space-y-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                <li><a href="#producto">Plataforma</a></li>
                <li><a href="#modulos">Módulos</a></li>
                <li><a href="#movil">App móvil</a></li>
                <li><a href="#ia">IA</a></li>
                <li><a href="#precios">Precios</a></li>
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.ink }}>Empresa</div>
              <ul className="space-y-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                <li><Link to="/partners">Partners</Link></li>
                <li><Link to="/tutoriales">Tutoriales</Link></li>
                <li><Link to="/privacidad">Privacidad</Link></li>
                <li><Link to="/terminos">Términos</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.ink }}>Cuenta</div>
              <ul className="space-y-2 text-[14px]" style={{ color: BRAND.ink2 }}>
                <li><Link to="/login">Iniciar sesión</Link></li>
                <li><Link to="/signup">Empezar gratis</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-3"
            style={{ borderColor: BRAND.line }}>
            <p className="text-[12px]" style={{ color: BRAND.muted }}>© {new Date().getFullYear()} Rutapp · Hecho en México</p>
            <p className="text-[12px]" style={{ color: BRAND.muted }}>rutapp.mx</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
