import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, User, ShoppingCart, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export default function RutaNuevaVenta() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('cliente');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [searchProducto, setSearchProducto] = useState('');
  const [saving, setSaving] = useState(false);
  const [tipoVenta, setTipoVenta] = useState<'venta_directa' | 'pedido'>('venta_directa');
  const [condicionPago, setCondicionPago] = useState<'contado' | 'credito' | 'por_definir'>('contado');
  const [entregaInmediata, setEntregaInmediata] = useState(true);
  const [notas, setNotas] = useState('');

  // Fetch clients
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

  // Fetch products
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

  // Totals
  const totals = useMemo(() => {
    let subtotal = 0, iva = 0;
    cart.forEach(item => {
      const lineaSub = item.precio_unitario * item.cantidad;
      subtotal += lineaSub;
      if (item.tiene_iva) iva += lineaSub * (item.iva_pct / 100);
    });
    return { subtotal, iva, total: subtotal + iva, items: cart.reduce((s, c) => s + c.cantidad, 0) };
  }, [cart]);

  // Save sale
  const handleSave = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      // Create venta
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
      const { data: venta, error: ventaErr } = await supabase.from('ventas').insert({
        empresa_id: profile!.empresa_id,
        cliente_id: clienteId,
        tipo: tipoVenta,
        condicion_pago: condicionPago,
        entrega_inmediata: entregaInmediata,
        status: tipoVenta === 'venta_directa' ? 'confirmado' as const : 'borrador' as const,
        notas: notas || null,
        subtotal: totals.subtotal,
        iva_total: totals.iva,
        ieps_total: 0,
        descuento_total: 0,
        total: totals.total,
      }).select('id').single();
      if (ventaErr) throw ventaErr;

      // Create lineas
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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => step === 'cliente' ? navigate('/ruta/ventas') : setStep(step === 'resumen' ? 'productos' : 'cliente')} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground flex-1">
          {step === 'cliente' ? 'Seleccionar cliente' : step === 'productos' ? 'Agregar productos' : 'Confirmar venta'}
        </h1>
        {/* Step indicators */}
        <div className="flex gap-1.5">
          {(['cliente', 'productos', 'resumen'] as Step[]).map((s, i) => (
            <div key={s} className={`w-2 h-2 rounded-full ${step === s ? 'bg-primary' : i < ['cliente', 'productos', 'resumen'].indexOf(step) ? 'bg-primary/40' : 'bg-border'}`} />
          ))}
        </div>
      </div>

      {/* STEP 1: Select client */}
      {step === 'cliente' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Skip client option */}
          <button
            onClick={() => { setClienteId(null); setClienteNombre('Público general'); setStep('productos'); }}
            className="mx-4 mb-2 bg-accent border border-primary/20 rounded-xl p-3 text-left active:scale-[0.98] transition-transform"
          >
            <p className="text-[13px] font-semibold text-primary">Continuar sin cliente</p>
            <p className="text-[11px] text-muted-foreground">Público general</p>
          </button>

          <div className="flex-1 overflow-auto px-4 space-y-1.5 pb-4">
            {filteredClientes?.map(c => (
              <button
                key={c.id}
                onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setStep('productos'); }}
                className={`w-full rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left ${
                  clienteId === c.id ? 'bg-primary/10 border-2 border-primary' : 'bg-card border border-border'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-[13px]">{c.nombre.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{c.nombre}</p>
                  {c.codigo && <p className="text-[11px] text-muted-foreground">{c.codigo}</p>}
                </div>
                {clienteId === c.id && <Check className="h-5 w-5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Add products */}
      {step === 'productos' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Client banner */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="text-[12px] font-medium text-foreground">{clienteNombre}</span>
          </div>

          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar producto..."
                className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={searchProducto}
                onChange={e => setSearchProducto(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 space-y-1.5 pb-24">
            {filteredProductos?.map(p => {
              const inCart = getItemInCart(p.id);
              const stock = p.cantidad ?? 0;
              return (
                <div key={p.id} className={`rounded-xl p-3 ${inCart ? 'bg-primary/5 border-2 border-primary/30' : 'bg-card border border-border'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0" onClick={() => !inCart && addToCart(p)}>
                      <p className="text-[13px] font-semibold text-foreground truncate">{p.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{p.codigo}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className={`text-[11px] font-medium ${stock > 0 ? 'text-success' : 'text-destructive'}`}>{stock} disp.</span>
                      </div>
                      <p className="text-[14px] font-bold text-primary mt-0.5">$ {(p.precio_principal ?? 0).toFixed(2)}</p>
                    </div>

                    {inCart ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => inCart.cantidad === 1 ? removeFromCart(p.id) : updateQty(p.id, -1)}
                          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center active:scale-90 transition-transform">
                          {inCart.cantidad === 1 ? <Trash2 className="h-3.5 w-3.5 text-destructive" /> : <Minus className="h-3.5 w-3.5" />}
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="w-10 text-center text-[15px] font-bold bg-transparent border-b-2 border-primary/30 focus:border-primary focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                        <button onClick={() => addToCart(p)}
                          className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)}
                        className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform shrink-0">
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating cart bar */}
          {cart.length > 0 && (
            <div className="fixed bottom-14 left-0 right-0 z-30 px-4 pb-3 safe-area-bottom">
              <button
                onClick={() => setStep('resumen')}
                className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 flex items-center justify-between px-5 active:scale-[0.98] transition-transform shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  <span className="font-semibold text-[14px]">{totals.items} productos</span>
                </div>
                <span className="font-bold text-[16px]">$ {totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Summary */}
      {step === 'resumen' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-4 pt-3 pb-24 space-y-4">
            {/* Client */}
            <div className="bg-card border border-border rounded-xl p-3.5">
              <p className="text-[11px] text-muted-foreground mb-1">Cliente</p>
              <p className="text-[14px] font-semibold text-foreground">{clienteNombre}</p>
            </div>

            {/* Sale options */}
            <div className="bg-card border border-border rounded-xl p-3.5 space-y-4">
              {/* Tipo */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Tipo de operación</p>
                <div className="flex gap-2">
                  {([['venta_directa', 'Venta directa'], ['pedido', 'Pedido']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setTipoVenta(val)}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-95 ${
                        tipoVenta === val
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-foreground border border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Condición de pago */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Condición de pago</p>
                <div className="flex gap-2">
                  {([['contado', 'Contado'], ['credito', 'Crédito'], ['por_definir', 'Por definir']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setCondicionPago(val)}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-95 ${
                        condicionPago === val
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-foreground border border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entrega inmediata */}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-foreground">Entrega inmediata</p>
                <button
                  onClick={() => setEntregaInmediata(!entregaInmediata)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${entregaInmediata ? 'bg-primary' : 'bg-border'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${entregaInmediata ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Notas */}
            <div className="bg-card border border-border rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Notas (opcional)</p>
              <textarea
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={2}
                placeholder="Instrucciones, observaciones..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase">Productos ({totals.items})</p>
              {cart.map(item => (
                <div key={item.producto_id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{item.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.cantidad} × $ {item.precio_unitario.toFixed(2)}
                    </p>
                  </div>
                  <span className="text-[14px] font-bold text-foreground shrink-0">
                    $ {(item.precio_unitario * item.cantidad).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">$ {totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
              {totals.iva > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">IVA</span>
                  <span className="font-medium">$ {totals.iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-[16px] font-bold border-t border-border pt-2">
                <span>Total</span>
                <span className="text-primary">$ {totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Confirm button */}
          <div className="fixed bottom-14 left-0 right-0 z-30 px-4 pb-3 safe-area-bottom">
            <button
              onClick={handleSave}
              disabled={saving || cart.length === 0}
              className="w-full bg-success text-success-foreground rounded-2xl py-4 text-[16px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg flex items-center justify-center gap-2"
            >
              <Check className="h-5 w-5" />
              {saving ? 'Guardando...' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
