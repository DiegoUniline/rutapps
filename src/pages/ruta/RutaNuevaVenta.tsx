import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, Check, Package, ChevronRight, CalendarDays } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface CartItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  unidad: string;
  tiene_iva: boolean;
  iva_pct: number;
}

type Step = 'cliente' | 'productos' | 'resumen';

const STEP_LABELS: Record<Step, string> = {
  cliente: 'Cliente',
  productos: 'Productos',
  resumen: 'Confirmar',
};

const STEPS: Step[] = ['cliente', 'productos', 'resumen'];

export default function RutaNuevaVenta() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('cliente');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCredito, setClienteCredito] = useState<{ credito: boolean; limite: number; dias: number } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [searchProducto, setSearchProducto] = useState('');
  const [saving, setSaving] = useState(false);
  const [tipoVenta, setTipoVenta] = useState<'venta_directa' | 'pedido'>('venta_directa');
  const [condicionPago, setCondicionPago] = useState<'contado' | 'credito' | 'por_definir'>('contado');
  const [notas, setNotas] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');

  const entregaInmediata = tipoVenta === 'venta_directa';

  const { data: clientes } = useQuery({
    queryKey: ['ruta-clientes-venta', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, telefono')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  const { data: productos } = useQuery({
    queryKey: ['ruta-productos-venta', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, codigo, nombre, precio_principal, cantidad, tiene_iva, tasa_iva_id, unidades:unidad_venta_id(nombre, abreviatura), tasas_iva:tasa_iva_id(porcentaje)')
        .eq('empresa_id', empresa!.id)
        .eq('se_puede_vender', true)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  const filteredClientes = clientes?.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );

  const filteredProductos = productos?.filter(p =>
    !searchProducto || p.nombre.toLowerCase().includes(searchProducto.toLowerCase()) ||
    p.codigo.toLowerCase().includes(searchProducto.toLowerCase())
  );

  const addToCart = (p: any) => {
    const existing = cart.find(c => c.producto_id === p.id);
    if (existing) {
      setCart(cart.map(c => c.producto_id === p.id ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else {
      setCart([...cart, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_unitario: p.precio_principal ?? 0,
        cantidad: 1,
        unidad: (p.unidades as any)?.abreviatura || (p.unidades as any)?.nombre || 'pz',
        tiene_iva: p.tiene_iva ?? false,
        iva_pct: p.tiene_iva ? ((p.tasas_iva as any)?.porcentaje ?? 16) : 0,
      }]);
    }
  };

  const updateQty = (productoId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.producto_id !== productoId) return c;
      const newQty = c.cantidad + delta;
      return newQty > 0 ? { ...c, cantidad: newQty } : c;
    }));
  };

  const removeFromCart = (productoId: string) => {
    setCart(prev => prev.filter(c => c.producto_id !== productoId));
  };

  const getItemInCart = (productoId: string) => cart.find(c => c.producto_id === productoId);

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0;
    cart.forEach(item => {
      const lineaSub = item.precio_unitario * item.cantidad;
      subtotal += lineaSub;
      if (item.tiene_iva) iva += lineaSub * (item.iva_pct / 100);
    });
    return { subtotal, iva, total: subtotal + iva, items: cart.reduce((s, c) => s + c.cantidad, 0) };
  }, [cart]);

  const handleSave = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
      const { data: venta, error: ventaErr } = await supabase.from('ventas').insert({
        empresa_id: profile!.empresa_id,
        cliente_id: clienteId,
        tipo: tipoVenta,
        condicion_pago: condicionPago,
        entrega_inmediata: entregaInmediata,
        fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null,
        status: tipoVenta === 'venta_directa' ? 'confirmado' as const : 'borrador' as const,
        notas: notas || null,
        subtotal: totals.subtotal,
        iva_total: totals.iva,
        ieps_total: 0,
        descuento_total: 0,
        total: totals.total,
      }).select('id').single();
      if (ventaErr) throw ventaErr;

      const lineas = cart.map(item => ({
        venta_id: venta.id,
        producto_id: item.producto_id,
        descripcion: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
        iva_pct: item.iva_pct,
        iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0,
        ieps_pct: 0,
        ieps_monto: 0,
        descuento_pct: 0,
        total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)),
      }));

      const { error: lineasErr } = await supabase.from('venta_lineas').insert(lineas);
      if (lineasErr) throw lineasErr;

      toast.success('¡Venta registrada!');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      navigate('/ruta/ventas');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const currentStepIdx = STEPS.indexOf(step);

  const goBack = () => {
    if (currentStepIdx === 0) navigate('/ruta/ventas');
    else setStep(STEPS[currentStepIdx - 1]);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Nueva venta</span>
        </div>
        {/* Step bar */}
        <div className="flex px-3 pb-2.5 gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-[3px] w-full rounded-full transition-colors ${
                i < currentStepIdx ? 'bg-primary' : i === currentStepIdx ? 'bg-primary' : 'bg-border'
              }`} />
              <span className={`text-[10px] font-medium transition-colors ${
                i <= currentStepIdx ? 'text-primary' : 'text-muted-foreground/60'
              }`}>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ─── STEP 1: Cliente ─── */}
      {step === 'cliente' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre o código..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40 transition-shadow"
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 pb-4">
            {/* Skip client */}
            <button
              onClick={() => { setClienteId(null); setClienteNombre('Público general'); setStep('productos'); }}
              className="w-full mb-1.5 rounded-lg px-3 py-2.5 flex items-center gap-2.5 bg-accent/40 border border-dashed border-primary/25 active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-[11px] font-bold">PG</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">Público general</p>
                <p className="text-[10.5px] text-muted-foreground">Continuar sin cliente</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            </button>

            <div className="space-y-[3px]">
              {filteredClientes?.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setStep('productos'); }}
                  className={`w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left ${
                    clienteId === c.id
                      ? 'bg-primary/8 ring-1.5 ring-primary/40'
                      : 'bg-card hover:bg-accent/30'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    clienteId === c.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
                  }`}>
                    <span className="text-[11px] font-bold">{c.nombre.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                    {c.codigo && <p className="text-[10.5px] text-muted-foreground">{c.codigo}</p>}
                  </div>
                  {clienteId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 2: Productos ─── */}
      {step === 'productos' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Client chip */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
              <span className="text-[10px] text-muted-foreground">Cliente:</span>
              <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
            </div>
          </div>

          <div className="px-3 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar producto..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40 transition-shadow"
                value={searchProducto}
                onChange={e => setSearchProducto(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
            {filteredProductos?.map(p => {
              const inCart = getItemInCart(p.id);
              const stock = p.cantidad ?? 0;
              const overStock = inCart && inCart.cantidad > stock && tipoVenta === 'venta_directa';
              return (
                <div
                  key={p.id}
                  className={`rounded-lg px-3 py-2 transition-all ${
                    inCart ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0" onClick={() => !inCart && addToCart(p)}>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-px">
                        <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={`text-[10px] font-medium ${stock > 0 ? 'text-success' : 'text-destructive'}`}>
                          {stock} {(p.unidades as any)?.abreviatura || 'pz'}
                        </span>
                        {overStock && <span className="text-[9px] text-destructive font-medium">⚠ excede</span>}
                      </div>
                      <p className="text-[13px] font-bold text-foreground mt-px">
                        ${(p.precio_principal ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{(p.unidades as any)?.abreviatura || 'pz'}</span>
                      </p>
                    </div>

                    {inCart ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => inCart.cantidad === 1 ? removeFromCart(p.id) : updateQty(p.id, -1)}
                          className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform"
                        >
                          {inCart.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                          value={inCart.cantidad}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              setCart(prev => prev.map(c => c.producto_id === p.id ? { ...c, cantidad: val } : c));
                            } else if (e.target.value === '') {
                              setCart(prev => prev.map(c => c.producto_id === p.id ? { ...c, cantidad: 1 } : c));
                            }
                          }}
                          onFocus={e => e.target.select()}
                        />
                        <button
                          onClick={() => addToCart(p)}
                          className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating cart bar */}
          {cart.length > 0 && (
            <div className="fixed bottom-14 left-0 right-0 z-30 px-3 pb-2 safe-area-bottom">
              <button
                onClick={() => setStep('resumen')}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
              >
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4 opacity-80" />
                  <span className="text-[13px] font-medium">{totals.items} {totals.items === 1 ? 'producto' : 'productos'}</span>
                </div>
                <span className="text-[14px] font-bold">${totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3: Resumen ─── */}
      {step === 'resumen' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-3 pt-2.5 pb-20 space-y-2.5">

            {/* Tipo de operación */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo de operación</p>
              <div className="flex gap-1.5">
                {([['venta_directa', 'Venta directa'], ['pedido', 'Pedido']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTipoVenta(val)}
                    className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all active:scale-95 ${
                      tipoVenta === val
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent/60 text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Entrega context */}
              <div className={`mt-2.5 rounded-md px-2.5 py-2 flex items-start gap-2 ${
                entregaInmediata ? 'bg-success/8' : 'bg-accent/50'
              }`}>
                {entregaInmediata ? (
                  <>
                    <Package className="h-3.5 w-3.5 text-success mt-px shrink-0" />
                    <p className="text-[11px] text-foreground leading-snug">Entrega inmediata · Descuenta stock a bordo</p>
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" />
                    <div className="flex-1">
                      <p className="text-[11px] text-muted-foreground leading-snug mb-1.5">Pedido · No descuenta stock</p>
                      <input
                        type="date"
                        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                        value={fechaEntrega}
                        onChange={e => setFechaEntrega(e.target.value)}
                        placeholder="Fecha de entrega"
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Condición de pago + Cliente */}
            <section className="bg-card rounded-lg p-3">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Condición de pago</p>
              </div>
              <div className="flex gap-1.5">
                {([['contado', 'Contado'], ['credito', 'Crédito'], ['por_definir', 'Por definir']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setCondicionPago(val)}
                    className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all active:scale-95 ${
                      condicionPago === val
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent/60 text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-foreground">{clienteNombre.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-medium text-foreground truncate">{clienteNombre}</p>
                </div>
                <button onClick={() => setStep('cliente')} className="text-[10.5px] text-primary font-medium">Cambiar</button>
              </div>
            </section>

            {/* Productos en carrito */}
            <section className="bg-card rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Productos ({totals.items})
                </p>
                <button onClick={() => setStep('productos')} className="text-[10.5px] text-primary font-medium">Editar</button>
              </div>
              <div className="space-y-1.5">
                {cart.map(item => {
                  const lineTotal = item.precio_unitario * item.cantidad;
                  return (
                    <div key={item.producto_id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {item.cantidad} × ${item.precio_unitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <span className="text-[12.5px] font-semibold text-foreground shrink-0 tabular-nums">
                        ${lineTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Notas */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
              <textarea
                className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none transition-shadow"
                rows={2}
                placeholder="Instrucciones o comentarios..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </section>

            {/* Totales */}
            <section className="bg-card rounded-lg p-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground tabular-nums">${totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                {totals.iva > 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted-foreground">IVA</span>
                    <span className="font-medium text-foreground tabular-nums">${totals.iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60">
                <span className="text-[13px] font-semibold text-foreground">Total</span>
                <span className="text-[18px] font-bold text-primary tabular-nums">${totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            </section>
          </div>

          {/* Confirm button */}
          <div className="fixed bottom-14 left-0 right-0 z-30 px-3 pb-2 safe-area-bottom">
            <button
              onClick={handleSave}
              disabled={saving || cart.length === 0}
              className="w-full bg-success text-success-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-success/20 flex items-center justify-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Guardando...' : tipoVenta === 'venta_directa' ? 'Confirmar venta' : 'Registrar pedido'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
