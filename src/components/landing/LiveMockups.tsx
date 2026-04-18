import { useEffect, useState } from 'react';
import {
  Battery, MapPin, ShoppingCart, TrendingUp, Package, Users,
  Wallet, Bell, Wifi, Signal, ChevronRight, Search, BarChart3,
  ArrowUp, Check,
} from 'lucide-react';

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
   3. DASHBOARD MOCKUP — KPI panel with animated chart
   ============================================================ */
export function LiveDashboardMockup() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
      {/* Window chrome */}
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 mx-3">
          <div className="bg-white border border-gray-200 rounded-md px-2 py-0.5 text-[10px] text-gray-400 max-w-xs mx-auto">
            rutapp.mx/dashboard
          </div>
        </div>
      </div>

      {/* App body */}
      <div className="flex bg-gray-50" style={{ minHeight: 360 }}>
        {/* Sidebar */}
        <aside className="w-44 bg-white border-r border-gray-100 p-3 hidden sm:block">
          <div className="flex items-center gap-1.5 mb-4">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-black"
              style={{ background: 'hsl(230, 55%, 52%)' }}>R</div>
            <span className="text-xs font-black" style={{ color: 'hsl(230, 55%, 52%)' }}>Rutapp</span>
          </div>
          <div className="space-y-0.5">
            {[
              { icon: BarChart3, label: 'Dashboard', active: true },
              { icon: ShoppingCart, label: 'Punto de venta' },
              { icon: MapPin, label: 'App Móvil' },
              { icon: Users, label: 'Clientes' },
              { icon: Package, label: 'Productos' },
              { icon: Wallet, label: 'Cobranza' },
            ].map(it => (
              <div key={it.label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] font-medium ${
                  it.active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600'
                }`}>
                <it.icon className="h-3 w-3" />
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Dashboard ejecutivo</h3>
              <p className="text-[10px] text-gray-500">Hoy, 18 de abril 2026</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold">D</div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Ventas hoy', val: '$48,320', delta: '+12%', color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Cobros', val: '$32,180', delta: '+8%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Pedidos', val: '47', delta: '+24%', color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Utilidad', val: '$14,090', delta: '+5%', color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map(k => (
              <div key={k.label} className={`rounded-lg p-2 ${k.bg}`}>
                <div className="text-[8px] font-medium text-gray-600 uppercase">{k.label}</div>
                <div className="text-sm font-black text-gray-900 mt-0.5">{k.val}</div>
                <div className={`text-[9px] font-bold flex items-center gap-0.5 ${k.color}`}>
                  <ArrowUp className="h-2 w-2" /> {k.delta}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + ranking */}
          <div className="grid grid-cols-3 gap-2">
            {/* Bar chart */}
            <div className="col-span-2 bg-white rounded-lg border border-gray-100 p-3">
              <div className="text-[10px] font-bold text-gray-700 mb-2">Ventas últimos 7 días</div>
              <svg viewBox="0 0 280 100" className="w-full h-24">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(230, 55%, 60%)" />
                    <stop offset="100%" stopColor="hsl(230, 55%, 85%)" />
                  </linearGradient>
                </defs>
                {[60, 45, 78, 52, 90, 68, 95].map((h, i) => (
                  <g key={i}>
                    <rect x={i * 40 + 8} y={100 - h} width="22" height={h} rx="2" fill="url(#barGrad)">
                      <animate attributeName="height" from="0" to={h} dur="0.8s" fill="freeze" />
                      <animate attributeName="y" from="100" to={100 - h} dur="0.8s" fill="freeze" />
                    </rect>
                  </g>
                ))}
              </svg>
              <div className="flex justify-between text-[8px] text-gray-400 mt-1 px-1">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d}>{d}</span>)}
              </div>
            </div>

            {/* Top vendedores */}
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <div className="text-[10px] font-bold text-gray-700 mb-2">Top vendedores</div>
              <div className="space-y-1.5">
                {[
                  { n: 'Juan L.', v: '$11.2k', c: 'bg-amber-500' },
                  { n: 'Carlos R.', v: '$8.4k', c: 'bg-indigo-500' },
                  { n: 'Ana M.', v: '$6.2k', c: 'bg-emerald-500' },
                ].map((v, i) => (
                  <div key={v.n} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-gray-400 w-3">{i + 1}</span>
                    <div className={`w-4 h-4 rounded-full ${v.c} text-white flex items-center justify-center text-[8px] font-bold`}>
                      {v.n[0]}
                    </div>
                    <span className="text-[9px] text-gray-700 flex-1 truncate">{v.n}</span>
                    <span className="text-[9px] font-bold text-gray-900">{v.v}</span>
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
