import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import rutappLogo from '@/assets/rutapp-logo.jpeg.asset.json';
import {
  ShoppingCart, Users, Package, Wallet, Truck, Check, X,
  ArrowRight, Menu, Route, CreditCard, Radio, FileText,
  WifiOff, Brain, Boxes, LineChart, Zap, AlertTriangle,
  Award, Sparkles, BarChart3, MapPin,
} from 'lucide-react';
import { LiveSupervisorMap, LiveMobileApp, LiveDashboardMockup } from '@/components/landing/LiveMockups';
import { ModuleVisual } from '@/components/landing/ModuleVisuals';
import { PhoneRutero, PhonePOS, PhoneCobro, PhoneEntrega } from '@/components/landing/MobileAppScreens';
import { Seo } from '@/components/seo/Seo';
import { useFacebookPixel } from '@/hooks/useFacebookPixel';
import { Reveal } from '@/components/landing/Reveal';
import LandingChatWidget from '@/components/landing/LandingChatWidget';
import MobileDemoSimulator from '@/components/landing/MobileDemoSimulator';
import { WhatsAppAgentSection } from '@/components/landing/WhatsAppAgentSection';
import { Parallax, Float } from '@/components/landing/Parallax';
import { motion } from 'motion/react';
import { useLenis } from '@/hooks/useLenis';
import offlineImg from '@/assets/landing/offline-vendedor.jpg';
import papelImg from '@/assets/landing/vendedor-ticket-calle.jpg';
import tiendaImg from '@/assets/landing/tienda-online.jpg';


const BRAND = {
  primary: '#0060e8',
  primarySoft: '#e6efff',
  accent: '#fe8c1a',
  ink: '#0a1530',
  ink2: '#3b4863',
  muted: '#6b7791',
  line: '#eef0f5',
  surface: '#f7f8fb',
};

const LANDING_JSON_LD = [
  { '@context': 'https://schema.org', '@type': 'Organization', name: 'Rutapp', url: 'https://rutapp.mx',
    logo: 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png' },
  { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Rutapp',
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, iOS',
    description: 'ERP para distribuidoras con IA. Ventas, cobranza, inventario, ruta.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN' } },
];

const MODULES: {
  icon: any; t: string; d: string;
  star: { t: string; d: string };
  features: string[];
  why: string;
}[] = [
  {
    icon: ShoppingCart, t: 'Ventas', d: 'POS, preventa y pedidos',
    star: { t: 'Rutero de preventa', d: 'Cada vendedor abre su ruta del día y captura pedidos en segundos: producto sugerido por cliente, precios y promociones aplicadas automáticamente.' },
    features: [
      'POS con búsqueda por código de barras',
      'Preventa con pedidos sugeridos por cliente',
      'Venta directa con entrega inmediata',
      'Promociones nxm y % acumulables',
      'Listas de precios por cliente o zona',
      'Crédito con validación en tiempo real',
    ],
    why: 'El vendedor deja de improvisar: ve qué pide normalmente cada cliente, qué dejó de comprar y a qué precio.',
  },
  {
    icon: Wallet, t: 'Cobranza', d: 'FIFO y multi-folio',
    star: { t: 'Cobro multi-folio FIFO', d: 'Un solo pago aplica automáticamente a las facturas más viejas. El recibo se imprime térmico o se manda por WhatsApp al instante.' },
    features: [
      'Aplicación FIFO automática',
      'Múltiples folios en un mismo cobro',
      'Recibos térmicos y por WhatsApp',
      'Liquidación de ruta con efectivo esperado',
      'Saldo anterior y nuevo en cada documento',
      'Cancelación con desligado de aplicaciones',
    ],
    why: 'Cero confusión sobre qué se pagó. El cobrador no decide a mano qué aplicar.',
  },
  {
    icon: Package, t: 'Inventario', d: 'Multi-almacén · Kardex',
    star: { t: 'Kardex granular en vivo', d: 'Cada movimiento (venta, compra, traspaso, ajuste) queda registrado con folio, hora y usuario. Auditas el stock minuto a minuto.' },
    features: [
      'Múltiples almacenes con stock independiente',
      'Traspasos con bloqueo de fila',
      'Conteos físicos con reconciliación',
      'Productos a granel (3 decimales)',
      'Presentaciones (caja, paquete, pieza)',
      'Permitir venta con stock negativo (opcional)',
    ],
    why: 'Sabes en qué almacén, en qué camión y desde cuándo está cada unidad.',
  },
  {
    icon: Truck, t: 'Logística', d: 'Cargas, surtido y rutas',
    star: { t: 'Surtido de pedidos', d: 'El bodeguero ve el concentrado del día: cuánto producto sale total, por ruta, por vendedor. Carga el camión con la cantidad exacta y descuenta del almacén automáticamente.' },
    features: [
      'Concentrado de surtido por día y ruta',
      'Orden de carga con confirmación',
      'Descarga con diferencias y motivos',
      'Optimización de ruta con GPS (vecino + 2-opt)',
      'Entrega con firma y foto',
      'Liquidación inmutable al cierre de ruta',
    ],
    why: 'El camión sale con lo justo. Las diferencias quedan documentadas con motivo.',
  },
  {
    icon: CreditCard, t: 'Compras', d: 'Órdenes y proveedores',
    star: { t: 'Compras sugeridas con IA', d: 'El sistema analiza venta histórica, stock mínimo, días de cobertura y tiempo de entrega del proveedor. Te dice qué pedir, cuánto y a quién — listo para enviar la orden.' },
    features: [
      'Sugerencias de compra por IA',
      'Órdenes a proveedores con recepción parcial',
      'Pagos a proveedores con FIFO',
      'Cuentas por pagar y estado de cuenta',
      'Costos con o sin impuestos',
      'Proveedor preferido por producto',
    ],
    why: 'Dejas de comprar de más o quedarte sin producto los días pico.',
  },
  {
    icon: Users, t: 'Clientes', d: 'CRM con historial',
    star: { t: 'Ficha 360° del cliente', d: 'Ves su historial de compras, saldo, última visita, ubicación GPS, productos que más pide y los que dejó de comprar. Todo en una pantalla.' },
    features: [
      'Alta con GPS y foto de fachada',
      'Frecuencia y día de visita',
      'Límite y días de crédito',
      'Pedido sugerido por cliente',
      'Estado de cuenta público (link)',
      'Catálogo compartible por WhatsApp',
    ],
    why: 'Cada cliente es una ficha viva, no una fila en Excel.',
  },
  {
    icon: LineChart, t: 'Finanzas', d: 'CxC · CxP · Gastos',
    star: { t: 'Estado de cuenta en tiempo real', d: 'Por cliente, por proveedor, por vendedor: saldo anterior, movimientos y saldo nuevo. Auditable y exportable.' },
    features: [
      'Cuentas por cobrar y por pagar',
      'Gastos con foto del ticket',
      'Multimoneda con conversión automática',
      'Saldos iniciales sin afectar inventario',
      'Reportes contables exportables',
      'Caja y turnos con corte',
    ],
    why: 'Sabes cuánto te deben, cuánto debes y cuánto entró hoy — sin esperar al contador.',
  },
  {
    icon: Award, t: 'Comisiones', d: 'Reglas por vendedor',
    star: { t: 'Comisiones por producto y meta', d: 'Define % por producto, por categoría o por meta cumplida. El sistema calcula la comisión por venta cobrada (no facturada).' },
    features: [
      'Comisión por producto o categoría',
      'Calculada sobre venta cobrada',
      'Metas mensuales por vendedor',
      'Reporte de seguimiento de metas',
      'Esquemas por equipo',
      'Visible para el vendedor en su app',
    ],
    why: 'El vendedor sabe qué empujar y cuánto va a ganar en tiempo real.',
  },
  {
    icon: FileText, t: 'Reportes', d: 'Operativos y auditables',
    star: { t: 'Control y auditoría', d: 'Detecta descuentos excesivos, ventas bajo costo, anomalías de cobro y vendedores inactivos. El dueño deja de auditar a mano.' },
    features: [
      'Dashboard supervisor con 8 KPIs',
      'Reporte diario consolidado',
      'Detalle por producto y por vendedor',
      'Control de fraude y descuentos',
      'Exportable a Excel y PDF',
      'Filtros avanzados multi-criterio',
    ],
    why: 'Auditas en segundos lo que antes tardaba días.',
  },
  {
    icon: Brain, t: 'IA', d: 'Asesor inteligente',
    star: { t: 'Asesor Rutapp IA', d: 'Analiza tu operación todos los días y te suelta acciones concretas: qué comprar, qué cliente está en riesgo, qué vendedor destaca y qué movimientos son sospechosos.' },
    features: [
      'Sugerencias de reposición de stock',
      'Detección de clientes en riesgo de fuga',
      'Identificación de vendedores destacados',
      'Anomalías en ventas y cobros',
      'Predicción de demanda',
      'Resumen diario accionable',
    ],
    why: 'Tienes un analista trabajando 24/7 sin contratarlo.',
  },
];


const AI_CARDS = [
  { icon: Boxes, t: 'Reponer', d: 'Coca 600ml caerá a crítico en 3 días. Comprar 240.', tone: BRAND.primary },
  { icon: AlertTriangle, t: 'Riesgo', d: 'Don Pepe bajó 38% sus compras. Visita prioritaria.', tone: '#dc2626' },
  { icon: Award, t: 'Destacado', d: 'Juan L. 12% arriba de meta. Replicar su ruta.', tone: BRAND.accent },
  { icon: Radio, t: 'Anomalía', d: '3 ventas bajo costo en la última hora. Revisar.', tone: '#7c3aed' },
];

const COMPARE = [
  ['Tiempo real', true, false, false, 'Parcial'],
  ['Tolerancia a cortes', true, false, false, false],
  ['GPS y ruta', true, false, false, false],
  ['Cobranza FIFO', true, false, false, true],
  ['IA integrada', true, false, false, false],
  ['Implementación', 'Días', '—', '—', 'Meses'],
] as const;

const PLANS = [
  { slug: 'individual', name: 'Individual', price: 450, users: 1, popular: false },
  { slug: 'equipo', name: 'Equipo', price: 900, users: 3, popular: true },
  { slug: 'empresa', name: 'Empresa', price: 1500, users: 5, popular: false },
];

const fmtMX = (n: number) => `$${n.toLocaleString('es-MX')}`;

// Tasas aproximadas desde 1 MXN — el cliente puede ver el precio en su moneda local.
const CURRENCIES: { code: string; label: string; symbol: string; rate: number; locale: string; decimals: number }[] = [
  { code: 'MXN', label: '🇲🇽 Peso mexicano',   symbol: '$',   rate: 1,       locale: 'es-MX', decimals: 0 },
  { code: 'USD', label: '🇺🇸 Dólar (USD)',      symbol: '$',   rate: 0.055,   locale: 'en-US', decimals: 2 },
  { code: 'EUR', label: '🇪🇺 Euro',             symbol: '€',   rate: 0.051,   locale: 'es-ES', decimals: 2 },
  { code: 'GTQ', label: '🇬🇹 Quetzal',          symbol: 'Q',   rate: 0.43,    locale: 'es-GT', decimals: 2 },
  { code: 'CLP', label: '🇨🇱 Peso chileno',     symbol: '$',   rate: 51,      locale: 'es-CL', decimals: 0 },
  { code: 'ARS', label: '🇦🇷 Peso argentino',   symbol: '$',   rate: 55,      locale: 'es-AR', decimals: 0 },
  { code: 'COP', label: '🇨🇴 Peso colombiano',  symbol: '$',   rate: 230,     locale: 'es-CO', decimals: 0 },
  { code: 'PEN', label: '🇵🇪 Sol peruano',      symbol: 'S/',  rate: 0.20,    locale: 'es-PE', decimals: 2 },
  { code: 'BOB', label: '🇧🇴 Boliviano',        symbol: 'Bs',  rate: 0.38,    locale: 'es-BO', decimals: 2 },
];

const fmtCur = (mxn: number, c: typeof CURRENCIES[number]) => {
  const v = mxn * c.rate;
  return `${c.symbol}${v.toLocaleString(c.locale, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })}`;
};

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [scrolled, setScrolled] = useState(false);
  const [glow, setGlow] = useState({ x: 50, y: 30, visible: false });

  const [searchParams] = useSearchParams();
  useFacebookPixel();
  useLenis();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) localStorage.setItem('rutapp_partner_ref', ref);
  }, [searchParams]);

  useEffect(() => {
    import('@/pwa/registerSW').then(({ ensureNoSWForPublicPage }) => ensureNoSWForPublicPage());
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return <PirateBlockPage />;
  return (
    <div className="min-h-[100dvh] bg-white overflow-x-hidden antialiased"
      style={{ color: BRAND.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Seo
        title="Rutapp · ERP para distribuidoras con IA"
        description="Ventas, cobranza, inventario, ruta GPS e IA en la nube. App móvil que tolera cortes de internet sin perder ventas."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      {/* NAV — glass + shrink on scroll */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${scrolled ? 'bg-white/75 shadow-[0_8px_30px_-15px_rgba(10,21,48,0.18)]' : 'bg-white/60'}`}
        style={{ borderColor: scrolled ? 'rgba(238,240,245,0.9)' : 'transparent', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
          <div className={`max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-5 transition-all duration-300 overflow-hidden ${scrolled ? 'h-12' : 'h-14'}`}>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src={rutappLogo.url} alt="Rutapp" className={`w-auto rounded-md transition-all duration-300 ${scrolled ? 'h-7' : 'h-8'}`} />
            <span className="text-[15px] font-bold tracking-tight max-[340px]:hidden">Rutapp</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-[13px]" style={{ color: BRAND.ink2 }}>
            <Link to="/modulos" className="transition-colors hover:text-[color:var(--brand-primary,#0060e8)]">Módulos</Link>
            <Link to="/precios" className="transition-colors hover:text-[color:var(--brand-primary,#0060e8)]">Precios</Link>
            <Link to="/giros" className="transition-colors hover:text-[color:var(--brand-primary,#0060e8)]">Giros</Link>
            <a href="#ia" className="inline-flex items-center gap-1 transition-colors hover:text-[color:var(--brand-primary,#0060e8)]">IA <span className="text-[9px] px-1 rounded text-white font-bold" style={{ background: BRAND.accent }}>NEW</span></a>
            <Link to="/partners" className="transition-colors hover:text-[color:var(--brand-primary,#0060e8)]">Partners</Link>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className="px-3 py-1.5 text-[13px] font-medium transition-colors" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
            <Link to="/signup" className="px-3.5 py-1.5 text-[13px] font-semibold text-white rounded-lg inline-flex items-center gap-1 transition-all duration-200 hover:scale-[1.04] hover:shadow-lg"
              style={{ background: BRAND.ink }}>
              Empezar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex md:hidden shrink-0 items-center gap-1">
            <Link to="/login" className="px-2 py-1 text-xs font-medium" style={{ color: BRAND.ink2 }}>Entrar</Link>
            <Link to="/signup" className="px-2 py-1 text-xs font-semibold text-white rounded" style={{ background: BRAND.ink }}>Probar</Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-1.5 shrink-0" aria-label="Menú">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-5 py-3 space-y-2.5 text-sm animate-[fade-in_0.25s_ease-out]" style={{ borderColor: BRAND.line }}>
            <Link to="/modulos" onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>Módulos</Link>
            <Link to="/precios" onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>Precios</Link>
            <Link to="/giros" onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>Giros</Link>
            <a href="#ia" onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>IA</a>
            <Link to="/login" className="block font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      {/* HERO — side-by-side, edge-to-edge on desktop */}
      <section
        className="relative overflow-hidden pb-12 px-4 sm:px-6 lg:px-8 xl:px-10"
        style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setGlow({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, visible: true });
        }}
        onMouseLeave={() => setGlow(g => ({ ...g, visible: false }))}
      >
        {/* Breathing brand glow */}
        <div
          className="absolute inset-x-0 top-0 h-[620px] -z-10 animate-breathe-glow pointer-events-none will-change-transform"
          style={{ background: `radial-gradient(65% 55% at 50% 0%, ${BRAND.primarySoft} 0%, transparent 65%)` }}
        />
        {/* Secondary warm accent breathing */}
        <div
          className="absolute -z-10 right-[-10%] top-[8%] h-[420px] w-[420px] rounded-full blur-3xl opacity-30 animate-breathe-glow pointer-events-none"
          style={{ background: `radial-gradient(circle, ${BRAND.accent}55, transparent 70%)`, animationDelay: '1.5s' }}
        />
        {/* Cursor-follow glow (desktop) */}
        <div
          className="absolute -z-10 pointer-events-none transition-opacity duration-500 hidden md:block"
          style={{
            opacity: glow.visible ? 0.55 : 0,
            left: `${glow.x}%`, top: `${glow.y}%`,
            width: 520, height: 520, transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${BRAND.primary}33 0%, transparent 60%)`,
            filter: 'blur(20px)',
          }}
        />

        <div className="max-w-[1440px] mx-auto grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          <div className="lg:col-span-5 xl:col-span-5">
            <Reveal variant="up" duration={350}>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-white"
                style={{ borderColor: BRAND.line, color: BRAND.ink2 }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: BRAND.accent }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: BRAND.accent }} />
                </span>
                Nuevo · Asesor con IA
              </div>
            </Reveal>
            <Reveal variant="up" delay={60} duration={420}>
              <h1 className="mt-4 text-[32px] sm:text-[42px] md:text-[52px] lg:text-[58px] font-semibold leading-[1.05] tracking-tight" style={{ letterSpacing: '-0.035em' }}>
                Tu distribuidora,<br />
                <span className="relative inline-block">
                  en una sola pantalla.
                  <span className="absolute left-0 -bottom-1 h-[4px] md:h-[5px] w-full rounded-full origin-left animate-[underlineGrow_700ms_cubic-bezier(0.22,1,0.36,1)_300ms_both]"
                    style={{ background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent})` }} />
                </span>
              </h1>
            </Reveal>
            <Reveal variant="up" delay={140}>
              <p className="mt-4 md:mt-5 text-[14.5px] md:text-[16px] leading-relaxed max-w-md" style={{ color: BRAND.ink2 }}>
                Ventas, cobranza, inventario, ruta GPS e <b style={{ color: BRAND.ink }}>IA</b> en la nube. App móvil que aguanta cortes de internet y sincroniza al recuperar señal.
              </p>
            </Reveal>
            <Reveal variant="up" delay={200}>
              <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
                <button
                  onClick={() => setSimulatorOpen(true)}
                  className="group w-full sm:w-auto justify-center px-5 py-3 text-[14px] font-semibold text-white rounded-lg inline-flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                  style={{ background: BRAND.primary, boxShadow: `0 12px 30px -10px ${BRAND.primary}99` }}
                >
                  <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" /> Probar venta móvil ahora
                </button>
                <Link to="/signup" className="group w-full sm:w-auto justify-center px-5 py-3 text-[14px] font-semibold rounded-lg inline-flex items-center gap-2 border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                  Solicitar demo <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <a href="#modulos" className="hidden sm:inline-flex w-full sm:w-auto justify-center px-5 py-3 text-[14px] font-semibold rounded-lg border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                  Ver módulos
                </a>
              </div>
            </Reveal>
            <Reveal variant="fade" delay={260}>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] md:text-[12.5px]" style={{ color: BRAND.muted }}>
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> 7 días gratis</span>
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> No se cobra hasta el día 8</span>
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Listo en días</span>
              </div>
            </Reveal>
          </div>

          {/* Bento mockups — edge-to-edge, larger */}
          <Reveal variant="scale" delay={120} duration={500} className="hidden sm:block lg:col-span-7 xl:col-span-7">
            <div className="grid grid-cols-6 grid-rows-2 gap-3 h-[380px] md:h-[480px] lg:h-[520px] overflow-hidden rounded-2xl p-1">
              <Parallax offset={30} className="col-span-4 row-span-2">
                <div className="rounded-2xl overflow-hidden border bg-white transition-transform duration-300 hover:-translate-y-1 h-full"
                  style={{ borderColor: BRAND.line, boxShadow: '0 25px 60px -20px rgba(10,21,48,0.18)' }}>
                  <LiveDashboardMockup />
                </div>
              </Parallax>
              <Parallax offset={60} className="col-span-2">
                <div className="rounded-2xl overflow-hidden border bg-white transition-transform duration-300 hover:-translate-y-1 h-full"
                  style={{ borderColor: BRAND.line, boxShadow: '0 20px 40px -15px rgba(10,21,48,0.15)' }}>
                  <LiveSupervisorMap />
                </div>
              </Parallax>
              <Parallax offset={-40} className="col-span-2">
                <div className="rounded-2xl border bg-white grid place-items-center overflow-hidden transition-transform duration-300 hover:-translate-y-1 h-full"
                  style={{ borderColor: BRAND.line, boxShadow: '0 20px 40px -15px rgba(10,21,48,0.15)' }}>
                  <div className="scale-75 origin-center"><LiveMobileApp /></div>
                </div>
              </Parallax>
            </div>
          </Reveal>
        </div>
      </section>

      {/* STATS strip */}
      <section className="px-4 sm:px-6 lg:px-8 py-8 border-y" style={{ borderColor: BRAND.line, background: BRAND.surface }}>
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            ['10', 'Módulos integrados'],
            ['Nube', 'En tiempo real'],
            ['Tiempo real', 'GPS y stock'],
            ['Días', 'No meses'],
          ].map(([n, l]) => (
            <div key={l as string}>
              <div className="text-[26px] md:text-[32px] font-bold tracking-tight" style={{ color: BRAND.primary }}>{n}</div>
              <div className="text-[12px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: BRAND.muted }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* VIDEO — Mira qué y cómo es Rutapp */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Video</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight leading-tight" style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>
              Mira qué y cómo es <span style={{ color: BRAND.primary }}>Rutapp</span>
            </h2>
            <p className="mt-3 text-[14px] md:text-[15px]" style={{ color: BRAND.muted }}>
              En pocos minutos descubre cómo funciona y por qué cientos de distribuidoras ya lo usan.
            </p>
          </div>
          <div className="relative w-full overflow-hidden rounded-2xl shadow-xl border" style={{ borderColor: BRAND.line, aspectRatio: '16 / 9' }}>
            <iframe
              src="https://www.youtube.com/embed/0pkauD3ZBYI?rel=0"
              title="Mira qué y cómo es Rutapp"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* MODULES — bento dense */}
      <section id="modulos" className="px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Módulos</span>
              <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight leading-tight" style={{ letterSpacing: '-0.025em' }}>
                10 módulos. <span style={{ color: BRAND.primary }}>Una plataforma.</span>
              </h2>
            </div>
            <Link to="/signup" className="text-[13px] font-semibold inline-flex items-center gap-1" style={{ color: BRAND.primary }}>
              Probar gratis <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            {MODULES.map((m, i) => (
              <Reveal key={m.t} variant="up" delay={i * 35} duration={350}>
                <motion.div
                  whileHover={{ y: -6, scale: 1.03 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="group rounded-xl border bg-white p-4 hover:shadow-lg hover:border-transparent cursor-default"
                  style={{ borderColor: BRAND.line }}
                >
                  <m.icon className="h-4 w-4 mb-2 transition-transform duration-200 group-hover:scale-110" style={{ color: BRAND.primary }} />
                  <div className="text-[13.5px] font-semibold">{m.t}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: BRAND.muted }}>{m.d}</div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>

        <WhatsAppAgentSection />

        {/* CTA a página de módulos */}
        <div className="max-w-[1440px] mx-auto mt-10 text-center">
          <Link to="/modulos" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[13.5px] border bg-white hover:shadow-md transition-all"
            style={{ borderColor: BRAND.line, color: BRAND.ink }}>
            Ver los 10 módulos a detalle <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>


      {/* MOBILE — phones showcase */}
      <section id="movil" className="px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative overflow-hidden" style={{ background: BRAND.surface }}>
        <div className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: `radial-gradient(60% 40% at 50% 0%, ${BRAND.primarySoft}, transparent)` }} />
        <div className="max-w-[1440px] mx-auto relative">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>App móvil</span>
            <h2 className="mt-2 text-[28px] md:text-[44px] font-semibold tracking-tight leading-[1.05]" style={{ letterSpacing: '-0.025em' }}>
              Tu distribuidora <span style={{ color: BRAND.primary }}>en el bolsillo de tu vendedor.</span>
            </h2>
            <p className="mt-4 text-[14.5px] md:text-[16px] leading-relaxed" style={{ color: BRAND.muted }}>
              Rutero, venta, cobro y entrega — diseñados para tocarse con el pulgar y tolerar cortes de red.
            </p>
          </div>

          {/* Phones row */}
          <div className="mt-12 md:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-6 [&>*]:scale-90 [&>*]:origin-top lg:[&>*]:scale-100">
            <Reveal variant="up" delay={0} duration={480} className="lg:translate-y-6"><Float amplitude={8} duration={5} delay={0}><PhoneRutero /></Float></Reveal>
            <Reveal variant="up" delay={90} duration={480}><Float amplitude={8} duration={5.5} delay={0.4}><PhonePOS /></Float></Reveal>
            <Reveal variant="up" delay={180} duration={480} className="lg:translate-y-6"><Float amplitude={8} duration={5.2} delay={0.8}><PhoneCobro /></Float></Reveal>
            <Reveal variant="up" delay={270} duration={480}><Float amplitude={8} duration={5.7} delay={1.2}><PhoneEntrega /></Float></Reveal>
          </div>

          {/* Feature pills */}
          <div className="mt-14 max-w-[1100px] mx-auto grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              [Zap, 'Venta en segundos'],
              [Wallet, 'Cobro multi-folio FIFO'],
              [MapPin, 'GPS por cliente'],
              [Truck, 'Entrega con firma'],
              [Package, 'Stock del camión'],
              [WifiOff, 'Tolera cortes de red'],
            ].map(([Icon, t]: any, i: number) => (
              <Reveal key={t} variant="up" delay={i * 50} duration={350}>
                <div className="group flex items-center gap-2.5 text-[13px] bg-white border rounded-lg px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  style={{ color: BRAND.ink, borderColor: BRAND.line }}>
                  <span className="h-7 w-7 rounded-md grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                    style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium">{t}</span>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Supervisor map — bonus */}
          <div className="mt-16 grid lg:grid-cols-5 gap-8 items-center">
            <div className="lg:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Supervisor en vivo</span>
              <h3 className="mt-2 text-[22px] md:text-[28px] font-semibold tracking-tight leading-tight" style={{ letterSpacing: '-0.022em', color: BRAND.ink }}>
                Mira a todo tu equipo en un mapa.
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Ubicación, ventas del día, batería y última visita — sin llamarles ni un solo WhatsApp.
              </p>
            </div>
            <div className="lg:col-span-3 rounded-2xl overflow-hidden border bg-white"
              style={{ borderColor: BRAND.line, boxShadow: '0 25px 50px -20px rgba(10,21,48,0.2)' }}>
              <LiveSupervisorMap />
            </div>
          </div>
        </div>
      </section>

      {/* AI — dark, dense */}
      <section id="ia" className="px-4 sm:px-6 lg:px-8 py-16 md:py-20 relative overflow-hidden" style={{ background: BRAND.ink }}>
        <div className="absolute inset-0 opacity-40"
          style={{ background: `radial-gradient(40% 50% at 70% 30%, ${BRAND.primary}66, transparent), radial-gradient(35% 45% at 20% 80%, ${BRAND.accent}40, transparent)` }} />
        <div className="max-w-[1440px] mx-auto relative grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
              <Sparkles className="h-3 w-3" style={{ color: BRAND.accent }} /> Asesor IA
            </span>
            <h2 className="mt-3 text-[28px] md:text-[40px] font-semibold tracking-tight leading-tight text-white" style={{ letterSpacing: '-0.025em' }}>
              IA que <span style={{ color: BRAND.accent }}>te dice qué hacer hoy.</span>
            </h2>
            <p className="mt-4 text-[14.5px] text-white/65 leading-relaxed">
              Lee tus datos, detecta lo que importa y te avisa. Sin reportes que nadie lee.
            </p>
            <Link to="/signup" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-lg text-white"
              style={{ background: BRAND.primary }}>
              Probar gratis <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AI_CARDS.map((ex, i) => (
              <Reveal key={ex.t} variant="scale" delay={i * 70} duration={400}>
                <div className="group rounded-xl p-4 border backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.07]"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                      style={{ background: `${ex.tone}22`, color: ex.tone }}>
                      <ex.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/50">{ex.t}</div>
                      <p className="text-[13.5px] text-white leading-snug mt-0.5">{ex.d}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* OFFLINE — Funciona sin internet */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20" style={{ background: BRAND.ink }}>
        <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div className="text-white">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full" style={{ background: 'rgba(254,140,26,0.15)', color: BRAND.accent }}>
                <WifiOff className="h-3.5 w-3.5" /> Sin internet
              </span>
              <h2 className="mt-3 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
                Funciona aunque no haya señal.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: '#b8c4dd' }}>
                Tu vendedor vende, cobra e imprime tickets en zonas sin red. Todo se guarda en el celular y se sincroniza solo cuando vuelve la conexión. Cero pedidos perdidos.
              </p>
              <ul className="mt-5 space-y-2.5 text-[14px]" style={{ color: '#dde4f3' }}>
                {['Ventas, cobros y entregas 100% offline','Cola de sincronización visible en pantalla','Auto-sync al recuperar señal','Tickets térmicos por Bluetooth sin internet'].map(x => (
                  <li key={x} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.accent }} strokeWidth={3}/>{x}</li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <img src={offlineImg} alt="Vendedor usando Rutapp sin internet" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ADIÓS AL PAPEL */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div className="rounded-2xl overflow-hidden border order-2 md:order-1" style={{ borderColor: BRAND.line }}>
              <img src={papelImg} alt="Vendedor imprimiendo ticket en la calle" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="order-1 md:order-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full" style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                <FileText className="h-3.5 w-3.5" /> Adiós al papel
              </span>
              <h2 className="mt-3 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
                Olvídate de la nota de papel.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Cero recapturas en oficina. El vendedor toma el pedido, cobra e imprime el ticket en la calle. Todo entra al sistema en tiempo real, sin errores de transcripción.
              </p>
              <ul className="mt-5 space-y-2.5 text-[14px]" style={{ color: BRAND.ink2 }}>
                {['Ticket térmico Bluetooth desde el celular','Sin recapturar pedidos a mano','Inventario y cobranza al instante','Cliente firma o confirma en pantalla'].map(x => (
                  <li key={x} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.primary }} strokeWidth={3}/>{x}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* TIENDA EN LÍNEA */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20" style={{ background: BRAND.surface }}>
        <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full" style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                <ShoppingCart className="h-3.5 w-3.5" /> Tienda en línea
              </span>
              <h2 className="mt-3 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
                Tu propia tienda online. Sin desarrollar nada.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Activas tu tienda con un clic. Tus clientes entran con su usuario, ven los precios de su lista asignada y mandan pedidos directo al sistema. Te llega notificación con campanita en tiempo real.
              </p>
              <ul className="mt-5 space-y-2.5 text-[14px]" style={{ color: BRAND.ink2 }}>
                {['Catálogo con tus precios personalizados por cliente','Pedidos entran como borrador para que los autorices','Notificación instantánea de nuevos pedidos','Logo, banner y URL propia (rutapp.mx/tienda/tu-marca)'].map(x => (
                  <li key={x} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.primary }} strokeWidth={3}/>{x}</li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl overflow-hidden border shadow-xl" style={{ borderColor: BRAND.line }}>
              <img src={tiendaImg} alt="Tienda en línea Rutapp" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMPARE — compact table */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-[1280px] mx-auto">
          <div className="text-center mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Comparativa</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              Rutapp vs el caos actual.
            </h2>
          </div>
          <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: BRAND.line }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px] md:text-[13.5px]">
                <thead>
                  <tr style={{ background: BRAND.surface }}>
                    <th className="text-left p-2.5 md:p-3.5 font-semibold">Capacidad</th>
                    <th className="p-2.5 md:p-3.5 text-center font-bold" style={{ color: BRAND.primary }}>Rutapp</th>
                    <th className="p-2.5 md:p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>Excel</th>
                    <th className="p-2.5 md:p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>WhatsApp</th>
                    <th className="p-2.5 md:p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>ERP</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row[0] as string} style={{ borderTop: `1px solid ${BRAND.line}` }}>
                      <td className="p-2.5 md:p-3.5 font-medium">{row[0]}</td>
                      {row.slice(1).map((v, j) => (
                        <td key={j} className="p-2.5 md:p-3.5 text-center">
                          {v === true ? <Check className="h-4 w-4 mx-auto" style={{ color: j === 0 ? BRAND.primary : BRAND.muted }} strokeWidth={3} />
                            : v === false ? <X className="h-4 w-4 mx-auto" style={{ color: '#cbd5e1' }} />
                            : <span className="text-[12px] font-medium" style={{ color: BRAND.muted }}>{v}</span>}
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

      {/* PRICING — teaser, detalle en /precios */}
      <section id="precios" className="px-4 sm:px-6 lg:px-8 py-16 md:py-20" style={{ background: BRAND.surface }}>
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Precios</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              Simple. Sin sorpresas.
            </h2>
            <p className="mt-2 text-[14px]" style={{ color: BRAND.muted }}>Desde $450 MXN/mes · 7 días gratis · cancela cuando quieras</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map(p => (
              <div key={p.slug} className="relative rounded-2xl p-6 bg-white border flex flex-col"
                style={{ borderColor: p.popular ? BRAND.primary : BRAND.line, boxShadow: p.popular ? `0 20px 50px -20px ${BRAND.primary}55` : 'none' }}>
                {p.popular && (
                  <div className="absolute -top-2.5 left-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold text-white" style={{ background: BRAND.primary }}>
                    Más popular
                  </div>
                )}
                <h3 className="text-[18px] font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[36px] font-bold tracking-tight">${p.price.toLocaleString('es-MX')}</span>
                  <span className="text-[13px]" style={{ color: BRAND.muted }}>MXN /mes</span>
                </div>
                <p className="mt-1 text-[12.5px]" style={{ color: BRAND.muted }}>{p.users} usuarios incluidos</p>
                <Link to="/signup" className="mt-5 w-full text-center px-4 py-2.5 rounded-lg font-semibold text-[13.5px] text-white"
                  style={{ background: p.popular ? BRAND.primary : BRAND.ink }}>
                  Empezar gratis
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/precios" className="inline-flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: BRAND.primary }}>
              Ver detalle de precios y monedas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>


      {/* CTA — el gran final */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative">
        <Reveal variant="scale" duration={500} className="max-w-[1280px] mx-auto block">
          <div className="relative rounded-3xl overflow-hidden p-10 md:p-16 text-center"
            style={{ background: `linear-gradient(135deg, ${BRAND.ink} 0%, #122550 55%, ${BRAND.ink} 100%)` }}>
            {/* Breathing aura */}
            <div className="absolute inset-0 opacity-70 animate-breathe-glow pointer-events-none"
              style={{ background: `radial-gradient(55% 75% at 50% 0%, ${BRAND.primary}80, transparent 60%), radial-gradient(45% 70% at 85% 100%, ${BRAND.accent}55, transparent 65%)` }} />
            {/* Subtle grid texture */}
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            <div className="relative">
              <Sparkles className="h-7 w-7 mx-auto mb-4 text-white/80 animate-float-slow" />
              <h2 className="text-[28px] md:text-[44px] font-semibold tracking-tight text-white leading-[1.05]" style={{ letterSpacing: '-0.03em' }}>
                ¿Listo para controlar tu distribuidora?
              </h2>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/signup" className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-[14.5px] text-white inline-flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.04] hover:-translate-y-0.5 animate-pulse-cta"
                  style={{ background: BRAND.primary }}>
                  Solicitar demo <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link to="/login" className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-[14.5px] text-white border border-white/15 backdrop-blur-sm bg-white/5 transition-all duration-200 hover:bg-white/10 hover:-translate-y-0.5">
                  Iniciar sesión
                </Link>
              </div>
              <p className="mt-5 text-[12.5px] text-white/55">7 días gratis · registras tarjeta y el cobro empieza hasta el día 8</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="px-4 sm:px-6 lg:px-8 pt-10 pb-6 border-t" style={{ borderColor: BRAND.line }}>
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md grid place-items-center text-white font-black text-[10px]" style={{ background: BRAND.primary }}>R</div>
            <span className="text-[14px] font-bold">Rutapp</span>
            <span className="text-[12px] ml-3" style={{ color: BRAND.muted }}>© {new Date().getFullYear()} · Hecho en México</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]" style={{ color: BRAND.ink2 }}>
            <Link to="/partners">Partners</Link>
            <Link to="/tutoriales">Tutoriales</Link>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/terminos">Términos</Link>
          </div>
        </div>
      </footer>

      <LandingChatWidget />
      <MobileDemoSimulator open={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
}
