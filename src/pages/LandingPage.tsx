import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, Users, Package, Wallet, Truck, Check, X,
  ArrowRight, Menu, Route, CreditCard, Radio, FileText,
  WifiOff, Brain, Boxes, LineChart, Zap, AlertTriangle,
  Award, Sparkles, BarChart3, MapPin,
} from 'lucide-react';
import { LiveSupervisorMap, LiveMobileApp, LiveDashboardMockup } from '@/components/landing/LiveMockups';
import { ModuleVisual } from '@/components/landing/ModuleVisuals';
import { Seo } from '@/components/seo/Seo';
import { useFacebookPixel } from '@/hooks/useFacebookPixel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openModule, setOpenModule] = useState<number | null>(null);
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
      style={{ color: BRAND.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Seo
        title="Rutapp · ERP para distribuidoras con IA"
        description="Ventas, cobranza, inventario, ruta GPS e IA en la nube. App móvil que tolera cortes de internet sin perder ventas."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/85 backdrop-blur-xl border-b" style={{ borderColor: BRAND.line }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 h-14">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md grid place-items-center text-white font-black text-xs" style={{ background: BRAND.primary }}>R</div>
            <span className="text-[15px] font-bold tracking-tight">Rutapp</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-[13px]" style={{ color: BRAND.ink2 }}>
            <a href="#modulos">Módulos</a>
            <a href="#movil">Móvil</a>
            <a href="#ia" className="inline-flex items-center gap-1">IA <span className="text-[9px] px-1 rounded text-white font-bold" style={{ background: BRAND.accent }}>NEW</span></a>
            <a href="#precios">Precios</a>
            <Link to="/partners">Partners</Link>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login" className="px-3 py-1.5 text-[13px] font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
            <Link to="/signup" className="px-3.5 py-1.5 text-[13px] font-semibold text-white rounded-lg inline-flex items-center gap-1"
              style={{ background: BRAND.ink }}>
              Empezar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <Link to="/signup" className="px-2.5 py-1 text-xs font-semibold text-white rounded" style={{ background: BRAND.ink }}>Probar</Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-1.5" aria-label="Menú">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t px-5 py-3 space-y-2.5 text-sm" style={{ borderColor: BRAND.line }}>
            {[['#modulos', 'Módulos'], ['#movil', 'Móvil'], ['#ia', 'IA'], ['#precios', 'Precios']].map(([h, l]) => (
              <a key={h} href={h} onClick={() => setMobileMenu(false)} className="block font-medium" style={{ color: BRAND.ink2 }}>{l}</a>
            ))}
            <Link to="/login" className="block font-medium" style={{ color: BRAND.ink2 }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      {/* HERO — compact, side-by-side */}
      <section className="relative pt-20 md:pt-24 pb-12 px-5">
        <div className="absolute inset-x-0 top-0 h-[480px] -z-10"
          style={{ background: `radial-gradient(60% 50% at 50% 0%, ${BRAND.primarySoft} 0%, transparent 65%)` }} />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-white"
              style={{ borderColor: BRAND.line, color: BRAND.ink2 }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND.accent }} />
              Nuevo · Asesor con IA
            </div>
            <h1 className="mt-4 text-[40px] md:text-[56px] font-semibold leading-[1.02] tracking-tight" style={{ letterSpacing: '-0.035em' }}>
              Tu distribuidora,<br />
              <span className="relative inline-block">
                en una sola pantalla.
                <span className="absolute left-0 -bottom-1 h-[5px] w-full rounded-full" style={{ background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.accent})` }} />
              </span>
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed max-w-md" style={{ color: BRAND.ink2 }}>
              Ventas, cobranza, inventario, ruta GPS e <b style={{ color: BRAND.ink }}>IA</b> en la nube. App móvil que aguanta cortes de internet y sincroniza al recuperar señal.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link to="/signup" className="px-5 py-3 text-[14px] font-semibold text-white rounded-lg inline-flex items-center gap-2 shadow-lg transition-all hover:scale-[1.02]"
                style={{ background: BRAND.primary, boxShadow: `0 10px 30px -10px ${BRAND.primary}80` }}>
                Solicitar demo <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#modulos" className="px-5 py-3 text-[14px] font-semibold rounded-lg border bg-white"
                style={{ borderColor: BRAND.line, color: BRAND.ink }}>
                Ver módulos
              </a>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]" style={{ color: BRAND.muted }}>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> 7 días gratis</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Sin tarjeta</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" style={{ color: BRAND.primary }} /> Listo en días</span>
            </div>
          </div>

          {/* Bento mockups */}
          <div className="lg:col-span-6 grid grid-cols-6 grid-rows-2 gap-3 h-[440px]">
            <div className="col-span-4 row-span-2 rounded-2xl overflow-hidden border bg-white"
              style={{ borderColor: BRAND.line, boxShadow: '0 25px 60px -20px rgba(10,21,48,0.18)' }}>
              <LiveDashboardMockup />
            </div>
            <div className="col-span-2 rounded-2xl overflow-hidden border bg-white"
              style={{ borderColor: BRAND.line, boxShadow: '0 20px 40px -15px rgba(10,21,48,0.15)' }}>
              <LiveSupervisorMap />
            </div>
            <div className="col-span-2 rounded-2xl border bg-white grid place-items-center overflow-hidden"
              style={{ borderColor: BRAND.line, boxShadow: '0 20px 40px -15px rgba(10,21,48,0.15)' }}>
              <div className="scale-75 origin-center"><LiveMobileApp /></div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS strip */}
      <section className="px-5 py-8 border-y" style={{ borderColor: BRAND.line, background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
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

      {/* MODULES — bento dense */}
      <section id="modulos" className="px-5 py-16 md:py-20">
        <div className="max-w-7xl mx-auto">
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
              <button
                key={m.t}
                onClick={() => setOpenModule(i)}
                className="text-left rounded-xl border bg-white p-4 transition-all hover:shadow-md hover:-translate-y-0.5 group focus:outline-none focus:ring-2"
                style={{ borderColor: BRAND.line }}
              >
                <m.icon className="h-4 w-4 mb-2" style={{ color: BRAND.primary }} />
                <div className="text-[13.5px] font-semibold">{m.t}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: BRAND.muted }}>{m.d}</div>
                <div className="mt-2.5 text-[11px] font-semibold inline-flex items-center gap-1 opacity-80 group-hover:opacity-100" style={{ color: BRAND.primary }}>
                  Ver más <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Module detail dialog */}
        <Dialog open={openModule !== null} onOpenChange={(o) => !o && setOpenModule(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-white border-0">
            {openModule !== null && (() => {
              const m = MODULES[openModule];
              const Icon = m.icon;
              return (
                <>
                  <div className="p-6 md:p-8" style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #003a99)` }}>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl grid place-items-center bg-white/15 backdrop-blur">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <DialogHeader>
                          <DialogTitle className="text-white text-[22px] md:text-[26px] font-semibold tracking-tight">
                            {m.t}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="text-[13px] text-white/80 mt-0.5">{m.d}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 md:p-8 space-y-5">
                    {/* Visual preview */}
                    <ModuleVisual name={m.t} />

                    {/* Star feature */}
                    <div className="rounded-xl p-5 border" style={{ background: BRAND.primarySoft, borderColor: BRAND.primary + '33' }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5" style={{ color: BRAND.accent }} />
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.accent }}>Función estrella</span>
                      </div>
                      <div className="text-[16px] font-semibold mb-1" style={{ color: BRAND.ink }}>{m.star.t}</div>
                      <div className="text-[13.5px] leading-relaxed" style={{ color: BRAND.ink2 }}>{m.star.d}</div>
                    </div>

                    {/* Features list */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: BRAND.primary }}>Lo que incluye</div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {m.features.map(f => (
                          <div key={f} className="flex items-start gap-2 text-[13.5px]" style={{ color: BRAND.ink2 }}>
                            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={3} style={{ color: BRAND.primary }} />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Why it matters */}
                    <div className="border-t pt-5" style={{ borderColor: BRAND.line }}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: BRAND.muted }}>Por qué importa</div>
                      <div className="text-[14px] leading-relaxed italic" style={{ color: BRAND.ink }}>"{m.why}"</div>
                    </div>

                    {/* CTA */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Link
                        to="/signup"
                        onClick={() => setOpenModule(null)}
                        className="px-4 py-2.5 text-[13.5px] font-semibold text-white rounded-lg inline-flex items-center gap-1.5"
                        style={{ background: BRAND.primary }}
                      >
                        Probar gratis <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => {
                          const next = openModule === MODULES.length - 1 ? 0 : openModule + 1;
                          setOpenModule(next);
                        }}
                        className="px-4 py-2.5 text-[13.5px] font-semibold rounded-lg border"
                        style={{ borderColor: BRAND.line, color: BRAND.ink }}
                      >
                        Siguiente módulo →
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </section>


      {/* MOBILE — compact split */}
      <section id="movil" className="px-5 py-16 md:py-20" style={{ background: BRAND.surface }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl overflow-hidden border bg-white"
              style={{ borderColor: BRAND.line, boxShadow: '0 25px 50px -20px rgba(10,21,48,0.2)' }}>
              <LiveSupervisorMap />
            </div>
            <div className="rounded-2xl border bg-white grid place-items-center overflow-hidden p-2"
              style={{ borderColor: BRAND.line, boxShadow: '0 25px 50px -20px rgba(10,21,48,0.2)' }}>
              <div className="scale-90"><LiveMobileApp /></div>
            </div>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>App móvil</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight leading-tight" style={{ letterSpacing: '-0.025em' }}>
              Vende, cobra, entrega — <span style={{ color: BRAND.primary }}>aunque se caiga la señal.</span>
            </h2>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                [Zap, 'Venta en segundos'],
                [Wallet, 'Cobro con recibo'],
                [MapPin, 'GPS por cliente'],
                [Truck, 'Entrega con firma'],
                [Package, 'Stock del camión'],
                [WifiOff, 'Aguanta cortes de red'],
              ].map(([Icon, t]: any) => (
                <div key={t} className="flex items-center gap-2.5 text-[13.5px]" style={{ color: BRAND.ink }}>
                  <span className="h-7 w-7 rounded-md grid place-items-center shrink-0"
                    style={{ background: BRAND.primarySoft, color: BRAND.primary }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI — dark, dense */}
      <section id="ia" className="px-5 py-16 md:py-20 relative overflow-hidden" style={{ background: BRAND.ink }}>
        <div className="absolute inset-0 opacity-40"
          style={{ background: `radial-gradient(40% 50% at 70% 30%, ${BRAND.primary}66, transparent), radial-gradient(35% 45% at 20% 80%, ${BRAND.accent}40, transparent)` }} />
        <div className="max-w-7xl mx-auto relative grid lg:grid-cols-12 gap-8 items-center">
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
            {AI_CARDS.map(ex => (
              <div key={ex.t} className="rounded-xl p-4 border backdrop-blur-sm"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
                    style={{ background: `${ex.tone}22`, color: ex.tone }}>
                    <ex.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/50">{ex.t}</div>
                    <p className="text-[13.5px] text-white leading-snug mt-0.5">{ex.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARE — compact table */}
      <section className="px-5 py-16 md:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Comparativa</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              Rutapp vs el caos actual.
            </h2>
          </div>
          <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: BRAND.line }}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr style={{ background: BRAND.surface }}>
                  <th className="text-left p-3.5 font-semibold">Capacidad</th>
                  <th className="p-3.5 text-center font-bold" style={{ color: BRAND.primary }}>Rutapp</th>
                  <th className="p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>Excel</th>
                  <th className="p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>WhatsApp</th>
                  <th className="p-3.5 text-center font-medium" style={{ color: BRAND.muted }}>ERP</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row[0] as string} style={{ borderTop: `1px solid ${BRAND.line}` }}>
                    <td className="p-3.5 font-medium">{row[0]}</td>
                    {row.slice(1).map((v, j) => (
                      <td key={j} className="p-3.5 text-center">
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
      </section>

      {/* PRICING */}
      <section id="precios" className="px-5 py-16 md:py-20" style={{ background: BRAND.surface }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: BRAND.primary }}>Precios</span>
            <h2 className="mt-2 text-[28px] md:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: '-0.025em' }}>
              Simple. Sin sorpresas.
            </h2>
            <p className="mt-2 text-[14px]" style={{ color: BRAND.muted }}>7 días gratis · cancela cuando quieras</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map(p => (
              <div key={p.slug} className="relative rounded-2xl p-6 bg-white border flex flex-col"
                style={{
                  borderColor: p.popular ? BRAND.primary : BRAND.line,
                  boxShadow: p.popular ? `0 20px 50px -20px ${BRAND.primary}55` : 'none',
                }}>
                {p.popular && (
                  <div className="absolute -top-2.5 left-6 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold text-white" style={{ background: BRAND.primary }}>
                    Más popular
                  </div>
                )}
                <h3 className="text-[18px] font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[36px] font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>{fmtMX(p.price)}</span>
                  <span className="text-[13px]" style={{ color: BRAND.muted }}>/mes</span>
                </div>
                <p className="mt-1 text-[12.5px]" style={{ color: BRAND.muted }}>{p.users} usuarios · extra $300/mes</p>
                <Link to="/signup" className="mt-5 w-full text-center px-4 py-2.5 rounded-lg font-semibold text-[13.5px] text-white"
                  style={{ background: p.popular ? BRAND.primary : BRAND.ink }}>
                  Empezar gratis
                </Link>
                <ul className="mt-5 space-y-2 flex-1">
                  {['Acceso completo', 'App móvil tolerante a cortes', 'IA incluida', 'Soporte WhatsApp'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-[13px]" style={{ color: BRAND.ink2 }}>
                      <Check className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND.primary }} strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden p-8 md:p-12 text-center" style={{ background: BRAND.ink }}>
            <div className="absolute inset-0 opacity-50"
              style={{ background: `radial-gradient(50% 70% at 50% 0%, ${BRAND.primary}66, transparent), radial-gradient(40% 60% at 80% 100%, ${BRAND.accent}40, transparent)` }} />
            <div className="relative">
              <h2 className="text-[26px] md:text-[38px] font-semibold tracking-tight text-white leading-tight" style={{ letterSpacing: '-0.025em' }}>
                ¿Listo para controlar tu distribuidora?
              </h2>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <Link to="/signup" className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-[14px] text-white inline-flex items-center justify-center gap-2"
                  style={{ background: BRAND.primary, boxShadow: `0 15px 40px -10px ${BRAND.primary}` }}>
                  Solicitar demo <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/login" className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-[14px] text-white border border-white/15">
                  Iniciar sesión
                </Link>
              </div>
              <p className="mt-4 text-[12px] text-white/50">7 días gratis · sin tarjeta</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-5 pt-10 pb-6 border-t" style={{ borderColor: BRAND.line }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
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
    </div>
  );
}
