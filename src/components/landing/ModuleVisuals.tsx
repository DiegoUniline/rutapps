/* Visual mini-mockups per landing module. Pure SVG/HTML, no data. */
import {
  ShoppingCart, Wallet, Package, Truck, CreditCard, Users,
  LineChart, Award, FileText, Brain, Check, ArrowUp, ArrowDown,
  MapPin, Sparkles, AlertTriangle, TrendingUp,
} from 'lucide-react';

const C = {
  primary: '#0060e8',
  primarySoft: '#e6efff',
  accent: '#fe8c1a',
  ink: '#0a1530',
  ink2: '#3b4863',
  muted: '#6b7791',
  line: '#eef0f5',
  green: '#16a34a',
  red: '#dc2626',
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden bg-white shadow-sm" style={{ borderColor: C.line }}>
      <div className="px-3 py-2 flex items-center gap-2 border-b bg-gray-50" style={{ borderColor: C.line }}>
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="text-[10px] font-semibold text-gray-500 mx-auto">{title}</div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* ---------- 1. Ventas — POS ticket + line items ---------- */
function VentasViz() {
  const lines = [
    { p: 'Coca Cola 600ml', q: 12, t: 240 },
    { p: 'Sabritas Original 45g', q: 24, t: 360 },
    { p: 'Agua Ciel 1L', q: 6, t: 90 },
  ];
  return (
    <Shell title="rutapp.mx · Nueva venta">
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3">
          <div className="text-[9px] font-bold uppercase text-gray-400 mb-1.5">Productos</div>
          {lines.map(l => (
            <div key={l.p} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.line }}>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold truncate" style={{ color: C.ink }}>{l.p}</div>
                <div className="text-[9px]" style={{ color: C.muted }}>{l.q} pza × $20</div>
              </div>
              <div className="text-[11px] font-bold" style={{ color: C.ink }}>${l.t}</div>
            </div>
          ))}
        </div>
        <div className="col-span-2 rounded-lg p-2.5" style={{ background: C.primarySoft }}>
          <div className="text-[9px] font-bold uppercase" style={{ color: C.primary }}>Total</div>
          <div className="text-[20px] font-black leading-none mt-1" style={{ color: C.ink }}>$690.00</div>
          <div className="text-[9px] mt-0.5" style={{ color: C.muted }}>3 productos · 42 pza</div>
          <div className="mt-2 rounded-md py-1.5 text-center text-[10px] font-bold text-white" style={{ background: C.primary }}>
            <ShoppingCart className="inline h-2.5 w-2.5 mr-1" /> Cobrar
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[9px]" style={{ color: C.green }}>
            <Sparkles className="h-2.5 w-2.5" /> 2 promos aplicadas
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- 2. Cobranza — multi-folio FIFO ---------- */
function CobranzaViz() {
  const folios = [
    { f: 'F-1842', d: '12/04', t: 2400, ap: 2400, ok: true },
    { f: 'F-1856', d: '15/04', t: 1800, ap: 1800, ok: true },
    { f: 'F-1871', d: '18/04', t: 1200, ap: 800, ok: false },
  ];
  return (
    <Shell title="Cobro · Abarrotes Don Pepe">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[9px] font-bold uppercase text-gray-400">Pago recibido</div>
          <div className="text-[18px] font-black" style={{ color: C.ink }}>$5,000.00</div>
        </div>
        <div className="text-right">
          <div className="text-[9px]" style={{ color: C.muted }}>Saldo anterior</div>
          <div className="text-[12px] font-bold" style={{ color: C.ink }}>$5,400</div>
          <div className="text-[9px] mt-0.5" style={{ color: C.green }}>→ Nuevo: $400</div>
        </div>
      </div>
      <div className="rounded-md border" style={{ borderColor: C.line }}>
        <div className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide border-b flex justify-between" style={{ background: '#fafbfc', borderColor: C.line, color: C.muted }}>
          <span>Aplicación FIFO automática</span>
          <span>Aplicado</span>
        </div>
        {folios.map(f => (
          <div key={f.f} className="px-2.5 py-1.5 border-b last:border-0 flex items-center gap-2" style={{ borderColor: C.line }}>
            <div className="h-4 w-4 rounded-full flex items-center justify-center" style={{ background: f.ok ? C.green : C.accent }}>
              {f.ok ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} /> : <span className="text-[8px] font-bold text-white">½</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold" style={{ color: C.ink }}>{f.f}</div>
              <div className="text-[8.5px]" style={{ color: C.muted }}>{f.d} · Total ${f.t}</div>
            </div>
            <div className="text-[10.5px] font-bold" style={{ color: f.ok ? C.green : C.accent }}>${f.ap}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---------- 3. Inventario — Kardex ---------- */
function InventarioViz() {
  const rows = [
    { t: 'Venta', f: 'V-2104', q: -12, s: 234, c: C.red },
    { t: 'Compra', f: 'C-381', q: +120, s: 246, c: C.green },
    { t: 'Traspaso', f: 'T-92', q: -20, s: 126, c: C.accent },
    { t: 'Ajuste', f: 'AJ-15', q: -2, s: 124, c: C.muted },
  ];
  return (
    <Shell title="Kardex · Coca Cola 600ml">
      <div className="flex gap-2 mb-2">
        {[
          { l: 'Almacén 1', v: '124', c: C.primary },
          { l: 'Camión A', v: '36', c: C.accent },
          { l: 'Camión B', v: '18', c: C.accent },
        ].map(b => (
          <div key={b.l} className="flex-1 rounded-md p-1.5 text-center" style={{ background: '#f7f8fb' }}>
            <div className="text-[8.5px]" style={{ color: C.muted }}>{b.l}</div>
            <div className="text-[14px] font-black" style={{ color: b.c }}>{b.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md border overflow-hidden" style={{ borderColor: C.line }}>
        <div className="grid grid-cols-12 px-2 py-1 text-[8.5px] font-bold uppercase border-b" style={{ background: '#fafbfc', borderColor: C.line, color: C.muted }}>
          <div className="col-span-4">Movimiento</div>
          <div className="col-span-3">Folio</div>
          <div className="col-span-2 text-right">Cant.</div>
          <div className="col-span-3 text-right">Saldo</div>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 px-2 py-1.5 text-[10px] border-b last:border-0" style={{ borderColor: C.line }}>
            <div className="col-span-4 font-semibold" style={{ color: C.ink }}>{r.t}</div>
            <div className="col-span-3" style={{ color: C.muted }}>{r.f}</div>
            <div className="col-span-2 text-right font-bold" style={{ color: r.c }}>{r.q > 0 ? '+' : ''}{r.q}</div>
            <div className="col-span-3 text-right font-bold" style={{ color: C.ink }}>{r.s}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---------- 4. Logística — concentrado de surtido + mapa ---------- */
function LogisticaViz() {
  const surtido = [
    { p: 'Coca 600ml', r1: 48, r2: 36, r3: 24, t: 108 },
    { p: 'Sabritas 45g', r1: 24, r2: 30, r3: 12, t: 66 },
    { p: 'Agua 1L', r1: 12, r2: 18, r3: 18, t: 48 },
  ];
  return (
    <Shell title="Concentrado de surtido · Jueves">
      <div className="rounded-md border overflow-hidden mb-2" style={{ borderColor: C.line }}>
        <div className="grid grid-cols-12 px-2 py-1 text-[8.5px] font-bold uppercase border-b" style={{ background: '#fafbfc', borderColor: C.line, color: C.muted }}>
          <div className="col-span-5">Producto</div>
          <div className="col-span-2 text-right">R-1</div>
          <div className="col-span-2 text-right">R-2</div>
          <div className="col-span-1 text-right">R-3</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {surtido.map(s => (
          <div key={s.p} className="grid grid-cols-12 px-2 py-1.5 text-[10px] border-b last:border-0" style={{ borderColor: C.line }}>
            <div className="col-span-5 font-semibold" style={{ color: C.ink }}>{s.p}</div>
            <div className="col-span-2 text-right" style={{ color: C.ink2 }}>{s.r1}</div>
            <div className="col-span-2 text-right" style={{ color: C.ink2 }}>{s.r2}</div>
            <div className="col-span-1 text-right" style={{ color: C.ink2 }}>{s.r3}</div>
            <div className="col-span-2 text-right font-black" style={{ color: C.primary }}>{s.t}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md p-2 flex items-center gap-2 text-[10px]" style={{ background: C.primarySoft, color: C.ink }}>
        <Truck className="h-3.5 w-3.5" style={{ color: C.primary }} />
        <span className="font-semibold">Camión A:</span>
        <span style={{ color: C.muted }}>222 unidades · 18 paradas · ruta optimizada</span>
      </div>
    </Shell>
  );
}

/* ---------- 5. Compras — sugerencias IA ---------- */
function ComprasViz() {
  const sug = [
    { p: 'Coca Cola 600ml', s: 'Crítico en 3 días', q: 240, prov: 'FEMSA', urg: C.red },
    { p: 'Sabritas 45g', s: 'Bajo cobertura', q: 120, prov: 'PepsiCo', urg: C.accent },
    { p: 'Agua Ciel 1L', s: 'Punto de reorden', q: 96, prov: 'Coca-Cola', urg: C.primary },
  ];
  return (
    <Shell title="Compras sugeridas · IA">
      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md" style={{ background: '#fff7ed' }}>
        <Sparkles className="h-3.5 w-3.5" style={{ color: C.accent }} />
        <div className="text-[10px] font-semibold" style={{ color: C.ink }}>
          3 sugerencias · Ahorro estimado: <span style={{ color: C.green }}>$4,200</span>
        </div>
      </div>
      {sug.map(s => (
        <div key={s.p} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: C.line }}>
          <div className="w-1 h-8 rounded-full" style={{ background: s.urg }} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate" style={{ color: C.ink }}>{s.p}</div>
            <div className="text-[9px]" style={{ color: C.muted }}>{s.s} · Proveedor: {s.prov}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-black" style={{ color: C.ink }}>{s.q}</div>
            <div className="text-[8.5px]" style={{ color: C.muted }}>pza</div>
          </div>
          <div className="ml-1 px-2 py-1 text-[9px] font-bold text-white rounded" style={{ background: C.primary }}>Pedir</div>
        </div>
      ))}
    </Shell>
  );
}

/* ---------- 6. Clientes — ficha 360 ---------- */
function ClientesViz() {
  return (
    <Shell title="Cliente · Abarrotes Don Pepe">
      <div className="flex gap-3 mb-2">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-base font-black shrink-0" style={{ background: C.primary }}>DP</div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold" style={{ color: C.ink }}>Abarrotes Don Pepe</div>
          <div className="text-[9.5px]" style={{ color: C.muted }}>Av. Reforma 142 · Centro</div>
          <div className="text-[9.5px] flex items-center gap-2 mt-0.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: C.primarySoft, color: C.primary }}>Ruta 2 · Jue</span>
            <span style={{ color: C.green }}>● Activo</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[
          { l: 'Compras 30d', v: '$18.4k', c: C.primary },
          { l: 'Saldo', v: '$2,400', c: C.accent },
          { l: 'Ticket prom', v: '$1,532', c: C.ink },
        ].map(k => (
          <div key={k.l} className="rounded-md p-1.5 text-center" style={{ background: '#f7f8fb' }}>
            <div className="text-[8.5px]" style={{ color: C.muted }}>{k.l}</div>
            <div className="text-[12px] font-black" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md p-2 border" style={{ borderColor: C.line }}>
        <div className="text-[9px] font-bold uppercase mb-1" style={{ color: C.muted }}>Productos que más pide</div>
        {['Coca 600ml · 24/sem', 'Sabritas 45g · 18/sem', 'Bimbo Pan · 12/sem'].map(p => (
          <div key={p} className="flex items-center gap-1.5 text-[10px] py-0.5" style={{ color: C.ink2 }}>
            <span className="w-1 h-1 rounded-full" style={{ background: C.primary }} /> {p}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---------- 7. Finanzas — estado de cuenta ---------- */
function FinanzasViz() {
  const mov = [
    { f: '12/04', c: 'Venta F-1842', d: 2400, h: 0 },
    { f: '15/04', c: 'Venta F-1856', d: 1800, h: 0 },
    { f: '18/04', c: 'Cobro COB-441', d: 0, h: 5000 },
    { f: '18/04', c: 'Venta F-1871', d: 1200, h: 0 },
  ];
  let saldo = 5400;
  return (
    <Shell title="Estado de cuenta · Don Pepe">
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded-md p-1.5" style={{ background: '#f7f8fb' }}>
          <div className="text-[8.5px]" style={{ color: C.muted }}>Saldo anterior</div>
          <div className="text-[12px] font-black" style={{ color: C.ink }}>$5,400</div>
        </div>
        <div className="rounded-md p-1.5" style={{ background: '#f0fdf4' }}>
          <div className="text-[8.5px]" style={{ color: C.muted }}>Pagos</div>
          <div className="text-[12px] font-black" style={{ color: C.green }}>$5,000</div>
        </div>
        <div className="rounded-md p-1.5" style={{ background: C.primarySoft }}>
          <div className="text-[8.5px]" style={{ color: C.muted }}>Saldo nuevo</div>
          <div className="text-[12px] font-black" style={{ color: C.primary }}>$5,800</div>
        </div>
      </div>
      <div className="rounded-md border overflow-hidden" style={{ borderColor: C.line }}>
        <div className="grid grid-cols-12 px-2 py-1 text-[8.5px] font-bold uppercase border-b" style={{ background: '#fafbfc', borderColor: C.line, color: C.muted }}>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-5">Concepto</div>
          <div className="col-span-2 text-right">Cargo</div>
          <div className="col-span-3 text-right">Saldo</div>
        </div>
        {mov.map((m, i) => {
          saldo = saldo + m.d - m.h;
          return (
            <div key={i} className="grid grid-cols-12 px-2 py-1 text-[9.5px] border-b last:border-0" style={{ borderColor: C.line }}>
              <div className="col-span-2" style={{ color: C.muted }}>{m.f}</div>
              <div className="col-span-5" style={{ color: C.ink2 }}>{m.c}</div>
              <div className="col-span-2 text-right" style={{ color: m.h > 0 ? C.green : C.ink }}>{m.h > 0 ? `-$${m.h}` : `$${m.d}`}</div>
              <div className="col-span-3 text-right font-bold" style={{ color: C.ink }}>${saldo.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

/* ---------- 8. Comisiones — ranking ---------- */
function ComisionesViz() {
  const vend = [
    { n: 'Juan L.', m: '$11,200', p: 112, c: '$1,120', color: C.green },
    { n: 'Carlos R.', m: '$8,420', p: 84, c: '$842', color: C.primary },
    { n: 'Ana M.', m: '$6,210', p: 62, c: '$621', color: C.accent },
  ];
  return (
    <Shell title="Metas y comisiones · Abril">
      {vend.map((v, i) => (
        <div key={v.n} className="mb-2 last:mb-0">
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black w-3" style={{ color: C.muted }}>{i + 1}</span>
              <span className="font-semibold" style={{ color: C.ink }}>{v.n}</span>
              {v.p >= 100 && <Award className="h-3 w-3" style={{ color: C.accent }} />}
            </div>
            <div className="font-bold" style={{ color: C.ink }}>{v.m}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(v.p, 100)}%`, background: v.color }} />
            </div>
            <div className="text-[9.5px] font-bold w-9 text-right" style={{ color: v.color }}>{v.p}%</div>
            <div className="text-[9.5px] font-bold w-12 text-right" style={{ color: C.green }}>{v.c}</div>
          </div>
        </div>
      ))}
      <div className="mt-2 text-[9px] flex items-center gap-1" style={{ color: C.muted }}>
        <TrendingUp className="h-2.5 w-2.5" /> Comisión sobre venta cobrada · meta $10,000
      </div>
    </Shell>
  );
}

/* ---------- 9. Reportes — dashboard ---------- */
function ReportesViz() {
  const bars = [60, 45, 78, 52, 90, 68, 95];
  return (
    <Shell title="Dashboard ejecutivo">
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[
          { l: 'Ventas', v: '$48.3k', d: '+12%', c: C.primary, bg: C.primarySoft },
          { l: 'Cobros', v: '$32.1k', d: '+8%', c: C.green, bg: '#f0fdf4' },
          { l: 'Pedidos', v: '47', d: '+24%', c: C.accent, bg: '#fff7ed' },
          { l: 'Utilidad', v: '$14.0k', d: '+5%', c: '#e11d48', bg: '#fff1f2' },
        ].map(k => (
          <div key={k.l} className="rounded-md p-1.5" style={{ background: k.bg }}>
            <div className="text-[8px] font-bold uppercase" style={{ color: C.muted }}>{k.l}</div>
            <div className="text-[12px] font-black" style={{ color: C.ink }}>{k.v}</div>
            <div className="text-[8.5px] font-bold flex items-center gap-0.5" style={{ color: k.c }}>
              <ArrowUp className="h-2 w-2" /> {k.d}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border p-2" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9.5px] font-bold" style={{ color: C.ink }}>Ventas últimos 7 días</div>
          <div className="text-[8.5px]" style={{ color: C.green }}>● +18% vs sem. ant.</div>
        </div>
        <svg viewBox="0 0 280 70" className="w-full h-16">
          <defs>
            <linearGradient id="repBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.primary} />
              <stop offset="100%" stopColor="#8ab4f0" />
            </linearGradient>
          </defs>
          {bars.map((h, i) => (
            <rect key={i} x={i * 40 + 6} y={70 - (h * 0.6)} width="24" height={h * 0.6} rx="2" fill="url(#repBar)" />
          ))}
        </svg>
        <div className="flex justify-between text-[7.5px] mt-0.5" style={{ color: C.muted }}>
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d}>{d}</span>)}
        </div>
      </div>
    </Shell>
  );
}

/* ---------- 10. IA — chat asesor ---------- */
function IAViz() {
  const insights = [
    { i: AlertTriangle, c: C.red, t: 'Riesgo de fuga', d: 'Don Pepe ↓38% sus compras vs prom.' },
    { i: TrendingUp, c: C.green, t: 'Oportunidad', d: 'Reordenar Coca 600ml: faltan 3 días.' },
    { i: Award, c: C.accent, t: 'Destacado', d: 'Juan L. 12% sobre meta — replicar su ruta.' },
  ];
  return (
    <Shell title="Asesor Rutapp IA">
      <div className="rounded-lg p-3 mb-2 text-white" style={{ background: `linear-gradient(135deg, ${C.ink}, #1e3a8a)` }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Brain className="h-3.5 w-3.5" />
          <div className="text-[9px] font-bold uppercase opacity-90">Resumen de hoy</div>
        </div>
        <div className="text-[11px] leading-snug">
          Ventas <b>+12%</b> vs ayer. <b>3 clientes</b> sin visita en 14 días. Stock crítico en <b>2 productos</b>. Cobranza al <b>92%</b>.
        </div>
      </div>
      {insights.map((it, i) => (
        <div key={i} className="flex gap-2 py-1.5 border-b last:border-0" style={{ borderColor: C.line }}>
          <div className="h-6 w-6 rounded-md grid place-items-center shrink-0" style={{ background: it.c + '15' }}>
            <it.i className="h-3 w-3" style={{ color: it.c }} />
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold" style={{ color: C.ink }}>{it.t}</div>
            <div className="text-[9.5px]" style={{ color: C.muted }}>{it.d}</div>
          </div>
        </div>
      ))}
    </Shell>
  );
}

const VIZ_MAP: Record<string, () => JSX.Element> = {
  Ventas: VentasViz,
  Cobranza: CobranzaViz,
  Inventario: InventarioViz,
  Logística: LogisticaViz,
  Compras: ComprasViz,
  Clientes: ClientesViz,
  Finanzas: FinanzasViz,
  Comisiones: ComisionesViz,
  Reportes: ReportesViz,
  IA: IAViz,
};

export function ModuleVisual({ name }: { name: string }) {
  const Cmp = VIZ_MAP[name];
  if (!Cmp) return null;
  return <Cmp />;
}
