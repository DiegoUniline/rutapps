import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, Check, Package, ChevronRight, CalendarDays, Banknote, CreditCard, Wallet, Receipt, Save, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import TicketVenta from '@/components/ruta/TicketVenta';
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
  es_cambio?: boolean; // free replacement
}

interface DevolucionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'otro';
  reemplazo_producto_id?: string;
  reemplazo_nombre?: string;
}

interface CuentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
}

type Step = 'cliente' | 'devoluciones' | 'productos' | 'resumen' | 'pago';

const STEP_LABELS: Record<Step, string> = {
  cliente: 'Cliente',
  devoluciones: 'Devol.',
  productos: 'Pedido',
  resumen: 'Confirmar',
  pago: 'Pago',
};

const STEPS: Step[] = ['cliente', 'devoluciones', 'productos', 'resumen', 'pago'];

const MOTIVOS: { value: DevolucionItem['motivo']; label: string }[] = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'otro', label: 'Otro' },
];

export default function RutaNuevaVenta() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlClienteId = searchParams.get('clienteId');
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(urlClienteId ? 'devoluciones' : 'cliente');
  const [clienteId, setClienteId] = useState<string | null>(urlClienteId);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCredito, setClienteCredito] = useState<{ credito: boolean; limite: number; dias: number } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionItem[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [searchProducto, setSearchProducto] = useState('');
  const [searchDevProducto, setSearchDevProducto] = useState('');
  const [saving, setSaving] = useState(false);
  const [tipoVenta, setTipoVenta] = useState<'venta_directa' | 'pedido'>('venta_directa');
  const [condicionPago, setCondicionPago] = useState<'contado' | 'credito' | 'por_definir'>('contado');
  const [notas, setNotas] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [cuentasPendientes, setCuentasPendientes] = useState<CuentaPendiente[]>([]);
  const [showDevSearch, setShowDevSearch] = useState(false);
  const [showReemplazoFor, setShowReemplazoFor] = useState<string | null>(null);
  const [searchReemplazo, setSearchReemplazo] = useState('');
  const [ticketInfo, setTicketInfo] = useState<{ folio: string; fecha: string } | null>(null);

  const entregaInmediata = tipoVenta === 'venta_directa';

  const { data: clientes } = useQuery({
    queryKey: ['ruta-clientes-venta', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, telefono, credito, limite_credito, dias_credito')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  // Auto-select client from URL param
  useEffect(() => {
    if (urlClienteId && clientes) {
      const c = clientes.find(cl => cl.id === urlClienteId);
      if (c) {
        setClienteNombre(c.nombre);
        setClienteCredito({
          credito: c.credito ?? false,
          limite: c.limite_credito ?? 0,
          dias: c.dias_credito ?? 0,
        });
      }
    }
  }, [urlClienteId, clientes]);

  const { data: ventasPendientes } = useQuery({
    queryKey: ['ruta-cuentas-pendientes', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente')
        .eq('cliente_id', clienteId!)
        .eq('condicion_pago', 'credito')
        .gt('saldo_pendiente', 0)
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });

  const saldoPendienteTotal = useMemo(() =>
    (ventasPendientes ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0),
    [ventasPendientes]
  );

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

  // Pedido sugerido for selected client
  const { data: pedidoSugerido } = useQuery({
    queryKey: ['pedido-sugerido', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cliente_pedido_sugerido')
        .select('*, productos(id, codigo, nombre, precio_principal, tiene_iva, tasa_iva_id, unidades:unidad_venta_id(nombre, abreviatura), tasas_iva:tasa_iva_id(porcentaje))')
        .eq('cliente_id', clienteId!);
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

  const filteredDevProductos = productos?.filter(p =>
    !searchDevProducto || p.nombre.toLowerCase().includes(searchDevProducto.toLowerCase()) ||
    p.codigo.toLowerCase().includes(searchDevProducto.toLowerCase())
  );

  const filteredReemplazoProductos = productos?.filter(p =>
    !searchReemplazo || p.nombre.toLowerCase().includes(searchReemplazo.toLowerCase()) ||
    p.codigo.toLowerCase().includes(searchReemplazo.toLowerCase())
  );

  // When client is selected and has pedido sugerido, pre-load cart
  const initCartFromSugerido = () => {
    if (!pedidoSugerido || pedidoSugerido.length === 0) return;
    const newCart: CartItem[] = pedidoSugerido.map((ps: any) => ({
      producto_id: ps.productos.id,
      codigo: ps.productos.codigo,
      nombre: ps.productos.nombre,
      precio_unitario: ps.productos.precio_principal ?? 0,
      cantidad: ps.cantidad,
      unidad: (ps.productos.unidades as any)?.abreviatura || 'pz',
      tiene_iva: ps.productos.tiene_iva ?? false,
      iva_pct: ps.productos.tiene_iva ? ((ps.productos.tasas_iva as any)?.porcentaje ?? 16) : 0,
    }));
    setCart(newCart);
  };

  const addToCart = (p: any, esCambio = false) => {
    const existing = cart.find(c => c.producto_id === p.id && c.es_cambio === esCambio);
    if (existing) {
      setCart(cart.map(c => c.producto_id === p.id && c.es_cambio === esCambio ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else {
      setCart([...cart, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_unitario: esCambio ? 0 : (p.precio_principal ?? 0),
        cantidad: 1,
        unidad: (p.unidades as any)?.abreviatura || (p.unidades as any)?.nombre || 'pz',
        tiene_iva: esCambio ? false : (p.tiene_iva ?? false),
        iva_pct: esCambio ? 0 : (p.tiene_iva ? ((p.tasas_iva as any)?.porcentaje ?? 16) : 0),
        es_cambio: esCambio,
      }]);
    }
  };

  const updateQty = (productoId: string, delta: number, esCambio?: boolean) => {
    setCart(prev => prev.map(c => {
      if (c.producto_id !== productoId || c.es_cambio !== esCambio) return c;
      const newQty = c.cantidad + delta;
      return newQty > 0 ? { ...c, cantidad: newQty } : c;
    }));
  };

  const removeFromCart = (productoId: string, esCambio?: boolean) => {
    setCart(prev => prev.filter(c => !(c.producto_id === productoId && c.es_cambio === esCambio)));
  };

  const getItemInCart = (productoId: string) => cart.find(c => c.producto_id === productoId && !c.es_cambio);

  // Devolucion helpers
  const addDevolucion = (p: any) => {
    if (devoluciones.find(d => d.producto_id === p.id)) return;
    setDevoluciones(prev => [...prev, {
      producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1, motivo: 'no_vendido',
    }]);
    setShowDevSearch(false);
    setSearchDevProducto('');
  };

  const updateDevQty = (productoId: string, qty: number) => {
    if (qty <= 0) {
      setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId));
    } else {
      setDevoluciones(prev => prev.map(d => d.producto_id === productoId ? { ...d, cantidad: qty } : d));
    }
  };

  const updateDevMotivo = (productoId: string, motivo: DevolucionItem['motivo']) => {
    setDevoluciones(prev => prev.map(d => {
      if (d.producto_id !== productoId) return d;
      const updated = { ...d, motivo };
      if (motivo !== 'cambio') {
        delete updated.reemplazo_producto_id;
        delete updated.reemplazo_nombre;
      }
      return updated;
    }));
  };

  const setReemplazo = (devProductoId: string, p: any) => {
    setDevoluciones(prev => prev.map(d =>
      d.producto_id === devProductoId ? { ...d, reemplazo_producto_id: p.id, reemplazo_nombre: p.nombre } : d
    ));
    setShowReemplazoFor(null);
    setSearchReemplazo('');
  };

  const removeDevolucion = (productoId: string) => {
    setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId));
  };

  // Process devoluciones into cart when moving to productos step
  const processDevolucionesAndGoToProductos = () => {
    // Remove existing cambio items from cart
    let newCart = cart.filter(c => !c.es_cambio);

    // If no cart yet and there's pedido sugerido, load it
    if (newCart.length === 0 && pedidoSugerido && pedidoSugerido.length > 0) {
      newCart = pedidoSugerido.map((ps: any) => ({
        producto_id: ps.productos.id,
        codigo: ps.productos.codigo,
        nombre: ps.productos.nombre,
        precio_unitario: ps.productos.precio_principal ?? 0,
        cantidad: ps.cantidad,
        unidad: (ps.productos.unidades as any)?.abreviatura || 'pz',
        tiene_iva: ps.productos.tiene_iva ?? false,
        iva_pct: ps.productos.tiene_iva ? ((ps.productos.tasas_iva as any)?.porcentaje ?? 16) : 0,
      }));
    }

    // Add cambio replacements to cart as $0 items
    devoluciones.filter(d => d.motivo === 'cambio' && d.reemplazo_producto_id).forEach(d => {
      const p = productos?.find(pr => pr.id === d.reemplazo_producto_id);
      if (p) {
        const existing = newCart.find(c => c.producto_id === p.id && c.es_cambio);
        if (existing) {
          newCart = newCart.map(c => c.producto_id === p.id && c.es_cambio ? { ...c, cantidad: c.cantidad + d.cantidad } : c);
        } else {
          newCart.push({
            producto_id: p.id, codigo: p.codigo, nombre: p.nombre,
            precio_unitario: 0, cantidad: d.cantidad,
            unidad: (p.unidades as any)?.abreviatura || 'pz',
            tiene_iva: false, iva_pct: 0, es_cambio: true,
          });
        }
      }
    });

    setCart(newCart);
    setStep('productos');
  };

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, items = 0;
    cart.forEach(item => {
      if (item.es_cambio) { items += item.cantidad; return; } // don't charge
      const lineaSub = item.precio_unitario * item.cantidad;
      subtotal += lineaSub;
      if (item.tiene_iva) iva += lineaSub * (item.iva_pct / 100);
      items += item.cantidad;
    });
    return { subtotal, iva, total: subtotal + iva, items };
  }, [cart]);

  const creditoDisponible = clienteCredito ? clienteCredito.limite - saldoPendienteTotal : 0;
  const excedeCredito = condicionPago === 'credito' && totals.total > creditoDisponible;

  const totalAplicarCuentas = cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0);
  const totalACobrar = (condicionPago === 'contado' ? totals.total : 0) + totalAplicarCuentas;
  const montoRecibidoNum = parseFloat(montoRecibido) || 0;
  const cambio = montoRecibidoNum > totalACobrar ? montoRecibidoNum - totalACobrar : 0;

  const initCuentasPendientes = () => {
    if (ventasPendientes && ventasPendientes.length > 0) {
      setCuentasPendientes(ventasPendientes.map(v => ({
        id: v.id, folio: v.folio, fecha: v.fecha, total: v.total ?? 0,
        saldo_pendiente: v.saldo_pendiente ?? 0, montoAplicar: 0,
      })));
    } else {
      setCuentasPendientes([]);
    }
  };

  const liquidarTodas = () => {
    setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: c.saldo_pendiente })));
  };

  const updateCuentaMonto = (id: string, monto: number) => {
    setCuentasPendientes(prev => prev.map(c =>
      c.id === id ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c
    ));
  };

  // Save without payment
  const handleSaveOnly = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();

      // 1. Save devoluciones if any
      if (devoluciones.length > 0 && clienteId) {
        const { data: dev } = await supabase.from('devoluciones').insert({
          empresa_id: profile!.empresa_id, user_id: user.id, cliente_id: clienteId, tipo: 'tienda' as const,
        }).select('id').single();
        if (dev) {
          await supabase.from('devolucion_lineas').insert(
            devoluciones.map(d => ({ devolucion_id: dev.id, producto_id: d.producto_id, cantidad: d.cantidad, motivo: d.motivo as any }))
          );
        }
      }

      // 2. Create sale
      const chargedItems = cart.filter(c => !c.es_cambio);
      const { data: venta, error: ventaErr } = await supabase.from('ventas').insert({
        empresa_id: profile!.empresa_id, cliente_id: clienteId, tipo: tipoVenta,
        condicion_pago: condicionPago, entrega_inmediata: entregaInmediata,
        fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null,
        status: 'borrador' as const, notas: notas || null,
        subtotal: totals.subtotal, iva_total: totals.iva, ieps_total: 0, descuento_total: 0,
        total: totals.total, saldo_pendiente: totals.total,
      }).select('id').single();
      if (ventaErr) throw ventaErr;

      // 3. Insert all lines (including cambios at $0)
      const lineas = cart.map(item => ({
        venta_id: venta.id, producto_id: item.producto_id, descripcion: item.nombre,
        cantidad: item.cantidad, precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
        iva_pct: item.iva_pct,
        iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0,
        ieps_pct: 0, ieps_monto: 0, descuento_pct: 0,
        total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)),
        notas: item.es_cambio ? 'CAMBIO - Sin cargo' : null,
      }));
      await supabase.from('venta_lineas').insert(lineas);

      // 4. Update carga
      await updateCargaVendida(cart);

      toast.success('Venta guardada');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      navigate('/ruta/ventas');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleSave = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();

      // 1. Save devoluciones
      if (devoluciones.length > 0 && clienteId) {
        const { data: dev } = await supabase.from('devoluciones').insert({
          empresa_id: profile!.empresa_id, user_id: user.id, cliente_id: clienteId, tipo: 'tienda' as const,
        }).select('id').single();
        if (dev) {
          await supabase.from('devolucion_lineas').insert(
            devoluciones.map(d => ({ devolucion_id: dev.id, producto_id: d.producto_id, cantidad: d.cantidad, motivo: d.motivo as any }))
          );
        }
      }

      // 2. Create the sale
      const { data: venta, error: ventaErr } = await supabase.from('ventas').insert({
        empresa_id: profile!.empresa_id, cliente_id: clienteId, tipo: tipoVenta,
        condicion_pago: condicionPago, entrega_inmediata: entregaInmediata,
        fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null,
        status: tipoVenta === 'venta_directa' ? 'confirmado' as const : 'borrador' as const,
        notas: notas || null, subtotal: totals.subtotal, iva_total: totals.iva,
        ieps_total: 0, descuento_total: 0, total: totals.total,
        saldo_pendiente: condicionPago === 'credito' ? totals.total : 0,
      }).select('id').single();
      if (ventaErr) throw ventaErr;

      const lineas = cart.map(item => ({
        venta_id: venta.id, producto_id: item.producto_id, descripcion: item.nombre,
        cantidad: item.cantidad, precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
        iva_pct: item.iva_pct,
        iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0,
        ieps_pct: 0, ieps_monto: 0, descuento_pct: 0,
        total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)),
        notas: item.es_cambio ? 'CAMBIO - Sin cargo' : null,
      }));
      await supabase.from('venta_lineas').insert(lineas);

      // 3. Cobro
      if (totalACobrar > 0 && clienteId) {
        const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({
          empresa_id: profile!.empresa_id, cliente_id: clienteId, user_id: user.id,
          monto: totalACobrar, metodo_pago: metodoPago, referencia: referenciaPago || null,
        }).select('id').single();
        if (cobroErr) throw cobroErr;

        const aplicaciones: { cobro_id: string; venta_id: string; monto_aplicado: number }[] = [];
        if (condicionPago === 'contado') {
          aplicaciones.push({ cobro_id: cobro.id, venta_id: venta.id, monto_aplicado: totals.total });
        }
        for (const cuenta of cuentasPendientes) {
          if (cuenta.montoAplicar > 0) {
            aplicaciones.push({ cobro_id: cobro.id, venta_id: cuenta.id, monto_aplicado: cuenta.montoAplicar });
            await supabase.from('ventas').update({ saldo_pendiente: cuenta.saldo_pendiente - cuenta.montoAplicar }).eq('id', cuenta.id);
          }
        }
        if (aplicaciones.length > 0) {
          await supabase.from('cobro_aplicaciones').insert(aplicaciones);
        }
      }

      // 4. Update carga
      await updateCargaVendida(cart);

      toast.success('¡Venta registrada!');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-cuentas-pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-carga'] });
      navigate('/ruta/ventas');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  // Update cantidad_vendida in active carga
  const updateCargaVendida = async (items: CartItem[]) => {
    try {
      // Find active carga (en_ruta) for current user's vendedor
      const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
      if (!profile) return;
      const { data: cargas } = await supabase
        .from('cargas')
        .select('id')
        .eq('empresa_id', profile.empresa_id)
        .eq('status', 'en_ruta')
        .order('fecha', { ascending: false })
        .limit(1);
      if (!cargas || cargas.length === 0) return;
      const cargaId = cargas[0].id;

      // For each sold product, update cantidad_vendida
      for (const item of items) {
        const { data: cl } = await supabase
          .from('carga_lineas')
          .select('id, cantidad_vendida')
          .eq('carga_id', cargaId)
          .eq('producto_id', item.producto_id)
          .single();
        if (cl) {
          await supabase.from('carga_lineas').update({
            cantidad_vendida: (cl.cantidad_vendida ?? 0) + item.cantidad,
          }).eq('id', cl.id);
        }
      }
    } catch (e) {
      console.error('Error updating carga:', e);
    }
  };

  const currentStepIdx = STEPS.indexOf(step);

  const goBack = () => {
    if (currentStepIdx === 0) navigate('/ruta/ventas');
    else setStep(STEPS[currentStepIdx - 1]);
  };

  const goToPayment = () => {
    initCuentasPendientes();
    setStep('pago');
  };

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const cambioItems = cart.filter(c => c.es_cambio);
  const chargedItems = cart.filter(c => !c.es_cambio);

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
        <div className="flex px-3 pb-2.5 gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-[3px] w-full rounded-full transition-colors ${
                i <= currentStepIdx ? 'bg-primary' : 'bg-border'
              }`} />
              <span className={`text-[9px] font-medium transition-colors ${
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
              <input type="text" placeholder="Buscar por nombre o código..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchCliente} onChange={e => setSearchCliente(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-auto px-3 pb-4">
            <button
              onClick={() => { setClienteId(null); setClienteNombre('Público general'); setClienteCredito(null); setCondicionPago('contado'); setStep('devoluciones'); }}
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
                <button key={c.id}
                  onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setClienteCredito({ credito: c.credito ?? false, limite: c.limite_credito ?? 0, dias: c.dias_credito ?? 0 }); setCondicionPago('contado'); setStep('devoluciones'); }}
                  className={`w-full rounded-lg px-3 py-2.5 flex items-center gap-2.5 active:scale-[0.98] transition-all text-left ${clienteId === c.id ? 'bg-primary/8 ring-1.5 ring-primary/40' : 'bg-card hover:bg-accent/30'}`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${clienteId === c.id ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'}`}>
                    <span className="text-[11px] font-bold">{c.nombre.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">{c.nombre}</p>
                    {c.codigo && <p className="text-[10.5px] text-muted-foreground">{c.codigo}</p>}
                  </div>
                  {c.credito && <span className="text-[9px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded font-medium">Crédito</span>}
                  {clienteId === c.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 2: Devoluciones ─── */}
      {step === 'devoluciones' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
              <span className="text-[10px] text-muted-foreground">Cliente:</span>
              <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 pb-20 space-y-2.5">
            <div className="bg-accent/30 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[12px] font-medium text-foreground">¿Hay devoluciones?</p>
                  <p className="text-[10px] text-muted-foreground">Registra productos devueltos antes de surtir</p>
                </div>
              </div>
            </div>

            {/* Add devolucion product */}
            {!showDevSearch ? (
              <button onClick={() => setShowDevSearch(true)} className="w-full rounded-lg border border-dashed border-primary/30 py-2.5 text-[12px] text-primary font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]">
                <Plus className="h-3.5 w-3.5" /> Agregar devolución
              </button>
            ) : (
              <div className="border border-border rounded-lg p-2.5 bg-card">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                    placeholder="Buscar producto..." value={searchDevProducto} onChange={e => setSearchDevProducto(e.target.value)} autoFocus />
                </div>
                <div className="max-h-40 overflow-auto space-y-0.5">
                  {filteredDevProductos?.slice(0, 15).map(p => (
                    <button key={p.id} onClick={() => addDevolucion(p)}
                      className="w-full text-left px-2.5 py-2 rounded-md hover:bg-accent text-[12px] text-foreground truncate">
                      {p.codigo} — {p.nombre}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShowDevSearch(false); setSearchDevProducto(''); }} className="mt-1.5 text-[11px] text-muted-foreground">Cancelar</button>
              </div>
            )}

            {/* Devolucion items */}
            {devoluciones.map(d => (
              <div key={d.producto_id} className="bg-card rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{d.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{d.codigo}</p>
                  </div>
                  <button onClick={() => removeDevolucion(d.producto_id)} className="p-1"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 bg-accent/50 rounded-lg px-1">
                    <button onClick={() => updateDevQty(d.producto_id, d.cantidad - 1)} className="p-1.5"><Minus className="h-3 w-3" /></button>
                    <span className="text-[13px] font-bold w-8 text-center text-foreground">{d.cantidad}</span>
                    <button onClick={() => updateDevQty(d.producto_id, d.cantidad + 1)} className="p-1.5"><Plus className="h-3 w-3" /></button>
                  </div>
                  <select
                    value={d.motivo}
                    onChange={e => updateDevMotivo(d.producto_id, e.target.value as any)}
                    className="flex-1 bg-accent/40 rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                  >
                    {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                {d.motivo === 'cambio' && (
                  <div className="bg-accent/20 rounded-lg px-2.5 py-2">
                    {d.reemplazo_producto_id ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <ArrowRightLeft className="h-3 w-3 text-primary" />
                          <span className="text-[11px] text-foreground font-medium">{d.reemplazo_nombre}</span>
                        </div>
                        <button onClick={() => setShowReemplazoFor(d.producto_id)} className="text-[10px] text-primary font-medium">Cambiar</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowReemplazoFor(d.producto_id)} className="text-[11px] text-primary font-semibold flex items-center gap-1">
                        <ArrowRightLeft className="h-3 w-3" /> Elegir producto de reemplazo
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Reemplazo picker overlay */}
            {showReemplazoFor && (
              <div className="fixed inset-0 z-50 bg-background flex flex-col">
                <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border">
                  <div className="flex items-center gap-2 px-3 h-12">
                    <button onClick={() => { setShowReemplazoFor(null); setSearchReemplazo(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
                      <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
                    </button>
                    <span className="text-[15px] font-semibold text-foreground flex-1">Producto de reemplazo</span>
                  </div>
                </header>
                <div className="px-3 pt-2.5 pb-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input type="text" placeholder="Buscar producto..."
                      className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                      value={searchReemplazo} onChange={e => setSearchReemplazo(e.target.value)} autoFocus />
                  </div>
                </div>
                <div className="flex-1 overflow-auto px-3 space-y-[3px]">
                  {filteredReemplazoProductos?.map(p => (
                    <button key={p.id} onClick={() => setReemplazo(showReemplazoFor, p)}
                      className="w-full rounded-lg px-3 py-2.5 bg-card text-left active:scale-[0.98] transition-all">
                      <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{p.codigo} · ${fmt(p.precio_principal ?? 0)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
            <button
              onClick={processDevolucionesAndGoToProductos}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
            >
              {devoluciones.length > 0 ? `Continuar con ${devoluciones.length} devolución(es)` : 'Sin devoluciones — Continuar'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Productos ─── */}
      {step === 'productos' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
              <span className="text-[10px] text-muted-foreground">Cliente:</span>
              <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
            </div>
            {devoluciones.length > 0 && (
              <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
                <RotateCcw className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{devoluciones.length} dev.</span>
              </div>
            )}
          </div>

          <div className="px-3 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Buscar producto..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchProducto} onChange={e => setSearchProducto(e.target.value)} autoFocus />
            </div>
          </div>

          {/* Cambio items notice */}
          {cambioItems.length > 0 && (
            <div className="mx-3 mb-1.5 bg-accent/40 rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Cambios (sin cargo)</p>
              {cambioItems.map(item => (
                <div key={`cambio-${item.producto_id}`} className="flex justify-between text-[11px] py-0.5">
                  <span className="text-foreground">{item.cantidad}x {item.nombre}</span>
                  <span className="text-muted-foreground">$0.00</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
            {filteredProductos?.map(p => {
              const inCart = getItemInCart(p.id);
              const stock = p.cantidad ?? 0;
              return (
                <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${inCart ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0" onClick={() => !inCart && addToCart(p)}>
                      <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      <div className="flex items-center gap-1.5 mt-px">
                        <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={`text-[10px] font-medium ${stock > 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {stock} {(p.unidades as any)?.abreviatura || 'pz'}
                        </span>
                      </div>
                      <p className="text-[13px] font-bold text-foreground mt-px">
                        ${(p.precio_principal ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{(p.unidades as any)?.abreviatura || 'pz'}</span>
                      </p>
                    </div>
                    {inCart ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => inCart.cantidad === 1 ? removeFromCart(p.id) : updateQty(p.id, -1)}
                          className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                          {inCart.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                        </button>
                        <input type="number" inputMode="numeric"
                          className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                          value={inCart.cantidad}
                          onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val) && val > 0) setCart(prev => prev.map(c => c.producto_id === p.id && !c.es_cambio ? { ...c, cantidad: val } : c)); }}
                          onFocus={e => e.target.select()} />
                        <button onClick={() => addToCart(p)} className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
              <button onClick={() => setStep('resumen')}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20">
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4 opacity-80" />
                  <span className="text-[13px] font-medium">{totals.items} {totals.items === 1 ? 'producto' : 'productos'}</span>
                </div>
                <span className="text-[14px] font-bold">${fmt(totals.total)}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 4: Confirmar ─── */}
      {step === 'resumen' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-3 pt-2.5 pb-24 space-y-2.5">
            <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2.5">
              <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-foreground">{clienteNombre.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate">{clienteNombre}</p>
              </div>
              <button onClick={() => setStep('cliente')} className="text-[10.5px] text-primary font-medium">Cambiar</button>
            </div>

            {/* Devoluciones summary */}
            {devoluciones.length > 0 && (
              <section className="bg-card rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Devoluciones ({devoluciones.length})</p>
                  <button onClick={() => setStep('devoluciones')} className="text-[10.5px] text-primary font-medium">Editar</button>
                </div>
                {devoluciones.map(d => (
                  <div key={d.producto_id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0 text-[11px]">
                    <span className="text-foreground truncate flex-1 mr-2">{d.cantidad}x {d.nombre}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      d.motivo === 'cambio' ? 'bg-primary/10 text-primary' : 'bg-accent text-muted-foreground'
                    }`}>{MOTIVOS.find(m => m.value === d.motivo)?.label}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Cambios (free) */}
            {cambioItems.length > 0 && (
              <section className="bg-card rounded-lg p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cambios (sin cargo)</p>
                {cambioItems.map(item => (
                  <div key={`cambio-${item.producto_id}`} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                      <p className="text-[10.5px] text-muted-foreground">{item.cantidad} × $0.00</p>
                    </div>
                    <span className="text-[12.5px] font-semibold text-muted-foreground shrink-0">$0.00</span>
                  </div>
                ))}
              </section>
            )}

            {/* Charged products */}
            <section className="bg-card rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Productos ({chargedItems.length})</p>
                <button onClick={() => setStep('productos')} className="text-[10.5px] text-primary font-medium">Editar</button>
              </div>
              <div className="space-y-1">
                {chargedItems.map(item => {
                  const lineTotal = item.precio_unitario * item.cantidad;
                  return (
                    <div key={item.producto_id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                        <p className="text-[10.5px] text-muted-foreground">{item.cantidad} × ${fmt(item.precio_unitario)} / {item.unidad}</p>
                      </div>
                      <span className="text-[12.5px] font-semibold text-foreground shrink-0 tabular-nums">${fmt(lineTotal)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Totals */}
            <section className="bg-card rounded-lg p-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground tabular-nums">${fmt(totals.subtotal)}</span>
                </div>
                {totals.iva > 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted-foreground">IVA</span>
                    <span className="font-medium text-foreground tabular-nums">${fmt(totals.iva)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60">
                <span className="text-[13px] font-semibold text-foreground">Total</span>
                <span className="text-[18px] font-bold text-primary tabular-nums">${fmt(totals.total)}</span>
              </div>
            </section>

            {saldoPendienteTotal > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Cuentas pendientes: ${fmt(saldoPendienteTotal)}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">Podrás aplicar pagos en el siguiente paso</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
            <div className="flex gap-2">
              <button onClick={handleSaveOnly} disabled={saving || cart.length === 0}
                className="flex-1 bg-card border border-border text-foreground rounded-xl py-3 text-[13px] font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5">
                <Save className="h-4 w-4" /> Guardar
              </button>
              <button onClick={goToPayment} disabled={cart.length === 0}
                className="flex-[2] bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5">
                <Banknote className="h-4 w-4" /> Cobrar ${fmt(totals.total)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 5: Pago ─── */}
      {step === 'pago' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-3 pt-2.5 pb-24 space-y-2.5">
            {/* Tipo de operación */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo de operación</p>
              <div className="flex gap-1.5">
                {([['venta_directa', 'Venta directa'], ['pedido', 'Pedido']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setTipoVenta(val)}
                    className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all active:scale-95 ${tipoVenta === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {!entregaInmediata && (
                <div className="mt-2.5 rounded-md px-2.5 py-2 flex items-start gap-2 bg-accent/50">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground leading-snug mb-1.5">Fecha de entrega</p>
                    <input type="date" className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                      value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
                  </div>
                </div>
              )}
            </section>

            {/* Condición de pago */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condición de pago</p>
              <div className="flex gap-1.5">
                {([['contado', 'Contado'], ...(clienteCredito?.credito ? [['credito', 'Crédito'] as const] : []), ['por_definir', 'Por definir']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setCondicionPago(val as typeof condicionPago)}
                    className={`flex-1 py-2 rounded-md text-[12px] font-semibold transition-all active:scale-95 ${condicionPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {condicionPago === 'credito' && clienteCredito && (
                <div className={`mt-2.5 rounded-md px-2.5 py-2 text-[11px] space-y-1 ${excedeCredito ? 'bg-destructive/8' : 'bg-accent/50'}`}>
                  <div className="flex justify-between"><span className="text-muted-foreground">Límite</span><span className="font-medium text-foreground">${fmt(clienteCredito.limite)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendiente</span><span className="font-medium text-foreground">${fmt(saldoPendienteTotal)}</span></div>
                  <div className="flex justify-between border-t border-border/40 pt-1"><span className="text-muted-foreground">Disponible</span><span className={`font-bold ${excedeCredito ? 'text-destructive' : 'text-green-600'}`}>${fmt(creditoDisponible)}</span></div>
                  {excedeCredito && <p className="text-[10px] text-destructive font-medium mt-1">⚠ El total excede el crédito disponible</p>}
                </div>
              )}
            </section>

            {/* Past pending accounts */}
            {cuentasPendientes.length > 0 && (
              <section className="bg-card rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cuentas pendientes ({cuentasPendientes.length})</p>
                  <button onClick={liquidarTodas} className="text-[10.5px] text-primary font-semibold">Liquidar todas</button>
                </div>
                <div className="space-y-1.5">
                  {cuentasPendientes.map(cuenta => (
                    <div key={cuenta.id} className="rounded-md border border-border/60 p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div><span className="text-[11px] font-semibold text-foreground">{cuenta.folio ?? '—'}</span><span className="text-[10px] text-muted-foreground ml-2">{cuenta.fecha}</span></div>
                        <span className="text-[11px] font-medium text-destructive">Debe: ${fmt(cuenta.saldo_pendiente)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateCuentaMonto(cuenta.id, cuenta.saldo_pendiente)}
                          className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${cuenta.montoAplicar === cuenta.saldo_pendiente ? 'bg-primary text-primary-foreground' : 'bg-accent/60 text-foreground'}`}>Liquidar</button>
                        <div className="flex-1 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                          <input type="number" inputMode="decimal"
                            className="w-full bg-accent/40 rounded-md pl-5 pr-2 py-1.5 text-[12px] text-foreground font-medium focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={cuenta.montoAplicar || ''} placeholder="0.00" onChange={e => updateCuentaMonto(cuenta.id, parseFloat(e.target.value) || 0)} />
                        </div>
                        {cuenta.montoAplicar > 0 && <button onClick={() => updateCuentaMonto(cuenta.id, 0)} className="text-[10px] text-destructive font-medium">Quitar</button>}
                      </div>
                    </div>
                  ))}
                </div>
                {totalAplicarCuentas > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 flex justify-between">
                    <span className="text-[11px] text-muted-foreground">Total a cuentas anteriores</span>
                    <span className="text-[12px] font-bold text-foreground">${fmt(totalAplicarCuentas)}</span>
                  </div>
                )}
              </section>
            )}

            {/* Payment method */}
            {totalACobrar > 0 && (
              <section className="bg-card rounded-lg p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de pago</p>
                <div className="flex gap-1.5">
                  {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Banknote], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
                    <button key={val} onClick={() => setMetodoPago(val as typeof metodoPago)}
                      className={`flex-1 py-2.5 rounded-md text-[11px] font-semibold transition-all active:scale-95 flex flex-col items-center gap-1 ${metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>
                      <Icon className="h-4 w-4" />{label}
                    </button>
                  ))}
                </div>
                {metodoPago === 'efectivo' && (
                  <div className="mt-2.5 space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-medium">Monto recibido</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">$</span>
                      <input type="number" inputMode="decimal"
                        className="w-full bg-accent/40 rounded-lg pl-7 pr-3 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={montoRecibido} placeholder={fmt(totalACobrar)} onChange={e => setMontoRecibido(e.target.value)} />
                    </div>
                    {cambio > 0 && (
                      <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded-md px-2.5 py-2">
                        <span className="text-[12px] text-green-700 dark:text-green-400 font-medium">Cambio</span>
                        <span className="text-[14px] text-green-700 dark:text-green-400 font-bold">${fmt(cambio)}</span>
                      </div>
                    )}
                  </div>
                )}
                {metodoPago !== 'efectivo' && (
                  <div className="mt-2.5">
                    <label className="text-[10px] text-muted-foreground font-medium">Referencia (opcional)</label>
                    <input type="text" className="w-full mt-1 bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                      value={referenciaPago} placeholder="No. de referencia o autorización" onChange={e => setReferenciaPago(e.target.value)} />
                  </div>
                )}
              </section>
            )}

            {/* Notas */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
              <textarea className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
                rows={2} placeholder="Instrucciones o comentarios..." value={notas} onChange={e => setNotas(e.target.value)} />
            </section>

            {/* Grand total */}
            <section className="bg-card rounded-lg p-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Venta actual</span><span className="font-medium text-foreground tabular-nums">${fmt(totals.total)}</span></div>
                {condicionPago === 'credito' && <div className="flex justify-between text-[11px]"><span className="text-muted-foreground italic">→ Se deja a crédito</span><span className="text-muted-foreground italic">$0.00 hoy</span></div>}
                {totalAplicarCuentas > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Cuentas anteriores</span><span className="font-medium text-foreground tabular-nums">${fmt(totalAplicarCuentas)}</span></div>}
              </div>
              {totalACobrar > 0 && (
                <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60">
                  <span className="text-[13px] font-semibold text-foreground">Total a cobrar</span>
                  <span className="text-[20px] font-bold text-primary tabular-nums">${fmt(totalACobrar)}</span>
                </div>
              )}
              {totalACobrar === 0 && condicionPago === 'credito' && (
                <div className="mt-2 pt-2 border-t border-border/60">
                  <p className="text-[12px] text-muted-foreground text-center">No hay cobro por ahora — se registra a crédito</p>
                </div>
              )}
            </section>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
            <button onClick={handleSave} disabled={saving || cart.length === 0 || excedeCredito}
              className="w-full bg-green-600 text-white rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-green-600/20 flex items-center justify-center gap-1.5">
              <Check className="h-4 w-4" />
              {saving ? 'Guardando...' : totalACobrar > 0 ? `Confirmar y cobrar $${fmt(totalACobrar)}` : 'Confirmar venta a crédito'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
