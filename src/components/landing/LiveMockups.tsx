import { useEffect, useState } from 'react';
import {
  Battery, MapPin, ShoppingCart, TrendingUp, Package, Users,
  Wallet, Bell, Wifi, Signal, ChevronRight, Search, BarChart3,
  ArrowUp, Check, RefreshCw,
} from 'lucide-react';
import rutappLogo from '@/assets/rutapp-logo.jpeg.asset.json';

/* ============================================================
   1. SUPERVISOR MAP — animated GPS tracking mockup
   ============================================================ */
export function LiveSupervisorMap() {
  // Animated vendor dots — interpolate position over time
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const vendors = [
    { id: 'CR', name: 'Carlos R.', color: '#4f46e5', baseX: 30, baseY: 35, sales: 12, total: 8420, battery: 87, status: 'En cliente' },
    { id: 'AM', name: 'Ana M.', color: '#10b981', baseX: 70, baseY: 55, sales: 9, total: 6210, battery: 64, status: 'En ruta' },
    { id: 'JL', name: 'Juan L.', color: '#f59e0b', baseX: 50, baseY: 75, sales: 15, total: 11200, battery: 92, status: 'Cobrando' },
    { id: 'MS', name: 'María S.', color: '#ec4899', baseX: 80, baseY: 28, sales: 7, total: 4830, battery: 41, status: 'En cliente' },
  ];

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white aspect-[4/3]">
      {/* Map background — abstract street-grid using SVG */}
      <svg viewBox="0 0 400 300" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
          <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0fdf4" />
            <stop offset="100%" stopColor="#ecfeff" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#mapBg)" />
        <rect width="400" height="300" fill="url(#grid)" />
        {/* Roads */}
        <path d="M 0 90 L 400 90" stroke="#d1d5db" strokeWidth="6" />
        <path d="M 0 200 L 400 200" stroke="#d1d5db" strokeWidth="6" />
        <path d="M 130 0 L 130 300" stroke="#d1d5db" strokeWidth="6" />
        <path d="M 280 0 L 280 300" stroke="#d1d5db" strokeWidth="6" />
        <path d="M 0 90 L 400 90" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
        <path d="M 130 0 L 130 300" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
        {/* Park area */}
        <rect x="160" y="110" width="100" height="80" rx="8" fill="#bbf7d0" opacity="0.5" />
      </svg>

      {/* Live badge */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 z-20">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <span className="text-xs font-bold text-gray-900">EN VIVO · {vendors.length} vendedores</span>
      </div>

      {/* Date filter chip */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-lg z-20">
        <span className="text-xs font-semibold text-gray-700">Hoy · 11:42 AM</span>
      </div>

      {/* Vendor markers — animated */}
      {vendors.map((v, i) => {
        const wobble = Math.sin((tick + i * 25) / 12) * 1.5;
        const x = v.baseX + wobble;
        const y = v.baseY + Math.cos((tick + i * 25) / 14) * 1.2;
        return (
          <div
            key={v.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: `${x}%`, top: `${y}%`, transition: 'all 0.08s linear' }}
          >
            {/* Pulse */}
            <span className="absolute inset-0 -m-3 rounded-full opacity-30 animate-ping"
              style={{ background: v.color }} />
            <div className="relative w-10 h-10 rounded-full text-white flex items-center justify-center text-[11px] font-black shadow-lg ring-2 ring-white"
              style={{ background: v.color }}>
              {v.id}
            </div>
          </div>
        );
      })}

      {/* Client markers (static) */}
      {[
        { x: 22, y: 60 }, { x: 65, y: 30 }, { x: 45, y: 45 }, { x: 88, y: 70 }, { x: 35, y: 85 },
      ].map((c, i) => (
        <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${c.x}%`, top: `${c.y}%` }}>
          <MapPin className="h-4 w-4 text-gray-400" fill="white" strokeWidth={2.5} />
        </div>
      ))}

      {/* Vendor card overlay */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur rounded-xl shadow-lg p-3 z-20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Actividad ahora</span>
          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sincronizado
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {vendors.slice(0, 4).map(v => (
            <div key={v.id} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: v.color }}>{v.id}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-gray-900 truncate">{v.name}</div>
                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                  <span className="text-emerald-600">●</span> {v.status}
                  <Battery className="h-2.5 w-2.5 ml-1" /> {v.battery}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   2. PHONE MOCKUP — Vendor mobile app
   ============================================================ */
export function LiveMobileApp() {
  const [time, setTime] = useState('11:42');
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      {/* Phone frame */}
      <div className="relative rounded-[44px] bg-gray-900 p-2.5 shadow-2xl"
        style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.1)' }}>
        {/* Screen */}
        <div className="rounded-[34px] overflow-hidden bg-white relative" style={{ aspectRatio: '9/19' }}>
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-2xl z-30" />

          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-2 pb-1 text-[10px] font-semibold text-gray-900 z-20 relative">
            <span>{time}</span>
            <div className="flex items-center gap-1">
              <Signal className="h-2.5 w-2.5" />
              <Wifi className="h-2.5 w-2.5" />
              <Battery className="h-3 w-3" />
            </div>
          </div>

          {/* Header */}
          <div className="px-4 pt-4 pb-3" style={{ background: 'hsl(230, 55%, 52%)' }}>
            <div className="text-white">
              <div className="text-[10px] opacity-75 capitalize">jueves, 18 de abril</div>
              <div className="text-base font-bold">Hola, Carlos 👋</div>
            </div>
          </div>

          {/* Sales summary card */}
          <div className="-mt-3 mx-3 rounded-2xl p-3 shadow-md text-white relative z-10"
            style={{ background: 'linear-gradient(135deg, hsl(230, 55%, 52%), hsl(260, 45%, 60%))' }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="h-3 w-3" />
              <span className="text-[9px] font-medium opacity-90">Resumen del día</span>
            </div>
            <div className="text-xl font-black">$ 8,420.00</div>
            <div className="text-[9px] opacity-75">12 ventas realizadas</div>
          </div>

          {/* Quick stats grid */}
          <div className="grid grid-cols-2 gap-2 px-3 mt-3">
            {[
              { icon: ShoppingCart, label: 'Ventas', val: '12', sub: '$8,420', color: 'bg-indigo-50 text-indigo-600' },
              { icon: Users, label: 'Clientes', val: '24', sub: 'activos', color: 'bg-emerald-50 text-emerald-600' },
              { icon: Package, label: 'Stock', val: '87', sub: 'productos', color: 'bg-amber-50 text-amber-600' },
              { icon: Wallet, label: 'Cobros', val: '$3.2k', sub: '5 cobros', color: 'bg-emerald-50 text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-1.5 ${s.color}`}>
                  <s.icon className="h-3 w-3" />
                </div>
                <div className="text-[8px] font-semibold text-gray-700">{s.label}</div>
                <div className="text-[11px] font-bold text-gray-900">{s.val}</div>
                <div className="text-[8px] text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* CTA button */}
          <div className="px-3 mt-3">
            <button className="w-full text-white rounded-xl py-2.5 text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-md"
              style={{ background: 'hsl(230, 55%, 52%)' }}>
              <ShoppingCart className="h-3 w-3" /> Nueva venta rápida
            </button>
          </div>

          {/* Bottom nav */}
          <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-2 py-2 flex justify-around z-20">
            {[
              { icon: BarChart3, label: 'Inicio', active: true },
              { icon: ShoppingCart, label: 'Ventas' },
              { icon: Users, label: 'Clientes' },
              { icon: MapPin, label: 'Ruta' },
            ].map(i => (
              <div key={i.label} className={`flex flex-col items-center gap-0.5 ${i.active ? 'text-indigo-600' : 'text-gray-400'}`}>
                <i.icon className="h-3.5 w-3.5" />
                <span className="text-[8px] font-medium">{i.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating notification */}
      <div className="absolute -right-6 top-32 bg-white rounded-xl shadow-xl border border-gray-100 p-2.5 w-44 animate-pulse-subtle"
        style={{ animation: 'float 3s ease-in-out infinite' }}>
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-gray-900">Venta sincronizada</div>
            <div className="text-[9px] text-gray-500">Abarrotes Don Pepe · $1,240</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   3. DASHBOARD MOCKUP — Real Rutapp dark theme with rich fake data
   ============================================================ */
const DTK = {
  bg: '#0b1322',
  surface: '#111c33',
  surface2: '#16243f',
  border: 'rgba(255,255,255,0.06)',
  text: '#e7ecf5',
  muted: '#8a96ac',
  primary: '#5b6cf9',
  primarySoft: 'rgba(91,108,249,0.18)',
};

export function LiveDashboardMockup() {
  const kpis1 = [
    { l: 'VENTAS', v: '$184,320', s: '127 operaciones', Icon: ShoppingCart, c: '#7c8cff', tint: 'rgba(91,108,249,0.18)' },
    { l: 'TICKET PROMEDIO', v: '$1,452', s: '108 pedidos · 19 directas', Icon: TrendingUp, c: '#34d399', tint: 'rgba(34,197,94,0.18)' },
    { l: 'COBRADO', v: '$162,840', s: '94 cobros', Icon: Wallet, c: '#22d3ee', tint: 'rgba(34,211,238,0.18)' },
    { l: 'CARTERA', v: '$48,210', s: '23 clientes con saldo', Icon: Users, c: '#fbbf24', tint: 'rgba(245,158,11,0.18)' },
    { l: 'COMPRAS', v: '$92,180', s: 'Pendiente: $18,400', Icon: Package, c: '#f472b6', tint: 'rgba(236,72,153,0.18)' },
    { l: 'UTILIDAD', v: '$42,610', s: 'Margen: 23%', Icon: ArrowUp, c: '#fb7185', tint: 'rgba(251,113,133,0.18)' },
  ];
  const kpis2 = [
    { l: 'DEVOLUCIONES', v: '14 uds', s: '$1,820 · 1.1% s/venta', c: '#fb7185' },
    { l: 'EFECTIVIDAD', v: '92%', s: '108 de 117 visitas', c: '#34d399' },
    { l: 'CUMPLIMIENTO RUTA', v: '88%', s: '94 de 107 planeadas', c: '#22d3ee' },
    { l: 'DROP SIZE', v: '$1,710', s: 'por punto de venta', c: '#fbbf24' },
    { l: 'COBERTURA', v: '76%', s: '11 clientes sin compra 30+ días', c: '#f472b6' },
  ];
  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: DTK.bg, border: `1px solid ${DTK.border}` }}>
      {/* Window chrome */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: '#070d1a', borderBottom: `1px solid ${DTK.border}` }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <div className="flex-1 mx-3">
          <div className="rounded-md px-2 py-0.5 text-[10px] max-w-xs mx-auto text-center"
            style={{ background: DTK.surface, color: DTK.muted, border: `1px solid ${DTK.border}` }}>
            rutapp.mx/dashboard
          </div>
        </div>
      </div>

      {/* App body */}
      <div className="flex" style={{ background: DTK.bg, minHeight: 420, color: DTK.text }}>
        {/* Sidebar */}
        <aside className="w-40 p-2.5 hidden sm:block" style={{ background: DTK.bg, borderRight: `1px solid ${DTK.border}` }}>
          <div className="flex items-center gap-1.5 mb-3 px-1">
            <img src={rutappLogo.url} alt="Rutapp" className="h-6 w-auto rounded-md" />
            <span className="text-[12px] font-black" style={{ color: DTK.primary }}>Rutapp</span>
          </div>
          <div className="rounded-md px-2 py-1 mb-2 text-[9px]" style={{ background: DTK.surface, color: DTK.muted }}>
            Buscar vistas…
          </div>
          <div className="space-y-0.5">
            {[
              { icon: BarChart3, label: 'Dashboard', active: true },
              { icon: ShoppingCart, label: 'Ventas' },
              { icon: ShoppingCart, label: 'Punto de venta' },
              { icon: Package, label: 'Compras' },
              { icon: MapPin, label: 'Logística' },
              { icon: Package, label: 'Almacén' },
              { icon: Wallet, label: 'Finanzas' },
              { icon: BarChart3, label: 'Reportes' },
            ].map(it => (
              <div key={it.label}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] font-medium"
                style={it.active
                  ? { background: DTK.primarySoft, color: DTK.text }
                  : { color: DTK.muted }}>
                <it.icon className="h-3 w-3" />
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-3.5 min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: DTK.muted }}>
              <span className="px-1.5 py-0.5 rounded" style={{ background: DTK.surface, color: DTK.text }}>
                Distribuidora Don Pepe
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="px-2 py-1 rounded text-[9px] font-bold text-white flex items-center gap-1"
                style={{ background: DTK.primary }}>
                <RefreshCw className="h-2.5 w-2.5" /> Sincronizar
              </div>
            </div>
          </div>

          {/* Title + date chips */}
          <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
            <div>
              <div className="text-[13px] font-bold flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard
              </div>
              <div className="text-[9px]" style={{ color: DTK.muted }}>1 jun — 30 jun 2026</div>
            </div>
            <div className="flex items-center gap-1">
              {['Hoy', '7 días', '30 días', 'Este mes', 'Semana'].map(d => (
                <div key={d} className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium`}
                  style={d === 'Este mes'
                    ? { background: DTK.primary, color: 'white' }
                    : { color: DTK.muted, background: DTK.surface }}>
                  {d}
                </div>
              ))}
            </div>
          </div>

          {/* Meta del mes banner */}
          <div className="rounded-lg p-2.5 mb-3 flex items-center justify-between"
            style={{ background: DTK.surface, border: `1px solid ${DTK.border}` }}>
            <div>
              <div className="text-[8.5px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: DTK.muted }}>
                <span className="w-1 h-1 rounded-full" style={{ background: DTK.primary }} /> META DEL MES
              </div>
              <div className="text-[11px] font-bold mt-0.5">Vas 78% de tu meta — quedan 6 días</div>
            </div>
            <div className="flex items-center gap-3">
              {[
                { l: 'MARGEN', v: '23%', s: '+2.1pts', c: '#34d399' },
                { l: 'RECUPERACIÓN', v: '94%', s: '$162k', c: '#22d3ee' },
                { l: 'FLUJO NETO', v: '$70k', s: 'mes', c: '#fbbf24' },
              ].map(k => (
                <div key={k.l}>
                  <div className="text-[7.5px]" style={{ color: DTK.muted }}>{k.l}</div>
                  <div className="text-[11px] font-black" style={{ color: k.c }}>{k.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI grid row 1 */}
          <div className="grid grid-cols-6 gap-1.5 mb-1.5">
            {kpis1.map(k => (
              <div key={k.l} className="rounded-lg p-2"
                style={{ background: DTK.surface, border: `1px solid ${DTK.border}` }}>
                <div className="flex items-start justify-between mb-1">
                  <div className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: DTK.muted }}>{k.l}</div>
                  <div className="w-5 h-5 rounded-md grid place-items-center"
                    style={{ background: k.tint, color: k.c }}>
                    <k.Icon className="h-2.5 w-2.5" />
                  </div>
                </div>
                <div className="text-[11px] font-black">{k.v}</div>
                <div className="text-[7.5px]" style={{ color: DTK.muted }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* KPI grid row 2 */}
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {kpis2.map(k => (
              <div key={k.l} className="rounded-lg p-2"
                style={{ background: DTK.surface, border: `1px solid ${DTK.border}` }}>
                <div className="text-[7.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: DTK.muted }}>{k.l}</div>
                <div className="text-[12px] font-black" style={{ color: k.c }}>{k.v}</div>
                <div className="text-[7.5px]" style={{ color: DTK.muted }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-3 mb-2 text-[9.5px]" style={{ borderBottom: `1px solid ${DTK.border}` }}>
            {['Resumen', 'Productos y Clientes', 'Evolución mensual', 'Equipo', 'Cartera', 'Asesor IA'].map((t, i) => (
              <div key={t} className="pb-1.5"
                style={i === 0
                  ? { color: DTK.text, fontWeight: 700, borderBottom: `2px solid ${DTK.primary}`, marginBottom: -1 }
                  : { color: DTK.muted }}>
                {t}
              </div>
            ))}
          </div>

          {/* Chart + ranking */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 rounded-lg p-2.5" style={{ background: DTK.surface, border: `1px solid ${DTK.border}` }}>
              <div className="text-[10px] font-bold mb-2">Tendencia de ventas</div>
              <svg viewBox="0 0 280 100" className="w-full h-24">
                <defs>
                  <linearGradient id="barGradDk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c8cff" />
                    <stop offset="100%" stopColor="#5b6cf9" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                {[55, 68, 42, 78, 52, 90, 72, 95, 64, 88, 76, 92].map((h, i) => (
                  <rect key={i} x={i * 23 + 4} y={100 - h} width="16" height={h} rx="2" fill="url(#barGradDk)">
                    <animate attributeName="height" from="0" to={h} dur="0.9s" fill="freeze" />
                    <animate attributeName="y" from="100" to={100 - h} dur="0.9s" fill="freeze" />
                  </rect>
                ))}
              </svg>
              <div className="flex justify-between text-[7.5px] mt-1 px-1" style={{ color: DTK.muted }}>
                {['L', 'M', 'M', 'J', 'V', 'S', 'D', 'L', 'M', 'M', 'J', 'V'].map((d, i) => <span key={i}>{d}</span>)}
              </div>
            </div>

            <div className="rounded-lg p-2.5" style={{ background: DTK.surface, border: `1px solid ${DTK.border}` }}>
              <div className="text-[10px] font-bold mb-2">Ventas por vendedor</div>
              <div className="space-y-1.5">
                {[
                  { n: 'Juan López', v: '$48.2k', pct: 95, c: '#fbbf24' },
                  { n: 'Carlos Ruiz', v: '$42.4k', pct: 84, c: '#5b6cf9' },
                  { n: 'Ana Martínez', v: '$36.1k', pct: 72, c: '#34d399' },
                  { n: 'María Soto', v: '$28.6k', pct: 57, c: '#f472b6' },
                ].map((v, i) => (
                  <div key={v.n}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[8px] font-bold w-2.5" style={{ color: DTK.muted }}>{i + 1}</span>
                      <div className="w-4 h-4 rounded-full text-white grid place-items-center text-[7.5px] font-bold"
                        style={{ background: v.c }}>{v.n[0]}</div>
                      <span className="text-[8.5px] flex-1 truncate">{v.n}</span>
                      <span className="text-[8.5px] font-bold">{v.v}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden ml-6" style={{ background: DTK.surface2 }}>
                      <div className="h-full rounded-full" style={{ width: `${v.pct}%`, background: v.c }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

