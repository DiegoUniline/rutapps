import {
  Battery, Wifi, Signal, MapPin, ShoppingCart, Check, ChevronRight,
  Wallet, Package, Truck, Search, Plus, Minus, CreditCard, Banknote,
  CheckCircle2, Navigation,
} from 'lucide-react';

const BRAND = 'hsl(230, 55%, 52%)';

/** Generic iPhone-like frame */
function Phone({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="relative mx-auto" style={{ width: 240 }}>
      <div className="relative rounded-[38px] bg-gray-900 p-2 shadow-2xl"
        style={{ boxShadow: '0 25px 50px -12px rgba(10,21,48,0.35), 0 0 0 1px rgba(0,0,0,0.08)' }}>
        <div className="rounded-[30px] overflow-hidden bg-white relative" style={{ aspectRatio: '9/19.5' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-b-2xl z-30" />
          <div className="flex items-center justify-between px-5 pt-1.5 pb-1 text-[9px] font-semibold text-gray-900 z-20 relative">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <Signal className="h-2 w-2" /><Wifi className="h-2 w-2" /><Battery className="h-2.5 w-2.5" />
            </div>
          </div>
          {children}
        </div>
      </div>
      {label && (
        <div className="text-center mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND }}>
          {label}
        </div>
      )}
    </div>
  );
}

/* 1 — Rutero (lista de clientes del día) */
export function PhoneRutero() {
  const clientes = [
    { n: 'Abarrotes Don Pepe', addr: 'Av. Hidalgo 124', st: 'done', amt: '$1,240' },
    { n: 'Mini Súper La Loma', addr: 'Calle 5 #88', st: 'now', amt: '—' },
    { n: 'Cremería El Sol', addr: 'Morelos 12', st: 'pending', amt: '—' },
    { n: 'Tienda La Esquina', addr: 'Juárez 340', st: 'pending', amt: '—' },
    { n: 'Depósito San Juan', addr: 'Reforma 78', st: 'pending', amt: '—' },
  ];
  return (
    <Phone label="Rutero del día">
      <div className="px-3 pt-2 pb-2" style={{ background: BRAND }}>
        <div className="text-white">
          <div className="text-[9px] opacity-80">Jueves · Ruta Centro</div>
          <div className="text-[13px] font-bold">12 clientes hoy</div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[['1','Visitados'],['4','Pendientes'],['$3.4k','Cobrado']].map(([v,l])=>(
            <div key={l} className="bg-white/15 backdrop-blur rounded-md px-1.5 py-1">
              <div className="text-[10px] font-bold text-white">{v}</div>
              <div className="text-[7.5px] text-white/80">{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-2 py-2 space-y-1.5">
        {clientes.map((c,i)=>(
          <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-100">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0
              ${c.st==='done'?'bg-emerald-100 text-emerald-700':c.st==='now'?'text-white':'bg-gray-100 text-gray-500'}`}
              style={c.st==='now'?{background:BRAND}:{}}>
              {c.st==='done'?<Check className="h-3 w-3"/>:i+1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-gray-900 truncate">{c.n}</div>
              <div className="text-[8px] text-gray-500 truncate flex items-center gap-0.5"><MapPin className="h-2 w-2"/>{c.addr}</div>
            </div>
            {c.st==='done' ? (
              <span className="text-[9px] font-bold text-emerald-600">{c.amt}</span>
            ) : c.st==='now' ? (
              <Navigation className="h-3 w-3" style={{color:BRAND}}/>
            ) : <ChevronRight className="h-3 w-3 text-gray-300"/>}
          </div>
        ))}
      </div>
    </Phone>
  );
}

/* 2 — POS móvil (nueva venta) */
export function PhonePOS() {
  const items = [
    { n: 'Coca-Cola 600ml', q: 12, p: 14 },
    { n: 'Sabritas Original', q: 6, p: 18 },
    { n: 'Galletas Marías', q: 4, p: 22 },
  ];
  const total = items.reduce((s,i)=>s+i.q*i.p,0);
  return (
    <Phone label="Punto de venta">
      <div className="px-3 pt-2 pb-2 border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="text-[8px] text-gray-500">Cliente</div>
          <div className="text-[10.5px] font-bold text-gray-900">Abarrotes Don Pepe</div>
        </div>
        <div className="w-6 h-6 rounded-full grid place-items-center text-white" style={{background:BRAND}}>
          <Plus className="h-3 w-3"/>
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-md px-2 py-1 mb-2">
          <Search className="h-2.5 w-2.5 text-gray-400"/>
          <span className="text-[9px] text-gray-400">Buscar producto…</span>
        </div>
        <div className="space-y-1.5">
          {items.map(it=>(
            <div key={it.n} className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-100">
              <div className="w-7 h-7 rounded-md bg-gray-100 grid place-items-center">
                <Package className="h-3 w-3 text-gray-400"/>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-semibold text-gray-900 truncate">{it.n}</div>
                <div className="text-[8px] text-gray-500">${it.p.toFixed(2)} c/u</div>
              </div>
              <div className="flex items-center gap-1">
                <button className="w-4 h-4 rounded grid place-items-center bg-gray-100"><Minus className="h-2 w-2"/></button>
                <span className="text-[10px] font-bold w-3 text-center">{it.q}</span>
                <button className="w-4 h-4 rounded grid place-items-center text-white" style={{background:BRAND}}><Plus className="h-2 w-2"/></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-3 pt-2 pb-3 bg-white border-t border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-gray-500">Total</span>
          <span className="text-[15px] font-black text-gray-900">${total.toFixed(2)}</span>
        </div>
        <button className="w-full rounded-lg py-2 text-white text-[10px] font-bold flex items-center justify-center gap-1"
          style={{background:BRAND}}>
          <ShoppingCart className="h-3 w-3"/> Cobrar venta
        </button>
      </div>
    </Phone>
  );
}

/* 3 — Cobro */
export function PhoneCobro() {
  return (
    <Phone label="Cobro multi-folio">
      <div className="px-3 pt-2 pb-2 border-b border-gray-100">
        <div className="text-[8px] text-gray-500">Cobrar a</div>
        <div className="text-[10.5px] font-bold text-gray-900">Mini Súper La Loma</div>
        <div className="text-[8.5px] text-gray-500 mt-0.5">Saldo total: <b className="text-gray-900">$4,820.00</b></div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Folios pendientes</div>
        <div className="space-y-1">
          {[
            { f:'V-1042', d:'12 abr', m:1240, sel:true },
            { f:'V-1078', d:'18 abr', m:1880, sel:true },
            { f:'V-1099', d:'02 may', m:1700, sel:false },
          ].map(r=>(
            <div key={r.f} className="flex items-center gap-2 p-1.5 rounded-md border"
              style={{borderColor: r.sel?BRAND:'#f3f4f6', background: r.sel?'rgba(79,70,229,0.04)':'white'}}>
              <div className={`w-3.5 h-3.5 rounded grid place-items-center ${r.sel?'text-white':'border border-gray-300'}`}
                style={r.sel?{background:BRAND}:{}}>
                {r.sel && <Check className="h-2 w-2"/>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-semibold text-gray-900">{r.f}</div>
                <div className="text-[8px] text-gray-500">{r.d}</div>
              </div>
              <span className="text-[10px] font-bold text-gray-900">${r.m.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-lg p-2" style={{background:'rgba(79,70,229,0.06)'}}>
          <div className="text-[8px] text-gray-600">Monto a cobrar</div>
          <div className="text-[18px] font-black" style={{color:BRAND}}>$3,120.00</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className="rounded-md py-1.5 border border-gray-200 text-[9px] font-bold flex items-center justify-center gap-1 text-gray-700">
            <Banknote className="h-2.5 w-2.5"/> Efectivo
          </button>
          <button className="rounded-md py-1.5 text-[9px] font-bold flex items-center justify-center gap-1 text-white" style={{background:BRAND}}>
            <CreditCard className="h-2.5 w-2.5"/> Transferencia
          </button>
        </div>
      </div>
    </Phone>
  );
}

/* 4 — Entrega (firma + confirmación) */
export function PhoneEntrega() {
  return (
    <Phone label="Entrega con firma">
      <div className="px-3 pt-2 pb-2" style={{ background:'linear-gradient(135deg, hsl(160,70%,40%), hsl(160,70%,32%))'}}>
        <div className="flex items-center gap-1.5 text-white/90 text-[8px]"><Truck className="h-2.5 w-2.5"/>Entrega · E-2034</div>
        <div className="text-[11px] font-bold text-white mt-0.5">Cremería El Sol</div>
        <div className="text-[8.5px] text-white/80">Morelos 12 · Centro</div>
      </div>
      <div className="px-3 py-2">
        <div className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Productos a entregar</div>
        <div className="space-y-1">
          {[
            { n:'Leche entera 1L', q:24, ok:true },
            { n:'Yoghurt natural 1kg', q:12, ok:true },
            { n:'Crema ácida 500g', q:8, ok:false },
          ].map(p=>(
            <div key={p.n} className="flex items-center gap-2 p-1.5 rounded-md border border-gray-100">
              <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${p.ok?'text-emerald-500':'text-gray-300'}`}/>
              <div className="min-w-0 flex-1">
                <div className="text-[9.5px] font-semibold text-gray-900 truncate">{p.n}</div>
                <div className="text-[8px] text-gray-500">Cant. {p.q}</div>
              </div>
              {!p.ok && <span className="text-[8px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded">Faltante</span>}
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-md border border-dashed border-gray-300 p-2 bg-gray-50">
          <div className="text-[8px] text-gray-500 mb-1">Firma del cliente</div>
          <svg viewBox="0 0 200 40" className="w-full h-8">
            <path d="M5 30 Q 20 5, 35 25 T 70 20 Q 90 5, 110 28 T 160 18 L 195 25"
              fill="none" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-3 pt-2 pb-3 bg-white border-t border-gray-100">
        <button className="w-full rounded-lg py-2 text-white text-[10px] font-bold flex items-center justify-center gap-1"
          style={{background:'hsl(160,70%,36%)'}}>
          <Check className="h-3 w-3"/> Confirmar entrega
        </button>
      </div>
    </Phone>
  );
}
