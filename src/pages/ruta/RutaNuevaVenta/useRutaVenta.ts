import { useState, useMemo, useEffect } from 'react';
import { todayInTimezone , todayLocal } from '@/lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { queueOperation } from '@/lib/syncQueue';
import { getOfflineTable } from '@/lib/offlineDb';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { resolveProductPrice, type TarifaLineaRule } from '@/lib/priceResolver';
import { toast } from 'sonner';
import { usePromocionesActivas, evaluatePromociones, type CartItemForPromo, type PromoResult } from '@/hooks/usePromociones';
import type { CartItem, DevolucionItem, CuentaPendiente, Step, PagoLinea } from './types';
import { locationService } from '@/lib/locationService';
import { useCurrency } from '@/hooks/useCurrency';
import { STEPS } from './types';

export function useRutaVenta() {
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
  const [pagos, setPagos] = useState<PagoLinea[]>([]);
  const [cuentasPendientes, setCuentasPendientes] = useState<CuentaPendiente[]>([]);
  const [showDevSearch, setShowDevSearch] = useState(false);
  const [showReemplazoFor, setShowReemplazoFor] = useState<string | null>(null);
  const [searchReemplazo, setSearchReemplazo] = useState('');
  const [ticketInfo, setTicketInfo] = useState<{ folio: string; fecha: string } | null>(null);
  const [sinCompra, setSinCompra] = useState(false);
  const [sinImpuestos, setSinImpuestos] = useState(false);
  const [motivoSinCompra, setMotivoSinCompra] = useState('');
  const [savingSinCompra, setSavingSinCompra] = useState(false);

  const VISITED_KEY = `rutapp_visited_${todayLocal()}`;
  const markVisited = (cId: string) => {
    try {
      const raw = localStorage.getItem(VISITED_KEY);
      const set = raw ? new Set(JSON.parse(raw)) : new Set();
      set.add(cId);
      localStorage.setItem(VISITED_KEY, JSON.stringify([...set]));
    } catch {}
  };

  const captureGps = (): { lat: number; lng: number } | null => {
    return locationService.getLastKnownLocation();
  };

  const saveVisita = async (tipo: string, opts?: { ventaId?: string; motivo?: string; notasVisita?: string }) => {
    if (!empresa || !user) return;
    const cId = clienteId || urlClienteId;
    const gps = await captureGps();
    await queueOperation('visitas', 'insert', {
      id: crypto.randomUUID(), empresa_id: empresa.id, cliente_id: cId, user_id: user.id, tipo,
      motivo: opts?.motivo || null, notas: opts?.notasVisita || null,
      gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
      venta_id: opts?.ventaId || null, fecha: new Date().toISOString(), created_at: new Date().toISOString(),
    });
  };

  const entregaInmediata = tipoVenta === 'venta_directa';

  const { data: cargasRaw } = useOfflineQuery('cargas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'fecha', ascending: false });
  const activeCarga = useMemo(() => {
    if (!cargasRaw || !profile) return null;
    const vendId = profile.vendedor_id || profile.id;
    return cargasRaw.find((c: any) => c.vendedor_id === vendId && ['pendiente', 'en_ruta'].includes(c.status)) ?? null;
  }, [cargasRaw, profile]);

  const { data: cargaLineasRaw } = useOfflineQuery('carga_lineas', { carga_id: activeCarga?.id }, { enabled: !!activeCarga?.id });

  // When no active carga, fall back to the user's assigned warehouse stock
  const useFallbackStock = !activeCarga;
  const almacenId = profile?.almacen_id;

  const { data: stockAlmacenRaw } = useOfflineQuery('stock_almacen', {
    empresa_id: empresa?.id,
    almacen_id: almacenId,
  }, {
    enabled: useFallbackStock && !!empresa?.id && !!almacenId,
  });

  const stockAbordo = useMemo(() => {
    const map = new Map<string, number>();
    if (!useFallbackStock && cargaLineasRaw && cargaLineasRaw.length > 0) {
      (cargaLineasRaw as any[]).forEach(l => {
        const disponible = (l.cantidad_cargada ?? 0) - (l.cantidad_vendida ?? 0) - (l.cantidad_devuelta ?? 0);
        map.set(l.producto_id, Math.max(0, disponible));
      });
    } else if (useFallbackStock && almacenId && stockAlmacenRaw) {
      // Use warehouse-specific stock
      (stockAlmacenRaw as any[]).forEach(s => {
        map.set(s.producto_id, s.cantidad ?? 0);
      });
    }
    return map;
  }, [cargaLineasRaw, useFallbackStock, almacenId, stockAlmacenRaw]);

  const { data: promocionesActivas } = usePromocionesActivas();
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id, status: 'activo' }, { enabled: !!empresa?.id, orderBy: 'nombre' });

  useEffect(() => {
    if (urlClienteId && clientes) {
      const c = clientes.find(cl => cl.id === urlClienteId);
      if (c) {
        setClienteNombre(c.nombre);
        setClienteCredito({ credito: c.credito ?? false, limite: c.limite_credito ?? 0, dias: c.dias_credito ?? 0 });
      }
    }
  }, [urlClienteId, clientes]);

  const { data: allVentas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const ventasPendientes = useMemo(() => {
    if (!allVentas || !clienteId) return [];
    return (allVentas as any[]).filter(v => v.cliente_id === clienteId && v.condicion_pago === 'credito' && (v.saldo_pendiente ?? 0) > 0 && ['confirmado', 'entregado', 'facturado'].includes(v.status)).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [allVentas, clienteId]);

  const saldoPendienteTotal = useMemo(() => (ventasPendientes ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0), [ventasPendientes]);

  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id, se_puede_vender: true, status: 'activo' }, { enabled: !!empresa?.id, orderBy: 'nombre' });
  const { data: tarifasOffline } = useOfflineQuery('tarifas', { empresa_id: empresa?.id, activa: true }, { enabled: !!empresa?.id });
  const selectedClienteData = clientes?.find(c => c.id === clienteId);
  const clienteTarifaId = selectedClienteData?.tarifa_id || tarifasOffline?.find((t: any) => t.tipo === 'general')?.id;
  const clienteListaPrecioId = (selectedClienteData as any)?.lista_precio_id || null;
  const { data: tarifaLineasOffline } = useOfflineQuery('tarifa_lineas', { tarifa_id: clienteTarifaId }, { enabled: !!clienteTarifaId });

  const resolvePrice = useMemo(() => {
    const rules = (tarifaLineasOffline ?? []) as TarifaLineaRule[];
    return (producto: any): number => {
      if (!rules.length) return producto.precio_principal ?? 0;
      return resolveProductPrice(rules, { id: producto.id, precio_principal: producto.precio_principal ?? 0, costo: producto.costo ?? 0, clasificacion_id: producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: producto.iva_pct ?? 16, tiene_ieps: producto.tiene_ieps, ieps_pct: producto.ieps_pct ?? 0, ieps_tipo: producto.ieps_tipo }, clienteListaPrecioId);
    };
  }, [tarifaLineasOffline, clienteListaPrecioId]);

  const { data: pedidoSugeridoRaw } = useOfflineQuery('cliente_pedido_sugerido', { cliente_id: clienteId }, { enabled: !!clienteId });
  const pedidoSugerido = useMemo(() => {
    if (!pedidoSugeridoRaw || !productos) return [];
    return (pedidoSugeridoRaw as any[]).map(ps => { const prod = productos.find((p: any) => p.id === ps.producto_id); return prod ? { ...ps, productos: prod } : null; }).filter(Boolean);
  }, [pedidoSugeridoRaw, productos]);

  const filteredClientes = clientes?.filter(c => !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) || c.codigo?.toLowerCase().includes(searchCliente.toLowerCase()));
  const productosDisponibles = useMemo(() => {
    if (!productos) return [];
    if (tipoVenta === 'pedido') return productos;
    if (useFallbackStock && almacenId) {
      // No carga but has assigned warehouse: use warehouse stock
      return productos.filter(p => (stockAbordo.get(p.id) ?? 0) > 0);
    }
    if (useFallbackStock) {
      // No carga, no warehouse: use global stock as last resort
      return productos.filter(p => (p.cantidad ?? 0) > 0);
    }
    return productos.filter(p => (stockAbordo.get(p.id) ?? 0) > 0);
  }, [productos, tipoVenta, stockAbordo, useFallbackStock, almacenId]);
  const filteredProductos = productosDisponibles?.filter(p => !searchProducto || p.nombre.toLowerCase().includes(searchProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchProducto.toLowerCase()));
  const filteredDevProductos = productos?.filter(p => !searchDevProducto || p.nombre.toLowerCase().includes(searchDevProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchDevProducto.toLowerCase()));
  const filteredReemplazoProductos = productos?.filter(p => !searchReemplazo || p.nombre.toLowerCase().includes(searchReemplazo.toLowerCase()) || p.codigo.toLowerCase().includes(searchReemplazo.toLowerCase()));

  const getMaxQty = (productoId: string) => {
    if (tipoVenta === 'pedido') return Infinity;
    if (useFallbackStock && almacenId) {
      return stockAbordo.get(productoId) ?? 0;
    }
    if (useFallbackStock) {
      const prod = productos?.find(p => p.id === productoId);
      return prod?.cantidad ?? 0;
    }
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
      setCart([...cart, { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, precio_unitario: esCambio ? 0 : resolvePrice(p), cantidad: 1, unidad: 'pz', unidad_id: p.unidad_venta_id ?? undefined, tiene_iva: esCambio ? false : (p.tiene_iva ?? false), iva_pct: esCambio ? 0 : (p.tiene_iva ? (p.iva_pct ?? 16) : 0), tiene_ieps: esCambio ? false : (p.tiene_ieps ?? false), ieps_pct: esCambio ? 0 : (p.tiene_ieps ? (p.ieps_pct ?? 0) : 0), es_cambio: esCambio }]);
    }
  };

  const updateQty = (productoId: string, delta: number, esCambio?: boolean) => { const match = !!esCambio; setCart(prev => prev.map(c => { if (c.producto_id !== productoId || !!c.es_cambio !== match) return c; const newQty = c.cantidad + delta; const maxQty = esCambio ? Infinity : getMaxQty(productoId); if (newQty > maxQty) return c; return newQty > 0 ? { ...c, cantidad: newQty } : c; })); };
  const removeFromCart = (productoId: string, esCambio?: boolean) => { const match = !!esCambio; setCart(prev => prev.filter(c => !(c.producto_id === productoId && !!c.es_cambio === match))); };
  const getItemInCart = (productoId: string) => cart.find(c => c.producto_id === productoId && !c.es_cambio);

  const addDevolucion = (p: any, defaults?: { motivo?: DevolucionItem['motivo']; accion?: DevolucionItem['accion'] }) => { if (devoluciones.find(d => d.producto_id === p.id)) { updateDevQty(p.id, (devoluciones.find(d => d.producto_id === p.id)?.cantidad ?? 0) + 1); return; } setDevoluciones(prev => [...prev, { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1, motivo: defaults?.motivo ?? 'no_vendido', accion: defaults?.accion ?? 'reposicion', precio_unitario: p.precio_principal ?? 0 }]); };
  const updateDevQty = (productoId: string, qty: number) => { if (qty <= 0) setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId)); else setDevoluciones(prev => prev.map(d => d.producto_id === productoId ? { ...d, cantidad: qty } : d)); };
  const updateDevMotivo = (productoId: string, motivo: DevolucionItem['motivo']) => { setDevoluciones(prev => prev.map(d => { if (d.producto_id !== productoId) return d; const updated = { ...d, motivo }; if (updated.accion === 'reposicion' && motivo !== 'cambio' && motivo !== 'danado' && motivo !== 'caducado' && motivo !== 'error_pedido') { /* keep accion */ } return updated; })); };
  const updateDevAccion = (productoId: string, accion: DevolucionItem['accion']) => { setDevoluciones(prev => prev.map(d => { if (d.producto_id !== productoId) return d; const updated = { ...d, accion }; if (accion !== 'reposicion') { delete updated.reemplazo_producto_id; delete updated.reemplazo_nombre; } return updated; })); };
  const batchUpdateDevDefaults = (motivo: DevolucionItem['motivo'], accion: DevolucionItem['accion']) => { setDevoluciones(prev => prev.map(d => { const updated = { ...d, motivo, accion }; if (accion !== 'reposicion') { delete updated.reemplazo_producto_id; delete updated.reemplazo_nombre; } return updated; })); };
  const setReemplazo = (devProductoId: string, p: any) => { setDevoluciones(prev => prev.map(d => d.producto_id === devProductoId ? { ...d, reemplazo_producto_id: p.id, reemplazo_nombre: p.nombre } : d)); setShowReemplazoFor(null); setSearchReemplazo(''); };
  const removeDevolucion = (productoId: string) => { setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId)); };

  const processDevolucionesAndGoToProductos = () => {
    let newCart = cart.filter(c => !c.es_cambio);
    if (newCart.length === 0 && pedidoSugerido && pedidoSugerido.length > 0) {
      newCart = pedidoSugerido.map((ps: any) => ({ producto_id: ps.productos.id, codigo: ps.productos.codigo, nombre: ps.productos.nombre, precio_unitario: resolvePrice(ps.productos), cantidad: ps.cantidad, unidad: (ps.productos.unidades as any)?.abreviatura || 'pz', unidad_id: ps.productos.unidad_venta_id ?? undefined, tiene_iva: ps.productos.tiene_iva ?? false, iva_pct: ps.productos.tiene_iva ? ((ps.productos.tasas_iva as any)?.porcentaje ?? ps.productos.iva_pct ?? 16) : 0, tiene_ieps: ps.productos.tiene_ieps ?? false, ieps_pct: ps.productos.tiene_ieps ? ((ps.productos.tasas_ieps as any)?.porcentaje ?? ps.productos.ieps_pct ?? 0) : 0 }));
    }
    // Add replacement products (reposición) at $0
    devoluciones.filter(d => d.accion === 'reposicion' && d.reemplazo_producto_id).forEach(d => {
      const p = productos?.find(pr => pr.id === d.reemplazo_producto_id);
      if (p) {
        const existing = newCart.find(c => c.producto_id === p.id && c.es_cambio);
        if (existing) { newCart = newCart.map(c => c.producto_id === p.id && c.es_cambio ? { ...c, cantidad: c.cantidad + d.cantidad } : c); }
        else { newCart.push({ producto_id: p.id, codigo: p.codigo, nombre: p.nombre, precio_unitario: 0, cantidad: d.cantidad, unidad: 'pz', tiene_iva: false, iva_pct: 0, tiene_ieps: false, ieps_pct: 0, es_cambio: true }); }
      }
    });
    setCart(newCart);
    setStep('productos');
  };

  const selectedCliente = clientes?.find(c => c.id === clienteId);
  const promoResults = useMemo(() => {
    if (!promocionesActivas || cart.length === 0) return [] as PromoResult[];
    const cartForPromo: CartItemForPromo[] = cart.filter(c => !c.es_cambio).map(c => {
      const prod = productos?.find((p: any) => p.id === c.producto_id);
      return { producto_id: c.producto_id, clasificacion_id: prod?.clasificacion_id ?? undefined, precio_unitario: c.precio_unitario, cantidad: c.cantidad };
    });
    return evaluatePromociones(promocionesActivas, cartForPromo, clienteId || undefined, (selectedCliente as any)?.zona_id || undefined);
  }, [promocionesActivas, cart, clienteId, selectedCliente, productos]);
  const totalDescuentoPromos = useMemo(() => promoResults.reduce((s, r) => s + r.descuento, 0), [promoResults]);

  const descuentoDevolucion = useMemo(() => devoluciones.filter(d => d.accion === 'descuento_venta').reduce((s, d) => s + d.precio_unitario * d.cantidad, 0), [devoluciones]);

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, items = 0;
    cart.forEach(item => { if (item.es_cambio) { items += item.cantidad; return; } const lineaSub = item.precio_unitario * item.cantidad; subtotal += lineaSub; if (!sinImpuestos) { const lineIeps = item.tiene_ieps ? lineaSub * (item.ieps_pct / 100) : 0; ieps += lineIeps; if (item.tiene_iva) iva += (lineaSub + lineIeps) * (item.iva_pct / 100); } items += item.cantidad; });
    const totalDescuentos = totalDescuentoPromos + descuentoDevolucion;
    const total = Math.max(0, subtotal + ieps + iva - totalDescuentos);
    return { subtotal, iva, ieps, total, items, descuento: totalDescuentos, descuentoDevolucion };
  }, [cart, totalDescuentoPromos, descuentoDevolucion, sinImpuestos]);

  const creditoDisponible = clienteCredito ? clienteCredito.limite - saldoPendienteTotal : 0;
  const excedeCredito = condicionPago === 'credito' && totals.total > creditoDisponible;
  const totalAplicarCuentas = cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0);
  const totalACobrar = (condicionPago === 'contado' ? totals.total : 0) + totalAplicarCuentas;
  const totalPagosLineas = pagos.reduce((s, p) => s + p.monto, 0);
  const montoRecibidoNum = totalPagosLineas;
  const cambio = pagos.some(p => p.metodo_pago === 'efectivo') ? Math.max(0, totalPagosLineas - totalACobrar) : 0;

  const initCuentasPendientes = () => { if (ventasPendientes && ventasPendientes.length > 0) setCuentasPendientes(ventasPendientes.map(v => ({ id: v.id, folio: v.folio, fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, montoAplicar: 0 }))); else setCuentasPendientes([]); };
  const liquidarTodas = () => { setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: c.saldo_pendiente }))); };
  const updateCuentaMonto = (id: string, monto: number) => { setCuentasPendientes(prev => prev.map(c => c.id === id ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c)); };

  const updateCargaVendidaOffline = async (items: CartItem[]) => {
    try {
      const cargasTable = getOfflineTable('cargas'); const cargaLineasTable = getOfflineTable('carga_lineas');
      if (!cargasTable || !cargaLineasTable) return;
      const allCargas = await cargasTable.toArray();
      const ac = allCargas.filter((c: any) => c.empresa_id === empresa?.id && c.status === 'en_ruta').sort((a: any, b: any) => (b.fecha > a.fecha ? 1 : -1))[0];
      if (!ac) return;
      const allLineas = await cargaLineasTable.toArray();
      for (const item of items) {
        const cl = allLineas.find((l: any) => l.carga_id === ac.id && l.producto_id === item.producto_id);
        if (cl) await queueOperation('carga_lineas', 'update', { id: cl.id, carga_id: cl.carga_id, producto_id: cl.producto_id, cantidad_cargada: cl.cantidad_cargada, cantidad_vendida: (cl.cantidad_vendida ?? 0) + item.cantidad, cantidad_devuelta: cl.cantidad_devuelta ?? 0 });
      }
    } catch (e) { console.error('Error updating carga offline:', e); }
  };

  const handleSave = async () => {
    if (!empresa || !user) return;
    setSaving(true);
    try {
      const ventaId = crypto.randomUUID();
      let localFolio = '';
      try { const ventasTable = getOfflineTable('ventas'); if (ventasTable) { const av = await ventasTable.toArray(); const prefix = tipoVenta === 'pedido' ? 'PED' : 'VTA'; const ev = av.filter((v: any) => v.empresa_id === empresa.id); let maxNum = 0; for (const v of ev) { const f = v.folio ?? ''; const match = f.match(new RegExp(`^${prefix}-(\\d+)$`)); if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10)); } localFolio = `${prefix}-${String(maxNum + 1).padStart(4, '0')}`; } } catch {}
      if (!localFolio) localFolio = `${tipoVenta === 'pedido' ? 'PED' : 'VTA'}-${ventaId.slice(0, 6).toUpperCase()}`;

      if (devoluciones.length > 0 && clienteId) {
        const devId = crypto.randomUUID();
        const cargaIdForDev = activeCarga?.id || null;
        await queueOperation('devoluciones', 'insert', { id: devId, empresa_id: empresa.id, user_id: user.id, vendedor_id: profile?.vendedor_id || profile?.id || null, cliente_id: clienteId, carga_id: cargaIdForDev, venta_id: ventaId, tipo: 'tienda', fecha: todayInTimezone(empresa.zona_horaria), created_at: new Date().toISOString() });
        for (const d of devoluciones) {
          const montoCredito = (d.accion === 'nota_credito' || d.accion === 'devolucion_dinero' || d.accion === 'descuento_venta') ? d.precio_unitario * d.cantidad : 0;
          await queueOperation('devolucion_lineas', 'insert', {
            id: crypto.randomUUID(), devolucion_id: devId, producto_id: d.producto_id, cantidad: d.cantidad,
            motivo: d.motivo, accion: d.accion, reemplazo_producto_id: d.reemplazo_producto_id || null,
            monto_credito: montoCredito, created_at: new Date().toISOString(),
          });

          // ── Restore inventory for returned products ──
          const destAlmacenId = profile?.almacen_id || null;

          if (activeCarga) {
            // Has active carga → update carga_lineas devuelta count
            try {
              const cargaLineasTable = getOfflineTable('carga_lineas');
              if (cargaLineasTable) {
                const allCL = await cargaLineasTable.toArray();
                const cl = allCL.find((l: any) => l.carga_id === activeCarga.id && l.producto_id === d.producto_id);
                if (cl) {
                  await queueOperation('carga_lineas', 'update', {
                    id: cl.id, carga_id: cl.carga_id, producto_id: cl.producto_id,
                    cantidad_cargada: cl.cantidad_cargada,
                    cantidad_vendida: cl.cantidad_vendida ?? 0,
                    cantidad_devuelta: (cl.cantidad_devuelta ?? 0) + d.cantidad,
                  });
                }
              }
            } catch (e) { console.error('Error updating carga devuelta:', e); }
          }

          // Always restore stock to user's assigned warehouse
          if (destAlmacenId) {
            try {
              const stockTable = getOfflineTable('stock_almacen');
              if (stockTable) {
                const allStock = await stockTable.toArray();
                const existing = allStock.find((s: any) => s.almacen_id === destAlmacenId && s.producto_id === d.producto_id);
                if (existing) {
                  await queueOperation('stock_almacen', 'update', {
                    id: existing.id, almacen_id: destAlmacenId, producto_id: d.producto_id,
                    empresa_id: empresa.id, cantidad: (existing.cantidad ?? 0) + d.cantidad,
                  });
                } else {
                  await queueOperation('stock_almacen', 'insert', {
                    id: crypto.randomUUID(), almacen_id: destAlmacenId, producto_id: d.producto_id,
                    empresa_id: empresa.id, cantidad: d.cantidad,
                  });
                }
              }
              // Also update global product stock
              const prodTable = getOfflineTable('productos');
              if (prodTable) {
                const prod = await prodTable.get(d.producto_id);
                if (prod) {
                  await queueOperation('productos', 'update', {
                    id: d.producto_id, cantidad: (prod.cantidad ?? 0) + d.cantidad,
                  });
                }
              }
            } catch (e) { console.error('Error restoring stock for devolution:', e); }

            // Log inventory movement
            await queueOperation('movimientos_inventario', 'insert', {
              id: crypto.randomUUID(), empresa_id: empresa.id, tipo: 'entrada',
              producto_id: d.producto_id, cantidad: d.cantidad,
              almacen_destino_id: destAlmacenId,
              referencia_tipo: 'devolucion', referencia_id: devId,
              user_id: user.id, fecha: todayInTimezone(empresa.zona_horaria),
              created_at: new Date().toISOString(),
              notas: `Devolución ${d.nombre} - ${d.motivo}`,
            });
          }
        }
      }

      const applyPayment = totalACobrar > 0;
      // saldo_pendiente starts as full total; will be reduced after payments are applied
      const tarifaId = clienteTarifaId || selectedClienteData?.tarifa_id || null;
      await queueOperation('ventas', 'insert', { id: ventaId, empresa_id: empresa.id, cliente_id: clienteId, tipo: tipoVenta, vendedor_id: profile?.vendedor_id || profile?.id || null, condicion_pago: condicionPago, entrega_inmediata: entregaInmediata, fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null, status: 'confirmado', notas: notas || null, folio: localFolio, tarifa_id: tarifaId, almacen_id: profile?.almacen_id || null, subtotal: totals.subtotal, iva_total: totals.iva, ieps_total: totals.ieps, descuento_total: totals.descuento, total: totals.total, saldo_pendiente: totals.total, fecha: todayInTimezone(empresa.zona_horaria), created_at: new Date().toISOString() });

      for (const item of cart) { const lineSub = item.precio_unitario * item.cantidad; const lineIeps = (!sinImpuestos && item.tiene_ieps) ? lineSub * (item.ieps_pct / 100) : 0; const lineIva = (!sinImpuestos && item.tiene_iva) ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0; const savedIvaPct = sinImpuestos ? 0 : item.iva_pct; const savedIepsPct = sinImpuestos ? 0 : item.ieps_pct; await queueOperation('venta_lineas', 'insert', { id: crypto.randomUUID(), venta_id: ventaId, producto_id: item.producto_id, descripcion: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario, unidad_id: item.unidad_id || null, subtotal: lineSub, iva_pct: savedIvaPct, iva_monto: lineIva, ieps_pct: savedIepsPct, ieps_monto: lineIeps, descuento_pct: 0, total: lineSub + lineIeps + lineIva, notas: item.es_cambio ? 'CAMBIO - Sin cargo' : null, created_at: new Date().toISOString() }); }

      if (applyPayment && clienteId && pagos.length > 0) {
        // Track how much of the sale and cuentas have been applied
        let saleRemaining = condicionPago === 'contado' ? totals.total : 0;
        const cuentasToApply = cuentasPendientes.filter(c => c.montoAplicar > 0);
        let cuentaIdx = 0;

        for (const pago of pagos) {
          if (pago.monto <= 0) continue;
          const cobroId = crypto.randomUUID();
          await queueOperation('cobros', 'insert', { id: cobroId, empresa_id: empresa.id, cliente_id: clienteId, user_id: user.id, monto: pago.monto, metodo_pago: pago.metodo_pago, referencia: pago.referencia || null, fecha: todayInTimezone(empresa.zona_horaria), created_at: new Date().toISOString() });

          let remaining = pago.monto;

          // First apply to current sale
          if (saleRemaining > 0 && remaining > 0) {
            const apply = Math.min(remaining, saleRemaining);
            await queueOperation('cobro_aplicaciones', 'insert', { id: crypto.randomUUID(), cobro_id: cobroId, venta_id: ventaId, monto_aplicado: apply, created_at: new Date().toISOString() });
            saleRemaining -= apply;
            remaining -= apply;
          }

          // Then apply to pending accounts
          while (remaining > 0.01 && cuentaIdx < cuentasToApply.length) {
            const cuenta = cuentasToApply[cuentaIdx];
            const apply = Math.min(remaining, cuenta.montoAplicar);
            await queueOperation('cobro_aplicaciones', 'insert', { id: crypto.randomUUID(), cobro_id: cobroId, venta_id: cuenta.id, monto_aplicado: apply, created_at: new Date().toISOString() });
            cuenta.montoAplicar -= apply;
            remaining -= apply;
            if (cuenta.montoAplicar <= 0.01) cuentaIdx++;
          }
        }

        // Update saldo_pendiente for the current sale based on actual payments applied
        const appliedToSale = (condicionPago === 'contado' ? totals.total : 0) - saleRemaining;
        if (appliedToSale > 0) {
          await queueOperation('ventas', 'update', { id: ventaId, saldo_pendiente: Math.max(0, totals.total - appliedToSale) });
        }

        // Update saldo_pendiente for cuentas
        for (const cuenta of cuentasPendientes) {
          if (cuenta.montoAplicar < cuenta.saldo_pendiente) {
            const applied = cuenta.saldo_pendiente - cuenta.montoAplicar;
            if (applied > 0) await queueOperation('ventas', 'update', { id: cuenta.id, saldo_pendiente: Math.max(0, cuenta.saldo_pendiente - applied) });
          }
        }
      } else if (condicionPago === 'contado' && totals.total === 0) {
        // Zero-total sale, mark as paid
        await queueOperation('ventas', 'update', { id: ventaId, saldo_pendiente: 0 });
      }

      await updateCargaVendidaOffline(cart);
      await saveVisita(tipoVenta === 'pedido' ? 'pedido' : 'venta', { ventaId });
      if (clienteId) markVisited(clienteId);
      toast.success('¡Venta registrada! Se sincronizará automáticamente');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-cuentas-pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-carga'] });
      setTicketInfo({ folio: localFolio, fecha: new Date().toLocaleDateString('es-MX') });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const currentStepIdx = STEPS.indexOf(step);
  const goBack = () => { if (currentStepIdx === 0) navigate('/ruta/ventas'); else setStep(STEPS[currentStepIdx - 1]); };
  const goToPayment = () => { initCuentasPendientes(); setStep('pago'); };
  const { symbol: currSym } = useCurrency();
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const fmtM = (n: number) => `${currSym}${fmt(n)}`;
  const cambioItems = cart.filter(c => c.es_cambio);
  const chargedItems = cart.filter(c => !c.es_cambio);

  return {
    navigate, empresa, user, profile, urlClienteId,
    step, setStep, clienteId, setClienteId, clienteNombre, setClienteNombre,
    clienteCredito, setClienteCredito, cart, setCart, devoluciones, setDevoluciones,
    searchCliente, setSearchCliente, searchProducto, setSearchProducto,
    searchDevProducto, setSearchDevProducto, saving, tipoVenta, setTipoVenta,
    condicionPago, setCondicionPago, notas, setNotas, fechaEntrega, setFechaEntrega,
    pagos, setPagos,
    cuentasPendientes, showDevSearch, setShowDevSearch,
    showReemplazoFor, setShowReemplazoFor, searchReemplazo, setSearchReemplazo,
    ticketInfo, sinCompra, setSinCompra, motivoSinCompra, setMotivoSinCompra, savingSinCompra, setSavingSinCompra, sinImpuestos, setSinImpuestos,
    entregaInmediata, stockAbordo, usandoAlmacen: useFallbackStock, clientes, productos, filteredClientes,
    filteredProductos, filteredDevProductos, filteredReemplazoProductos, pedidoSugerido,
    promoResults, totals, creditoDisponible, excedeCredito, totalAplicarCuentas,
    totalACobrar, montoRecibidoNum, cambio, saldoPendienteTotal, cambioItems, chargedItems,
    currentStepIdx, goBack, goToPayment, fmt, fmtM, currSym, markVisited, saveVisita,
    addToCart, updateQty, removeFromCart, getItemInCart, getMaxQty,
    addDevolucion, updateDevQty, updateDevMotivo, updateDevAccion, batchUpdateDevDefaults, setReemplazo, removeDevolucion,
    processDevolucionesAndGoToProductos, initCuentasPendientes, liquidarTodas, updateCuentaMonto,
    handleSave,
  };
}
