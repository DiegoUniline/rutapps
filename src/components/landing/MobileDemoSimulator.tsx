import { useEffect, useMemo, useState } from 'react';
import {
  X, Battery, Wifi, Signal, ShoppingCart, Users, Package, Wallet, MoreHorizontal,
  TrendingUp, RefreshCw, Moon, Monitor, ChevronDown, Search, MapPin, Navigation,
  Plus, Minus, Check, ArrowLeft, Banknote, CreditCard, Sparkles, Phone as PhoneIcon,
} from 'lucide-react';

/* ──────────────────────────── Design tokens (real app) ──────────────────────────── */
const T = {
  bg: '#ffffff',
  surface: '#f5f7fa',
  surface2: '#eef0f4',
  border: 'rgba(0,0,0,0.08)',
  text: '#1a1a2a',
  muted: '#6b7280',
  primary: '#5b6cf9',
  primarySoft: 'rgba(91,108,249,0.14)',
  warn: '#f59e0b',
  success: '#22c55e',
  danger: '#ef4444',
};

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ──────────────────────────── Fake data ──────────────────────────── */
type Cliente = {
  id: string; nombre: string; direccion: string; saldo: number;
  ultimaCompra: string; freq: string; tel: string;
};
type Producto = { id: string; nombre: string; precio: number; categoria: string; stock: number };

const CLIENTES: Cliente[] = [
  { id: 'c1', nombre: 'Abarrotes Don Pepe',     direccion: 'Morelos 12 · Centro',     saldo: 1840,  ultimaCompra: 'Hace 5 días', freq: 'Lunes', tel: '55 8123 4567' },
  { id: 'c2', nombre: 'Mini Súper La Loma',     direccion: 'Av. Hidalgo 88',          saldo: 4820,  ultimaCompra: 'Hace 2 días', freq: 'Lunes', tel: '55 6644 2211' },
  { id: 'c3', nombre: 'Cremería El Sol',        direccion: 'Allende 34 · Centro',     saldo: 0,     ultimaCompra: 'Ayer',        freq: 'Lunes', tel: '55 4422 9988' },
  { id: 'c4', nombre: 'Tiendita La Esquina',    direccion: 'Niños Héroes 5',          saldo: 320,   ultimaCompra: 'Hace 1 semana', freq: 'Lunes', tel: '55 7766 5544' },
  { id: 'c5', nombre: 'Recaudería Don Juan',    direccion: 'Reforma 210',             saldo: 1240,  ultimaCompra: 'Hace 3 días', freq: 'Lunes', tel: '55 9988 3322' },
];

const PRODUCTOS: Producto[] = [
  { id: 'p1', nombre: 'Coca-Cola 600 ml',      precio: 14,    categoria: 'Bebidas',  stock: 48 },
  { id: 'p2', nombre: 'Coca-Cola 2 L',         precio: 32,    categoria: 'Bebidas',  stock: 24 },
  { id: 'p3', nombre: 'Sabritas Original 45g', precio: 18,    categoria: 'Botanas',  stock: 60 },
  { id: 'p4', nombre: 'Galletas Marías 170g',  precio: 22,    categoria: 'Abarrotes', stock: 36 },
  { id: 'p5', nombre: 'Leche Entera 1L',       precio: 26.50, categoria: 'Lácteos',   stock: 30 },
  { id: 'p6', nombre: 'Pan Bimbo Integral',    precio: 48,    categoria: 'Abarrotes', stock: 18 },
  { id: 'p7', nombre: 'Yoghurt 1 kg',          precio: 42,    categoria: 'Lácteos',   stock: 22 },
  { id: 'p8', nombre: 'Cerveza Indio 355ml',   precio: 22,    categoria: 'Bebidas',   stock: 96 },
  { id: 'p9', nombre: 'Atún en lata',          precio: 19,    categoria: 'Abarrotes', stock: 40 },
];

type Step = 'inicio' | 'cliente' | 'pos' | 'cobro' | 'exito';

/* ──────────────────────────── Phone frame ──────────────────────────── */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 'min(360px, 92vw)' }}>
      <div className="rounded-[44px] p-2 shadow-2xl"
        style={{ background: '#f0f2f5', boxShadow: '0 40px 80px -20px rgba(0,0,0,0.15)' }}>
        <div className="rounded-[36px] overflow-hidden relative" style={{ aspectRatio: '9/19.5', background: T.bg, color: T.text }}>
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-white/90 rounded-b-2xl z-30 shadow-sm" />
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-semibold relative z-20" style={{ color: T.text }}>
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <Signal className="h-2.5 w-2.5" /><Wifi className="h-2.5 w-2.5" /><Battery className="h-3 w-3" />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Header & Nav ──────────────────────────── */
function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="px-3 pt-1 pb-2 flex items-center justify-between" style={{ background: T.bg }}>
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <button onClick={onBack} className="p-1 -ml-1 rounded" style={{ color: T.text }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="text-[14px] font-bold truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2.5" style={{ color: T.muted }}>
        <RefreshCw className="h-3.5 w-3.5" />
        <Moon className="h-3.5 w-3.5" />
        <Monitor className="h-3.5 w-3.5" />
        <Wifi className="h-3.5 w-3.5" style={{ color: T.success }} />
      </div>
    </div>
  );
}

function BottomNav({ active }: { active: string }) {
  const items = [
    { icon: Users, label: 'Clientes' },
    { icon: ShoppingCart, label: 'Ventas' },
    { icon: Package, label: 'POS' },
    { icon: Wallet, label: 'Stock' },
    { icon: MoreHorizontal, label: 'Más' },
  ];
  return (
    <div className="absolute bottom-0 inset-x-0 px-1 py-2 flex justify-around z-20"
      style={{ background: T.bg, borderTop: `1px solid ${T.border}` }}>
      {items.map(it => {
        const on = it.label === active;
        return (
          <div key={it.label} className="flex flex-col items-center gap-0.5"
            style={{ color: on ? T.text : T.muted }}>
            <it.icon className="h-4 w-4" />
            <span className="text-[8.5px] font-medium">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── Screens ──────────────────────────── */
function ScreenInicio({ onPickCliente }: { onPickCliente: (c: Cliente) => void }) {
  return (
    <>
      <Header title="Ruta" />
      <div className="mx-2 mt-1 mb-2 px-2 py-1.5 rounded-md flex items-center justify-between text-[10.5px]"
        style={{ background: T.surface }}>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded grid place-items-center text-[9px] font-bold" style={{ background: T.primary, color: 'white' }}>D</span>
          Distribuidora Demo
        </span>
        <ChevronDown className="h-3 w-3" style={{ color: T.muted }} />
      </div>

      <div className="px-3">
        <div className="text-[10px]" style={{ color: T.muted }}>Sábado, 13 de junio</div>
        <div className="text-[18px] font-bold mt-0.5">Hola, Carlos 👋</div>
      </div>

      {/* Resumen */}
      <div className="mx-3 mt-3 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #5b6cf9, #6d56f0)' }}>
        <div className="flex items-center gap-1.5 text-white/85 text-[10px] font-medium">
          <TrendingUp className="h-3 w-3" /> Resumen del día
        </div>
        <div className="text-[24px] font-black text-white mt-0.5">$ 8,420.00</div>
        <div className="text-[10px] text-white/75">12 ventas · 24 de 32 clientes</div>
      </div>

      {/* Clientes a visitar */}
      <div className="mt-3 px-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.muted }}>
          Clientes de hoy
        </span>
        <span className="text-[10px]" style={{ color: T.primary }}>Ver mapa</span>
      </div>

      <div className="px-3 mt-1.5 space-y-1.5 pb-[60px] overflow-y-auto" style={{ maxHeight: 'calc(100% - 230px)' }}>
        {CLIENTES.map(c => (
          <button key={c.id} onClick={() => onPickCliente(c)}
            className="w-full text-left flex items-center gap-2 p-2 rounded-lg active:scale-[0.98] transition-transform"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0"
              style={{ background: T.primarySoft, color: T.primary }}>
              {c.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold truncate">{c.nombre}</div>
              <div className="text-[9.5px] truncate" style={{ color: T.muted }}>
                <MapPin className="inline h-2.5 w-2.5 mr-0.5" />{c.direccion}
              </div>
            </div>
            <div className="text-right shrink-0">
              {c.saldo > 0 ? (
                <div className="text-[10px] font-bold" style={{ color: T.warn }}>{fmt(c.saldo)}</div>
              ) : (
                <div className="text-[9.5px]" style={{ color: T.success }}>Al día</div>
              )}
              <div className="text-[8.5px]" style={{ color: T.muted }}>{c.ultimaCompra}</div>
            </div>
          </button>
        ))}
      </div>

      <BottomNav active="Clientes" />
    </>
  );
}

function ScreenCliente({ cliente, onBack, onVender }: { cliente: Cliente; onBack: () => void; onVender: () => void }) {
  return (
    <>
      <Header title="Cliente" onBack={onBack} />
      <div className="px-3 pt-1">
        <div className="rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-full grid place-items-center text-[14px] font-bold shrink-0"
              style={{ background: T.primarySoft, color: T.primary }}>
              {cliente.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold truncate">{cliente.nombre}</div>
              <div className="text-[10px] truncate" style={{ color: T.muted }}>{cliente.direccion}</div>
              <div className="text-[10px] truncate" style={{ color: T.muted }}>
                <PhoneIcon className="inline h-2.5 w-2.5 mr-0.5" />{cliente.tel}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs cliente */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="text-[9px]" style={{ color: T.muted }}>Saldo pendiente</div>
            <div className="text-[14px] font-black" style={{ color: cliente.saldo > 0 ? T.warn : T.success }}>
              {fmt(cliente.saldo)}
            </div>
          </div>
          <div className="rounded-lg p-2.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="text-[9px]" style={{ color: T.muted }}>Última visita</div>
            <div className="text-[12px] font-bold">{cliente.ultimaCompra}</div>
          </div>
        </div>

        {/* Pedido sugerido */}
        <div className="mt-2.5 rounded-lg p-2.5" style={{ background: T.primarySoft, border: `1px solid ${T.primary}` }}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: T.primary }}>
            <Sparkles className="h-3 w-3" /> Pedido sugerido por IA
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10.5px]" style={{ color: T.text }}>
            <div className="flex justify-between"><span>Coca-Cola 600 ml</span><b>×12</b></div>
            <div className="flex justify-between"><span>Sabritas Original</span><b>×6</b></div>
            <div className="flex justify-between"><span>Galletas Marías</span><b>×4</b></div>
          </div>
        </div>

        <button onClick={onVender}
          className="mt-3 w-full rounded-lg py-3 text-white text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          style={{ background: T.primary }}>
          <ShoppingCart className="h-4 w-4" /> Vender a este cliente
        </button>

        <button className="mt-2 w-full rounded-lg py-2.5 text-[12px] font-semibold border"
          style={{ borderColor: T.border, color: T.text, background: T.surface }}>
          Ver estado de cuenta
        </button>
      </div>

      <BottomNav active="Clientes" />
    </>
  );
}

function ScreenPOS({ cliente, carrito, setCarrito, onBack, onCobrar }: {
  cliente: Cliente;
  carrito: Record<string, number>;
  setCarrito: (c: Record<string, number>) => void;
  onBack: () => void;
  onCobrar: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Todos');
  const cats = useMemo(() => ['Todos', ...Array.from(new Set(PRODUCTOS.map(p => p.categoria)))], []);
  const filtered = PRODUCTOS.filter(p =>
    (cat === 'Todos' || p.categoria === cat) &&
    (q === '' || p.nombre.toLowerCase().includes(q.toLowerCase()))
  );
  const total = Object.entries(carrito).reduce((s, [id, qty]) => {
    const p = PRODUCTOS.find(x => x.id === id);
    return s + (p ? p.precio * qty : 0);
  }, 0);
  const itemCount = Object.values(carrito).reduce((s, n) => s + n, 0);

  const add = (id: string) => setCarrito({ ...carrito, [id]: (carrito[id] || 0) + 1 });
  const sub = (id: string) => {
    const next = { ...carrito };
    if ((next[id] || 0) <= 1) delete next[id];
    else next[id]--;
    setCarrito(next);
  };

  return (
    <>
      <Header title={`POS · ${cliente.nombre}`} onBack={onBack} />

      {/* Search */}
      <div className="px-3">
        <div className="flex items-center gap-1.5 rounded-md px-2 py-2" style={{ background: T.surface }}>
          <Search className="h-3 w-3" style={{ color: T.muted }} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="bg-transparent border-0 outline-none text-[11px] flex-1 placeholder:text-[#8a96ac]"
            style={{ color: T.text }}
          />
        </div>
      </div>

      {/* Categorías */}
      <div className="px-3 mt-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className="px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0"
            style={cat === c
              ? { background: T.primary, color: 'white' }
              : { background: T.surface, color: T.muted, border: `1px solid ${T.border}` }}>
            {c}
          </button>
        ))}
      </div>

      {/* Productos */}
      <div className="px-3 mt-2 space-y-1.5 overflow-y-auto"
        style={{ maxHeight: itemCount > 0 ? 'calc(100% - 280px)' : 'calc(100% - 200px)' }}>
        {filtered.map(p => {
          const qty = carrito[p.id] || 0;
          return (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg"
              style={{ background: T.surface, border: `1px solid ${qty > 0 ? T.primary : T.border}` }}>
              <div className="w-8 h-8 rounded-md grid place-items-center" style={{ background: T.surface2 }}>
                <Package className="h-3.5 w-3.5" style={{ color: T.muted }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold truncate">{p.nombre}</div>
                <div className="text-[9.5px]" style={{ color: T.muted }}>{fmt(p.precio)} · stock {p.stock}</div>
              </div>
              {qty > 0 ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => sub(p.id)} className="w-6 h-6 rounded grid place-items-center"
                    style={{ background: T.surface2 }}>
                    <Minus className="h-2.5 w-2.5" style={{ color: T.text }} />
                  </button>
                  <span className="text-[12px] font-bold w-5 text-center">{qty}</span>
                  <button onClick={() => add(p.id)} className="w-6 h-6 rounded grid place-items-center text-white"
                    style={{ background: T.primary }}>
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => add(p.id)} className="px-2.5 py-1 rounded text-[10px] font-bold text-white"
                  style={{ background: T.primary }}>
                  + Agregar
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-[11px] py-6" style={{ color: T.muted }}>
            Sin resultados
          </div>
        )}
      </div>

      {/* Total + cobrar */}
      {itemCount > 0 && (
        <div className="absolute bottom-[48px] inset-x-0 px-3 pt-2.5 pb-2"
          style={{ background: T.bg, borderTop: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px]" style={{ color: T.muted }}>{itemCount} artículos</span>
            <span className="text-[18px] font-black">{fmt(total)}</span>
          </div>
          <button onClick={onCobrar}
            className="w-full rounded-lg py-2.5 text-white text-[12px] font-bold active:scale-[0.98] transition-transform"
            style={{ background: T.primary }}>
            Cobrar venta
          </button>
        </div>
      )}

      <BottomNav active="POS" />
    </>
  );
}

function ScreenCobro({ total, onBack, onConfirmar }: { total: number; onBack: () => void; onConfirmar: () => void }) {
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'credito'>('efectivo');
  const [recibido, setRecibido] = useState(total);
  const cambio = Math.max(0, recibido - total);

  return (
    <>
      <Header title="Cobrar venta" onBack={onBack} />
      <div className="px-3 pt-1">
        <div className="rounded-xl p-3 text-center" style={{ background: 'linear-gradient(135deg, #5b6cf9, #6d56f0)' }}>
          <div className="text-[10px] text-white/80">Total a cobrar</div>
          <div className="text-[28px] font-black text-white mt-0.5">{fmt(total)}</div>
        </div>

        <div className="mt-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: T.muted }}>
          Método de pago
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {[
            { id: 'efectivo' as const, label: 'Efectivo', Icon: Banknote },
            { id: 'transferencia' as const, label: 'Transfer.', Icon: CreditCard },
            { id: 'credito' as const, label: 'Crédito', Icon: Wallet },
          ].map(m => (
            <button key={m.id} onClick={() => setMetodo(m.id)}
              className="rounded-lg py-2.5 text-[10.5px] font-bold flex flex-col items-center gap-0.5"
              style={metodo === m.id
                ? { background: T.primary, color: 'white' }
                : { background: T.surface, color: T.text, border: `1px solid ${T.border}` }}>
              <m.Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>

        {metodo === 'efectivo' && (
          <div className="mt-3 rounded-lg p-2.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="text-[10px]" style={{ color: T.muted }}>Recibido del cliente</div>
            <input type="number" value={recibido} onChange={e => setRecibido(Number(e.target.value) || 0)}
              className="w-full bg-transparent text-[18px] font-bold outline-none mt-0.5"
              style={{ color: T.text }} />
            <div className="mt-1.5 flex justify-between text-[10.5px]">
              <span style={{ color: T.muted }}>Cambio</span>
              <span className="font-bold" style={{ color: T.success }}>{fmt(cambio)}</span>
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 100) * 100 + 100, Math.ceil(total / 500) * 500].map((v, i) => (
                <button key={i} onClick={() => setRecibido(v)}
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={{ background: T.surface2, color: T.text }}>
                  {fmt(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        {metodo === 'credito' && (
          <div className="mt-3 rounded-lg p-2.5 text-[10.5px]"
            style={{ background: 'rgba(245,158,11,0.12)', border: `1px solid ${T.warn}`, color: T.text }}>
            Esta venta se quedará como crédito. El saldo del cliente aumentará {fmt(total)}.
          </div>
        )}

        <button onClick={onConfirmar}
          className="mt-4 w-full rounded-lg py-3 text-white text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          style={{ background: T.success }}>
          <Check className="h-4 w-4" /> Confirmar y registrar
        </button>
      </div>
      <BottomNav active="POS" />
    </>
  );
}

function ScreenExito({ total, cliente, onNueva, onFin }: {
  total: number; cliente: Cliente; onNueva: () => void; onFin: () => void;
}) {
  return (
    <>
      <Header title="Venta registrada" />
      <div className="px-4 pt-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full grid place-items-center mb-3 animate-[pop_400ms_ease-out]"
          style={{ background: T.success }}>
          <Check className="h-8 w-8 text-white" strokeWidth={3} />
        </div>
        <div className="text-[18px] font-bold">¡Venta cobrada!</div>
        <div className="text-[11px] mt-1" style={{ color: T.muted }}>
          {cliente.nombre}
        </div>
        <div className="mt-4 text-[28px] font-black" style={{ color: T.success }}>{fmt(total)}</div>

        <div className="mt-4 w-full rounded-lg p-3 text-left" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="text-[10px]" style={{ color: T.muted }}>Folio</div>
          <div className="text-[12px] font-mono font-bold">V-{Math.floor(1000 + Math.random() * 9000)}</div>
          <div className="mt-1.5 text-[10px]" style={{ color: T.muted }}>Ticket enviado por WhatsApp al cliente.</div>
        </div>

        <button onClick={onNueva}
          className="mt-4 w-full rounded-lg py-2.5 text-white text-[12px] font-bold"
          style={{ background: T.primary }}>
          Vender a otro cliente
        </button>
        <button onClick={onFin}
          className="mt-2 w-full rounded-lg py-2.5 text-[12px] font-semibold border"
          style={{ borderColor: T.border, color: T.text, background: T.surface }}>
          Cerrar simulador
        </button>
      </div>
      <BottomNav active="POS" />
    </>
  );
}

/* ──────────────────────────── Main modal ──────────────────────────── */
export default function MobileDemoSimulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('inicio');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [carrito, setCarrito] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setStep('inicio');
    setCliente(null);
    setCarrito({});
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const total = Object.entries(carrito).reduce((s, [id, qty]) => {
    const p = PRODUCTOS.find(x => x.id === id);
    return s + (p ? p.precio * qty : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 animate-[fadeIn_200ms_ease-out]"
      style={{ background: 'rgba(8,12,24,0.85)', backdropFilter: 'blur(10px)' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { 0% { transform: scale(0); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1) } }
        .no-scrollbar::-webkit-scrollbar { display: none }
        .no-scrollbar { scrollbar-width: none }
      `}</style>

      {/* Close + label */}
      <button onClick={onClose}
        className="absolute top-3 right-3 sm:top-5 sm:right-5 z-10 w-10 h-10 rounded-full grid place-items-center text-white bg-white/10 hover:bg-white/20 active:scale-95 transition"
        aria-label="Cerrar simulador">
        <X className="h-5 w-5" />
      </button>
      <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-10 px-3 py-1.5 rounded-full text-[11px] font-bold text-white"
        style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
        🔒 Simulador · nada se guarda
      </div>

      <PhoneFrame>
        {step === 'inicio' && (
          <ScreenInicio onPickCliente={(c) => { setCliente(c); setStep('cliente'); }} />
        )}
        {step === 'cliente' && cliente && (
          <ScreenCliente cliente={cliente}
            onBack={() => setStep('inicio')}
            onVender={() => setStep('pos')} />
        )}
        {step === 'pos' && cliente && (
          <ScreenPOS cliente={cliente} carrito={carrito} setCarrito={setCarrito}
            onBack={() => setStep('cliente')}
            onCobrar={() => setStep('cobro')} />
        )}
        {step === 'cobro' && cliente && (
          <ScreenCobro total={total}
            onBack={() => setStep('pos')}
            onConfirmar={() => setStep('exito')} />
        )}
        {step === 'exito' && cliente && (
          <ScreenExito total={total} cliente={cliente}
            onNueva={() => { setCarrito({}); setCliente(null); setStep('inicio'); }}
            onFin={onClose} />
        )}
      </PhoneFrame>
    </div>
  );
}
