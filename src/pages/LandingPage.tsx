import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Users, MapPin, BarChart3, Package, Wallet,
  Truck, Smartphone, Shield, Zap, ChevronRight, Check,
  ArrowRight, Star, Menu, X, Route, CreditCard, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import heroDashboard from '@/assets/landing-hero-dashboard.jpg';
import mobileApp from '@/assets/landing-mobile-app.png';
import routeMap from '@/assets/landing-route-map.jpg';

const FEATURES = [
  { icon: ShoppingCart, title: 'Ventas y pedidos', desc: 'Gestiona ventas directas y pedidos con cálculo automático de impuestos, descuentos y tarifas por cliente.' },
  { icon: Route, title: 'Rutas optimizadas', desc: 'Optimiza las rutas de tus vendedores con Google Maps. Ahorra gasolina y tiempo en cada recorrido.' },
  { icon: Smartphone, title: 'App para vendedores', desc: 'Módulo móvil offline-first para que tus vendedores vendan, cobren y registren gastos sin conexión.' },
  { icon: Package, title: 'Inventario y almacén', desc: 'Control de stock en tiempo real, múltiples almacenes, cargas de camión y trazabilidad por lotes.' },
  { icon: Wallet, title: 'Cobranza inteligente', desc: 'Cuentas por cobrar con aplicación FIFO, estados de cuenta y envío automático por WhatsApp.' },
  { icon: BarChart3, title: 'Reportes y dashboard', desc: 'Dashboard ejecutivo con KPIs, gráficas de ventas, ranking de vendedores y alertas de stock.' },
  { icon: Users, title: 'Clientes con GPS', desc: 'Mapa interactivo de clientes, días de visita, historial de compras y pedido sugerido automático.' },
  { icon: Shield, title: 'Roles y permisos', desc: 'Control granular de acceso por módulo y acción. Define exactamente qué puede hacer cada usuario.' },
  { icon: CreditCard, title: 'Compras y proveedores', desc: 'Gestión completa de compras, cuentas por pagar y seguimiento de saldos con proveedores.' },
];

const TESTIMONIALS = [
  { name: 'Carlos M.', role: 'Director comercial', company: 'Distribuidora Norte', text: 'Rutapp nos permitió reducir un 30% los tiempos de entrega y tener visibilidad total de lo que pasa en campo.' },
  { name: 'Ana R.', role: 'Gerente de ventas', company: 'Lácteos del Valle', text: 'Mis vendedores ahora llevan todo en el celular. Ya no hay papelitos ni errores en los pedidos.' },
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
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Funciones</a>
            <a href="#screenshots" className="hover:text-gray-900 transition-colors">Capturas</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Precios</a>
            <a href="#testimonials" className="hover:text-gray-900 transition-colors">Testimonios</a>
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
            <button onClick={() => setMobileMenu(!mobileMenu)} className="p-2">
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
            <a href="#features" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Funciones</a>
            <a href="#screenshots" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Capturas</a>
            <a href="#pricing" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-600">Precios</a>
            <Link to="/login" className="block w-full text-center px-5 py-2.5 text-sm font-semibold text-white rounded-lg"
              style={{ background: 'hsl(230, 55%, 52%)' }}>Iniciar sesión</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, hsl(230, 55%, 52%), transparent)' }} />
          <div className="absolute top-60 -left-40 w-[400px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: 'radial-gradient(circle, hsl(260, 45%, 60%), transparent)' }} />
        </div>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold mb-6">
              <Zap className="h-3.5 w-3.5" /> El ERP que tu fuerza de ventas necesita
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6">
              Controla tus ventas en ruta
              <span className="block" style={{ color: 'hsl(230, 55%, 52%)' }}>como nunca antes</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              Gestiona vendedores, optimiza rutas, controla inventario y cobra — todo desde una sola plataforma.
              Diseñado para distribuidoras y empresas con venta en ruta.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
              <Link to="/signup" className="w-full sm:w-auto px-8 py-4 text-base font-bold text-white rounded-xl transition-all hover:opacity-90 shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-2"
                style={{ background: 'hsl(230, 55%, 52%)' }}>
                Comenzar ahora <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#screenshots" className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all flex items-center justify-center gap-2">
                Ver demo <ChevronRight className="h-5 w-5" />
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-4">Sin tarjeta de crédito · Configuración en 5 minutos</p>
          </div>

          {/* Hero image */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 rounded-2xl opacity-20 blur-3xl -z-10"
              style={{ background: 'linear-gradient(135deg, hsl(230, 55%, 52%), hsl(260, 45%, 60%))' }} />
            <img src={heroDashboard} alt="Dashboard de Rutapp mostrando analytics de ventas"
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

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Todo lo que necesitas para vender más</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Una plataforma completa que cubre cada aspecto de la operación de venta en ruta.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all duration-300">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-colors"
                  style={{ background: 'hsl(230, 55%, 95%)' }}>
                  <f.icon className="h-5 w-5" style={{ color: 'hsl(230, 55%, 52%)' }} />
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section id="screenshots" className="py-20 px-6" style={{ background: 'hsl(220, 14%, 98%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Míralo en acción</h2>
            <p className="text-gray-500 mt-3">Así se ve Rutapp por dentro. Potente, limpio y fácil de usar.</p>
          </div>

          {/* Screenshot 1: Dashboard + Mobile */}
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

          {/* Screenshot 2: Mobile */}
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

          {/* Screenshot 3: Route optimization */}
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
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Precios simples y transparentes</h2>
            <p className="text-gray-500 mt-3">Un solo plan con todo incluido. Sin costos ocultos.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS.map(plan => (
              <div key={plan.name} className={cn(
                "relative rounded-2xl p-8 border-2 transition-all",
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
                    'App móvil para vendedores',
                    'Optimización de rutas',
                    'Reportes y dashboard',
                    'WhatsApp integrado',
                    'Soporte prioritario',
                    'Usuarios ilimitados',
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
      <section id="testimonials" className="py-20 px-6" style={{ background: 'hsl(220, 14%, 98%)' }}>
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
              ¿Listo para transformar tus ventas en ruta?
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
