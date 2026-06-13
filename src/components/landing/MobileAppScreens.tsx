import {
  Battery, Wifi, Signal, ShoppingCart, Users, Package, Wallet, MoreHorizontal,
  TrendingUp, RefreshCw, Moon, Monitor, ChevronDown, Play, AlertTriangle,
  Check, Plus, Minus, Search, MapPin, Navigation, ChevronRight, CreditCard,
  Banknote, Truck, CheckCircle2, ArrowLeft, Camera, Pencil,
} from 'lucide-react';

// Rutapp dark theme tokens (matching the real app)
const TOKENS = {
  bg: '#0b1322',
  surface: '#111c33',
  surface2: '#16243f',
  border: 'rgba(255,255,255,0.06)',
  text: '#e7ecf5',
  muted: '#8a96ac',
  primary: '#5b6cf9',
  primarySoft: 'rgba(91,108,249,0.14)',
  warn: '#f59e0b',
  success: '#22c55e',
};

/** iPhone-like frame with dark Rutapp UI inside */
function Phone({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="relative mx-auto" style={{ width: 240 }}>
      <div className="relative rounded-[38px] p-2 shadow-2xl"
        style={{ background: '#0a0f1c', boxShadow: '0 30px 60px -20px rgba(10,21,48,0.45), 0 0 0 1px rgba(0,0,0,0.1)' }}>
        <div className="rounded-[30px] overflow-hidden relative" style={{ aspectRatio: '9/19.5', background: TOKENS.bg, color: TOKENS.text }}>
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-b-2xl z-30" />
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-1.5 pb-1 text-[9px] font-semibold relative z-20" style={{ color: TOKENS.text }}>
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <Signal className="h-2 w-2" /><Wifi className="h-2 w-2" /><Battery className="h-2.5 w-2.5" />
            </div>
          </div>
          {children}
        </div>
      </div>
      {label && (
        <div className="text-center mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: TOKENS.primary }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** Mobile top bar (matches real Rutapp /ruta) */
function MobileHeader({ title = 'Ruta' }: { title?: string }) {
  return (
    <div className="px-3 pt-1 pb-2 flex items-center justify-between" style={{ background: TOKENS.bg }}>
      <span className="text-[13px] font-bold">{title}</span>
      <div className="flex items-center gap-2.5" style={{ color: TOKENS.muted }}>
        <RefreshCw className="h-3 w-3" />
        <Moon className="h-3 w-3" />
        <Monitor className="h-3 w-3" />
        <span className="relative">
          <Wifi className="h-3 w-3" style={{ color: TOKENS.success }} />
        </span>
      </div>
    </div>
  );
}

/** Mobile bottom nav (matches real Rutapp /ruta) */
function MobileNav({ active = 'POS' }: { active?: string }) {
  const items = [
    { icon: Users, label: 'Clientes' },
    { icon: ShoppingCart, label: 'Ventas' },
    { icon: Package, label: 'POS' },
    { icon: Wallet, label: 'Stock' },
    { icon: MoreHorizontal, label: 'Más' },
  ];
  return (
    <div className="absolute bottom-0 inset-x-0 px-1 py-2 flex justify-around z-20"
      style={{ background: TOKENS.bg, borderTop: `1px solid ${TOKENS.border}` }}>
      {items.map(it => {
        const on = it.label === active;
        return (
          <div key={it.label} className="flex flex-col items-center gap-0.5" style={{ color: on ? TOKENS.text : TOKENS.muted }}>
            <it.icon className="h-3.5 w-3.5" />
            <span className="text-[7.5px] font-medium">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── 1. INICIO (Rutero) ───────────────────────── */
export function PhoneRutero() {
  return (
    <Phone label="Inicio · Ruta">
      <MobileHeader />
      {/* Empresa switcher */}
      <div className="mx-2 mt-1 mb-2 px-2 py-1.5 rounded-md flex items-center justify-between text-[9px]"
        style={{ background: TOKENS.surface, color: TOKENS.text }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded grid place-items-center text-[8px] font-bold" style={{ background: TOKENS.primary, color: 'white' }}>D</span>
          Distribuidora Don Pepe
        </span>
        <ChevronDown className="h-2.5 w-2.5" style={{ color: TOKENS.muted }} />
      </div>

      <div className="px-3">
        <div className="text-[9px]" style={{ color: TOKENS.muted }}>Sábado, 13 De Junio</div>
        <div className="text-[16px] font-bold mt-0.5">Hola, Carlos 👋</div>
      </div>

      {/* Resumen del día (primary card) */}
      <div className="mx-3 mt-3 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #5b6cf9, #6d56f0)' }}>
        <div className="flex items-center gap-1.5 text-white/85 text-[9px] font-medium">
          <TrendingUp className="h-2.5 w-2.5" /> Resumen del día
        </div>
        <div className="text-[22px] font-black text-white mt-0.5">$ 8,420.00</div>
        <div className="text-[9px] text-white/75">12 ventas realizadas</div>
      </div>

      {/* 2x2 KPI grid (matches real /ruta) */}
      <div className="px-3 mt-3 grid grid-cols-2 gap-2">
        {[
          { Icon: ShoppingCart, label: 'Ventas de hoy', val: '12 ventas', sub: '$8,420.00', tint: 'rgba(91,108,249,0.18)', color: '#7c8cff' },
          { Icon: Users, label: 'Clientes', val: '24 visitados', sub: 'de 32 hoy', tint: 'rgba(34,197,94,0.18)', color: '#34d399' },
          { Icon: Package, label: 'Stock abordo', val: '87 prods', sub: '4 bajo mínimo', tint: 'rgba(245,158,11,0.18)', color: '#fbbf24' },
          { Icon: Wallet, label: 'Cobros de hoy', val: '5 cobros', sub: '$3,210.00', tint: 'rgba(236,72,153,0.18)', color: '#f472b6' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-2.5" style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }}>
            <div className="w-7 h-7 rounded-lg grid place-items-center mb-1.5" style={{ background: k.tint, color: k.color }}>
              <k.Icon className="h-3.5 w-3.5" />
            </div>
            <div className="text-[8.5px]" style={{ color: TOKENS.muted }}>{k.label}</div>
            <div className="text-[11px] font-bold">{k.val}</div>
            <div className="text-[8px]" style={{ color: TOKENS.muted }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-3 mt-2.5">
        <div className="rounded-xl py-2 px-2.5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white"
          style={{ background: TOKENS.primary }}>
          <Navigation className="h-3 w-3" /> Iniciar siguiente visita
        </div>
      </div>

      <MobileNav active="Clientes" />
    </Phone>
  );
}

/* ───────────────────────── 2. POS móvil ───────────────────────── */
export function PhonePOS() {
  const items = [
    { n: 'Coca-Cola 600 ml', q: 12, p: 14 },
    { n: 'Sabritas Original', q: 6, p: 18 },
    { n: 'Galletas Marías', q: 4, p: 22 },
  ];
  const total = items.reduce((s, i) => s + i.q * i.p, 0);
  return (
    <Phone label="Punto de venta">
      <MobileHeader title="POS · Carlos R." />
      {/* Cliente */}
      <div className="mx-2 mt-1 mb-2 px-2.5 py-2 rounded-md flex items-center justify-between"
        style={{ background: TOKENS.surface }}>
        <div className="min-w-0">
          <div className="text-[8px]" style={{ color: TOKENS.muted }}>Cliente</div>
          <div className="text-[10.5px] font-bold truncate">Abarrotes Don Pepe</div>
        </div>
        <div className="w-6 h-6 rounded-full grid place-items-center text-white" style={{ background: TOKENS.primary }}>
          <Pencil className="h-2.5 w-2.5" />
        </div>
      </div>

      {/* Search */}
      <div className="px-3">
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5" style={{ background: TOKENS.surface }}>
          <Search className="h-2.5 w-2.5" style={{ color: TOKENS.muted }} />
          <span className="text-[9px]" style={{ color: TOKENS.muted }}>Buscar producto o escanear…</span>
        </div>
      </div>

      {/* Lines */}
      <div className="px-3 mt-2 space-y-1.5">
        {items.map(it => (
          <div key={it.n} className="flex items-center gap-2 p-1.5 rounded-lg"
            style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }}>
            <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: TOKENS.surface2 }}>
              <Package className="h-3 w-3" style={{ color: TOKENS.muted }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[9.5px] font-semibold truncate">{it.n}</div>
              <div className="text-[8px]" style={{ color: TOKENS.muted }}>${it.p.toFixed(2)} c/u</div>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-4 h-4 rounded grid place-items-center" style={{ background: TOKENS.surface2 }}>
                <Minus className="h-2 w-2" style={{ color: TOKENS.muted }} />
              </button>
              <span className="text-[10px] font-bold w-3 text-center">{it.q}</span>
              <button className="w-4 h-4 rounded grid place-items-center text-white" style={{ background: TOKENS.primary }}>
                <Plus className="h-2 w-2" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Total + CTA */}
      <div className="absolute bottom-[42px] inset-x-0 px-3 pt-2 pb-2" style={{ background: TOKENS.bg, borderTop: `1px solid ${TOKENS.border}` }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px]" style={{ color: TOKENS.muted }}>Total</span>
          <span className="text-[16px] font-black">${total.toFixed(2)}</span>
        </div>
        <div className="rounded-lg py-2 text-center text-white text-[10.5px] font-bold"
          style={{ background: TOKENS.primary }}>
          Cobrar venta
        </div>
      </div>

      <MobileNav active="POS" />
    </Phone>
  );
}

/* ───────────────────────── 3. Cobro multi-folio ───────────────────────── */
export function PhoneCobro() {
  return (
    <Phone label="Cobro · FIFO">
      <MobileHeader title="Cobrar" />
      <div className="px-3 pt-1">
        <div className="text-[9px]" style={{ color: TOKENS.muted }}>Cobrar a</div>
        <div className="text-[12px] font-bold">Mini Súper La Loma</div>
        <div className="text-[9px] mt-0.5" style={{ color: TOKENS.muted }}>
          Saldo total: <b style={{ color: TOKENS.text }}>$4,820.00</b>
        </div>
      </div>

      <div className="px-3 mt-3">
        <div className="text-[8.5px] font-bold uppercase tracking-wider mb-1.5" style={{ color: TOKENS.muted }}>
          Folios pendientes
        </div>
        <div className="space-y-1.5">
          {[
            { f: 'V-1042', d: '12 abr', m: 1240, sel: true },
            { f: 'V-1078', d: '18 abr', m: 1880, sel: true },
            { f: 'V-1099', d: '02 may', m: 1700, sel: false },
          ].map(r => (
            <div key={r.f} className="flex items-center gap-2 p-1.5 rounded-md"
              style={{
                background: r.sel ? TOKENS.primarySoft : TOKENS.surface,
                border: `1px solid ${r.sel ? TOKENS.primary : TOKENS.border}`,
              }}>
              <div className="w-3.5 h-3.5 rounded grid place-items-center"
                style={r.sel ? { background: TOKENS.primary, color: 'white' } : { border: `1px solid ${TOKENS.muted}` }}>
                {r.sel && <Check className="h-2 w-2" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-semibold">{r.f}</div>
                <div className="text-[8px]" style={{ color: TOKENS.muted }}>{r.d}</div>
              </div>
              <span className="text-[10px] font-bold">${r.m.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-lg p-2.5" style={{ background: TOKENS.primarySoft, border: `1px solid ${TOKENS.primary}` }}>
          <div className="text-[8px]" style={{ color: TOKENS.muted }}>Monto a cobrar</div>
          <div className="text-[20px] font-black" style={{ color: TOKENS.text }}>$3,120.00</div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className="rounded-md py-1.5 text-[9px] font-bold flex items-center justify-center gap-1"
            style={{ background: TOKENS.surface, color: TOKENS.text, border: `1px solid ${TOKENS.border}` }}>
            <Banknote className="h-2.5 w-2.5" /> Efectivo
          </button>
          <button className="rounded-md py-1.5 text-[9px] font-bold flex items-center justify-center gap-1 text-white"
            style={{ background: TOKENS.primary }}>
            <CreditCard className="h-2.5 w-2.5" /> Transferencia
          </button>
        </div>
      </div>

      <MobileNav active="Ventas" />
    </Phone>
  );
}

/* ───────────────────────── 4. Entrega con firma ───────────────────────── */
export function PhoneEntrega() {
  return (
    <Phone label="Entrega · Firma">
      <MobileHeader title="Entrega E-2034" />
      <div className="px-3 pt-1 pb-3 rounded-b-xl" style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
        <div className="flex items-center gap-1.5 text-white/85 text-[9px]">
          <Truck className="h-2.5 w-2.5" /> Entrega programada
        </div>
        <div className="text-[12px] font-bold text-white mt-0.5">Cremería El Sol</div>
        <div className="text-[8.5px] text-white/80">Morelos 12 · Centro</div>
      </div>

      <div className="px-3 mt-2.5">
        <div className="text-[8.5px] font-bold uppercase tracking-wider mb-1.5" style={{ color: TOKENS.muted }}>
          Productos a entregar
        </div>
        <div className="space-y-1.5">
          {[
            { n: 'Leche entera 1L', q: 24, ok: true },
            { n: 'Yoghurt natural 1kg', q: 12, ok: true },
            { n: 'Crema ácida 500g', q: 8, ok: false },
          ].map(p => (
            <div key={p.n} className="flex items-center gap-2 p-1.5 rounded-md"
              style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0"
                style={{ color: p.ok ? TOKENS.success : TOKENS.muted }} />
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-semibold truncate">{p.n}</div>
                <div className="text-[8px]" style={{ color: TOKENS.muted }}>Cantidad {p.q}</div>
              </div>
              {!p.ok && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(245,158,11,0.18)', color: TOKENS.warn }}>
                  Faltante
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Firma */}
        <div className="mt-2.5 rounded-md p-2"
          style={{ background: TOKENS.surface, border: `1px dashed ${TOKENS.muted}` }}>
          <div className="text-[8px] mb-1" style={{ color: TOKENS.muted }}>Firma del cliente</div>
          <svg viewBox="0 0 200 36" className="w-full h-7">
            <path d="M5 28 Q 20 5, 35 23 T 70 18 Q 90 5, 110 26 T 160 16 L 195 23"
              fill="none" stroke={TOKENS.text} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="absolute bottom-[42px] inset-x-0 px-3 pt-2 pb-2" style={{ background: TOKENS.bg, borderTop: `1px solid ${TOKENS.border}` }}>
        <div className="rounded-lg py-2 text-center text-white text-[10.5px] font-bold flex items-center justify-center gap-1.5"
          style={{ background: TOKENS.success }}>
          <Check className="h-3 w-3" /> Confirmar entrega
        </div>
      </div>

      <MobileNav active="Ventas" />
    </Phone>
  );
}
