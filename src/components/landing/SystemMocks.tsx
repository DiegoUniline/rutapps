import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck, Wallet,
  BarChart3, Settings, Search, Bell, ChevronRight, TrendingUp,
  TrendingDown, Plus, Filter, MoreVertical, Wifi, WifiOff,
  Battery, Signal, ArrowUpRight, ArrowDownRight, Check, Clock,
  MapPin, DollarSign, Store, ShoppingBag, Boxes, AlertTriangle,
} from "lucide-react";

const C = {
  primary: "#0060e8",
  primarySoft: "#e6efff",
  accent: "#fe8c1a",
  ink: "#0a1530",
  ink2: "#3b4863",
  muted: "#6b7791",
  line: "#eef0f5",
  surface: "#f7f8fb",
  green: "#16a34a",
  red: "#dc2626",
};

/* ──────────────────────────────────────────────────────────────── */
/*  BROWSER FRAME                                                   */
/* ──────────────────────────────────────────────────────────────── */
export function BrowserFrame({ url, children, className = "" }: { url: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden border bg-white shadow-2xl ${className}`} style={{ borderColor: C.line }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: C.line, background: "#fafbfc" }}>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1 rounded-md text-[11px] truncate"
          style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.muted }}>
          {url}
        </div>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  PHONE FRAME                                                     */
/* ──────────────────────────────────────────────────────────────── */
export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto ${className}`} style={{ width: 280 }}>
      <div className="rounded-[36px] p-2 shadow-2xl" style={{ background: "#0a1530" }}>
        <div className="rounded-[28px] overflow-hidden bg-white relative" style={{ aspectRatio: "9/19" }}>
          {/* Notch */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-20" />
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[10px] font-semibold relative z-10" style={{ color: C.ink }}>
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="h-2.5 w-2.5" />
              <WifiOff className="h-2.5 w-2.5 text-red-500" />
              <Battery className="h-3 w-3" />
            </span>
          </div>
          <div className="h-full overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  MOBILE — MIS VENTAS DEL DÍA (offline)                           */
/* ──────────────────────────────────────────────────────────────── */
export function MobileVentasScreen() {
  return (
    <PhoneFrame>
      {/* Offline banner */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-white" style={{ background: C.accent }}>
        <WifiOff className="h-3 w-3" /> Sin señal · 3 ventas en cola
      </div>
      {/* Header */}
      <div className="px-4 py-3" style={{ background: C.primary }}>
        <div className="text-[10px] text-white/70">Hoy · Ruta Norte</div>
        <div className="text-[22px] font-bold text-white tracking-tight">$12,480</div>
        <div className="flex gap-3 mt-1 text-[10px] text-white/85">
          <span>📦 23 entregas</span>
          <span>💰 18 cobros</span>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b" style={{ borderColor: C.line }}>
        {["Hoy", "Pedidos", "Cobros"].map((t, i) => (
          <span key={t} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold ${i === 0 ? "text-white" : ""}`}
            style={i === 0 ? { background: C.primary } : { color: C.muted }}>{t}</span>
        ))}
      </div>
      {/* Lista */}
      <div className="px-3 py-2 space-y-2">
        {[
          { c: "Abarrotes Doña Mary", t: "$1,840", s: "Entregado", g: true },
          { c: "Tienda El Sol", t: "$640", s: "Pendiente", g: false },
          { c: "Mini Súper Juárez", t: "$2,310", s: "Entregado", g: true },
          { c: "Don Pepe", t: "$485", s: "En ruta", g: false },
        ].map((v) => (
          <div key={v.c} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: C.line }}>
            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ background: v.g ? C.green : C.accent }}>
              {v.c.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold truncate" style={{ color: C.ink }}>{v.c}</div>
              <div className="text-[9px]" style={{ color: C.muted }}>{v.s}</div>
            </div>
            <div className="text-[11px] font-bold" style={{ color: C.primary }}>{v.t}</div>
          </div>
        ))}
      </div>
      {/* Bottom nav */}
      <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 border-t bg-white py-1.5" style={{ borderColor: C.line }}>
        {[Truck, Package, DollarSign, MapPin].map((I, i) => (
          <div key={i} className="flex justify-center">
            <I className="h-4 w-4" style={{ color: i === 0 ? C.primary : C.muted }} />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — DASHBOARD                                             */
/* ──────────────────────────────────────────────────────────────── */
export function DashboardScreen() {
  return (
    <BrowserFrame url="rutapp.mx/dashboard">
      <div className="flex" style={{ minHeight: 360 }}>
        {/* Sidebar */}
        <aside className="w-40 border-r py-3 px-2" style={{ borderColor: C.line, background: "#fafbfc" }}>
          <div className="flex items-center gap-1.5 px-2 mb-3">
            <div className="h-5 w-5 rounded" style={{ background: C.primary }} />
            <span className="text-[11px] font-bold">Rutapp</span>
          </div>
          {[
            [LayoutDashboard, "Dashboard", true],
            [ShoppingCart, "Ventas", false],
            [Package, "Inventario", false],
            [Users, "Clientes", false],
            [Truck, "Logística", false],
            [Wallet, "Finanzas", false],
            [BarChart3, "Reportes", false],
            [Store, "Tienda", false],
            [Settings, "Ajustes", false],
          ].map(([I, l, a]: any, i) => (
            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10.5px] ${a ? "font-semibold" : ""}`}
              style={a ? { background: C.primarySoft, color: C.primary } : { color: C.ink2 }}>
              <I className="h-3.5 w-3.5" /> {l}
            </div>
          ))}
        </aside>
        {/* Main */}
        <main className="flex-1 p-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[15px] font-bold">Dashboard</h2>
              <p className="text-[10px]" style={{ color: C.muted }}>Hoy · 25 jun 2026</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="px-2 py-1 rounded-md flex items-center gap-1 text-[10px]" style={{ background: C.surface, color: C.ink2 }}>
                <Search className="h-3 w-3" /> Buscar…
              </div>
              <Bell className="h-4 w-4" style={{ color: C.muted }} />
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#0060e8] to-[#fe8c1a]" />
            </div>
          </div>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { l: "Ventas hoy", v: "$48,250", d: "+12%", up: true, c: C.primary },
              { l: "Tickets", v: "23", d: "+8%", up: true, c: C.green },
              { l: "Cobrado", v: "$31,820", d: "+15%", up: true, c: C.accent },
              { l: "Por cobrar", v: "$16,430", d: "-4%", up: false, c: "#7c3aed" },
            ].map((k) => (
              <div key={k.l} className="rounded-lg p-2.5 border" style={{ borderColor: C.line }}>
                <div className="flex items-center justify-between">
                  <div className="text-[9px]" style={{ color: C.muted }}>{k.l}</div>
                  <span className={`inline-flex items-center text-[9px] font-semibold ${k.up ? "text-green-600" : "text-red-500"}`}>
                    {k.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {k.d}
                  </span>
                </div>
                <div className="text-[16px] font-bold mt-1" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
          {/* Charts row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 rounded-lg p-3 border" style={{ borderColor: C.line }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10.5px] font-semibold">Ventas últimos 7 días</div>
                <div className="text-[9px]" style={{ color: C.muted }}>+18% vs semana pasada</div>
              </div>
              <svg viewBox="0 0 280 80" className="w-full h-20">
                <defs>
                  <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={C.primary} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,60 L40,45 L80,55 L120,30 L160,38 L200,20 L240,28 L280,12 L280,80 L0,80 Z" fill="url(#g1)" />
                <path d="M0,60 L40,45 L80,55 L120,30 L160,38 L200,20 L240,28 L280,12" stroke={C.primary} strokeWidth="2" fill="none" />
                {[[0,60],[40,45],[80,55],[120,30],[160,38],[200,20],[240,28],[280,12]].map(([x,y],i) => (
                  <circle key={i} cx={x} cy={y} r="2.5" fill={C.primary} />
                ))}
              </svg>
              <div className="flex justify-between text-[8.5px] mt-1" style={{ color: C.muted }}>
                {["Jue","Vie","Sáb","Dom","Lun","Mar","Mié","Jue"].map(d => <span key={d}>{d}</span>)}
              </div>
            </div>
            <div className="rounded-lg p-3 border" style={{ borderColor: C.line }}>
              <div className="text-[10.5px] font-semibold mb-2">Top productos</div>
              {[
                ["Coca 600ml", 92, C.primary],
                ["Sabritas 45g", 68, C.accent],
                ["Agua 1L", 51, C.green],
                ["Galletas", 34, "#7c3aed"],
              ].map(([n, p, c]: any) => (
                <div key={n} className="mb-1.5">
                  <div className="flex justify-between text-[9px]" style={{ color: C.ink2 }}>
                    <span>{n}</span><span className="font-semibold">{p}</span>
                  </div>
                  <div className="h-1 rounded-full mt-0.5" style={{ background: C.line }}>
                    <div className="h-full rounded-full" style={{ width: `${p}%`, background: c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </BrowserFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — POS                                                    */
/* ──────────────────────────────────────────────────────────────── */
export function POSScreen() {
  return (
    <BrowserFrame url="rutapp.mx/pos">
      <div className="grid grid-cols-3" style={{ minHeight: 340 }}>
        <div className="col-span-2 p-3 border-r" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-[10.5px]" style={{ background: C.surface }}>
              <Search className="h-3 w-3" style={{ color: C.muted }} /> Buscar producto o escanear…
            </div>
            <button className="px-2 py-1.5 rounded-md text-[10px] font-semibold text-white" style={{ background: C.primary }}>
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-1.5 mb-2 overflow-hidden">
            {["Todos", "Bebidas", "Snacks", "Lácteos", "Limpieza"].map((t, i) => (
              <span key={t} className="px-2 py-1 rounded-full text-[9.5px] font-semibold whitespace-nowrap"
                style={i === 0 ? { background: C.primary, color: "#fff" } : { background: C.surface, color: C.ink2 }}>{t}</span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Coca 600ml", 18.5, "#e11d48"],
              ["Sabritas 45g", 16, C.accent],
              ["Agua Cz 1L", 12, "#0ea5e9"],
              ["Gansito", 14.5, "#f59e0b"],
              ["Galletas", 22, "#92400e"],
              ["Yogurt 1L", 28, "#fde68a"],
              ["Café 100g", 56, "#78350f"],
              ["Leche 1L", 24, "#e7e5e4"],
            ].map(([n, p, bg]: any) => (
              <div key={n} className="rounded-lg border p-1.5 cursor-pointer hover:shadow-md transition" style={{ borderColor: C.line }}>
                <div className="aspect-square rounded-md flex items-center justify-center mb-1" style={{ background: bg + "20" }}>
                  <Package className="h-5 w-5" style={{ color: bg }} />
                </div>
                <div className="text-[9px] font-semibold truncate">{n}</div>
                <div className="text-[10px] font-bold" style={{ color: C.primary }}>${p}</div>
              </div>
            ))}
          </div>
        </div>
        <aside className="p-3 flex flex-col" style={{ background: "#fafbfc" }}>
          <div className="text-[10.5px] font-semibold mb-1">Cliente</div>
          <div className="rounded-md border px-2 py-1.5 text-[10px] mb-3 flex items-center justify-between" style={{ borderColor: C.line }}>
            <span className="font-semibold">Abarrotes Doña Mary</span>
            <ChevronRight className="h-3 w-3" style={{ color: C.muted }} />
          </div>
          <div className="text-[10.5px] font-semibold mb-1">Carrito (4)</div>
          <div className="flex-1 space-y-1.5 overflow-hidden">
            {[
              ["Coca 600ml", 6, 18.5],
              ["Sabritas 45g", 4, 16],
              ["Yogurt 1L", 2, 28],
              ["Galletas", 3, 22],
            ].map(([n, q, p]: any) => (
              <div key={n} className="flex items-center justify-between text-[9.5px] py-1 border-b" style={{ borderColor: C.line }}>
                <div>
                  <div className="font-semibold">{n}</div>
                  <div style={{ color: C.muted }}>{q} × ${p}</div>
                </div>
                <div className="font-bold" style={{ color: C.ink }}>${(q * p).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t space-y-1 text-[10px]" style={{ borderColor: C.line }}>
            <div className="flex justify-between"><span style={{ color: C.muted }}>Subtotal</span><span>$289.00</span></div>
            <div className="flex justify-between"><span style={{ color: C.green }}>Promo 2x1</span><span style={{ color: C.green }}>-$18.50</span></div>
            <div className="flex justify-between font-bold text-[13px] pt-1"><span>Total</span><span style={{ color: C.primary }}>$270.50</span></div>
          </div>
          <button className="mt-3 w-full py-2 rounded-md text-[11px] font-bold text-white" style={{ background: C.primary }}>
            Cobrar
          </button>
        </aside>
      </div>
    </BrowserFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — INVENTARIO / KARDEX                                   */
/* ──────────────────────────────────────────────────────────────── */
export function KardexScreen() {
  return (
    <BrowserFrame url="rutapp.mx/almacen/kardex">
      <div className="p-4" style={{ minHeight: 340 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-bold">Kardex · Coca-Cola 600ml</h2>
            <p className="text-[10px]" style={{ color: C.muted }}>Almacén Central · Últimos 30 días</p>
          </div>
          <div className="flex gap-1.5">
            <span className="px-2 py-1 rounded-md text-[10px] inline-flex items-center gap-1" style={{ background: C.surface, color: C.ink2 }}>
              <Filter className="h-3 w-3" /> Filtros
            </span>
            <span className="px-2 py-1 rounded-md text-[10px] font-semibold text-white" style={{ background: C.primary }}>Exportar</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            ["Stock actual", "1,284 u", C.primary],
            ["Entradas", "+580 u", C.green],
            ["Salidas", "-642 u", C.red],
            ["Costo prom.", "$11.20", C.ink],
          ].map(([l, v, c]: any) => (
            <div key={l} className="rounded-lg p-2.5 border" style={{ borderColor: C.line }}>
              <div className="text-[9px]" style={{ color: C.muted }}>{l}</div>
              <div className="text-[15px] font-bold mt-0.5" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.line }}>
          <table className="w-full text-[10.5px]">
            <thead style={{ background: C.surface, color: C.muted }}>
              <tr>
                <th className="text-left p-2 font-semibold">Fecha</th>
                <th className="text-left p-2 font-semibold">Movimiento</th>
                <th className="text-left p-2 font-semibold">Folio</th>
                <th className="text-right p-2 font-semibold">Entrada</th>
                <th className="text-right p-2 font-semibold">Salida</th>
                <th className="text-right p-2 font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["25/06", "Venta", "V-2387", "", "24", "1,284", C.red],
                ["25/06", "Venta", "V-2386", "", "12", "1,308", C.red],
                ["24/06", "Compra OC", "OC-114", "240", "", "1,320", C.green],
                ["24/06", "Traspaso", "T-088", "", "60", "1,080", C.red],
                ["23/06", "Devolución", "D-045", "6", "", "1,140", C.green],
                ["23/06", "Conteo físico", "CF-12", "", "3", "1,134", "#f59e0b"],
              ].map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: C.line }}>
                  <td className="p-2" style={{ color: C.ink2 }}>{r[0]}</td>
                  <td className="p-2 font-semibold">{r[1]}</td>
                  <td className="p-2" style={{ color: C.primary }}>{r[2]}</td>
                  <td className="p-2 text-right font-semibold" style={{ color: C.green }}>{r[3]}</td>
                  <td className="p-2 text-right font-semibold" style={{ color: C.red }}>{r[4]}</td>
                  <td className="p-2 text-right font-bold">{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — TIENDA EN LÍNEA                                       */
/* ──────────────────────────────────────────────────────────────── */
export function TiendaScreen() {
  return (
    <BrowserFrame url="rutapp.mx/tienda/mi-empresa-demo">
      <div style={{ minHeight: 340 }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded" style={{ background: C.primary }} />
            <span className="text-[12px] font-bold">Mi Empresa Demo</span>
          </div>
          <div className="flex-1 max-w-xs mx-3 px-2.5 py-1 rounded-md flex items-center gap-1.5 text-[10px]" style={{ background: C.surface }}>
            <Search className="h-3 w-3" style={{ color: C.muted }} /> Buscar productos…
          </div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" style={{ color: C.primary }} />
            <span className="text-[10px] font-bold">3</span>
          </div>
        </div>
        <div className="px-4 py-3 grid grid-cols-3 gap-2" style={{ background: `linear-gradient(135deg, ${C.primarySoft}, #fff)` }}>
          <div className="col-span-3 rounded-lg p-4" style={{ background: `linear-gradient(135deg, ${C.primary}, #1e3a8a)` }}>
            <div className="text-white text-[10px] font-semibold uppercase tracking-wider opacity-80">Tu lista de precios</div>
            <div className="text-white text-[18px] font-bold mt-0.5">Hola, Don Pepe 👋</div>
            <div className="text-white/85 text-[11px] mt-1">Precios exclusivos para tu cuenta</div>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] font-bold mb-2">Productos para ti</div>
          <div className="grid grid-cols-6 gap-2">
            {[
              ["Coca 600ml", 18.5, "#e11d48"],
              ["Sabritas", 16, C.accent],
              ["Agua 1L", 12, "#0ea5e9"],
              ["Gansito", 14.5, "#f59e0b"],
              ["Galletas", 22, "#92400e"],
              ["Yogurt", 28, "#fde68a"],
            ].map(([n, p, bg]: any, i) => (
              <div key={n} className="rounded-lg border p-1.5" style={{ borderColor: C.line }}>
                <div className="aspect-square rounded-md flex items-center justify-center mb-1" style={{ background: bg + "20" }}>
                  <Package className="h-5 w-5" style={{ color: bg }} />
                </div>
                <div className="text-[9px] font-semibold truncate">{n}</div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] font-bold" style={{ color: C.primary }}>${p}</span>
                  {i < 2 && <span className="text-[7.5px] font-bold text-white px-1 rounded" style={{ background: C.accent }}>2x1</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — COMPRAS INTELIGENTES (IA)                             */
/* ──────────────────────────────────────────────────────────────── */
export function ComprasIAScreen() {
  return (
    <BrowserFrame url="rutapp.mx/compras/sugerencias">
      <div className="p-4" style={{ minHeight: 340 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-bold flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded text-white text-[10px] font-bold" style={{ background: "linear-gradient(135deg, #7c3aed, #0060e8)" }}>AI</span>
              Compras sugeridas
            </h2>
            <p className="text-[10px]" style={{ color: C.muted }}>La IA analizó tu venta de los últimos 90 días</p>
          </div>
          <span className="px-2 py-1 rounded-md text-[10px] font-semibold text-white" style={{ background: C.primary }}>Generar OC</span>
        </div>
        <div className="space-y-2">
          {[
            { p: "Coca 600ml", razon: "Stock caerá a crítico en 3 días", sugerido: 240, prov: "Coca-Cola FEMSA", tono: C.red, icon: AlertTriangle },
            { p: "Sabritas 45g", razon: "Pico de venta esperado (quincena)", sugerido: 180, prov: "PepsiCo", tono: C.accent, icon: TrendingUp },
            { p: "Galletas Marías", razon: "Venta sube 22% vs mes pasado", sugerido: 96, prov: "Gamesa", tono: C.green, icon: TrendingUp },
            { p: "Detergente 1kg", razon: "Patrón estacional detectado", sugerido: 48, prov: "Henkel", tono: "#7c3aed", icon: Boxes },
          ].map((r) => (
            <div key={r.p} className="rounded-lg border p-2.5 flex items-center gap-3" style={{ borderColor: C.line }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: r.tono + "15" }}>
                <r.icon className="h-4 w-4" style={{ color: r.tono }} />
              </div>
              <div className="flex-1">
                <div className="text-[11.5px] font-semibold">{r.p}</div>
                <div className="text-[10px]" style={{ color: C.muted }}>{r.razon} · {r.prov}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px]" style={{ color: C.muted }}>Sugerido</div>
                <div className="text-[14px] font-bold" style={{ color: C.primary }}>{r.sugerido} u</div>
              </div>
              <Check className="h-4 w-4" style={{ color: C.green }} />
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg p-3 flex items-center gap-3" style={{ background: C.primarySoft }}>
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: C.primary }}>$</div>
          <div className="flex-1 text-[11px]">
            <b>Ahorro estimado:</b> $4,820 este mes evitando faltantes y sobrecompras.
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ──────────────────────────────────────────────────────────────── */
/*  DESKTOP — SUPERVISOR EN VIVO                                    */
/* ──────────────────────────────────────────────────────────────── */
export function SupervisorScreen() {
  return (
    <BrowserFrame url="rutapp.mx/supervisor">
      <div className="grid grid-cols-3" style={{ minHeight: 340 }}>
        <div className="col-span-2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #e6efff, #f7f8fb)" }}>
          {/* Map grid */}
          <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 340">
            {Array.from({ length: 20 }, (_, i) => <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="340" stroke="#0060e8" strokeWidth="0.3" />)}
            {Array.from({ length: 17 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 20} x2="400" y2={i * 20} stroke="#0060e8" strokeWidth="0.3" />)}
            <path d="M50,80 Q120,60 180,120 T320,180 T370,250" stroke={C.accent} strokeWidth="2" fill="none" strokeDasharray="4 4" />
            <path d="M80,260 Q150,200 250,230 T380,150" stroke={C.primary} strokeWidth="2" fill="none" strokeDasharray="4 4" />
          </svg>
          {/* Pins */}
          {[
            { x: "20%", y: "25%", n: "Juan", s: "En cliente", c: C.green },
            { x: "55%", y: "40%", n: "Pedro", s: "En ruta", c: C.primary },
            { x: "35%", y: "65%", n: "Ana", s: "Cobrando", c: C.accent },
            { x: "75%", y: "70%", n: "Luis", s: "En ruta", c: C.primary },
          ].map((p) => (
            <div key={p.n} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
              <div className="px-1.5 py-0.5 rounded-md bg-white shadow border text-[8.5px] font-bold mb-0.5 text-center whitespace-nowrap" style={{ borderColor: C.line }}>
                {p.n}
              </div>
              <div className="h-4 w-4 rounded-full border-2 border-white shadow mx-auto" style={{ background: p.c }} />
              <div className="text-[8px] mt-0.5 text-center font-semibold" style={{ color: p.c }}>{p.s}</div>
            </div>
          ))}
        </div>
        <aside className="p-3 border-l" style={{ borderColor: C.line, background: "#fafbfc" }}>
          <div className="text-[11px] font-bold mb-2">Vendedores en ruta</div>
          {[
            { n: "Juan López", v: "$8,240", b: 82, s: C.green },
            { n: "Pedro Sánchez", v: "$6,180", b: 64, s: C.primary },
            { n: "Ana Hdez.", v: "$4,950", b: 91, s: C.accent },
            { n: "Luis García", v: "$3,420", b: 47, s: C.primary },
          ].map((v) => (
            <div key={v.n} className="mb-2 p-2 rounded-md border bg-white" style={{ borderColor: C.line }}>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold">{v.n}</div>
                <span className="text-[8.5px] font-bold" style={{ color: v.b < 50 ? C.red : C.green }}>🔋 {v.b}%</span>
              </div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: C.primary }}>{v.v}</div>
              <div className="h-1 rounded-full mt-1" style={{ background: C.line }}>
                <div className="h-full rounded-full" style={{ background: v.s, width: `${v.b}%` }} />
              </div>
            </div>
          ))}
        </aside>
      </div>
    </BrowserFrame>
  );
}
