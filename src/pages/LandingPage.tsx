import { useState, useEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import rutappLogo from '@/assets/rutapp-logo.jpeg.asset.json';
import {
  ShoppingCart, Users, Package, Wallet, Truck, Check, X,
  ArrowRight, Menu, Route, CreditCard, Radio, FileText,
  WifiOff, Brain, Boxes, LineChart, Zap, AlertTriangle,
  Award, Sparkles, BarChart3, MapPin,
} from 'lucide-react';
import { LiveSupervisorMap } from '@/components/landing/LiveMockups';
import { DashboardScreen, MobileVentasScreen } from '@/components/landing/SystemMocks';
import { ModuleVisual } from '@/components/landing/ModuleVisuals';
import { PhoneRutero, PhonePOS, PhoneCobro, PhoneEntrega } from '@/components/landing/MobileAppScreens';
import { Seo } from '@/components/seo/Seo';
import { useFacebookPixel } from '@/hooks/useFacebookPixel';
import { Reveal } from '@/components/landing/Reveal';
import LandingChatWidget from '@/components/landing/LandingChatWidget';
import MobileDemoSimulator from '@/components/landing/MobileDemoSimulator';
import { WhatsAppAgentSection } from '@/components/landing/WhatsAppAgentSection';
import { Float } from '@/components/landing/Parallax';
import { motion } from 'motion/react';
import { useLenis } from '@/hooks/useLenis';
import offlineImg from '@/assets/landing/offline-vendedor.jpg';
import papelImg from '@/assets/landing/vendedor-ticket-calle.jpg';
import tiendaImg from '@/assets/landing/tienda-online.jpg';


// Colores del tema RutApp (src/index.css, modo claro) en hex: la landing es solo clara.
const BRAND = {
  primary: '#0060e6',     // --primary 215 100% 45%
  primarySoft: '#e6effd', // --primary al 10 % sobre blanco
  accent: '#ff7b00',      // --brand-orange 29 100% 50%
  ink: '#12151c',         // --foreground 220 20% 9%
  ink2: '#515867',        // --muted-foreground 220 12% 36%
  muted: '#5c6270',       // --secondary 220 10% 40%
  line: '#d9dce2',        // --border 220 14% 87%
  surface: '#f3f4f6',     // --accent 220 14% 96%
  danger: '#d43535',      // --destructive 0 65% 52%
  success: '#2b9764',     // --success 152 56% 38%
  warning: '#f29e0d',     // --warning 38 90% 50%
  icon: '#848b9a',        // --muted 220 10% 56%
};

const SHADOW_SOFT = '0 1px 2px rgba(18,21,28,0.04), 0 12px 32px -16px rgba(18,21,28,0.16)';
const SECTION = 'px-4 sm:px-6 lg:px-8 py-20 md:py-28';
const WRAP = 'max-w-[1200px] mx-auto';
const H2 = 'text-[30px] sm:text-[36px] md:text-[44px] font-bold leading-[1.1] tracking-tight';
const EYEBROW = 'text-[12px] font-bold uppercase tracking-[0.14em]';

function SectionHeader({ eyebrow, title, desc, align = 'center' }: {
  eyebrow: ReactNode; title: ReactNode; desc?: ReactNode; align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'text-center max-w-2xl mx-auto' : 'max-w-2xl'}>
      <span className={EYEBROW} style={{ color: BRAND.primary }}>{eyebrow}</span>
      <h2 className={`mt-3 ${H2}`} style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>{title}</h2>
      {desc && <p className="mt-4 text-[16px] md:text-[18px] leading-relaxed" style={{ color: BRAND.ink2 }}>{desc}</p>}
    </div>
  );
}

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
  { icon: AlertTriangle, t: 'Riesgo', d: 'Don Pepe bajó 38% sus compras. Visita prioritaria.', tone: BRAND.danger },
  { icon: Award, t: 'Destacado', d: 'Juan L. 12% arriba de meta. Replicar su ruta.', tone: BRAND.success },
  { icon: Radio, t: 'Anomalía', d: '3 ventas bajo costo en la última hora. Revisar.', tone: BRAND.warning },
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

  const navLink = 'transition-colors hover:text-[#0060e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060e6]/40 rounded';
  const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0060e6]';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0060e6]';

  return (
    <div className="min-h-[100dvh] bg-white overflow-x-hidden antialiased font-sans"
      style={{ color: BRAND.ink }}>
      <Seo
        title="Rutapp · ERP para distribuidoras con IA"
        description="Ventas, cobranza, inventario, ruta GPS e IA en la nube. App móvil que tolera cortes de internet sin perder ventas."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      {/* NAV */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 border-b backdrop-blur-xl transition-all duration-300 ${scrolled ? 'bg-white/85 shadow-[0_8px_30px_-18px_rgba(18,21,28,0.25)]' : 'bg-white/70'}`}
        style={{ borderColor: scrolled ? BRAND.line : 'transparent', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className={`${WRAP} flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 xl:px-0 transition-all duration-300 overflow-hidden ${scrolled ? 'h-14' : 'h-16'}`}>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src={rutappLogo.url} alt="Rutapp" className={`w-auto rounded-md transition-all duration-300 ${scrolled ? 'h-7' : 'h-8'}`} />
            <span className="text-[16px] font-bold tracking-tight max-[340px]:hidden">Rutapp</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[14px] font-medium" style={{ color: BRAND.ink2 }}>
            <Link to="/modulos" className={navLink}>Módulos</Link>
            <Link to="/precios" className={navLink}>Precios</Link>
            <Link to="/giros" className={navLink}>Giros</Link>
            <a href="#ia" className={`inline-flex items-center gap-1 ${navLink}`}>IA <span className="text-[9px] px-1 rounded font-bold" style={{ background: BRAND.primarySoft, color: BRAND.primary }}>NEW</span></a>
            <Link to="/partners" className={navLink}>Partners</Link>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className={`px-3 py-2 text-[14px] font-medium ${navLink}`} style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
            <Link to="/signup" className={`${btnPrimary} px-4 py-2 text-[14px]`} style={{ background: BRAND.primary }}>
              Empezar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex md:hidden shrink-0 items-center gap-1">
            <Link to="/login" className="px-2 py-1.5 text-[13px] font-medium" style={{ color: BRAND.ink2 }}>Entrar</Link>
            <Link to="/signup" className="px-3 py-1.5 text-[13px] font-semibold text-white rounded-lg" style={{ background: BRAND.primary }}>Probar</Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2 shrink-0 rounded-md" aria-label="Menú" aria-expanded={mobileMenu}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-4 py-3 space-y-1 text-[15px] animate-[fade-in_0.25s_ease-out]" style={{ borderColor: BRAND.line }}>
            <Link to="/modulos" onClick={() => setMobileMenu(false)} className="block py-2 font-medium" style={{ color: BRAND.ink2 }}>Módulos</Link>
            <Link to="/precios" onClick={() => setMobileMenu(false)} className="block py-2 font-medium" style={{ color: BRAND.ink2 }}>Precios</Link>
            <Link to="/giros" onClick={() => setMobileMenu(false)} className="block py-2 font-medium" style={{ color: BRAND.ink2 }}>Giros</Link>
            <a href="#ia" onClick={() => setMobileMenu(false)} className="block py-2 font-medium" style={{ color: BRAND.ink2 }}>IA</a>
            <Link to="/login" className="block py-2 font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section
        className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pb-20 md:pb-28"
        style={{ paddingTop: 'calc(7.5rem + env(safe-area-inset-top))' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[640px] -z-10 pointer-events-none"
          style={{ background: `radial-gradient(60% 60% at 50% 0%, ${BRAND.primarySoft} 0%, transparent 70%)` }}
        />

        <div className={`${WRAP} grid lg:grid-cols-12 gap-12 lg:gap-10 items-center`}>
          <div className="lg:col-span-6">
            <Reveal variant="up" duration={350}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-semibold border bg-white"
                style={{ borderColor: BRAND.line, color: BRAND.ink2 }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: BRAND.accent }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: BRAND.accent }} />
                </span>
                Nuevo · Asesor con IA
              </div>
            </Reveal>
            <Reveal variant="up" delay={60} duration={420}>
              <h1 className="mt-6 text-[40px] sm:text-[52px] lg:text-[54px] xl:text-[60px] font-bold leading-[1.05] tracking-tight" style={{ letterSpacing: '-0.035em' }}>
                Tu distribuidora,<br />
                <span style={{ color: BRAND.primary }}>en una sola pantalla.</span>
              </h1>
            </Reveal>
            <Reveal variant="up" delay={140}>
              <p className="mt-6 text-[17px] md:text-[19px] leading-relaxed max-w-lg" style={{ color: BRAND.ink2 }}>
                Ventas, cobranza, inventario, ruta GPS e <b style={{ color: BRAND.ink }}>IA</b> en la nube. App móvil que aguanta cortes de internet y sincroniza al recuperar señal.
              </p>
            </Reveal>
            <Reveal variant="up" delay={200}>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/signup" className={`group ${btnPrimary} w-full sm:w-auto px-6 py-3.5 text-[15px]`}
                  style={{ background: BRAND.primary, boxShadow: `0 12px 28px -12px ${BRAND.primary}99` }}>
                  Prueba gratis 7 días <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <a href="#modulos" className={`${btnSecondary} w-full sm:w-auto px-6 py-3.5 text-[15px]`}
                  style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                  Ver cómo funciona
                </a>
              </div>
              <button
                onClick={() => setSimulatorOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060e6]/40"
                style={{ color: BRAND.primary }}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Probar venta móvil ahora
              </button>
            </Reveal>
            <Reveal variant="fade" delay={260}>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]" style={{ color: BRAND.muted }}>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> 7 días gratis</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> No se cobra hasta el día 8</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" style={{ color: BRAND.primary }} /> Listo en días</span>
              </div>
            </Reveal>
          </div>

          {/* Imagen de la app */}
          <Reveal variant="scale" delay={120} duration={500} className="lg:col-span-6">
            {/* Teléfono: maqueta de la app móvil */}
            <div className="sm:hidden h-[470px] overflow-hidden" aria-hidden="true">
              <div className="origin-top scale-[0.82]"><MobileVentasScreen /></div>
            </div>
            {/* Tablet y escritorio: panel web + app móvil */}
            <div className="hidden sm:block relative lg:pl-10" aria-hidden="true">
              <div className="rounded-2xl" style={{ boxShadow: '0 30px 70px -30px rgba(0,96,230,0.35)' }}>
                <DashboardScreen />
              </div>
              <div className="hidden lg:block absolute -left-4 -bottom-16 w-[154px] h-[320px] overflow-hidden">
                <div className="origin-top-left scale-[0.55] w-[280px]"><MobileVentasScreen /></div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* STATS */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 border-y" style={{ borderColor: BRAND.line, background: BRAND.surface }}>
        <div className={`${WRAP} grid grid-cols-2 md:grid-cols-4 gap-8 text-center`}>
          {[
            ['10', 'Módulos integrados'],
            ['Nube', 'En tiempo real'],
            ['Tiempo real', 'GPS y stock'],
            ['Días', 'No meses'],
          ].map(([n, l]) => (
            <div key={l as string}>
              <div className="text-[28px] md:text-[36px] font-bold tracking-tight" style={{ color: BRAND.primary }}>{n}</div>
              <div className="text-[12px] mt-1 font-semibold uppercase tracking-wider" style={{ color: BRAND.muted }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* VIDEO */}
      <section className={SECTION}>
        <div className={WRAP}>
          <SectionHeader
            eyebrow="Video"
            title={<>Mira qué y cómo es <span style={{ color: BRAND.primary }}>Rutapp</span></>}
            desc="En pocos minutos descubre cómo funciona y por qué cientos de distribuidoras ya lo usan."
          />
          <div className="relative mt-12 w-full max-w-[960px] mx-auto overflow-hidden rounded-2xl border bg-white" style={{ borderColor: BRAND.line, aspectRatio: '16 / 9', boxShadow: SHADOW_SOFT }}>
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

      {/* MÓDULOS */}
      <section id="modulos" className={`${SECTION} scroll-mt-16`} style={{ background: BRAND.surface }}>
        <div className={WRAP}>
          <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
            <SectionHeader
              align="left"
              eyebrow="Módulos"
              title={<>10 módulos. <span style={{ color: BRAND.primary }}>Una plataforma.</span></>}
            />
            <Link to="/signup" className="text-[14px] font-semibold inline-flex items-center gap-1 hover:underline" style={{ color: BRAND.primary }}>
              Probar gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {MODULES.map((m, i) => (
              <Reveal key={m.t} variant="up" delay={i * 35} duration={350}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className="group h-full rounded-xl border bg-white p-5 transition-shadow hover:shadow-lg cursor-default"
                  style={{ borderColor: BRAND.line }}
                >
                  <span className="h-10 w-10 mb-4 rounded-lg grid place-items-center" style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                    <m.icon className="h-5 w-5" />
                  </span>
                  <div className="text-[15px] font-semibold">{m.t}</div>
                  <div className="text-[13px] mt-1 leading-snug" style={{ color: BRAND.ink2 }}>{m.d}</div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className={WRAP}>
          <WhatsAppAgentSection />
        </div>

        <div className={`${WRAP} mt-12 text-center`}>
          <Link to="/modulos" className={`${btnSecondary} px-6 py-3 text-[14px]`}
            style={{ borderColor: BRAND.line, color: BRAND.ink }}>
            Ver los 10 módulos a detalle <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* MÓVIL */}
      <section id="movil" className={`${SECTION} scroll-mt-16 overflow-hidden`}>
        <div className={WRAP}>
          <SectionHeader
            eyebrow="App móvil"
            title={<>Tu distribuidora <span style={{ color: BRAND.primary }}>en el bolsillo de tu vendedor.</span></>}
            desc="Rutero, venta, cobro y entrega — diseñados para tocarse con el pulgar y tolerar cortes de red."
          />

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 [&>*]:scale-90 [&>*]:origin-top lg:[&>*]:scale-100">
            <Reveal variant="up" delay={0} duration={480} className="lg:translate-y-6"><Float amplitude={8} duration={5} delay={0}><PhoneRutero /></Float></Reveal>
            <Reveal variant="up" delay={90} duration={480}><Float amplitude={8} duration={5.5} delay={0.4}><PhonePOS /></Float></Reveal>
            <Reveal variant="up" delay={180} duration={480} className="lg:translate-y-6"><Float amplitude={8} duration={5.2} delay={0.8}><PhoneCobro /></Float></Reveal>
            <Reveal variant="up" delay={270} duration={480}><Float amplitude={8} duration={5.7} delay={1.2}><PhoneEntrega /></Float></Reveal>
          </div>

          <div className="mt-16 max-w-[1000px] mx-auto grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              [Zap, 'Venta en segundos'],
              [Wallet, 'Cobro multi-folio FIFO'],
              [MapPin, 'GPS por cliente'],
              [Truck, 'Entrega con firma'],
              [Package, 'Stock del camión'],
              [WifiOff, 'Tolera cortes de red'],
            ].map(([Icon, t]: any, i: number) => (
              <Reveal key={t} variant="up" delay={i * 50} duration={350}>
                <div className="flex items-center gap-3 text-[14px] bg-white border rounded-xl px-4 py-3"
                  style={{ color: BRAND.ink, borderColor: BRAND.line }}>
                  <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0"
                    style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-semibold">{t}</span>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-20 grid lg:grid-cols-5 gap-10 items-center">
            <div className="lg:col-span-2">
              <span className={EYEBROW} style={{ color: BRAND.primary }}>Supervisor en vivo</span>
              <h3 className="mt-3 text-[24px] md:text-[32px] font-bold tracking-tight leading-tight" style={{ letterSpacing: '-0.022em', color: BRAND.ink }}>
                Mira a todo tu equipo en un mapa.
              </h3>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Ubicación, ventas del día, batería y última visita — sin llamarles ni un solo WhatsApp.
              </p>
            </div>
            <div className="lg:col-span-3 rounded-2xl overflow-hidden border bg-white"
              style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
              <LiveSupervisorMap />
            </div>
          </div>
        </div>
      </section>

      {/* IA */}
      <section id="ia" className={`${SECTION} scroll-mt-16`} style={{ background: BRAND.surface }}>
        <div className={`${WRAP} grid lg:grid-cols-12 gap-10 items-center`}>
          <div className="lg:col-span-5">
            <span className={`inline-flex items-center gap-1.5 ${EYEBROW}`} style={{ color: BRAND.primary }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: BRAND.accent }} aria-hidden="true" /> Asesor IA
            </span>
            <h2 className={`mt-3 ${H2}`} style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>
              IA que <span style={{ color: BRAND.primary }}>te dice qué hacer hoy.</span>
            </h2>
            <p className="mt-4 text-[16px] md:text-[18px] leading-relaxed" style={{ color: BRAND.ink2 }}>
              Lee tus datos, detecta lo que importa y te avisa. Sin reportes que nadie lee.
            </p>
            <Link to="/signup" className={`mt-8 ${btnPrimary} px-5 py-3 text-[14px]`}
              style={{ background: BRAND.primary }}>
              Probar gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AI_CARDS.map((ex, i) => (
              <Reveal key={ex.t} variant="scale" delay={i * 70} duration={400}>
                <div className="h-full rounded-xl p-5 border bg-white transition-all duration-200 hover:-translate-y-1"
                  style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
                  <div className="flex items-start gap-3.5">
                    <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0"
                      style={{ background: `${ex.tone}1f`, color: ex.tone }}>
                      <ex.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: BRAND.muted }}>{ex.t}</div>
                      <p className="text-[15px] leading-snug mt-1" style={{ color: BRAND.ink }}>{ex.d}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SIN INTERNET */}
      <section className={SECTION}>
        <div className={`${WRAP} grid md:grid-cols-2 gap-12 items-center`}>
          <Reveal>
            <div>
              <span className={`inline-flex items-center gap-2 ${EYEBROW} px-3 py-1 rounded-full`} style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                <WifiOff className="h-3.5 w-3.5" /> Sin internet
              </span>
              <h2 className={`mt-4 ${H2}`} style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>
                Funciona aunque no haya señal.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Tu vendedor vende, cobra e imprime tickets en zonas sin red. Todo se guarda en el celular y se sincroniza solo cuando vuelve la conexión. Cero pedidos perdidos.
              </p>
              <ul className="mt-6 space-y-3 text-[15px]" style={{ color: BRAND.ink2 }}>
                {['Ventas, cobros y entregas 100% offline','Cola de sincronización visible en pantalla','Auto-sync al recuperar señal','Tickets térmicos por Bluetooth sin internet'].map(x => (
                  <li key={x} className="flex gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.primary }} strokeWidth={3}/>{x}</li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
              <img src={offlineImg} alt="Vendedor usando Rutapp sin internet" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ADIÓS AL PAPEL */}
      <section className={SECTION} style={{ background: BRAND.surface }}>
        <div className={`${WRAP} grid md:grid-cols-2 gap-12 items-center`}>
          <Reveal className="order-2 md:order-1">
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
              <img src={papelImg} alt="Vendedor imprimiendo ticket en la calle" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="order-1 md:order-2">
            <div>
              <span className={`inline-flex items-center gap-2 ${EYEBROW} px-3 py-1 rounded-full`} style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                <FileText className="h-3.5 w-3.5" /> Adiós al papel
              </span>
              <h2 className={`mt-4 ${H2}`} style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>
                Olvídate de la nota de papel.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Cero recapturas en oficina. El vendedor toma el pedido, cobra e imprime el ticket en la calle. Todo entra al sistema en tiempo real, sin errores de transcripción.
              </p>
              <ul className="mt-6 space-y-3 text-[15px]" style={{ color: BRAND.ink2 }}>
                {['Ticket térmico Bluetooth desde el celular','Sin recapturar pedidos a mano','Inventario y cobranza al instante','Cliente firma o confirma en pantalla'].map(x => (
                  <li key={x} className="flex gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.primary }} strokeWidth={3}/>{x}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* TIENDA EN LÍNEA */}
      <section className={SECTION}>
        <div className={`${WRAP} grid md:grid-cols-2 gap-12 items-center`}>
          <Reveal>
            <div>
              <span className={`inline-flex items-center gap-2 ${EYEBROW} px-3 py-1 rounded-full`} style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                <ShoppingCart className="h-3.5 w-3.5" /> Tienda en línea
              </span>
              <h2 className={`mt-4 ${H2}`} style={{ letterSpacing: '-0.025em', color: BRAND.ink }}>
                Tu propia tienda online. Sin desarrollar nada.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: BRAND.ink2 }}>
                Activas tu tienda con un clic. Tus clientes entran con su usuario, ven los precios de su lista asignada y mandan pedidos directo al sistema. Te llega notificación con campanita en tiempo real.
              </p>
              <ul className="mt-6 space-y-3 text-[15px]" style={{ color: BRAND.ink2 }}>
                {['Catálogo con tus precios personalizados por cliente','Pedidos entran como borrador para que los autorices','Notificación instantánea de nuevos pedidos','Logo, banner y URL propia (rutapp.mx/tienda/tu-marca)'].map(x => (
                  <li key={x} className="flex gap-2.5"><Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: BRAND.primary }} strokeWidth={3}/><span className="min-w-0 break-words">{x}</span></li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
              <img src={tiendaImg} alt="Tienda en línea Rutapp" className="w-full h-auto" loading="lazy"/>
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section className={SECTION} style={{ background: BRAND.surface }}>
        <div className={WRAP}>
          <SectionHeader eyebrow="Comparativa" title="Rutapp vs el caos actual." />
          <div className="mt-12 max-w-[960px] mx-auto rounded-2xl bg-white border overflow-hidden" style={{ borderColor: BRAND.line, boxShadow: SHADOW_SOFT }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px] md:text-[14.5px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.line}` }}>
                    <th className="text-left p-3 md:p-4 font-semibold">Capacidad</th>
                    <th className="p-3 md:p-4 text-center font-bold" style={{ color: BRAND.primary, background: BRAND.primarySoft }}>Rutapp</th>
                    <th className="p-3 md:p-4 text-center font-semibold" style={{ color: BRAND.muted }}>Excel</th>
                    <th className="p-3 md:p-4 text-center font-semibold" style={{ color: BRAND.muted }}>WhatsApp</th>
                    <th className="p-3 md:p-4 text-center font-semibold" style={{ color: BRAND.muted }}>ERP</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row, r) => (
                    <tr key={row[0] as string} style={{ borderTop: r === 0 ? undefined : `1px solid ${BRAND.line}` }}>
                      <td className="p-3 md:p-4 font-medium">{row[0]}</td>
                      {row.slice(1).map((v, j) => (
                        <td key={j} className="p-3 md:p-4 text-center" style={j === 0 ? { background: `${BRAND.primarySoft}99` } : undefined}>
                          {v === true ? <Check className="h-4 w-4 mx-auto" style={{ color: j === 0 ? BRAND.primary : BRAND.muted }} strokeWidth={3} />
                            : v === false ? <X className="h-4 w-4 mx-auto" style={{ color: BRAND.icon }} />
                            : <span className="text-[13px] font-semibold" style={{ color: j === 0 ? BRAND.primary : BRAND.muted }}>{v}</span>}
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

      {/* PRECIOS — teaser, detalle en /precios */}
      <section id="precios" className={`${SECTION} scroll-mt-16`}>
        <div className={WRAP}>
          <SectionHeader
            eyebrow="Precios"
            title="Simple. Sin sorpresas."
            desc="Desde $450 MXN/mes · 7 días gratis · cancela cuando quieras"
          />
          <div className="mt-12 max-w-[1040px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <div key={p.slug} className="relative rounded-2xl p-7 bg-white border flex flex-col"
                style={{ borderColor: p.popular ? BRAND.primary : BRAND.line, borderWidth: p.popular ? 2 : 1, boxShadow: p.popular ? `0 24px 50px -24px ${BRAND.primary}66` : SHADOW_SOFT }}>
                {p.popular && (
                  <div className="absolute -top-3 left-7 px-3 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: BRAND.primary }}>
                    Más popular
                  </div>
                )}
                <h3 className="text-[18px] font-bold">{p.name}</h3>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-[40px] font-bold tracking-tight">${p.price.toLocaleString('es-MX')}</span>
                  <span className="text-[14px]" style={{ color: BRAND.muted }}>MXN /mes</span>
                </div>
                <p className="mt-1 text-[14px]" style={{ color: BRAND.muted }}>{p.users} usuarios incluidos</p>
                {p.popular ? (
                  <Link to="/signup" className={`mt-7 w-full ${btnPrimary} px-4 py-3 text-[14px]`} style={{ background: BRAND.primary }}>
                    Empezar gratis
                  </Link>
                ) : (
                  <Link to="/signup" className={`mt-7 w-full ${btnSecondary} px-4 py-3 text-[14px]`} style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                    Empezar gratis
                  </Link>
                )}
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/precios" className="inline-flex items-center gap-2 text-[14px] font-semibold hover:underline" style={{ color: BRAND.primary }}>
              Ver detalle de precios y monedas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20 md:pb-28">
        <Reveal variant="scale" duration={500} className={`${WRAP} block`}>
          <div className="relative rounded-3xl overflow-hidden px-6 py-14 md:p-16 text-center text-white"
            style={{ background: 'linear-gradient(155deg, hsl(215 100% 45%) 0%, hsl(215 100% 37%) 100%)' }}>
            <div aria-hidden="true" className="absolute inset-0 opacity-[0.12] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
            <div className="relative">
              <Sparkles className="h-7 w-7 mx-auto mb-5 text-white" aria-hidden="true" />
              <h2 className="text-[30px] md:text-[44px] font-bold tracking-tight leading-[1.1]" style={{ letterSpacing: '-0.03em' }}>
                ¿Listo para controlar tu distribuidora?
              </h2>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/signup" className="group w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-[15px] bg-white inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0060e6]"
                  style={{ color: BRAND.primary }}>
                  Solicitar demo <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link to="/login" className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-[15px] text-white border border-white/50 transition-all duration-200 hover:bg-white/10 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Iniciar sesión
                </Link>
              </div>
              <p className="mt-6 text-[13.5px] text-white/90">7 días gratis · registras tarjeta y el cobro empieza hasta el día 8</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* PIE DE PÁGINA */}
      <footer className="px-4 sm:px-6 lg:px-8 pt-14 border-t" style={{ borderColor: BRAND.line, background: BRAND.surface, paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <div className={`${WRAP} grid grid-cols-2 md:grid-cols-4 gap-8`}>
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src={rutappLogo.url} alt="Rutapp" className="h-8 w-auto rounded-md" />
              <span className="text-[16px] font-bold">Rutapp</span>
            </Link>
            <p className="mt-3 text-[14px] leading-relaxed max-w-xs" style={{ color: BRAND.ink2 }}>
              ERP para distribuidoras con IA.
            </p>
          </div>
          {([
            ['Producto', [['Módulos', '/modulos'], ['Precios', '/precios'], ['Giros', '/giros']]],
            ['Recursos', [['Partners', '/partners'], ['Tutoriales', '/tutoriales']]],
            ['Legal', [['Privacidad', '/privacidad'], ['Términos', '/terminos']]],
          ] as [string, [string, string][]][]).map(([titulo, links]) => (
            <div key={titulo}>
              <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: BRAND.muted }}>{titulo}</p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                {links.map(([t, to]) => (
                  <li key={to}><Link to={to} className={navLink} style={{ color: BRAND.ink2 }}>{t}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`${WRAP} mt-12 pt-6 border-t text-[13px]`} style={{ borderColor: BRAND.line, color: BRAND.muted }}>
          © {new Date().getFullYear()} Rutapp · Hecho en México
        </div>
      </footer>

      <LandingChatWidget />
      <MobileDemoSimulator open={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
}
