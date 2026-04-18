import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Users, MapPin, BarChart3, Package, Wallet,
  Truck, Smartphone, Shield, Zap, ChevronRight, Check,
  ArrowRight, Star, Menu, X, Route, CreditCard, Radio,
  FileText, ClipboardCheck, RefreshCw, Receipt, Bell,
  WifiOff, MessageCircle, TrendingUp, Eye, Layers,
  Tag, Building2, Calculator, ScanLine, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import heroDashboard from '@/assets/landing-hero-dashboard.jpg';
import mobileApp from '@/assets/landing-mobile-app.png';
import routeMap from '@/assets/landing-route-map.jpg';

// ── Hero highlight: seguimiento en tiempo real ──
const REALTIME_BULLETS = [
  { icon: Radio, text: 'Ubicación GPS de cada vendedor actualizada al instante' },
  { icon: Eye, text: 'Mira qué cliente está visitando cada uno en este momento' },
  { icon: Activity, text: 'Detecta ventas fuera de la ubicación del cliente' },
  { icon: Bell, text: 'Alertas automáticas si un vendedor se desvía de la ruta' },
];

// ── Capacidades principales (todo lo que hace el sistema) ──
const FEATURE_GROUPS = [
  {
    title: 'Operación de campo',
    color: 'hsl(230, 55%, 52%)',
    bg: 'hsl(230, 55%, 95%)',
    items: [
      { icon: Radio, title: 'Seguimiento en tiempo real', desc: 'Ubicación viva de cada vendedor en el mapa con histórico de recorrido y batería del dispositivo.' },
      { icon: Smartphone, title: 'App móvil offline-first', desc: 'Tus vendedores venden, cobran y registran gastos sin internet. Todo sincroniza al volver a línea.' },
      { icon: Route, title: 'Optimización de rutas', desc: 'Algoritmo Google Routes API + 2-opt. Ordena automáticamente la visita más eficiente del día.' },
      { icon: MapPin, title: 'Mapa de clientes con GPS', desc: 'Captura GPS al alta, navegación tipo Uber paso a paso y detección de visita.' },
    ],
  },
  {
    title: 'Ventas y cobranza',
    color: 'hsl(152, 56%, 38%)',
    bg: 'hsl(152, 56%, 95%)',
    items: [
      { icon: ShoppingCart, title: 'Punto de venta avanzado', desc: 'POS responsivo con búsqueda rápida, promociones nxm, descuentos y control de stock por almacén.' },
      { icon: Truck, title: 'Pedidos y entregas', desc: 'Flujo 1:N pedido → entregas. Despacha por ruta, marca entregado y descuenta inventario automático.' },
      { icon: Wallet, title: 'Cobranza inteligente', desc: 'Aplicación FIFO multi-folio, cobros parciales, liquidación de ruta con efectivo esperado vs real.' },
      { icon: Receipt, title: 'Tickets y CFDI 4.0', desc: 'Tickets térmicos por Bluetooth, PDFs estilo Odoo y facturación SAT con Facturama integrado.' },
    ],
  },
  {
    title: 'Inventario y catálogo',
    color: 'hsl(38, 90%, 50%)',
    bg: 'hsl(38, 90%, 95%)',
    items: [
      { icon: Package, title: 'Inventario multialmacén', desc: 'Stock en tiempo real por almacén, traspasos con bloqueo de filas y kardex granular.' },
      { icon: ClipboardCheck, title: 'Conteos físicos y auditorías', desc: 'Reconciliación teórico vs físico desde móvil con PIN de supervisor para reapertura.' },
      { icon: RefreshCw, title: 'Cargas y descargas de ruta', desc: 'Arma cargas para camión, controla devoluciones y liquidación de mercancía sobrante.' },
      { icon: Tag, title: 'Listas de precios y promociones', desc: 'Múltiples tarifas por cliente, promociones nxm, descuentos por volumen y precios mayoreo.' },
    ],
  },
  {
    title: 'Finanzas y análisis',
    color: 'hsl(260, 45%, 60%)',
    bg: 'hsl(260, 45%, 95%)',
    items: [
      { icon: BarChart3, title: 'Dashboard ejecutivo', desc: 'KPIs en vivo, ranking de vendedores, top productos y alertas de stock bajo mínimo.' },
      { icon: TrendingUp, title: 'Reportes operativos', desc: 'Ventas por cliente, producto, vendedor, utilidad, devoluciones, comisiones y cobertura de ruta.' },
      { icon: Calculator, title: 'Cuentas por cobrar y pagar', desc: 'Estados de cuenta por cliente y proveedor, antigüedad de saldos y aplicación FIFO.' },
      { icon: CreditCard, title: 'Compras y proveedores', desc: 'Órdenes de compra, recepción de mercancía, pagos parciales y saldos pendientes.' },
    ],
  },
  {
    title: 'Administración y control',
    color: 'hsl(0, 70%, 55%)',
    bg: 'hsl(0, 70%, 96%)',
    items: [
      { icon: Shield, title: 'Roles y permisos granulares', desc: 'Control fino por módulo y acción. Vista solo móvil, solo propios o acceso total.' },
      { icon: Eye, title: 'Panel de auditoría y control', desc: 'Detecta descuentos excesivos, ventas debajo del costo y anomalías operativas.' },
      { icon: Layers, title: 'Multi-empresa y multi-moneda', desc: 'Maneja varias empresas en una cuenta, con soporte multimoneda y zonas horarias.' },
      { icon: Building2, title: 'Catálogo público compartible', desc: 'Genera enlaces de catálogo por lista de precios. Tus clientes piden por WhatsApp.' },
    ],
  },
  {
    title: 'Comunicación e integración',
    color: 'hsl(142, 71%, 45%)',
    bg: 'hsl(142, 71%, 95%)',
    items: [
      { icon: MessageCircle, title: 'WhatsApp integrado', desc: 'Envía tickets, estados de cuenta y campañas. Recordatorios automáticos de cobro.' },
      { icon: Bell, title: 'Notificaciones automatizadas', desc: 'Email + WhatsApp con branding propio. Avisos de pago, vencimientos y cumpleaños.' },
      { icon: ScanLine, title: 'Importación masiva', desc: 'Sube productos y clientes desde Excel/CSV con validación y autocreación de catálogos.' },
      { icon: WifiOff, title: 'PWA instalable', desc: 'Funciona como app nativa en Android, iOS y escritorio. Sin tiendas, sin descargas pesadas.' },
    ],
  },
];

const NAV_HIGHLIGHTS = [
  { icon: BarChart3, label: 'Dashboard', desc: 'KPIs del día' },
  { icon: ShoppingCart, label: 'Punto de venta', desc: 'POS rápido' },
  { icon: Smartphone, label: 'App Móvil', desc: 'Para ruta' },
  { icon: Users, label: 'Clientes', desc: 'CRM con GPS' },
  { icon: Package, label: 'Productos', desc: 'Inventario' },
  { icon: Truck, label: 'Logística', desc: 'Cargas y entregas' },
  { icon: Wallet, label: 'Cobranza', desc: 'Cuentas por cobrar' },
  { icon: FileText, label: 'Reportes', desc: 'Análisis total' },
];

const TESTIMONIALS = [
  { name: 'Carlos M.', role: 'Director comercial', company: 'Distribuidora Norte', text: 'El seguimiento en tiempo real cambió todo. Ahora sé exactamente dónde está cada vendedor y puedo reaccionar al instante.' },
  { name: 'Ana R.', role: 'Gerente de ventas', company: 'Lácteos del Valle', text: 'Mis vendedores venden desde el celular sin internet. Ya no hay papelitos ni errores en pedidos.' },
  { name: 'Roberto S.', role: 'Fundador', company: 'Botanas Express', text: 'La optimización de rutas nos ahorró miles de pesos en gasolina el primer mes. Se pagó solo.' },
];

const PRICE_MONTHLY = 300;
const PLANS = [
  { name: 'Mensual', period: '/mes', price: PRICE_MONTHLY, discount: 0, tag: null, popular: false },
  { name: 'Semestral', period: '/mes', price: Math.round(PRICE_MONTHLY * 0.9), discount: 10, tag: '10% OFF', popular: false },
  { name: 'Anual', period: '/mes', price: Math.round(PRICE_MONTHLY * 0.85), discount: 15, tag: '15% OFF', popular: true },
];

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-[max(1.5rem,env(safe-area-inset-left))] h-16">
          <div className="flex items-center gap-2">
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-xl font-black tracking-tight" style={{ color: 'hsl(230, 55%, 52%)' }}>Rutapp</span>
          </div>
          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600">
            <a href="#realtime" className="hover:text-gray-900 transition-colors flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              En vivo
            </a>
            <a href="#features" className="hover:text-gray-900 transition-colors">Funciones</a>
            <a href="#modules" className="hover:text-gray-900 transition-colors">Módulos</a>
            <a href="#screenshots" className="hover:text-gray-900 transition-colors">Capturas</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Precios</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">Iniciar sesión</Link>
            <Link to="/signup" className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-all hover:opacity-90 shadow-lg shadow-indigo-500/25"
              style={{ background: 'hsl(230, 55%, 52%)' }}>
              Probar gratis
            </Link>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <Link to="/login" className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
              style={{ background: 'hsl(230, 55%, 52%)' }}>
              Iniciar sesión
            </Link>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2" aria-label="Abrir menú">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
            <a href="#realtime" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-emerald-600">● En vivo</a>
            <a href="#features" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Funciones</a>
            <a href="#modules" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Módulos</a>
            <a href="#screenshots" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Capturas</a>
            <a href="#pricing" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Precios</a>
            <Link to="/signup" className="block w-full text-center px-5 py-2.5 text-sm font-semibold text-white rounded-lg"
              style={{ background: 'hsl(230, 55%, 52%)' }}>Probar gratis</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, hsl(230, 55%, 52%), transparent)' }} />
          <div className="absolute top-60 -left-40 w-[400px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: 'radial-gradient(circle, hsl(260, 45%, 60%), transparent)' }} />
        </div>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Nuevo · Seguimiento en tiempo real de vendedores
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6">
              Mira a tus vendedores
              <span className="block" style={{ color: 'hsl(230, 55%, 52%)' }}>en vivo, en el mapa</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              El ERP completo para distribuidoras y venta en ruta. Seguimiento GPS al instante, app móvil offline,
              optimización de rutas, inventario, cobranza y facturación CFDI — todo en un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
              <Link to="/signup" className="w-full sm:w-auto px-8 py-4 text-base font-bold text-white rounded-xl transition-all hover:opacity-90 shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-2"
                style={{ background: 'hsl(230, 55%, 52%)' }}>
                Comenzar gratis <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#realtime" className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all flex items-center justify-center gap-2">
                Ver seguimiento en vivo <ChevronRight className="h-5 w-5" />
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-4">Sin tarjeta · Configuración en 5 minutos · 14 días de prueba</p>
          </div>

          {/* Hero image */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 rounded-2xl opacity-20 blur-3xl -z-10"
              style={{ background: 'linear-gradient(135deg, hsl(230, 55%, 52%), hsl(260, 45%, 60%))' }} />
            <img src={heroDashboard} alt="Dashboard de Rutapp con seguimiento de vendedores en tiempo real"
              className="w-full rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-200" />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-10 border-y border-gray-100" style={{ background: 'hsl(220, 14%, 98%)' }}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-6 text-center">
          {[
            { val: '500+', label: 'Empresas activas' },
            { val: '10,000+', label: 'Vendedores en ruta' },
            { val: '99.9%', label: 'Uptime garantizado' },
            { val: '< 5 min', label: 'Soporte promedio' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl md:text-3xl font-black" style={{ color: 'hsl(230, 55%, 52%)' }}>{s.val}</div>
              <div className="text-xs text-gray-500 mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── REALTIME TRACKING (HERO FEATURE) ── */}
      <section id="realtime" className="py-24 px-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, white 0%, hsl(152, 56%, 97%) 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold mb-5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                LO MÁS POPULAR
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-5">
                Seguimiento en tiempo real
                <span className="block" style={{ color: 'hsl(152, 56%, 38%)' }}>de toda tu fuerza de ventas</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                Olvídate de llamar para preguntar dónde está cada vendedor. El mapa de supervisión muestra la
                ubicación viva de todos, con qué cliente están, cuántas ventas llevan y hasta el nivel de batería.
              </p>
              <ul className="space-y-3.5 mb-8">
                {REALTIME_BULLETS.map(b => (
                  <li key={b.text} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'hsl(152, 56%, 92%)' }}>
                      <b.icon className="h-4.5 w-4.5" style={{ color: 'hsl(152, 56%, 38%)' }} />
                    </div>
                    <span className="text-sm md:text-base text-gray-700 pt-1.5">{b.text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold text-white rounded-xl transition-all hover:opacity-90 shadow-lg"
                style={{ background: 'hsl(152, 56%, 38%)', boxShadow: '0 10px 25px -5px hsl(152, 56%, 38% / 0.4)' }}>
                Pruébalo gratis ahora <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Mock map */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl opacity-30 blur-2xl"
                style={{ background: 'linear-gradient(135deg, hsl(152, 56%, 50%), hsl(180, 56%, 50%))' }} />
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
                <img src={routeMap} alt="Mapa de seguimiento en tiempo real" className="w-full block" />
                {/* Live badge overlay */}
                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-lg flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-xs font-bold text-gray-900">EN VIVO · 8 vendedores activos</span>
                </div>
                {/* Card overlays */}
                <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur px-4 py-3 rounded-xl shadow-lg max-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[11px] font-bold">CR</div>
                    <div>
                      <div className="text-[11px] font-bold text-gray-900 leading-tight">Carlos Ramírez</div>
                      <div className="text-[10px] text-emerald-600 leading-tight">● En cliente</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500">12 ventas · $8,420 · 87% 🔋</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUICK NAV / MÓDULOS ── */}
      <section id="modules" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Navegación clara, todo a un clic</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              8 módulos principales accesibles desde el sidebar. Diseñado para que cualquiera lo domine sin entrenamiento.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {NAV_HIGHLIGHTS.map(n => (
              <div key={n.label}
                className="p-5 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 bg-white text-center">
                <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'hsl(230, 55%, 95%)' }}>
                  <n.icon className="h-5.5 w-5.5" style={{ color: 'hsl(230, 55%, 52%)' }} />
                </div>
                <div className="text-sm font-bold text-gray-900">{n.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{n.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ALL FEATURES (grouped) ── */}
      <section id="features" className="py-20 px-6" style={{ background: 'hsl(220, 14%, 98%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Todo lo que Rutapp puede hacer por ti</h2>
            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
              Más de 30 funciones listas para usar, organizadas por área. Sin add-ons, sin sorpresas.
            </p>
          </div>

          <div className="space-y-12">
            {FEATURE_GROUPS.map(group => (
              <div key={group.title}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-1 w-10 rounded-full" style={{ background: group.color }} />
                  <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: group.color }}>
                    {group.title}
                  </h3>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {group.items.map(f => (
                    <div key={f.title} className="p-5 rounded-2xl bg-white border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                        style={{ background: group.bg }}>
                        <f.icon className="h-5 w-5" style={{ color: group.color }} />
                      </div>
                      <h4 className="text-sm font-bold mb-1.5">{f.title}</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section id="screenshots" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Míralo en acción</h2>
            <p className="text-gray-500 mt-3">Así se ve Rutapp por dentro. Potente, limpio y fácil de usar.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold mb-4">
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard ejecutivo
              </div>
              <h3 className="text-2xl font-bold mb-3">Visibilidad total de tu negocio</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                KPIs en tiempo real, tendencia de ventas, ranking de vendedores, alertas de stock bajo mínimo
                y utilidad neta. Todo en un solo vistazo.
              </p>
              <ul className="space-y-2.5">
                {['Ventas, cobros y gastos por período', 'Top productos y mejores clientes', 'Filtros por vendedor y fecha', 'Alertas automáticas de inventario'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'hsl(152, 56%, 38%)' }} /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <img src={heroDashboard} alt="Dashboard" className="rounded-2xl shadow-xl border border-gray-200" />
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center mb-20">
            <img src={mobileApp} alt="Aplicación móvil" className="rounded-2xl max-w-sm mx-auto md:order-1" />
            <div className="md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold mb-4">
                <Smartphone className="h-3.5 w-3.5" /> App para vendedores
              </div>
              <h3 className="text-2xl font-bold mb-3">Tu vendedor vende desde el celular</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Módulo móvil optimizado para trabajo en campo. Funciona sin internet y sincroniza
                automáticamente cuando hay conexión.
              </p>
              <ul className="space-y-2.5">
                {['Modo offline completo', 'Venta rápida con pedido sugerido', 'Cobro en efectivo y transferencia', 'GPS y navegación al cliente'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'hsl(152, 56%, 38%)' }} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold mb-4">
                <Route className="h-3.5 w-3.5" /> Optimización de rutas
              </div>
              <h3 className="text-2xl font-bold mb-3">Ahorra gasolina y tiempo</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Optimización inteligente con Google Maps. Selecciona el día, los clientes y el punto
                de partida — y obtén la ruta más eficiente al instante.
              </p>
              <ul className="space-y-2.5">
                {['Algoritmo de Google Routes API', 'Ruta trazada en el mapa', 'Marcadores numerados por orden', 'Actualización automática del orden de visita'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'hsl(152, 56%, 38%)' }} /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <img src={routeMap} alt="Optimización de rutas" className="rounded-2xl shadow-xl border border-gray-200" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6" style={{ background: 'hsl(220, 14%, 98%)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Precios simples y transparentes</h2>
            <p className="text-gray-500 mt-3">Un solo plan con todo incluido. Sin costos ocultos.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS.map(plan => (
              <div key={plan.name} className={cn(
                "relative rounded-2xl p-8 border-2 transition-all bg-white",
                plan.popular
                  ? "border-indigo-500 shadow-xl shadow-indigo-500/10 scale-105"
                  : "border-gray-100 hover:border-gray-200"
              )}>
                {plan.tag && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: plan.popular ? 'hsl(230, 55%, 52%)' : 'hsl(38, 90%, 50%)' }}>
                    {plan.tag}
                  </div>
                )}
                {plan.popular && (
                  <div className="absolute -top-3 right-4 px-3 py-1 rounded-full text-xs font-bold text-white bg-emerald-500">
                    Recomendado
                  </div>
                )}
                <h3 className="text-lg font-bold text-center mb-1">{plan.name}</h3>
                <div className="text-center mb-6">
                  <span className="text-4xl font-black" style={{ color: plan.popular ? 'hsl(230, 55%, 52%)' : undefined }}>
                    ${plan.price}
                  </span>
                  <span className="text-sm text-gray-500"> {plan.period}</span>
                  <div className="text-xs text-gray-400 mt-1">por usuario</div>
                  {plan.discount > 0 && (
                    <div className="text-xs text-gray-400 mt-1 line-through">${PRICE_MONTHLY}/mes</div>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    'Todos los módulos incluidos',
                    'Seguimiento GPS en vivo',
                    'App móvil offline',
                    'Optimización de rutas',
                    'CFDI 4.0 y WhatsApp',
                    'Soporte prioritario',
                    'Agrega usuarios según necesites',
                  ].map(feat => (
                    <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 shrink-0" style={{ color: 'hsl(152, 56%, 38%)' }} /> {feat}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className={cn(
                  "block w-full text-center py-3.5 rounded-xl text-sm font-bold transition-all",
                  plan.popular
                    ? "text-white shadow-lg shadow-indigo-500/25 hover:opacity-90"
                    : "text-gray-700 border-2 border-gray-200 hover:border-gray-300"
                )} style={plan.popular ? { background: 'hsl(230, 55%, 52%)' } : undefined}>
                  Empezar ahora
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            Todos los precios están en MXN + IVA. Cancela cuando quieras.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Lo que dicen nuestros clientes</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-6">"{t.text}"</p>
                <div>
                  <div className="text-sm font-bold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.role}, {t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center rounded-3xl p-12 md:p-16 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, hsl(230, 55%, 48%), hsl(260, 45%, 52%))' }}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          </div>
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">
              ¿Listo para ver tu operación en tiempo real?
            </h2>
            <p className="text-indigo-100 text-lg mb-8 max-w-xl mx-auto">
              Únete a cientos de distribuidoras que ya optimizaron su operación con Rutapp.
            </p>
            <Link to="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-base font-bold rounded-xl shadow-xl hover:shadow-2xl transition-all"
              style={{ color: 'hsl(230, 55%, 48%)' }}>
              Crear cuenta gratis <ArrowRight className="h-5 w-5" />
            </Link>
            <p className="text-indigo-200 text-xs mt-4">14 días de prueba sin compromiso</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 px-[max(1.5rem,env(safe-area-inset-left))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-black" style={{ color: 'hsl(230, 55%, 52%)' }}>Rutapp</span>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#realtime" className="hover:text-gray-700">En vivo</a>
            <a href="#features" className="hover:text-gray-700">Funciones</a>
            <a href="#pricing" className="hover:text-gray-700">Precios</a>
            <Link to="/login" className="hover:text-gray-700">Iniciar sesión</Link>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Rutapp. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
