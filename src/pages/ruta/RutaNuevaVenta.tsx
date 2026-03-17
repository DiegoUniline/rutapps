import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, Check, Package, ChevronRight, CalendarDays, Banknote, CreditCard, Wallet, Receipt, Save, RotateCcw, ArrowRightLeft, Tag, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

import { queueOperation } from '@/lib/syncQueue';
import { getOfflineTable } from '@/lib/offlineDb';
import TicketVenta from '@/components/ruta/TicketVenta';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { toast } from 'sonner';
import { usePromocionesActivas, evaluatePromociones, type CartItemForPromo, type PromoResult } from '@/hooks/usePromociones';

interface CartItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  unidad: string;
  unidad_id?: string;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
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

type Step = 'tipo' | 'cliente' | 'devoluciones' | 'productos' | 'resumen' | 'pago';

const STEP_LABELS: Record<Step, string> = {
  tipo: 'Tipo',
  cliente: 'Cliente',
  devoluciones: 'Devol.',
  productos: 'Pedido',
  resumen: 'Confirmar',
  pago: 'Pago',
};

const STEPS: Step[] = ['tipo', 'cliente', 'devoluciones', 'productos', 'resumen', 'pago'];

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
  const { empresa, user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('tipo');
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
  const [sinCompra, setSinCompra] = useState(false);
  const [motivoSinCompra, setMotivoSinCompra] = useState('');
  const [savingSinCompra, setSavingSinCompra] = useState(false);

  // Visited localStorage helpers (shared with RutaClientes)
  const VISITED_KEY = `rutapp_visited_${new Date().toISOString().slice(0, 10)}`;
  const markVisited = (cId: string) => {
    try {
      const raw = localStorage.getItem(VISITED_KEY);
      const set = raw ? new Set(JSON.parse(raw)) : new Set();
      set.add(cId);
      localStorage.setItem(VISITED_KEY, JSON.stringify([...set]));
    } catch {}
  };

  // Capture current GPS (best-effort, non-blocking)
  const captureGps = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
      );
    });

  // Save a visita record (GPS + fecha + usuario + tipo)
  const saveVisita = async (tipo: string, opts?: { ventaId?: string; motivo?: string; notasVisita?: string }) => {
    if (!empresa || !user) return;
    const cId = clienteId || urlClienteId;
    const gps = await captureGps();
    await queueOperation('visitas', 'insert', {
      id: crypto.randomUUID(),
      empresa_id: empresa.id,
      cliente_id: cId,
      user_id: user.id,
      tipo,
      motivo: opts?.motivo || null,
      notas: opts?.notasVisita || null,
      gps_lat: gps?.lat ?? null,
      gps_lng: gps?.lng ?? null,
      venta_id: opts?.ventaId || null,
      fecha: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  };

  const entregaInmediata = tipoVenta === 'venta_directa';

  // Load carga data for stock-aboard (venta directa)
  const { data: cargasRaw } = useOfflineQuery('cargas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'fecha', ascending: false });
  const activeCarga = useMemo(() => {
    if (!cargasRaw || !profile) return null;
    const vendId = profile.vendedor_id || profile.id;
    return cargasRaw.find((c: any) => c.vendedor_id === vendId && ['pendiente', 'en_ruta'].includes(c.status)) ?? null;
  }, [cargasRaw, profile]);

  const { data: cargaLineasRaw } = useOfflineQuery('carga_lineas', { carga_id: activeCarga?.id }, { enabled: !!activeCarga?.id });

  // Map producto_id → stock aboard (cargada - vendida - devuelta)
  const stockAbordo = useMemo(() => {
    const map = new Map<string, number>();
    if (!cargaLineasRaw) return map;
    (cargaLineasRaw as any[]).forEach(l => {
      const disponible = (l.cantidad_cargada ?? 0) - (l.cantidad_vendida ?? 0) - (l.cantidad_devuelta ?? 0);
      map.set(l.producto_id, Math.max(0, disponible));
    });
    return map;
  }, [cargaLineasRaw]);

  // Promotions engine
  const { data: promocionesActivas } = usePromocionesActivas();

  const { data: clientes } = useOfflineQuery('clientes', {
    empresa_id: empresa?.id,
    status: 'activo',
  }, { enabled: !!empresa?.id, orderBy: 'nombre' });

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

  // Offline-compatible: filter ventas from local cache for cuentas pendientes
  const { data: allVentas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const ventasPendientes = useMemo(() => {
    if (!allVentas || !clienteId) return [];
    return (allVentas as any[])
      .filter(v =>
        v.cliente_id === clienteId &&
        v.condicion_pago === 'credito' &&
        (v.saldo_pendiente ?? 0) > 0 &&
        ['confirmado', 'entregado', 'facturado'].includes(v.status)
      )
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [allVentas, clienteId]);

  const saldoPendienteTotal = useMemo(() =>
    (ventasPendientes ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0),
    [ventasPendientes]
  );

  const { data: productos } = useOfflineQuery('productos', {
    empresa_id: empresa?.id,
    se_puede_vender: true,
    status: 'activo',
  }, { enabled: !!empresa?.id, orderBy: 'nombre' });

  // Pedido sugerido for selected client (offline-compatible)
  const { data: pedidoSugeridoRaw } = useOfflineQuery('cliente_pedido_sugerido', { cliente_id: clienteId }, { enabled: !!clienteId });
  const pedidoSugerido = useMemo(() => {
    if (!pedidoSugeridoRaw || !productos) return [];
    return (pedidoSugeridoRaw as any[]).map(ps => {
      const prod = productos.find((p: any) => p.id === ps.producto_id);
      return prod ? { ...ps, productos: prod } : null;
    }).filter(Boolean);
  }, [pedidoSugeridoRaw, productos]);

  const filteredClientes = clientes?.filter(c =>
    !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.codigo?.toLowerCase().includes(searchCliente.toLowerCase())
  );

  // For venta_directa: only products in carga with stock > 0
  // For pedido: all products
  const productosDisponibles = useMemo(() => {
    if (!productos) return [];
    if (tipoVenta === 'pedido') return productos;
    // Venta directa: only products in active carga with available stock
    return productos.filter(p => (stockAbordo.get(p.id) ?? 0) > 0);
  }, [productos, tipoVenta, stockAbordo]);

  const filteredProductos = productosDisponibles?.filter(p =>
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
      unidad_id: ps.productos.unidad_venta_id ?? undefined,
      tiene_iva: ps.productos.tiene_iva ?? false,
      iva_pct: ps.productos.tiene_iva ? ((ps.productos.tasas_iva as any)?.porcentaje ?? ps.productos.iva_pct ?? 16) : 0,
      tiene_ieps: ps.productos.tiene_ieps ?? false,
      ieps_pct: ps.productos.tiene_ieps ? ((ps.productos.tasas_ieps as any)?.porcentaje ?? ps.productos.ieps_pct ?? 0) : 0,
    }));
    setCart(newCart);
  };

  const getMaxQty = (productoId: string) => {
    if (tipoVenta === 'pedido') return Infinity;
    return stockAbordo.get(productoId) ?? 0;
  };

  const addToCart = (p: any, esCambio = false) => {
    const maxQty = esCambio ? Infinity : getMaxQty(p.id);
    const existing = cart.find(c => c.producto_id === p.id && c.es_cambio === esCambio);
    if (existing) {
      const newQty = Math.min(existing.cantidad + 1, maxQty);
      if (newQty <= existing.cantidad) { toast.error('Stock a bordo insuficiente'); return; }
      setCart(cart.map(c => c.producto_id === p.id && c.es_cambio === esCambio ? { ...c, cantidad: newQty } : c));
    } else {
      if (maxQty < 1) { toast.error('Sin stock a bordo'); return; }
      setCart([...cart, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_unitario: esCambio ? 0 : (p.precio_principal ?? 0),
        cantidad: 1,
        unidad: p.unidad_venta_id ? ((productos?.find(pr => pr.id === p.id) as any)?.abreviatura || 'pz') : 'pz',
        unidad_id: p.unidad_venta_id ?? undefined,
        tiene_iva: esCambio ? false : (p.tiene_iva ?? false),
        iva_pct: esCambio ? 0 : (p.tiene_iva ? (p.iva_pct ?? 16) : 0),
        tiene_ieps: esCambio ? false : (p.tiene_ieps ?? false),
        ieps_pct: esCambio ? 0 : (p.tiene_ieps ? (p.ieps_pct ?? 0) : 0),
        es_cambio: esCambio,
      }]);
    }
  };

  const updateQty = (productoId: string, delta: number, esCambio?: boolean) => {
    setCart(prev => prev.map(c => {
      if (c.producto_id !== productoId || c.es_cambio !== esCambio) return c;
      const newQty = c.cantidad + delta;
      const maxQty = esCambio ? Infinity : getMaxQty(productoId);
      if (newQty > maxQty) return c;
      return newQty > 0 ? { ...c, cantidad: newQty } : c;
    }));
  };

  const removeFromCart = (productoId: string, esCambio?: boolean) => {
    setCart(prev => prev.filter(c => !(c.producto_id === productoId && c.es_cambio === esCambio)));
  };

  const getItemInCart = (productoId: string) => cart.find(c => c.producto_id === productoId && !c.es_cambio);

  // Devolucion helpers
  const addDevolucion = (p: any) => {
    if (devoluciones.find(d => d.producto_id === p.id)) {
      updateDevQty(p.id, (devoluciones.find(d => d.producto_id === p.id)?.cantidad ?? 0) + 1);
      return;
    }
    setDevoluciones(prev => [...prev, {
      producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1, motivo: 'no_vendido',
    }]);
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
        unidad_id: ps.productos.unidad_venta_id ?? undefined,
        tiene_iva: ps.productos.tiene_iva ?? false,
        iva_pct: ps.productos.tiene_iva ? ((ps.productos.tasas_iva as any)?.porcentaje ?? ps.productos.iva_pct ?? 16) : 0,
        tiene_ieps: ps.productos.tiene_ieps ?? false,
        ieps_pct: ps.productos.tiene_ieps ? ((ps.productos.tasas_ieps as any)?.porcentaje ?? ps.productos.ieps_pct ?? 0) : 0,
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
            unidad: 'pz',
            tiene_iva: false, iva_pct: 0, tiene_ieps: false, ieps_pct: 0, es_cambio: true,
          });
        }
      }
    });

    setCart(newCart);
    setStep('productos');
  };

  // Evaluate promotions
  const selectedCliente = clientes?.find(c => c.id === clienteId);
  const promoResults = useMemo(() => {
    if (!promocionesActivas || cart.length === 0) return [] as PromoResult[];
    const cartForPromo: CartItemForPromo[] = cart.filter(c => !c.es_cambio).map(c => ({
      producto_id: c.producto_id,
      precio_unitario: c.precio_unitario,
      cantidad: c.cantidad,
    }));
    return evaluatePromociones(
      promocionesActivas,
      cartForPromo,
      clienteId || undefined,
      (selectedCliente as any)?.zona_id || undefined,
    );
  }, [promocionesActivas, cart, clienteId, selectedCliente]);

  const totalDescuentoPromos = useMemo(() =>
    promoResults.reduce((s, r) => s + r.descuento, 0), [promoResults]);

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, items = 0;
    cart.forEach(item => {
      if (item.es_cambio) { items += item.cantidad; return; }
      const lineaSub = item.precio_unitario * item.cantidad;
      subtotal += lineaSub;
      const lineIeps = item.tiene_ieps ? lineaSub * (item.ieps_pct / 100) : 0;
      ieps += lineIeps;
      if (item.tiene_iva) iva += (lineaSub + lineIeps) * (item.iva_pct / 100);
      items += item.cantidad;
    });
    const totalBeforeDiscount = subtotal + ieps + iva;
    const total = Math.max(0, totalBeforeDiscount - totalDescuentoPromos);
    return { subtotal, iva, ieps, total, items, descuento: totalDescuentoPromos };
  }, [cart, totalDescuentoPromos]);

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

  // Unified save handler — applies payment if totalACobrar > 0
  const handleSave = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      const ventaId = crypto.randomUUID();

      // Generate local folio based on existing local ventas
      let localFolio = '';
      try {
        const ventasTable = getOfflineTable('ventas');
        if (ventasTable) {
          const allVentas = await ventasTable.toArray();
          const prefix = tipoVenta === 'pedido' ? 'PED' : 'VTA';
          const empresaVentas = allVentas.filter((v: any) => v.empresa_id === empresa.id);
          let maxNum = 0;
          for (const v of empresaVentas) {
            const f = v.folio ?? '';
            const match = f.match(new RegExp(`^${prefix}-(\\d+)$`));
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
          localFolio = `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
        }
      } catch { /* fallback below */ }
      if (!localFolio) {
        localFolio = `${tipoVenta === 'pedido' ? 'PED' : 'VTA'}-${ventaId.slice(0, 6).toUpperCase()}`;
      }

      // 1. Save devoluciones if any
      if (devoluciones.length > 0 && clienteId) {
        const devId = crypto.randomUUID();
        await queueOperation('devoluciones', 'insert', {
          id: devId, empresa_id: empresa.id, user_id: user.id,
          cliente_id: clienteId, tipo: 'tienda', fecha: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
        });
        for (const d of devoluciones) {
          await queueOperation('devolucion_lineas', 'insert', {
            id: crypto.randomUUID(), devolucion_id: devId,
            producto_id: d.producto_id, cantidad: d.cantidad, motivo: d.motivo,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Determine if payment is being applied
      const applyPayment = totalACobrar > 0;
      const saldoPendienteVenta = applyPayment && condicionPago === 'contado' ? 0 : totals.total;

      // 2. Create the sale
      const saveCliente = clientes?.find(c => c.id === clienteId);
      const tarifaId = saveCliente?.tarifa_id || null;
      const almacenId = profile?.almacen_id || null;
      await queueOperation('ventas', 'insert', {
        id: ventaId, empresa_id: empresa.id, cliente_id: clienteId, tipo: tipoVenta,
        vendedor_id: profile?.vendedor_id || profile?.id || null,
        condicion_pago: condicionPago, entrega_inmediata: entregaInmediata,
        fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null,
        status: 'confirmado', notas: notas || null,
        folio: localFolio,
        tarifa_id: tarifaId, almacen_id: almacenId,
        subtotal: totals.subtotal, iva_total: totals.iva, ieps_total: totals.ieps,
        descuento_total: totals.descuento, total: totals.total,
        saldo_pendiente: saldoPendienteVenta,
        fecha: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });

      // 3. Insert lines
      for (const item of cart) {
        const lineSub = item.precio_unitario * item.cantidad;
        const lineIeps = item.tiene_ieps ? lineSub * (item.ieps_pct / 100) : 0;
        const lineIva = item.tiene_iva ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0;
        await queueOperation('venta_lineas', 'insert', {
          id: crypto.randomUUID(), venta_id: ventaId, producto_id: item.producto_id,
          descripcion: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario,
          unidad_id: item.unidad_id || null,
          subtotal: lineSub,
          iva_pct: item.iva_pct, iva_monto: lineIva,
          ieps_pct: item.ieps_pct, ieps_monto: lineIeps, descuento_pct: 0,
          total: lineSub + lineIeps + lineIva,
          notas: item.es_cambio ? 'CAMBIO - Sin cargo' : null,
          created_at: new Date().toISOString(),
        });
      }

      // 4. Cobro — only if there's something to collect
      if (applyPayment && clienteId) {
        const cobroId = crypto.randomUUID();
        await queueOperation('cobros', 'insert', {
          id: cobroId, empresa_id: empresa.id, cliente_id: clienteId, user_id: user.id,
          monto: totalACobrar, metodo_pago: metodoPago, referencia: referenciaPago || null,
          fecha: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
        });

        const aplicaciones: { cobro_id: string; venta_id: string; monto_aplicado: number }[] = [];
        if (condicionPago === 'contado') {
          aplicaciones.push({ cobro_id: cobroId, venta_id: ventaId, monto_aplicado: totals.total });
        }
        for (const cuenta of cuentasPendientes) {
          if (cuenta.montoAplicar > 0) {
            aplicaciones.push({ cobro_id: cobroId, venta_id: cuenta.id, monto_aplicado: cuenta.montoAplicar });
            await queueOperation('ventas', 'update', {
              id: cuenta.id, saldo_pendiente: cuenta.saldo_pendiente - cuenta.montoAplicar,
            });
          }
        }
        for (const app of aplicaciones) {
          await queueOperation('cobro_aplicaciones', 'insert', {
            id: crypto.randomUUID(), ...app,
            created_at: new Date().toISOString(),
          });
        }
      }

      // 5. Update carga
      await updateCargaVendidaOffline(cart);

      // 6. Save visita record with GPS
      await saveVisita(tipoVenta === 'pedido' ? 'pedido' : 'venta', { ventaId });

      // Mark client as visited
      if (clienteId) markVisited(clienteId);
      toast.success('¡Venta registrada! Se sincronizará automáticamente');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-cuentas-pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-carga'] });
      setTicketInfo({ folio: ventaId.slice(0, 8).toUpperCase(), fecha: new Date().toLocaleDateString('es-MX') });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  // Update cantidad_vendida in active carga (offline-safe)
  const updateCargaVendidaOffline = async (items: CartItem[]) => {
    try {
      const cargasTable = getOfflineTable('cargas');
      const cargaLineasTable = getOfflineTable('carga_lineas');
      if (!cargasTable || !cargaLineasTable) return;

      // Find active carga from local DB
      const allCargas = await cargasTable.toArray();
      const activeCarga = allCargas
        .filter((c: any) => c.empresa_id === empresa?.id && c.status === 'en_ruta')
        .sort((a: any, b: any) => (b.fecha > a.fecha ? 1 : -1))[0];
      if (!activeCarga) return;

      const allLineas = await cargaLineasTable.toArray();
      
      for (const item of items) {
        const cl = allLineas.find((l: any) => l.carga_id === activeCarga.id && l.producto_id === item.producto_id);
        if (cl) {
          await queueOperation('carga_lineas', 'update', {
            id: cl.id, carga_id: cl.carga_id, producto_id: cl.producto_id,
            cantidad_cargada: cl.cantidad_cargada,
            cantidad_vendida: (cl.cantidad_vendida ?? 0) + item.cantidad,
            cantidad_devuelta: cl.cantidad_devuelta ?? 0,
          });
        }
      }
    } catch (e) {
      console.error('Error updating carga offline:', e);
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

  // Show ticket after save
  if (ticketInfo) {
    return (
      <TicketVenta
        empresa={{ nombre: empresa?.nombre ?? '', telefono: empresa?.telefono, direccion: empresa?.direccion, logo_url: empresa?.logo_url, rfc: empresa?.rfc }}
        folio={ticketInfo.folio}
        fecha={ticketInfo.fecha}
        clienteNombre={clienteNombre}
        lineas={cart.map(item => {
          const lineSub = item.precio_unitario * item.cantidad;
          const lineIeps = item.tiene_ieps ? lineSub * (item.ieps_pct / 100) : 0;
          const lineIva = item.tiene_iva ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0;
          return {
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: item.precio_unitario,
            subtotal: lineSub,
            iva_monto: lineIva,
            ieps_monto: lineIeps,
            descuento_pct: 0,
            total: lineSub + lineIeps + lineIva,
            esCambio: item.es_cambio,
          };
        })}
        subtotal={totals.subtotal}
        iva={totals.iva}
        ieps={totals.ieps}
        total={totals.total}
        condicionPago={condicionPago}
        metodoPago={metodoPago}
        montoRecibido={montoRecibidoNum}
        cambio={cambio}
        saldoAnterior={saldoPendienteTotal}
        pagoAplicado={totalAplicarCuentas}
        saldoNuevo={
          saldoPendienteTotal - totalAplicarCuentas + (condicionPago === 'credito' ? totals.total : 0)
        }
        onClose={() => navigate('/ruta')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
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

      {/* ─── STEP 0: Tipo ─── */}
      {step === 'tipo' && !sinCompra && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="text-center">
            <h2 className="text-[18px] font-bold text-foreground mb-1">¿Qué tipo de operación?</h2>
            <p className="text-[12px] text-muted-foreground">Elige antes de continuar</p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={() => { setTipoVenta('venta_directa'); setStep(urlClienteId ? 'devoluciones' : 'cliente'); }}
              className="w-full rounded-xl border-2 border-primary bg-primary/5 p-4 text-left active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Venta inmediata</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Entrega ahora · Solo productos con stock a bordo</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setTipoVenta('pedido'); setCondicionPago('por_definir'); setStep(urlClienteId ? 'devoluciones' : 'cliente'); }}
              className="w-full rounded-xl border-2 border-border bg-card p-4 text-left active:scale-[0.98] transition-all hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Pedido</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Se entrega después · Todos los productos disponibles</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setSinCompra(true)}
              className="w-full rounded-xl border-2 border-border bg-card p-4 text-left active:scale-[0.98] transition-all hover:border-muted-foreground/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Sin compra</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Se visitó pero no compró · Registrar motivo</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ─── Sin compra motivo ─── */}
      {step === 'tipo' && sinCompra && (
        <div className="flex-1 flex flex-col px-6 pt-8 gap-5">
          <div className="text-center">
            <h2 className="text-[18px] font-bold text-foreground mb-1">¿Por qué no compró?</h2>
            <p className="text-[12px] text-muted-foreground">{clienteNombre || 'Cliente'}</p>
          </div>
          <div className="w-full max-w-xs mx-auto space-y-2">
            {['No necesita producto', 'No hay stock de lo que pide', 'Cerrado / no encontrado', 'Sin dinero', 'Precio alto', 'Otro'].map(m => (
              <button key={m} onClick={() => setMotivoSinCompra(m)}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-[13px] font-medium active:scale-[0.98] transition-all ${
                  motivoSinCompra === m ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-foreground hover:border-primary/30'
                }`}>
                {m}
              </button>
            ))}
          </div>
          {motivoSinCompra === 'Otro' && (
            <div className="w-full max-w-xs mx-auto">
              <textarea
                className="w-full bg-accent/40 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
                rows={2} placeholder="Describe el motivo..." value={notas} onChange={e => setNotas(e.target.value)} autoFocus
              />
            </div>
          )}
          <div className="w-full max-w-xs mx-auto flex gap-2 mt-2">
            <button onClick={() => { setSinCompra(false); setMotivoSinCompra(''); }}
              className="flex-1 bg-card border border-destructive/30 text-destructive rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] transition-transform">
              Cancelar
            </button>
            <button
              disabled={!motivoSinCompra || savingSinCompra}
              onClick={async () => {
                setSavingSinCompra(true);
                try {
                  const cId = clienteId || urlClienteId;
                  // Save visita record with GPS + motivo
                  await saveVisita('sin_compra', {
                    motivo: motivoSinCompra,
                    notasVisita: motivoSinCompra === 'Otro' ? notas : undefined,
                  });
                  if (cId) markVisited(cId);
                  toast.success('Visita registrada sin compra');
                  navigate(-1);
                } catch { toast.error('Error al registrar'); } finally { setSavingSinCompra(false); }
              }}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20">
              {savingSinCompra ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

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

          <div className="px-3 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Buscar producto..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchDevProducto} onChange={e => setSearchDevProducto(e.target.value)} />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
            {filteredDevProductos?.map(p => {
              const dev = devoluciones.find(d => d.producto_id === p.id);
              const qty = dev?.cantidad ?? 0;
              return (
                <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${qty > 0 ? 'bg-destructive/[0.04] ring-1 ring-destructive/20' : 'bg-card'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0" onClick={() => !dev && addDevolucion(p)}>
                      <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                    </div>
                    {qty > 0 ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => updateDevQty(p.id, qty - 1)}
                          className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                          {qty === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                        </button>
                        <input type="number" inputMode="numeric"
                          className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                          value={qty}
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) updateDevQty(p.id, val);
                          }}
                          onFocus={e => e.target.select()} />
                        <button onClick={() => updateDevQty(p.id, qty + 1)}
                          className="w-7 h-7 rounded-md bg-destructive/80 text-destructive-foreground flex items-center justify-center active:scale-90 transition-transform">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addDevolucion(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-destructive/10 flex items-center justify-center text-destructive active:scale-90 transition-all shrink-0">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Motivo selector inline */}
                  {qty > 0 && dev && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={dev.motivo}
                        onChange={e => updateDevMotivo(p.id, e.target.value as any)}
                        className="flex-1 bg-accent/40 rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                      >
                        {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      {dev.motivo === 'cambio' && (
                        <button onClick={() => setShowReemplazoFor(p.id)} className="text-[10px] text-primary font-semibold flex items-center gap-0.5 shrink-0">
                          <ArrowRightLeft className="h-3 w-3" />
                          {dev.reemplazo_nombre ? dev.reemplazo_nombre : 'Reemplazo'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reemplazo picker overlay */}
          {showReemplazoFor && (
            <div className="fixed inset-0 z-50 bg-background flex flex-col">
              <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
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
              const maxQty = getMaxQty(p.id);
              const stockLabel = tipoVenta === 'venta_directa'
                ? `${maxQty} a bordo`
                : `${p.cantidad ?? 0} en almacén`;
              const stockOk = tipoVenta === 'pedido' || maxQty > 0;
              const atMax = inCart && tipoVenta === 'venta_directa' && inCart.cantidad >= maxQty;
              return (
                <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${inCart ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0" onClick={() => !inCart && stockOk && addToCart(p)}>
                      <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                      <div className="flex items-center gap-1.5 mt-px">
                        <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={`text-[10px] font-medium ${stockOk ? 'text-green-600' : 'text-destructive'}`}>
                          {stockLabel}
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
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              const capped = tipoVenta === 'venta_directa' ? Math.min(val, maxQty) : val;
                              setCart(prev => prev.map(c => c.producto_id === p.id && !c.es_cambio ? { ...c, cantidad: capped } : c));
                            }
                          }}
                          onFocus={e => e.target.select()} />
                        <button onClick={() => addToCart(p)} disabled={!!atMax}
                          className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-90 transition-transform ${atMax ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all shrink-0">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {atMax && (
                    <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">Máximo a bordo alcanzado</p>
                  )}
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

            {/* Promotions applied */}
            {promoResults.length > 0 && (
              <section className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Promociones aplicadas
                </p>
                {promoResults.map((r, i) => (
                  <div key={i} className="flex justify-between text-[11px] py-0.5">
                    <span className="text-emerald-700 dark:text-emerald-300 truncate flex-1 mr-2">{r.descripcion}</span>
                    {r.descuento > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">-${fmt(r.descuento)}</span>}
                    {r.cantidad_gratis && r.cantidad_gratis > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">{r.cantidad_gratis}x gratis</span>}
                  </div>
                ))}
              </section>
            )}

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
                {totals.descuento > 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Tag className="h-3 w-3" /> Promociones</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">-${fmt(totals.descuento)}</span>
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
              <button onClick={() => navigate(-1)}
                className="flex-1 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] transition-transform">
                Cancelar
              </button>
              <button onClick={goToPayment} disabled={cart.length === 0}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5">
                <Check className="h-4 w-4" /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 5: Pago ─── */}
      {step === 'pago' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-3 pt-2.5 pb-24 space-y-2.5">
            {/* Tipo de operación (read-only, selected in step 1) */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tipo de operación</p>
              <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-md px-3 py-1.5 text-[12px] font-semibold">
                {tipoVenta === 'venta_directa' ? <ShoppingCart className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                {tipoVenta === 'venta_directa' ? 'Venta inmediata' : 'Pedido'}
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

            {/* Payment method — always visible for advance payments or past debt */}
            <section className="bg-card rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recibir pago</p>
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
                {condicionPago === 'por_definir' && <div className="flex justify-between text-[11px]"><span className="text-muted-foreground italic">→ Pago por definir</span><span className="text-muted-foreground italic">$0.00 hoy</span></div>}
                {totalAplicarCuentas > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Cuentas anteriores</span><span className="font-medium text-foreground tabular-nums">${fmt(totalAplicarCuentas)}</span></div>}
              </div>
              {totalACobrar > 0 && (
                <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-border/60">
                  <span className="text-[13px] font-semibold text-foreground">Total a cobrar</span>
                  <span className="text-[20px] font-bold text-primary tabular-nums">${fmt(totalACobrar)}</span>
                </div>
              )}
              {totalACobrar === 0 && (condicionPago === 'credito' || condicionPago === 'por_definir') && (
                <div className="mt-2 pt-2 border-t border-border/60">
                  <p className="text-[12px] text-muted-foreground text-center">
                    {condicionPago === 'credito' ? 'No hay cobro por ahora — se registra a crédito' : 'No hay cobro por ahora — pago por definir'}
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
            <div className="flex gap-2">
              <button onClick={() => navigate(-1)}
                className="flex-1 bg-card border border-destructive/30 text-destructive rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || cart.length === 0 || excedeCredito}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
