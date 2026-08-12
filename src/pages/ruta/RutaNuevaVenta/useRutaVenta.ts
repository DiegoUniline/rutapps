import { useState, useMemo, useEffect, useRef } from 'react';
import { todayInTimezone , todayLocal, roundMoney } from '@/lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { queueOperation, queueOperations, queueInsertMany } from '@/lib/syncQueue';
import { deterministicUuid } from '@/lib/deterministicId';
import { getOfflineTable } from '@/lib/offlineDb';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { resolveProductPrice, resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { buildManualSalePricingFromGross, buildSalePricingSnapshot, getDisplayUnitPrice as getSaleDisplayUnitPrice, getTaxMultiplier } from '@/lib/salePricing';
import { buildPosLinePricing, type PosPricingItem } from '@/lib/posPricing';
import { toast } from 'sonner';
import { usePromocionesActivas, evaluatePromociones, getPendingProductoGratis, type CartItemForPromo, type PromoResult, type PendingProductoGratis } from '@/hooks/usePromociones';
import { buildPromoAplicadaRows, promoPersistHabilitado } from '@/lib/promoPersist';
import { promosAutoHabilitado } from '@/lib/promoAuto';

import { aplicarPromoALinea, promoLineaHabilitado, separarDescuentoPromo } from '@/lib/promoLinea';
import { buildDesgloseLinea, desgloseLineaHabilitado } from '@/lib/ventaLineaDesglose';

import type { CartItem, DevolucionItem, CuentaPendiente, Step, PagoLinea, DescuentoExtraTipo } from './types';
import { locationService } from '@/lib/locationService';
import { useCurrency } from '@/hooks/useCurrency';
import { useClienteInsights } from '@/hooks/useClienteInsights';
import { useSaldoFavor } from '@/hooks/useSaldoFavor';
import { SALDO_FAVOR_METODO } from '@/lib/saldoFavor';
import { usePermisos } from '@/hooks/usePermisos';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { STEPS } from './types';
import { nextVisitDate } from '@/lib/nextVisitDate';
import { getLotesDisponibles, pickFefo } from '@/lib/lotesFefo';

const r2 = (n: number) => Math.round(n * 100) / 100;

function splitFinalGross(item: PosPricingItem, finalGross: number) {
  const gross = r2(finalGross);
  const taxMultiplier = getTaxMultiplier(item);

  if (taxMultiplier <= 0 || (!item.tiene_iva && !item.tiene_ieps)) {
    return { subtotal: gross, ieps: 0, iva: 0 };
  }

  const subtotalBase = r2(gross / taxMultiplier);

  if (item.tiene_ieps && item.tiene_iva) {
    const ieps = r2(subtotalBase * ((item.ieps_pct ?? 0) / 100));
    const iva = r2(gross - subtotalBase - ieps);
    return { subtotal: r2(gross - ieps - iva), ieps, iva };
  }

  if (item.tiene_ieps) {
    const ieps = r2(gross - subtotalBase);
    return { subtotal: r2(gross - ieps), ieps, iva: 0 };
  }

  const iva = r2(gross - subtotalBase);
  return { subtotal: r2(gross - iva), ieps: 0, iva };
}

function toPosPricingItem(item: CartItem, sinImpuestos: boolean): PosPricingItem {
  return {
    precio_unitario: item.precio_unitario,
    precio_unitario_sin_redondeo: item.precio_unitario_sin_redondeo ?? item.precio_unitario,
    precio_display_sin_redondeo: item.precio_display_sin_redondeo ?? item.precio_unitario,
    cantidad: item.cantidad,
    tiene_iva: sinImpuestos ? false : item.tiene_iva,
    iva_pct: item.iva_pct,
    tiene_ieps: sinImpuestos ? false : item.tiene_ieps,
    ieps_pct: item.ieps_pct,
    base_precio: (item.base_precio ?? 'sin_impuestos') as PosPricingItem['base_precio'],
    redondeo: item.redondeo ?? 'ninguno',
  };
}

function getOriginalLineBreakdown(item: CartItem, sinImpuestos: boolean) {
  const pricingItem = toPosPricingItem(item, sinImpuestos);
  if (!sinImpuestos && pricingItem.base_precio === 'con_impuestos') {
    const gross = r2(getSaleDisplayUnitPrice(pricingItem) * item.cantidad);
    return { ...splitFinalGross(pricingItem, gross), total: gross };
  }

  const original = buildPosLinePricing(pricingItem, 0);
  return { subtotal: original.subtotal, ieps: original.ieps, iva: original.iva, total: original.finalGross };
}

export function useRutaVenta(opts?: { onAlmacenMissing?: () => void }) {
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
  const savingRef = useRef(false);
  // IDEMPOTENCIA (patrón local-first / idempotency key): el id de la venta se
  // genera UNA sola vez por operación y se REUSA en cada reintento (error de red,
  // reenvío). Así el upsert por PK del servidor deduplica: reintentar la MISMA
  // venta nunca crea una segunda. Se limpia solo al terminar con éxito, para que
  // la siguiente venta tome un id nuevo. Antes se generaba dentro del submit, así
  // que cada reintento nacía con id nuevo → duplicados.
  const pendingVentaIdRef = useRef<string | null>(null);
  // Mismo patrón para la devolución independiente (sin venta): id estable por
  // operación, reusado en reintentos, limpiado al éxito.
  const pendingDevIdRef = useRef<string | null>(null);
  const [tipoVenta, setTipoVenta] = useState<'venta_directa' | 'pedido'>('venta_directa');
  // Apartado de stock en pedidos (solo si empresa.apartar_stock_pedidos === true)
  const [pedidoAlmacenId, setPedidoAlmacenId] = useState<string | null>(null);
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
  const [soloDevolucion, setSoloDevolucion] = useState(false);
  const [sinImpuestos, setSinImpuestos] = useState(false);
  const [motivoSinCompra, setMotivoSinCompra] = useState('');
  const [savingSinCompra, setSavingSinCompra] = useState(false);
  // Descuento extra al total (gateado por permiso 'ventas.aplicar_descuento')
  const [descuentoExtraTipo, setDescuentoExtraTipo] = useState<DescuentoExtraTipo>('monto');
  const [descuentoExtraValor, setDescuentoExtraValor] = useState<number>(0);
  const [descuentoExtraMotivo, setDescuentoExtraMotivo] = useState<string>('');

  const { hasPermisoMovil, isOwner } = usePermisos();
  // En /ruta solo mandan los permisos móviles (sección "Permisos móviles" del rol).
  // Antes hacíamos OR con el permiso desktop (`ventas.*`), lo que causaba que aunque
  // el admin denegara "Aplicar descuento" en móvil, el descuento siguiera apareciendo
  // porque el permiso desktop entraba con default true en ciertos escenarios.
  const canChangePrice = isOwner || hasPermisoMovil('ruta.cambiar_precio');
  const canChangeLista = isOwner || hasPermisoMovil('ruta.cambiar_lista_precio');
  const canApplyDiscount = isOwner || hasPermisoMovil('ruta.aplicar_descuento');
  const canDoDevoluciones = isOwner || hasPermisoMovil('ruta.devoluciones');

  // ── Lotes: apartar lote(s) desde que se captura la línea (FEFO) ──────────
  // Se resuelve para cualquier producto con `maneja_lote`, online (RPC) u
  // offline (IndexedDB). Soporta REPARTO EN VARIOS LOTES: si el primer lote no
  // alcanza para la cantidad, se completa con los siguientes en orden FEFO.
  // El vendedor puede ajustarlo manualmente en la línea.
  const manejaLotesEmpresa = !!(empresa as any)?.maneja_lotes;
  const almacenLotesBase = pedidoAlmacenId || profile?.almacen_id || null;
  const productoManejaLote = (productoId: string) =>
    manejaLotesEmpresa && !!productos?.find((p: any) => p.id === productoId)?.maneja_lote;

  /** Asigna manualmente el reparto de lotes de una línea. */
  const setLineaLotes = (productoId: string, lotes: { lote_id: string; codigo: string; cantidad: number }[]) => {
    setCart(prev => prev.map(c => (c.producto_id === productoId && !c.es_cambio)
      ? { ...c, lotes, lote_id: lotes[0]?.lote_id ?? null, lote_codigo: lotes[0]?.codigo ?? null }
      : c));
  };

  /** Cantidad de la línea que aún no tiene lote asignado (0 = completa). */
  const lotePendienteDe = (item: CartItem) => {
    if (!productoManejaLote(item.producto_id) || item.es_cambio) return 0;
    const asignado = (item.lotes ?? []).reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
    return Math.round((item.cantidad - asignado) * 1000) / 1000;
  };

  useEffect(() => {
    if (!empresa?.id || !manejaLotesEmpresa) return;
    const almacenBase = almacenLotesBase;
    if (!almacenBase) return;
    const pendientes = cart
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.es_cambio && lotePendienteDe(c) > 0);
    if (pendientes.length === 0) return;
    let cancelado = false;
    (async () => {
      for (const { c, i } of pendientes) {
        const almacenId = c.almacen_id || almacenBase;
        const disponibles = await getLotesDisponibles({ empresaId: empresa.id, almacenId, productoId: c.producto_id });
        if (cancelado || disponibles.length === 0) continue;
        // Reparto FEFO desde cero para la cantidad completa de la línea.
        const reparto: { lote_id: string; codigo: string; cantidad: number }[] = [];
        let resta = c.cantidad;
        for (const l of disponibles) {
          if (resta <= 0) break;
          const usar = Math.min(l.disponible, resta);
          if (usar > 0) {
            reparto.push({ lote_id: l.lote_id, codigo: l.codigo, cantidad: Math.round(usar * 1000) / 1000 });
            resta = Math.round((resta - usar) * 1000) / 1000;
          }
        }
        // Si ningún lote tiene disponible, se apoya en el FEFO simple para no dejar la línea sin lote.
        if (reparto.length === 0) {
          const fefo = pickFefo(disponibles, c.cantidad);
          if (fefo) reparto.push({ lote_id: fefo.lote_id, codigo: fefo.codigo, cantidad: c.cantidad });
        }
        if (reparto.length === 0) continue;
        setCart(prev => {
          const arr = [...prev];
          if (!arr[i] || arr[i].producto_id !== c.producto_id) return prev;
          arr[i] = { ...arr[i], lotes: reparto, lote_id: reparto[0].lote_id, lote_codigo: reparto[0].codigo };
          return arr;
        });
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.map(c => `${c.producto_id}:${c.cantidad}:${(c.lotes ?? []).length}`).join('|'), empresa?.id, manejaLotesEmpresa, almacenLotesBase]);


  useEffect(() => {
    if (!canDoDevoluciones && devoluciones.length > 0) {
      setDevoluciones([]);
      setCart(prev => prev.filter(c => !c.es_cambio));
    }
    if (!canDoDevoluciones && step === 'devoluciones') {
      setStep('productos');
    }
  }, [canDoDevoluciones, devoluciones.length, step]);

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
    // Id determinístico: una visita por (cliente, usuario, tipo) atada a su venta
    // si la hay, o al día. Reintentar no duplica la visita (ni infla el conteo
    // del supervisor).
    const visitaId = opts?.ventaId
      ? await deterministicUuid('visita', empresa.id, cId, user.id, tipo, opts.ventaId)
      : await deterministicUuid('visita', empresa.id, cId, user.id, tipo, todayLocal());
    await queueOperation('visitas', 'insert', {
      id: visitaId, empresa_id: empresa.id, cliente_id: cId, user_id: user.id, tipo,
      motivo: opts?.motivo || null, notas: opts?.notasVisita || null,
      gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
      venta_id: opts?.ventaId || null, fecha: new Date().toISOString(), created_at: new Date().toISOString(),
    });


  };

  const entregaInmediata = tipoVenta === 'venta_directa';

  const { data: cargasRaw } = useOfflineQuery('cargas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id, orderBy: 'fecha', ascending: false });
  const activeCarga = useMemo(() => {
    if (!cargasRaw || !profile) return null;
    const vendId = profile.id || profile.id;
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

  const apartadoActivoPedido = tipoVenta === 'pedido' && !!(empresa as any)?.apartar_stock_pedidos;
  const apartadoAlmacenesIds = ((empresa as any)?.apartado_almacenes_ids ?? []) as string[];

  const { data: pedidoStockAlmacenRaw } = useOfflineQuery('stock_almacen', {
    empresa_id: empresa?.id,
    almacen_id: pedidoAlmacenId,
  }, {
    enabled: apartadoActivoPedido && !!empresa?.id && !!pedidoAlmacenId,
  });

  const { data: pedidoStockApartadoRaw } = useOfflineQuery('stock_apartado', {
    empresa_id: empresa?.id,
    almacen_id: pedidoAlmacenId,
  }, {
    enabled: apartadoActivoPedido && !!empresa?.id && !!pedidoAlmacenId,
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

  const apartadoDisponible = useMemo(() => {
    const map = new Map<string, number>();
    if (!apartadoActivoPedido || !pedidoAlmacenId) return map;
    (pedidoStockAlmacenRaw as any[] | undefined)?.forEach(s => {
      map.set(s.producto_id, Number(s.cantidad) || 0);
    });
    (pedidoStockApartadoRaw as any[] | undefined)?.forEach(s => {
      map.set(s.producto_id, (map.get(s.producto_id) ?? 0) - (Number(s.cantidad) || 0));
    });
    return map;
  }, [apartadoActivoPedido, pedidoAlmacenId, pedidoStockAlmacenRaw, pedidoStockApartadoRaw]);

  const { data: promocionesActivas, isError: promosError, isLoading: promosLoading, refetch: refetchPromos } = usePromocionesActivas();
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id, status: 'activo' }, { enabled: !!empresa?.id, orderBy: 'nombre' });

  useEffect(() => {
    if (urlClienteId && clientes) {
      const c = clientes.find(cl => cl.id === urlClienteId);
      if (c) {
        setClienteNombre(c.nombre);
        setClienteCredito({ credito: c.credito ?? false, limite: c.limite_credito ?? 0, dias: c.dias_credito ?? 0 });

        // Fetch real-time saldo from server to avoid stale credit check
        if (navigator.onLine && c.credito) {
          (async () => {
            try {
              const { data: ventasOnline } = await supabase
                .from('ventas')
                .select('saldo_pendiente')
                .eq('empresa_id', empresa!.id)
                .eq('cliente_id', urlClienteId!)
                .eq('condicion_pago', 'credito')
                .gt('saldo_pendiente', 0)
                .in('status', ['confirmado', 'entregado', 'facturado']);
              if (ventasOnline) {
                const saldoReal = ventasOnline.reduce((s: number, v: any) => s + (v.saldo_pendiente ?? 0), 0);
                if (Math.abs(saldoReal - saldoPendienteTotal) > 1) {
                  toast.warning(`Saldo actualizado desde servidor: $${saldoReal.toFixed(2)}`);
                }
              }
            } catch {} // offline — continue with cached data
          })();
        }
      }
    }
  }, [urlClienteId, clientes]);

  const { data: allVentas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const [saldoOnlineOverride, setSaldoOnlineOverride] = useState<number | null>(null);
  const ventasPendientes = useMemo(() => {
    if (!allVentas || !clienteId) return [];
    return (allVentas as any[]).filter(v => v.cliente_id === clienteId && (v.saldo_pendiente ?? 0) > 0 && ['confirmado', 'entregado', 'facturado'].includes(v.status)).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [allVentas, clienteId]);

  const saldoPendienteLocal = useMemo(() => (ventasPendientes ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0), [ventasPendientes]);
  const saldoPendienteTotal = saldoOnlineOverride ?? saldoPendienteLocal;

  // Refresh saldo anterior desde servidor cuando hay conexión — evita que el cache local (IndexedDB) muestre saldos ya cobrados
  useEffect(() => {
    if (!clienteId || !empresa?.id || !navigator.onLine) { setSaldoOnlineOverride(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('ventas')
          .select('saldo_pendiente')
          .eq('empresa_id', empresa.id)
          .eq('cliente_id', clienteId)
          .gt('saldo_pendiente', 0)
          .in('status', ['confirmado', 'entregado', 'facturado']);
        if (cancelled) return;
        const total = (data ?? []).reduce((s: number, r: any) => s + (r.saldo_pendiente ?? 0), 0);
        setSaldoOnlineOverride(total);
      } catch { /* offline — fallback local */ }
    })();
    return () => { cancelled = true; };
  }, [clienteId, empresa?.id]);


  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id, se_puede_vender: true, status: 'activo' }, { enabled: !!empresa?.id, orderBy: 'nombre' });
  const { data: tarifasOffline } = useOfflineQuery('tarifas', { empresa_id: empresa?.id, activa: true }, { enabled: !!empresa?.id });
  const selectedClienteData = clientes?.find(c => c.id === clienteId);
  const clienteTarifaId = selectedClienteData?.tarifa_id || tarifasOffline?.find((t: any) => t.tipo === 'general')?.id;
  const clienteListaPrecioId = (selectedClienteData as any)?.lista_precio_id || null;
  const { data: listasPreciosOffline } = useOfflineQuery('lista_precios', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const clienteListaNombre = (listasPreciosOffline as any[])?.find(l => l.id === clienteListaPrecioId)?.nombre
    ?? tarifasOffline?.find((t: any) => t.id === clienteTarifaId)?.nombre
    ?? null;
  const { data: tarifaLineasOffline } = useOfflineQuery('tarifa_lineas', { tarifa_id: clienteTarifaId }, { enabled: !!clienteTarifaId });

  // Enriquecer clasificacion_id desde Supabase (cuando hay internet): el cache
  // offline puede traerlo vacío (productos sincronizados con un select viejo, y
  // el delta del sync es por created_at, así que no re-baja productos existentes).
  // Sin clasificacion_id la regla de precio por CATEGORÍA no aplica y cae a
  // "todos" → precio equivocado. Con el mapa fresco eso ya no pasa online.
  const { data: claseFresh } = useQuery({
    queryKey: ['productos-clase-fresh', empresa?.id],
    enabled: !!empresa?.id && (typeof navigator === 'undefined' || navigator.onLine),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, clasificacion_id').eq('empresa_id', empresa!.id);
      return (data ?? []) as { id: string; clasificacion_id: string | null }[];
    },
  });
  const claseMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of (claseFresh ?? [])) m.set(r.id, r.clasificacion_id ?? null);
    return m;
  }, [claseFresh]);

  const resolvePrice = useMemo(() => {
    const rules = (tarifaLineasOffline ?? []) as TarifaLineaRule[];
    return (producto: any): number => {
      if (!rules.length) return producto.precio_principal ?? 0;
      return resolveProductPrice(rules, { id: producto.id, precio_principal: producto.precio_principal ?? 0, costo: producto.costo ?? 0, clasificacion_id: claseMap.get(producto.id) ?? producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: producto.iva_pct ?? 16, tiene_ieps: producto.tiene_ieps, ieps_pct: producto.ieps_pct ?? 0, ieps_tipo: producto.ieps_tipo, usa_listas_precio: producto.usa_listas_precio }, clienteListaPrecioId);
    };
  }, [tarifaLineasOffline, clienteListaPrecioId, claseMap]);

  /** Full pricing info for building cart items with raw data */
  const resolvePricingFull = useMemo(() => {
    const rules = (tarifaLineasOffline ?? []) as TarifaLineaRule[];
    return (producto: any) => {
      const pf: ProductForPricing = { id: producto.id, precio_principal: producto.precio_principal ?? 0, costo: producto.costo ?? 0, clasificacion_id: claseMap.get(producto.id) ?? producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: producto.iva_pct ?? 16, tiene_ieps: producto.tiene_ieps, ieps_pct: producto.ieps_pct ?? 0, ieps_tipo: producto.ieps_tipo, usa_listas_precio: producto.usa_listas_precio };
      const r = resolveProductPricing(rules, pf, clienteListaPrecioId);
      // Igual que el escritorio: el precio_unitario guardado se deriva del
      // display YA REDONDEADO (buildSalePricingSnapshot). Antes el móvil usaba
      // r.unitPrice (neto SIN redondeo), por eso el redondeo de la lista no se
      // respetaba en la app móvil.
      const snap = buildSalePricingSnapshot(pf, r);
      return { unitPrice: snap.unitPrice, displayPrice: snap.displayPrice, rawUnitPrice: snap.rawUnitPrice, rawDisplayPrice: snap.rawDisplayPrice, basePrecio: snap.basePrecio, redondeo: snap.redondeo };
    };
  }, [tarifaLineasOffline, clienteListaPrecioId, claseMap]);

  // Recalculate cart prices when client tarifa changes
  useEffect(() => {
    if (cart.length === 0 || !productos) return;
    setCart(prev => prev.map(item => {
      if (item.es_cambio) return item;
      // Un precio editado a mano por el vendedor NO se pisa al cambiar de
      // cliente/tarifa: era una sobrescritura silenciosa.
      if ((item as any).precio_manual) return item;


      const prod = productos.find((p: any) => p.id === item.producto_id);
      if (!prod) return item;
      const pf = resolvePricingFull(prod);
      if (pf.unitPrice === item.precio_unitario) return item;
      return {
        ...item,
        precio_unitario: pf.unitPrice,
        precio_unitario_sin_redondeo: pf.rawUnitPrice,
        precio_display_sin_redondeo: pf.rawDisplayPrice,
        base_precio: pf.basePrecio,
        redondeo: pf.redondeo,
      };
    }));
  }, [resolvePricingFull, productos]);

  const { data: pedidoSugeridoRaw } = useOfflineQuery('cliente_pedido_sugerido', { cliente_id: clienteId }, { enabled: !!clienteId });
  const pedidoSugerido = useMemo(() => {
    if (!pedidoSugeridoRaw || !productos) return [];
    return (pedidoSugeridoRaw as any[]).map(ps => { const prod = productos.find((p: any) => p.id === ps.producto_id); return prod ? { ...ps, productos: prod } : null; }).filter(Boolean);
  }, [pedidoSugeridoRaw, productos]);

  // Saldo a favor del cliente (crédito por notas de crédito). Funciona offline.
  const { disponible: saldoFavorDisp } = useSaldoFavor(clienteId);

  // ── Client insights (smart suggestion + alerts) ──
  const insights = useClienteInsights(clienteId, selectedClienteData);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => { setBannerDismissed(false); }, [clienteId]);

  // Auto-fill fecha_entrega for pedidos based on client's route days
  useEffect(() => {
    if (tipoVenta !== 'pedido') return;
    if (fechaEntrega) return;
    const dias = (selectedClienteData as any)?.dia_visita as string[] | null | undefined;
    setFechaEntrega(nextVisitDate(dias));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoVenta, clienteId]);

  // Data visibility: si la empresa tiene 'propios' y el usuario no tiene 'ver_todos',
  // solo mostrar los clientes asignados a este vendedor.
  const { seeAll: seeAllClientes, clientesVisibilidad } = useDataVisibility('clientes');
  const clientesVisibles = useMemo(() => {
    if (!clientes) return clientes;
    if (seeAllClientes) return clientes;
    if (clientesVisibilidad === 'propios' && profile?.id) {
      return (clientes as any[]).filter(c => c.vendedor_id === profile.id);
    }
    return clientes;
  }, [clientes, seeAllClientes, clientesVisibilidad, profile?.id]);

  const filteredClientes = clientesVisibles?.filter(c => !searchCliente || c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) || c.codigo?.toLowerCase().includes(searchCliente.toLowerCase()));
  const productosDisponibles = useMemo(() => {
    if (!productos) return [];
    if (tipoVenta === 'pedido') return productos;
    if (useFallbackStock && almacenId) {
      return productos.filter(p => p.vender_sin_stock || (stockAbordo.get(p.id) ?? 0) > 0);
    }
    if (useFallbackStock) {
      return productos.filter(p => p.vender_sin_stock || (p.cantidad ?? 0) > 0);
    }
    return productos.filter(p => p.vender_sin_stock || (stockAbordo.get(p.id) ?? 0) > 0);
  }, [productos, tipoVenta, stockAbordo, useFallbackStock, almacenId]);
  const filteredProductos = productosDisponibles?.filter(p => {
    if (!searchProducto) return true;
    const q = searchProducto.toLowerCase();
    return p.nombre.toLowerCase().includes(q)
      || p.codigo.toLowerCase().includes(q)
      || ((p as any).formula ?? '').toLowerCase().includes(q);
  });
  const filteredDevProductos = productos?.filter(p => !searchDevProducto || p.nombre.toLowerCase().includes(searchDevProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchDevProducto.toLowerCase()));
  const filteredReemplazoProductos = productos?.filter(p => !searchReemplazo || p.nombre.toLowerCase().includes(searchReemplazo.toLowerCase()) || p.codigo.toLowerCase().includes(searchReemplazo.toLowerCase()));

  const getMaxQty = (productoId: string) => {
    if (apartadoActivoPedido) return Math.max(0, apartadoDisponible.get(productoId) ?? 0);
    if (tipoVenta === 'pedido') return Infinity;
    const prod = productos?.find(p => p.id === productoId);
    if (prod?.vender_sin_stock) return Infinity;
    if (useFallbackStock && almacenId) {
      return stockAbordo.get(productoId) ?? 0;
    }
    if (useFallbackStock) {
      return prod?.cantidad ?? 0;
    }
    return stockAbordo.get(productoId) ?? 0;
  };

  /** Disponible (con signo, permite negativos) para mostrar en UI cuando hay apartado */
  const getDispSigned = (productoId: string): number => {
    if (apartadoActivoPedido) return apartadoDisponible.get(productoId) ?? 0;
    return getMaxQty(productoId);
  };

  /** Apply a list of suggested items into the cart, capping qty at available stock */
  const applySuggestionList = (items: { producto_id: string; cantidad: number }[], label: string) => {
    if (!productos || !items.length) return;
    const newItems: CartItem[] = [];
    let cappedCount = 0;
    let skippedCount = 0;
    items.forEach(s => {
      const prod = (productos as any[]).find(p => p.id === s.producto_id);
      if (!prod) return;
      const max = getMaxQty(prod.id);
      // Skip products with zero stock when in venta_directa mode
      if (max <= 0) { skippedCount++; return; }
      const finalQty = Math.min(s.cantidad, max);
      if (finalQty <= 0) { skippedCount++; return; }
      if (finalQty < s.cantidad) cappedCount++;
      const pf = resolvePricingFull(prod);
      newItems.push({
        producto_id: prod.id, codigo: prod.codigo, nombre: prod.nombre,
        precio_unitario: pf.unitPrice, cantidad: finalQty,
        unidad: (prod.unidades as any)?.abreviatura || 'pz',
        unidad_id: prod.unidad_venta_id ?? undefined,
        tiene_iva: prod.tiene_iva ?? false,
        iva_pct: prod.tiene_iva ? (prod.iva_pct ?? 16) : 0,
        tiene_ieps: prod.tiene_ieps ?? false,
        ieps_pct: prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0,
        precio_unitario_sin_redondeo: pf.rawUnitPrice,
        precio_display_sin_redondeo: pf.rawDisplayPrice,
        base_precio: pf.basePrecio, redondeo: pf.redondeo,
      });
    });
    setCart(prev => [...prev.filter(c => c.es_cambio), ...newItems]);
    let msg = `${newItems.length} productos cargados (${label})`;
    if (cappedCount > 0) msg += ` · ${cappedCount} ajustados al stock`;
    if (skippedCount > 0) msg += ` · ${skippedCount} sin stock`;
    toast.success(msg);
  };

  /** Backwards-compatible: smart pick (manual list preferred, fallback to historial) */
  const applySmartSuggestion = () => applySuggestionList(insights.suggested, insights.manualList.length > 0 ? 'lista' : 'historial');
  /** Apply ONLY the manually configured list */
  const applyManualList = () => applySuggestionList(insights.manualList, 'lista configurada');
  /** Apply ONLY the historical average */
  const applyHistorialAvg = () => applySuggestionList(insights.historialAvg, 'promedio historial');

  /** Repeat the client's last sale */
  const repeatLastSale = () => {
    if (!productos || !insights.lastSaleLineas.length) return;
    const newItems: CartItem[] = [];
    let cappedCount = 0;
    let skippedCount = 0;
    insights.lastSaleLineas.forEach(l => {
      const prod = (productos as any[]).find(p => p.id === l.producto_id);
      if (!prod) return;
      const max = getMaxQty(prod.id);
      if (max <= 0) { skippedCount++; return; }
      const requestedQty = Number(l.cantidad) || 1;
      const finalQty = Math.min(requestedQty, max);
      if (finalQty < requestedQty) cappedCount++;
      const pf = resolvePricingFull(prod);
      newItems.push({
        producto_id: prod.id, codigo: prod.codigo, nombre: prod.nombre,
        precio_unitario: pf.unitPrice, cantidad: finalQty,
        unidad: (prod.unidades as any)?.abreviatura || 'pz',
        unidad_id: prod.unidad_venta_id ?? undefined,
        tiene_iva: prod.tiene_iva ?? false,
        iva_pct: prod.tiene_iva ? (prod.iva_pct ?? 16) : 0,
        tiene_ieps: prod.tiene_ieps ?? false,
        ieps_pct: prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0,
        precio_unitario_sin_redondeo: pf.rawUnitPrice,
        precio_display_sin_redondeo: pf.rawDisplayPrice,
        base_precio: pf.basePrecio, redondeo: pf.redondeo,
      });
    });
    setCart(prev => [...prev.filter(c => c.es_cambio), ...newItems]);
    let msg = `${newItems.length} productos de la última venta`;
    if (cappedCount > 0) msg += ` · ${cappedCount} ajustados al stock`;
    if (skippedCount > 0) msg += ` · ${skippedCount} sin stock`;
    toast.success(msg);
  };

  /** Find product by scanned code (barcode → SKU → name fuzzy) */
  const findProductByCode = (code: string): any | null => {
    if (!productos || !code) return null;
    const c = code.trim().toLowerCase();
    const list = productos as any[];
    return (
      list.find(p => (p.id ?? '').toLowerCase() === c) ||
      list.find(p => (p.codigo_barras ?? '').toLowerCase() === c) ||
      list.find(p => (p.codigo ?? '').toLowerCase() === c) ||
      list.find(p => (p.codigo_barras ?? '').toLowerCase().includes(c)) ||
      list.find(p => (p.codigo ?? '').toLowerCase().includes(c)) ||
      list.find(p => (p.nombre ?? '').toLowerCase().includes(c)) ||
      null
    );
  };

  /** Set exact qty (used by numeric keypad) */
  const setItemQty = (productoId: string, qty: number, esCambio = false) => {
    const match = !!esCambio;
    if (qty <= 0) {
      setCart(prev => prev.filter(c => !(c.producto_id === productoId && !!c.es_cambio === match)));
      return;
    }
    const maxQty = esCambio ? Infinity : getMaxQty(productoId);
    const capped = Math.min(qty, maxQty);
    setCart(prev => prev.map(c => c.producto_id === productoId && !!c.es_cambio === match ? { ...c, cantidad: capped } : c));
  };

  // Default pedidoAlmacenId al primer almacén habilitado cuando aplica
  useEffect(() => {
    if (!apartadoActivoPedido) { if (pedidoAlmacenId !== null) setPedidoAlmacenId(null); return; }
    if (apartadoAlmacenesIds.length === 0) return;
    if (!pedidoAlmacenId || !apartadoAlmacenesIds.includes(pedidoAlmacenId)) {
      setPedidoAlmacenId(apartadoAlmacenesIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartadoActivoPedido, apartadoAlmacenesIds.join(',')]);


  const addToCart = (p: any, esCambio = false) => {
    const maxQty = esCambio ? Infinity : getMaxQty(p.id);
    const stockMessage = apartadoActivoPedido ? 'Sin stock disponible' : 'Stock a bordo insuficiente';
    const existing = cart.find(c => c.producto_id === p.id && c.es_cambio === esCambio);
    if (existing) {
      const newQty = Math.min(existing.cantidad + 1, maxQty);
      if (newQty <= existing.cantidad) { toast.error(stockMessage); return; }
      setCart(cart.map(c => c.producto_id === p.id && c.es_cambio === esCambio ? { ...c, cantidad: newQty } : c));
    } else {
      if (maxQty < 1) { toast.error(apartadoActivoPedido ? 'Sin stock disponible' : 'Sin stock a bordo'); return; }
      const pf = resolvePricingFull(p);
      const almacenLinea = apartadoActivoPedido && !esCambio ? pedidoAlmacenId : null;
      setCart([...cart, { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, precio_unitario: esCambio ? 0 : pf.unitPrice, cantidad: 1, unidad: 'pz', unidad_id: p.unidad_venta_id ?? undefined, tiene_iva: esCambio ? false : (p.tiene_iva ?? false), iva_pct: esCambio ? 0 : (p.tiene_iva ? (p.iva_pct ?? 16) : 0), tiene_ieps: esCambio ? false : (p.tiene_ieps ?? false), ieps_pct: esCambio ? 0 : (p.tiene_ieps ? (p.ieps_pct ?? 0) : 0), es_cambio: esCambio, precio_unitario_sin_redondeo: esCambio ? 0 : pf.rawUnitPrice, precio_display_sin_redondeo: esCambio ? 0 : pf.rawDisplayPrice, base_precio: pf.basePrecio, redondeo: pf.redondeo, almacen_id: almacenLinea }]);
    }
  };

  /** Add/replace a granel line with explicit cantidad (in unidad base) and presentación snapshot */
  const addGranelLine = (p: any, opts: { cantidadBase: number; precioUnitario: number; paquetes: number | null; presentacion: { id: string; nombre: string; factor_base: number } | null }) => {
    const { cantidadBase, precioUnitario, paquetes, presentacion } = opts;
    if (cantidadBase <= 0) return;
    const noLimit = !apartadoActivoPedido && !!p.vender_sin_stock;
    const maxQty = noLimit ? Infinity : getMaxQty(p.id);
    if (!noLimit && maxQty <= 0) {
      toast.error('Sin stock disponible');
      return;
    }
    // Unidad base: granel usa unidad_granel; no-granel usa la abreviatura de la
    // unidad de venta (pz por defecto). Antes caía siempre en 'kg' y etiquetaba
    // mal los productos por pieza con presentaciones.
    const unidadBase = p.es_granel
      ? (p.unidad_granel || p.unidades?.abreviatura || 'kg')
      : (p.unidades?.abreviatura || 'pz');
    if (!noLimit && cantidadBase > maxQty) {
      toast.error(`No puedes vender más de ${maxQty.toLocaleString('es-MX', { maximumFractionDigits: 3 })} ${unidadBase} disponibles`);
      return;
    }
    const capped = cantidadBase;
    // `precioUnitario` (por unidad base) viene BRUTO = precio final que ve/paga
    // el cliente. Guardamos el neto derivado + el display bruto, para que el
    // desglose de impuestos cuadre. Antes se guardaba el bruto como si fuera el
    // neto y luego se le sumaban impuestos otra vez (erosión: 89.81 en vez de 97).
    const gsnap = buildManualSalePricingFromGross(
      { tiene_iva: p.tiene_iva ?? false, iva_pct: p.tiene_iva ? (p.iva_pct ?? 16) : 0, tiene_ieps: p.tiene_ieps ?? false, ieps_pct: p.tiene_ieps ? (p.ieps_pct ?? 0) : 0 },
      precioUnitario,
    );
    const existingIdx = cart.findIndex(c => c.producto_id === p.id && !c.es_cambio);
    // La "unidad base" (sin presentación con nombre) al precio de tarifa NO es un
    // precio manual: es el sugerido de la lista. Solo marcamos manual cuando hay
    // una presentación con nombre (caja/paquete, precio especial) o granel a peso.
    const esUnidadBaseTarifa = presentacion === null && !p.es_granel;
    const lineBase: any = {
      producto_id: p.id, codigo: p.codigo, nombre: p.nombre,
      precio_unitario: gsnap.unitPrice,
      cantidad: capped,
      unidad: unidadBase,
      unidad_id: p.unidad_venta_id ?? undefined,
      tiene_iva: p.tiene_iva ?? false,
      iva_pct: p.tiene_iva ? (p.iva_pct ?? 16) : 0,
      tiene_ieps: p.tiene_ieps ?? false,
      ieps_pct: p.tiene_ieps ? (p.ieps_pct ?? 0) : 0,
      es_cambio: false,
      precio_unitario_sin_redondeo: gsnap.rawUnitPrice,
      precio_display_sin_redondeo: gsnap.rawDisplayPrice,
      base_precio: gsnap.basePrecio,
      redondeo: gsnap.redondeo,
      presentacion_id: presentacion?.id ?? null,
      presentacion_nombre: presentacion?.nombre ?? null,
      presentacion_factor: presentacion?.factor_base ?? null,
      paquetes,
      precio_manual: !esUnidadBaseTarifa,
      almacen_id: apartadoActivoPedido ? pedidoAlmacenId : null,
    };
    if (existingIdx >= 0) setCart(cart.map((c, i) => i === existingIdx ? { ...c, ...lineBase } : c));
    else setCart([...cart, lineBase]);
  };

  const updateQty = (productoId: string, delta: number, esCambio?: boolean) => { const match = !!esCambio; setCart(prev => prev.map(c => { if (c.producto_id !== productoId || !!c.es_cambio !== match) return c; const newQty = c.cantidad + delta; const maxQty = esCambio ? Infinity : getMaxQty(productoId); if (newQty > maxQty) return c; return newQty > 0 ? { ...c, cantidad: newQty } : c; })); };
  const removeFromCart = (productoId: string, esCambio?: boolean) => { const match = !!esCambio; setCart(prev => prev.filter(c => !(c.producto_id === productoId && !!c.es_cambio === match))); };
  const getItemInCart = (productoId: string) => cart.find(c => c.producto_id === productoId && !c.es_cambio);

  const requireDevolucionesPermiso = () => {
    if (canDoDevoluciones) return true;
    toast.error('Tu rol no permite registrar devoluciones en Ruta');
    setDevoluciones([]);
    return false;
  };

  const addDevolucion = (p: any, defaults?: { motivo?: DevolucionItem['motivo']; accion?: DevolucionItem['accion'] }) => { if (!requireDevolucionesPermiso()) return; if (devoluciones.find(d => d.producto_id === p.id)) { updateDevQty(p.id, (devoluciones.find(d => d.producto_id === p.id)?.cantidad ?? 0) + 1); return; } setDevoluciones(prev => [...prev, { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1, motivo: defaults?.motivo ?? 'no_vendido', accion: defaults?.accion ?? 'reposicion', precio_unitario: p.precio_principal ?? 0 }]); };
  const updateDevQty = (productoId: string, qty: number) => { if (!requireDevolucionesPermiso()) return; if (qty <= 0) setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId)); else setDevoluciones(prev => prev.map(d => d.producto_id === productoId ? { ...d, cantidad: qty } : d)); };
  const updateDevMotivo = (productoId: string, motivo: DevolucionItem['motivo']) => { if (!requireDevolucionesPermiso()) return; setDevoluciones(prev => prev.map(d => { if (d.producto_id !== productoId) return d; const updated = { ...d, motivo }; if (updated.accion === 'reposicion' && motivo !== 'cambio' && motivo !== 'danado' && motivo !== 'caducado' && motivo !== 'error_pedido') { /* keep accion */ } return updated; })); };
  const updateDevAccion = (productoId: string, accion: DevolucionItem['accion']) => { if (!requireDevolucionesPermiso()) return; setDevoluciones(prev => prev.map(d => { if (d.producto_id !== productoId) return d; const updated = { ...d, accion }; if (accion !== 'reposicion') { delete updated.reemplazo_producto_id; delete updated.reemplazo_nombre; } return updated; })); };
  const batchUpdateDevDefaults = (motivo: DevolucionItem['motivo'], accion: DevolucionItem['accion']) => { if (!requireDevolucionesPermiso()) return; setDevoluciones(prev => prev.map(d => { const updated = { ...d, motivo, accion }; if (accion !== 'reposicion') { delete updated.reemplazo_producto_id; delete updated.reemplazo_nombre; } return updated; })); };
  const setReemplazo = (devProductoId: string, p: any) => { if (!requireDevolucionesPermiso()) return; setDevoluciones(prev => prev.map(d => d.producto_id === devProductoId ? { ...d, reemplazo_producto_id: p.id, reemplazo_nombre: p.nombre } : d)); setShowReemplazoFor(null); setSearchReemplazo(''); };
  const removeDevolucion = (productoId: string) => { setDevoluciones(prev => prev.filter(d => d.producto_id !== productoId)); };

  const processDevolucionesAndGoToProductos = () => {
    if (!canDoDevoluciones) {
      setDevoluciones([]);
      setCart(prev => prev.filter(c => !c.es_cambio));
      setStep('productos');
      return;
    }
    let newCart = cart.filter(c => !c.es_cambio);
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
      // El motor de promociones trabaja SIEMPRE sobre el precio BRUTO cobrado
      // (con impuestos y redondeo ya aplicados). Así un 10% de descuento es 10%
      // de lo que paga el cliente, y el IVA queda proporcional.
      const bruto = getOriginalLineBreakdown(c, sinImpuestos);
      const qty = Number(c.cantidad) || 0;
      return {
        producto_id: c.producto_id,
        clasificacion_id: prod?.clasificacion_id ?? undefined,
        precio_unitario: qty > 0 ? bruto.total / qty : 0,
        cantidad: c.cantidad,
      };
    });
    return evaluatePromociones(promocionesActivas, cartForPromo, clienteId || undefined, (selectedCliente as any)?.zona_id || undefined, (empresa as any)?.zona_horaria);
  }, [promocionesActivas, cart, clienteId, selectedCliente, productos, sinImpuestos]);

  // ── Promociones de PRODUCTO GRATIS pendientes ────────────────────────────
  // El motor solo rebaja el regalo si ya está en el carrito. Aquí detectamos
  // los que faltan para (a) agregarlos solos y (b) impedir cobrar mal.
  const pendingGratis = useMemo(() => {
    if (!promocionesActivas || cart.length === 0) return [] as PendingProductoGratis[];
    const items: CartItemForPromo[] = cart.filter(c => !c.es_cambio).map(c => ({
      producto_id: c.producto_id,
      clasificacion_id: productos?.find((p: any) => p.id === c.producto_id)?.clasificacion_id ?? undefined,
      precio_unitario: Number(c.precio_unitario) || 0,
      cantidad: Number(c.cantidad) || 0,
    }));
    return getPendingProductoGratis(
      promocionesActivas, items, clienteId || undefined,
      (selectedCliente as any)?.zona_id || undefined, (empresa as any)?.zona_horaria,
    );
  }, [promocionesActivas, cart, clienteId, selectedCliente, productos, empresa]);

  const autoPromosOn = promosAutoHabilitado((empresa as any)?.licencia);

  // Agrega solo el producto de bonificación con la cantidad faltante (topada al
  // stock disponible). El motor de promociones lo netea a $0 en el siguiente
  // render, así que el vendedor ya no tiene que acordarse de agregarlo.
  useEffect(() => {
    if (!autoPromosOn || pendingGratis.length === 0) return;
    for (const pend of pendingGratis) {
      const prod = productos?.find((p: any) => p.id === pend.gratis_producto_id);
      if (!prod) continue;
      const enCarrito = cart.find(c => c.producto_id === pend.gratis_producto_id && !c.es_cambio)?.cantidad ?? 0;
      const deseada = enCarrito + pend.cantidad_gratis_faltante;
      const maxQty = getMaxQty(pend.gratis_producto_id);
      const objetivo = Math.min(deseada, maxQty);
      if (objetivo <= enCarrito) continue; // sin stock a bordo para el regalo
      if (enCarrito > 0) {
        setItemQty(pend.gratis_producto_id, objetivo);
      } else {
        addToCart(prod);
        if (objetivo > 1) setItemQty(pend.gratis_producto_id, objetivo);
      }
      return; // un ajuste por render; el efecto vuelve a correr con el carrito nuevo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPromosOn, pendingGratis, productos]);




  // Build a map of raw promo discount per product
  const promoRawByProduct = useMemo(() => {
    const m = new Map<string, number>();
    promoResults.forEach(r => {
      if (r.producto_id) m.set(r.producto_id, (m.get(r.producto_id) ?? 0) + r.descuento);
    });
    return m;
  }, [promoResults]);

  const descuentoDevolucion = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return devoluciones.filter(d => d.accion === 'descuento_venta').reduce((s, d) => {
      const prod: any = productos?.find((p: any) => p.id === d.producto_id);
      // Base price: from devolución, fallback to product, fallback to cart line
      let base = d.precio_unitario;
      if (!base || base <= 0) {
        const cartLine = cart.find(c => c.producto_id === d.producto_id && !c.es_cambio);
        base = prod?.precio_principal ?? cartLine?.precio_unitario ?? 0;
      }
      // Include taxes so the discount actually reduces the tax-inclusive total
      let factor = 1;
      if (!sinImpuestos && prod) {
        if (prod.tiene_iva) factor += (prod.iva_pct ?? 16) / 100;
        if (prod.tiene_ieps && prod.ieps_tipo !== 'cuota') factor += (prod.ieps_pct ?? 0) / 100;
      }
      return s + r2(base * factor) * d.cantidad;
    }, 0);
  }, [devoluciones, productos, cart, sinImpuestos]);

  // Descuento EFECTIVO de promoción por producto.
  // El motor ya trabaja sobre el bruto cobrado, así que el descuento se aplica
  // tal cual (topado al total de la línea). Sin dobles conversiones.
  const promoEffectiveByProduct = useMemo(() => {
    const m = new Map<string, number>();
    cart.forEach(item => {
      if (item.es_cambio) return;
      const original = getOriginalLineBreakdown(item, sinImpuestos);
      const qty = Number(item.cantidad) || 0;
      const promoParts = separarDescuentoPromo(
        promoResults,
        item.producto_id,
        qty > 0 ? original.total / qty : 0,
      );
      const eff = Math.min(
        original.total,
        r2(promoParts.descuentoRegular + promoParts.descuentoGratisBruto),
      );
      if (eff > 0) m.set(item.producto_id, r2((m.get(item.producto_id) ?? 0) + eff));
    });
    return m;
  }, [cart, promoResults, sinImpuestos]);

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, items = 0, descuentoPromo = 0;
    const pendiente = new Map<string, number>(promoEffectiveByProduct);
    cart.forEach(item => {
      if (item.es_cambio) { items += item.cantidad; return; }
      const original = getOriginalLineBreakdown(item, sinImpuestos);
      // El encabezado se arma sumando las líneas YA netas de promoción, así
      // siempre se cumple subtotal + IVA + IEPS = total.
      const rem = pendiente.get(item.producto_id) ?? 0;
      const aplicado = rem > 0 ? Math.min(rem, original.total) : 0;
      if (aplicado > 0) pendiente.set(item.producto_id, rem - aplicado);
      const ajustado = aplicado > 0 ? aplicarPromoALinea(original, aplicado) : original;
      subtotal += ajustado.subtotal;
      iva += ajustado.iva;
      ieps += ajustado.ieps;
      descuentoPromo += aplicado;
      items += item.cantidad;
    });
    const preExtra = r2(Math.max(0, subtotal + ieps + iva - descuentoDevolucion));
    // Solo aplica si tiene permiso y valor > 0
    const extraVal = canApplyDiscount && descuentoExtraValor > 0 ? descuentoExtraValor : 0;
    const extraAmt = extraVal > 0
      ? r2(descuentoExtraTipo === 'porcentaje' ? preExtra * (extraVal / 100) : Math.min(extraVal, preExtra))
      : 0;
    const totalDescuentos = r2(descuentoPromo + descuentoDevolucion + extraAmt);
    const total = r2(Math.max(0, preExtra - extraAmt));
    return { subtotal: r2(subtotal), iva: r2(iva), ieps: r2(ieps), total, items, descuento: totalDescuentos, descuentoDevolucion: r2(descuentoDevolucion), descuentoExtra: extraAmt };
  }, [cart, promoEffectiveByProduct, descuentoDevolucion, sinImpuestos, canApplyDiscount, descuentoExtraValor, descuentoExtraTipo]);



  const creditoDisponible = clienteCredito ? clienteCredito.limite - saldoPendienteTotal : 0;
  const excedeCredito = condicionPago === 'credito' && totals.total > creditoDisponible;
  const totalPagosLineas = pagos.reduce((s, p) => s + p.monto, 0);

  // Auto-distribute surplus payment to pending accounts (FIFO)
  useEffect(() => {
    if (condicionPago !== 'contado' || cuentasPendientes.length === 0) return;
    const surplus = totalPagosLineas - totals.total;
    if (surplus <= 0) {
      // Reset any auto-assigned amounts when payment doesn't cover current sale
      const hasAny = cuentasPendientes.some(c => c.montoAplicar > 0);
      if (hasAny) setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: 0 })));
      return;
    }
    let remaining = surplus;
    const updated = cuentasPendientes.map(c => {
      const apply = Math.min(remaining, c.saldo_pendiente);
      remaining -= apply;
      return { ...c, montoAplicar: Math.round(apply * 100) / 100 };
    });
    // Only update if values actually changed to avoid infinite loop
    const changed = updated.some((u, i) => u.montoAplicar !== cuentasPendientes[i].montoAplicar);
    if (changed) setCuentasPendientes(updated);
  }, [totalPagosLineas, totals.total, condicionPago, cuentasPendientes.length]);

  const totalAplicarCuentas = cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0);
  const totalACobrar = (condicionPago === 'contado' ? totals.total : 0) + totalAplicarCuentas;
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
    if (!canDoDevoluciones && devoluciones.length > 0) {
      toast.error('Tu rol no permite registrar devoluciones en Ruta');
      setDevoluciones([]);
      setStep('productos');
      return;
    }
     if (!profile?.almacen_id) {
      opts?.onAlmacenMissing?.();
      return;
    }
    if (savingRef.current) return;
    if (tipoVenta === 'pedido' && !fechaEntrega) {
      toast.error('La fecha de entrega es obligatoria');
      return;
    }
    // El pago con saldo a favor no puede exceder el crédito disponible del cliente.
    const totalSaldoFavor = pagos
      .filter(p => p.metodo_pago === SALDO_FAVOR_METODO)
      .reduce((s, p) => s + p.monto, 0);
    if (totalSaldoFavor > saldoFavorDisp + 0.01) {
      toast.error(`Saldo a favor insuficiente. Disponible: ${fmt(saldoFavorDisp)}`);
      return;
    }
    // Nunca guardar una venta cuando las promociones no se pudieron cargar:
    // se cobraría a precio completo sin descuento y sin ningún aviso.
    if (promosError || promosLoading || !promocionesActivas) {
      toast.error('No se pudieron cargar las promociones. Sincroniza antes de cobrar.');
      try { refetchPromos(); } catch { /* ignore */ }
      return;
    }
    // Promoción de producto gratis que no se pudo aplicar (regalo sin stock a
    // bordo). Guardar así cobraría de más: se bloquea con el detalle.
    if (autoPromosOn && pendingGratis.length > 0) {
      const nombres = pendingGratis.map(p => {
        const prod = productos?.find((x: any) => x.id === p.gratis_producto_id);
        return `${p.promocion_nombre}: faltan ${p.cantidad_gratis_faltante} de ${prod?.nombre ?? 'producto'}`;
      }).join(' · ');
      toast.error(`Promoción sin aplicar — ${nombres}. Agrega el producto de regalo o quita la promoción.`);
      return;
    }

    // Lotes: lo loteado debe ser EXACTAMENTE igual a lo pedido en cada línea.
    if (manejaLotesEmpresa) {
      const sinLotear = cart.filter(c => lotePendienteDe(c) !== 0);
      if (sinLotear.length > 0) {
        toast.error(`Falta asignar lotes en: ${sinLotear.map(c => c.nombre).join(', ')}`);
        return;
      }
    }


    savingRef.current = true;
    setSaving(true);

    try {
      // Id estable de la venta: se genera una vez y se reusa en reintentos.
      if (!pendingVentaIdRef.current) pendingVentaIdRef.current = crypto.randomUUID();
      const ventaId = pendingVentaIdRef.current;
      // El folio lo asigna EXCLUSIVAMENTE el trigger de la BD (auto_folio_venta)
      // al insertar. Es la única fuente confiable y ya es seguro ante
      // concurrencia (advisory lock por empresa/prefijo).
      //
      // Antes se generaba aquí en el cliente y se enviaba ya asignado, por lo
      // que el trigger lo respetaba y NO lo corregía. Eso producía el desorden:
      //   - RPC generate_folio (MAX+1 sin lock) → duplicados (p. ej. VTA-4210).
      //   - Fallback offline `VTA-<hex del uuid>` → folios sin lógica; y si el
      //     hex salía todo numérico, envenenaba el MAX (folios de 7-8 dígitos).
      // Ahora enviamos folio=null: estando offline la UI muestra un placeholder
      // (el id) hasta que sincroniza y el servidor asigna el consecutivo real.

      // NOTE: Devoluciones block moved AFTER ventas/venta_lineas enqueue to
      // guarantee parent→child order in the sync queue (avoids FK 23503 on
      // devoluciones_venta_id_fkey and cascading RLS 42501 on devolucion_lineas).

      const applyPayment = totalACobrar > 0;

      // Resolve "Público general" client when no client was selected, so cobros (NOT NULL cliente_id) can be registered
      let clientePublicoId: string | null = null;
      if (!clienteId) {
        try {
          const { data: publicClient } = await supabase
            .from('clientes')
            .select('id')
            .eq('empresa_id', empresa.id)
            .eq('status', 'activo')
            .in('nombre', ['Público general', 'Publico general', 'Público General', 'Publico General'])
            .limit(1)
            .maybeSingle();
          if (publicClient?.id) {
            clientePublicoId = publicClient.id;
          } else {
            const { data: createdPublicClient } = await supabase
              .from('clientes')
              .insert({ empresa_id: empresa.id, nombre: 'Público general', status: 'activo', credito: false, vendedor_id: profile?.id || null })
              .select('id')
              .single();
            clientePublicoId = createdPublicClient?.id ?? null;
          }
        } catch (e) { console.error('Error resolviendo Público general:', e); }
      }
      const ventaClienteId = clienteId ?? clientePublicoId;

      // saldo_pendiente starts as full total; will be reduced after payments are applied
      const tarifaId = clienteTarifaId || selectedClienteData?.tarifa_id || null;
      const extraAmtSaved = (totals as any).descuentoExtra ?? 0;
      const extraValSaved = canApplyDiscount && descuentoExtraValor > 0 ? descuentoExtraValor : 0;
      // ── Promoción descontada EN LA LÍNEA (bandera por licencia) ──────────
      // Cada línea se guarda ya neta de su promoción. El TOTAL de la venta NO
      // cambia (mismo neto que ya se cobraba): solo se reparte el descuento.
      const netearLineas = promoLineaHabilitado((empresa as any)?.licencia);
      const promoPendiente = new Map<string, number>(promoEffectiveByProduct);
      const brutoPorIdx: Array<{ subtotal: number; iva: number; ieps: number; total: number }> = [];
      const netoPorIdx: Array<{ subtotal: number; iva: number; ieps: number; total: number }> = [];
      for (const item of cart) {
        const bruto = getOriginalLineBreakdown(item, sinImpuestos);
        brutoPorIdx.push(bruto);
        let neto = bruto;
        if (netearLineas && !item.es_cambio) {
          const pend = promoPendiente.get(item.producto_id) ?? 0;
          if (pend > 0) {
            const aplicar = Math.min(pend, bruto.total);
            neto = aplicarPromoALinea(bruto, aplicar);
            promoPendiente.set(item.producto_id, r2(pend - aplicar));
          }
        }
        netoPorIdx.push(neto);
      }

      let headerSubtotal = totals.subtotal;
      let headerIva = totals.iva;
      let headerIeps = totals.ieps;
      let headerDescuento = totals.descuento;
      if (netearLineas) {
        headerSubtotal = r2(netoPorIdx.reduce((s, b) => s + b.subtotal, 0));
        headerIva = r2(netoPorIdx.reduce((s, b) => s + b.iva, 0));
        headerIeps = r2(netoPorIdx.reduce((s, b) => s + b.ieps, 0));
        // La promoción ya está restada en las líneas: no se vuelve a restar aquí.
        headerDescuento = r2(Math.max(0, (totals.descuentoDevolucion ?? 0) + extraAmtSaved));
      }

      await queueOperation('ventas', 'insert', { id: ventaId, empresa_id: empresa.id, cliente_id: ventaClienteId, tipo: tipoVenta, vendedor_id: profile?.id || profile?.id || null, condicion_pago: condicionPago, entrega_inmediata: entregaInmediata, fecha_entrega: tipoVenta === 'pedido' && fechaEntrega ? fechaEntrega : null, status: 'confirmado', notas: notas || null, folio: null, tarifa_id: tarifaId, almacen_id: profile?.almacen_id || null, subtotal: headerSubtotal, iva_total: headerIva, ieps_total: headerIeps, descuento_total: headerDescuento, descuento_extra: extraValSaved, descuento_extra_tipo: descuentoExtraTipo, descuento_extra_motivo: extraAmtSaved > 0 ? (descuentoExtraMotivo || null) : null, total: totals.total, saldo_pendiente: totals.total, fecha: todayInTimezone(empresa.zona_horaria), created_at: new Date().toISOString() });


      const promoLineIdByProduct = new Map<string, string>();
      const promoLineTotalByProduct = new Map<string, number>();
      // Se construyen todas las líneas y se encolan en UN SOLO lote (insert-many):
      // una venta de 50 productos = 1 subida al servidor, no 50 → aparece completa
      // casi al instante en admin, sin la ventana en que faltaban líneas.
      const lineasBatch: any[] = [];
      // Desglose informativo por línea (bandera por licencia). NO altera montos.
      const guardarDesglose = desgloseLineaHabilitado((empresa as any)?.licencia);
      for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const breakdown = netoPorIdx[idx];
        const savedIvaPct = sinImpuestos ? 0 : item.iva_pct;
        const savedIepsPct = sinImpuestos ? 0 : item.ieps_pct;
        const lineaAlmacenId = (item as any).almacen_id ?? (apartadoActivoPedido && !item.es_cambio ? pedidoAlmacenId : null);
        // Id determinístico por (venta, posición): reintentar reusa el mismo id
        // → el upsert no duplica la línea.
        const ventaLineaId = await deterministicUuid('vlinea', ventaId, idx);
        if (!item.es_cambio) {
          if (!promoLineIdByProduct.has(item.producto_id)) promoLineIdByProduct.set(item.producto_id, ventaLineaId);
          // Tope de seguridad con el total BRUTO (pre-promoción) de la línea.
          promoLineTotalByProduct.set(item.producto_id, (promoLineTotalByProduct.get(item.producto_id) ?? 0) + brutoPorIdx[idx].total);
        }
        let desglose: Record<string, any> = {};
        if (guardarDesglose) {
          const promosLinea = promoResults.filter(p => p.producto_id === item.producto_id && Number(p.descuento) > 0);
          const promoDominante = promosLinea.slice().sort((a, b) => Number(b.descuento || 0) - Number(a.descuento || 0))[0];
          const cantidadBonificada = promosLinea.reduce((s, p) => s + (Number(p.cantidad_gratis) || 0), 0);
          desglose = buildDesgloseLinea({
            cantidad: item.cantidad,
            precioListaUnitario: Number((item as any).precio_unitario_sin_redondeo) || item.precio_unitario,
            breakdownBruto: brutoPorIdx[idx],
            breakdownNeto: breakdown,
            descuentoPromoMonto: r2(Math.max(0, brutoPorIdx[idx].total - breakdown.total)),
            descuentoManualMonto: 0,
            cantidadBonificada,
            promocion: promoDominante ? { id: promoDominante.promocion_id, nombre: promoDominante.nombre } : null,
            usuarioId: profile?.id || null,
            objetoImpuesto: (item as any).objeto_impuesto ?? null,
          });
        }
        lineasBatch.push({ id: ventaLineaId, venta_id: ventaId, producto_id: item.producto_id, descripcion: item.nombre, cantidad: item.cantidad, precio_unitario: item.cantidad > 0 ? r2(breakdown.subtotal / item.cantidad) : 0, precio_unitario_sin_redondeo: Number((item as any).precio_unitario_sin_redondeo) > 0 ? Number((item as any).precio_unitario_sin_redondeo) : (item.cantidad > 0 ? r2(breakdown.subtotal / item.cantidad) : 0), unidad_id: item.unidad_id || null, almacen_id: lineaAlmacenId, subtotal: breakdown.subtotal, iva_pct: savedIvaPct, iva_monto: breakdown.iva, ieps_pct: savedIepsPct, ieps_monto: breakdown.ieps, descuento_pct: 0, total: breakdown.total, lista_precio_id: (item as any).lista_precio_id ?? clienteListaPrecioId ?? null, precio_manual: (item as any).precio_manual ?? false, notas: item.es_cambio ? 'CAMBIO - Sin cargo' : null, presentacion_id: item.presentacion_id ?? null, presentacion_nombre: item.presentacion_nombre ?? null, presentacion_factor: item.presentacion_factor ?? null, paquetes: item.paquetes ?? null, lote_id: item.lote_id ?? null, ...desglose, created_at: new Date().toISOString() });
        if (apartadoActivoPedido && !item.es_cambio && lineaAlmacenId) {
          try {
            const apartTable = getOfflineTable('stock_apartado');
            await apartTable?.put({ id: await deterministicUuid('apart', ventaLineaId), empresa_id: empresa.id, venta_id: ventaId, venta_linea_id: ventaLineaId, producto_id: item.producto_id, almacen_id: lineaAlmacenId, lote_id: item.lote_id ?? null, cantidad: item.cantidad, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          } catch { /* cache local; el trigger del backend crea el apartado real */ }
        }
      }
      await queueInsertMany('venta_lineas', lineasBatch, 'venta_id');

      // Desglose informativo de promociones (para reportes). No altera totales.
      if (promoPersistHabilitado((empresa as any)?.licencia)) {
        const promoRows = buildPromoAplicadaRows({
          ventaId,
          promoResults,
          effectiveByProduct: promoEffectiveByProduct,
          lineIdByProduct: promoLineIdByProduct,
          lineTotalByProduct: promoLineTotalByProduct,
        });
        for (const row of promoRows) {
          // Id determinístico por (venta, promoción, línea) → reintento no duplica.
          const stableId = await deterministicUuid('promoapl', ventaId, row.promocion_id, row.venta_linea_id);
          await queueOperation('promocion_aplicada', 'insert', { ...row, id: stableId });
        }
      }



      // ── Devoluciones: encolar DESPUÉS de venta + venta_lineas para garantizar
      // orden padre→hijo en el sync queue (evita FK 23503 y RLS 42501 en cascada).
      if (devoluciones.length > 0 && clienteId) {
        // Id determinístico de la devolución por venta → reintento no duplica.
        const devId = await deterministicUuid('devventa', ventaId);
        const cargaIdForDev = activeCarga?.id || null;
        await queueOperation('devoluciones', 'insert', { id: devId, empresa_id: empresa.id, user_id: user.id, vendedor_id: profile?.id || profile?.id || null, cliente_id: clienteId, carga_id: cargaIdForDev, venta_id: ventaId, tipo: 'tienda', fecha: todayInTimezone(empresa.zona_horaria), created_at: new Date().toISOString() });
        let devLineaIdx = -1;
        for (const d of devoluciones) {
          devLineaIdx++;
          const montoCredito = (d.accion === 'nota_credito' || d.accion === 'devolucion_dinero' || d.accion === 'descuento_venta') ? d.precio_unitario * d.cantidad : 0;
          await queueOperation('devolucion_lineas', 'insert', {
            id: await deterministicUuid('devlinea', devId, devLineaIdx), devolucion_id: devId, producto_id: d.producto_id, cantidad: d.cantidad,
            motivo: d.motivo, accion: d.accion, reemplazo_producto_id: d.reemplazo_producto_id || null,
            monto_credito: montoCredito, created_at: new Date().toISOString(),
          });

          // ── carga_lineas: registrar la cantidad devuelta de esta carga ──
          if (activeCarga) {
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

          // ── Reingreso al inventario: lo aplica SOLO el trigger de BD
          // (apply_devolucion_linea_inventory sobre devolucion_lineas), igual que
          // useDevoluciones.ts (la pantalla de Devoluciones). Antes esta ruta también
          // ajustaba stock_almacen, productos.cantidad y creaba un movimiento
          // 'devolucion' A MANO —además del trigger—, y por el orden del sync se
          // DUPLICABA el reingreso (stock sumado 2×; movimientos 'devolucion' +
          // 'devolucion_aplicada'). Se elimina el ajuste manual y se delega al trigger.
        }
      }


      if (applyPayment && ventaClienteId && pagos.length > 0) {
        // Snapshot pending accounts to avoid mutating React state
        const cuentasSnapshot = cuentasPendientes
          .filter(c => c.montoAplicar > 0)
          .map(c => ({ id: c.id, montoAplicar: c.montoAplicar, saldo_pendiente: c.saldo_pendiente }));
        let saleRemaining = condicionPago === 'contado' ? totals.total : 0;
        let cuentaIdx = 0;
        const accountApplied = new Map<string, number>();

        let pagoIdx = -1;
        for (const pago of pagos) {
          pagoIdx++;
          if (pago.monto <= 0) continue;

          // Track applications first to determine the actual covered amount
          // (the cobro must reflect only what was applied, not the cash received — change is not part of the cobro)
          const aplicaciones: Array<{ venta_id: string; monto: number }> = [];
          let remaining = pago.monto;

          // First apply to current sale
          if (saleRemaining > 0 && remaining > 0) {
            const apply = Math.min(remaining, saleRemaining);
            aplicaciones.push({ venta_id: ventaId, monto: apply });
            saleRemaining -= apply;
            remaining -= apply;
          }

          // Then apply to pending accounts using snapshot (no state mutation)
          while (remaining > 0.01 && cuentaIdx < cuentasSnapshot.length) {
            const cuenta = cuentasSnapshot[cuentaIdx];
            const alreadyApplied = accountApplied.get(cuenta.id) ?? 0;
            const cuentaRemaining = cuenta.montoAplicar - alreadyApplied;
            if (cuentaRemaining <= 0.01) { cuentaIdx++; continue; }
            const apply = Math.min(remaining, cuentaRemaining);
            aplicaciones.push({ venta_id: cuenta.id, monto: apply });
            accountApplied.set(cuenta.id, alreadyApplied + apply);
            remaining -= apply;
            if (alreadyApplied + apply >= cuenta.montoAplicar - 0.01) cuentaIdx++;
          }

          // Cobro = sum of applications (excludes change given back)
          const montoCobro = roundMoney(aplicaciones.reduce((s, a) => s + a.monto, 0));
          if (montoCobro <= 0) continue;

          // Id DETERMINÍSTICO del cobro (mismo criterio que RutaCobrar): derivado
          // de la venta que lo origina + el pago (índice, método, monto). Si el
          // MISMO cobro se vuelve a encolar (doble-toque, reintento, resync) el id
          // coincide y el upsert lo trata como el mismo cobro → NO duplica. Antes
          // era crypto.randomUUID(): cada reenvío generaba un cobro nuevo (causa
          // real del cobro duplicado y huérfano en ventas de contado offline).
          const cobroId = await deterministicUuid('cobro-venta', ventaId, pagoIdx, pago.metodo_pago, montoCobro);

          const nowIso = new Date().toISOString();
          await queueOperations([
            {
              table: 'cobros',
              operation: 'insert',
              data: { id: cobroId, empresa_id: empresa.id, cliente_id: ventaClienteId, user_id: user.id, monto: montoCobro, metodo_pago: pago.metodo_pago, referencia: pago.referencia || null, fecha: todayInTimezone(empresa.zona_horaria), created_at: nowIso },
            },
            ...await Promise.all(aplicaciones.map(async ap => ({
              table: 'cobro_aplicaciones',
              operation: 'insert' as const,
              // Id determinístico por (cobro, venta) → la aplicación tampoco se duplica.
              data: { id: await deterministicUuid('capp', cobroId, ap.venta_id), cobro_id: cobroId, venta_id: ap.venta_id, monto_aplicado: ap.monto, created_at: nowIso },
            }))),
          ]);
        }

        // El saldo_pendiente lo recalcula EXCLUSIVAMENTE el trigger de BD
        // (recalc_venta_saldo, AFTER INSERT/UPDATE/DELETE en cobro_aplicaciones)
        // a partir de las aplicaciones ya encoladas arriba. NO lo escribimos
        // desde el cliente para no competir con el trigger ni pisar el valor
        // correcto (mismo criterio que RutaCobrar). Solo refrescamos la caché
        // local para mostrar el abono al instante mientras sincroniza.
        for (const cuenta of cuentasSnapshot) {
          const applied = accountApplied.get(cuenta.id) ?? 0;
          if (applied > 0) {
            const nuevoSaldo = Math.max(0, cuenta.saldo_pendiente - applied);
            try {
              const ventasTable = getOfflineTable('ventas');
              if (ventasTable) {
                const localVenta = await ventasTable.get(cuenta.id);
                if (localVenta) {
                  await ventasTable.put({ ...localVenta, saldo_pendiente: nuevoSaldo });
                }
              }
            } catch {}
          }
        }
      }

      await updateCargaVendidaOffline(cart);
      await saveVisita(tipoVenta === 'pedido' ? 'pedido' : 'venta', { ventaId });
      if (clienteId) markVisited(clienteId);
      toast.success('¡Venta registrada! Se sincronizará automáticamente');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-cuentas-pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-carga'] });
      // El folio real lo asigna el servidor al sincronizar; en el ticket
      // mostramos una referencia provisional basada en el id de la venta
      // y luego intentamos reemplazarla con el folio real de la BD.
      const placeholderFolio = ventaId.slice(0, 8).toUpperCase();
      setTicketInfo({ folio: placeholderFolio, fecha: new Date().toLocaleDateString('es-MX') });
      // Poll (hasta ~10s) para obtener el folio asignado por el trigger de BD.
      (async () => {
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, i === 0 ? 800 : 1200));
          try {
            const { data: vRow } = await supabase.from('ventas').select('folio').eq('id', ventaId).maybeSingle();
            if (vRow?.folio) {
              setTicketInfo(prev => prev ? { ...prev, folio: vRow.folio as string } : prev);
              break;
            }
          } catch { /* offline, seguir intentando */ }
        }
      })();
      // Venta encolada con éxito → la siguiente venta toma un id nuevo.
      // (Si algo falló arriba y se reintenta, se conserva el mismo id → idempotente.)
      pendingVentaIdRef.current = null;
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); savingRef.current = false; }
  };

  const saveSoloDevolucion = async () => {
    if (!empresa || !user) return;
    if (!canDoDevoluciones) { toast.error('Tu rol no permite registrar devoluciones en Ruta'); return; }
    if (!clienteId) { toast.error('Selecciona un cliente'); return; }
    if (devoluciones.length === 0) { toast.error('Agrega al menos una devolución'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Id estable de la devolución: se genera una vez y se reusa en reintentos.
      if (!pendingDevIdRef.current) pendingDevIdRef.current = crypto.randomUUID();
      const devId = pendingDevIdRef.current;
      const cargaIdForDev = activeCarga?.id || null;
      await queueOperation('devoluciones', 'insert', {
        id: devId, empresa_id: empresa.id, user_id: user.id,
        vendedor_id: profile?.id || null, cliente_id: clienteId,
        carga_id: cargaIdForDev, venta_id: null, tipo: 'tienda',
        fecha: todayInTimezone(empresa.zona_horaria),
        created_at: new Date().toISOString(),
      });
      let soloDevLineaIdx = -1;
      for (const d of devoluciones) {
        soloDevLineaIdx++;
        const montoCredito = (d.accion === 'nota_credito' || d.accion === 'devolucion_dinero')
          ? d.precio_unitario * d.cantidad : 0;
        await queueOperation('devolucion_lineas', 'insert', {
          id: await deterministicUuid('devlinea', devId, soloDevLineaIdx), devolucion_id: devId, producto_id: d.producto_id, cantidad: d.cantidad,
          motivo: d.motivo, accion: d.accion, reemplazo_producto_id: d.reemplazo_producto_id || null,
          monto_credito: montoCredito, created_at: new Date().toISOString(),
        });
        if (activeCarga) {
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
      }
      await saveVisita('devolucion');
      markVisited(clienteId);
      pendingDevIdRef.current = null;   // éxito → la siguiente devolución toma id nuevo
      toast.success('¡Devolución registrada! Se sincronizará automáticamente');
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-carga'] });
      navigate('/ruta');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); savingRef.current = false; }
  };



  const routeSteps = useMemo(
    () => {
      if (soloDevolucion) return ['tipo', 'cliente', 'devoluciones'] as Step[];
      return canDoDevoluciones ? STEPS : STEPS.filter(s => s !== 'devoluciones');
    },
    [canDoDevoluciones, soloDevolucion],
  );
  const currentStepIdx = routeSteps.indexOf(step);
  const goBack = () => { if (currentStepIdx <= 0) navigate('/ruta'); else setStep(routeSteps[currentStepIdx - 1]); };
  const goToPayment = () => { initCuentasPendientes(); setStep('pago'); };
  const { symbol: currSym, fmt } = useCurrency();
  const fmtM = fmt;
  const cambioItems = cart.filter(c => c.es_cambio);
  const chargedItems = cart.filter(c => !c.es_cambio);
  const ticketLineas = useMemo(() => cart.map(item => {
    const breakdown = getOriginalLineBreakdown(item, sinImpuestos);
    return {
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.cantidad > 0 ? r2(breakdown.total / item.cantidad) : 0,
      subtotal: breakdown.subtotal,
      iva_monto: breakdown.iva,
      ieps_monto: breakdown.ieps,
      descuento_pct: 0,
      total: breakdown.total,
      esCambio: item.es_cambio,
      producto_id: item.producto_id,
    };
  }), [cart, sinImpuestos]);

  /** Compute the suggested (tarifa-based) NET price for a product (para granel/almacenaje interno) */
  const getSuggestedPrice = (productoId: string): number => {
    const prod = productos?.find((p: any) => p.id === productoId);
    if (!prod) return 0;
    return resolvePricingFull(prod).unitPrice;
  };

  /**
   * Precio sugerido FINAL (con impuestos, ya redondeado) = lo que paga el cliente.
   * El modal de detalle trata "precio" como el final; darle el neto hacía que el
   * input manual precargara el neto y, al aplicarlo como bruto, se erosionara el
   * precio (89.81 en vez de 97). Este helper devuelve el bruto correcto.
   */
  const getSuggestedDisplayPrice = (productoId: string): number => {
    const prod = productos?.find((p: any) => p.id === productoId);
    if (!prod) return 0;
    return resolvePricingFull(prod).displayPrice;
  };

  /** Precio FINAL (bruto) aplicado en la línea del carrito, o el sugerido si no está. */
  const getLineDisplayPrice = (productoId: string): number => {
    const item = cart.find(c => c.producto_id === productoId && !c.es_cambio);
    if (!item) return getSuggestedDisplayPrice(productoId);
    return r2(getSaleDisplayUnitPrice(toPosPricingItem(item, sinImpuestos)));
  };

  /** Set unit price manually for a product (creates the cart line if missing) */
  const setItemPriceManual = (productoId: string, price: number) => {
    if (!canChangePrice) {
      toast.error('Tu rol no permite cambiar precios manuales en Ruta');
      return;
    }
    const prod = productos?.find((p: any) => p.id === productoId);
    if (!prod) return;
    const snap = buildManualSalePricingFromGross({ tiene_iva: prod.tiene_iva ?? false, iva_pct: prod.tiene_iva ? (prod.iva_pct ?? 16) : 0, tiene_ieps: prod.tiene_ieps ?? false, ieps_pct: prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0 }, price);
    setCart(prev => {
      const existing = prev.find(c => c.producto_id === productoId && !c.es_cambio);
      if (existing) {
        return prev.map(c => c.producto_id === productoId && !c.es_cambio
          ? { ...c, precio_unitario: snap.unitPrice, precio_unitario_sin_redondeo: snap.rawUnitPrice, precio_display_sin_redondeo: snap.rawDisplayPrice, base_precio: snap.basePrecio, redondeo: snap.redondeo, precio_manual: true, lista_precio_id: null, lista_nombre: null }
          : c);
      }
      return [...prev, {
        producto_id: prod.id, codigo: prod.codigo, nombre: prod.nombre,
        precio_unitario: snap.unitPrice, cantidad: 1, unidad: (prod.unidades as any)?.abreviatura || 'pz',
        unidad_id: prod.unidad_venta_id ?? undefined,
        tiene_iva: prod.tiene_iva ?? false,
        iva_pct: prod.tiene_iva ? (prod.iva_pct ?? 16) : 0,
        tiene_ieps: prod.tiene_ieps ?? false,
        ieps_pct: prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0,
        precio_unitario_sin_redondeo: snap.rawUnitPrice,
        precio_display_sin_redondeo: snap.rawDisplayPrice,
        base_precio: snap.basePrecio,
        redondeo: snap.redondeo,
        precio_manual: true, lista_precio_id: null, lista_nombre: null,
      }];
    });
    toast.success(`Precio actualizado: $${r2(price).toFixed(2)}`);
  };

  /** Apply a price-list price to a product (creates the cart line if missing) */
  const setItemPriceFromLista = (
    productoId: string,
    listaPrecioId: string | null,
    _tarifaId: string | null,
    unitPrice: number,
    listaNombre: string,
  ) => {
    if (!canChangeLista) {
      toast.error('Tu rol no permite cambiar la lista de precios en Ruta');
      return;
    }
    const prod = productos?.find((p: any) => p.id === productoId);
    if (!prod) return;
    setCart(prev => {
      const existing = prev.find(c => c.producto_id === productoId && !c.es_cambio);
      if (existing) {
        return prev.map(c => c.producto_id === productoId && !c.es_cambio
          ? { ...c, precio_unitario: unitPrice, precio_manual: false, lista_precio_id: listaPrecioId, lista_nombre: listaNombre }
          : c);
      }
      return [...prev, {
        producto_id: prod.id, codigo: prod.codigo, nombre: prod.nombre,
        precio_unitario: unitPrice, cantidad: 1, unidad: (prod.unidades as any)?.abreviatura || 'pz',
        unidad_id: prod.unidad_venta_id ?? undefined,
        tiene_iva: prod.tiene_iva ?? false,
        iva_pct: prod.tiene_iva ? (prod.iva_pct ?? 16) : 0,
        tiene_ieps: prod.tiene_ieps ?? false,
        ieps_pct: prod.tiene_ieps ? (prod.ieps_pct ?? 0) : 0,
        precio_manual: false, lista_precio_id: listaPrecioId, lista_nombre: listaNombre,
      }];
    });
    toast.success(`Precio aplicado: ${listaNombre}`);
  };

  /** Reset a product to its suggested (tarifa) price */
  const resetItemToSuggested = (productoId: string) => {
    const prod = productos?.find((p: any) => p.id === productoId);
    if (!prod) return;
    const item = cart.find(c => c.producto_id === productoId && !c.es_cambio);
    if (item?.precio_manual && !canChangePrice) {
      toast.error('Tu rol no permite cambiar precios manuales en Ruta');
      return;
    }
    if (item?.lista_precio_id && !canChangeLista) {
      toast.error('Tu rol no permite cambiar la lista de precios en Ruta');
      return;
    }
    const pf = resolvePricingFull(prod);
    setCart(prev => prev.map(c => c.producto_id === productoId && !c.es_cambio
      ? { ...c, precio_unitario: pf.unitPrice, precio_unitario_sin_redondeo: pf.rawUnitPrice,
          precio_display_sin_redondeo: pf.rawDisplayPrice, base_precio: pf.basePrecio,
          redondeo: pf.redondeo, precio_manual: false, lista_precio_id: null, lista_nombre: null }
      : c));
    toast.success('Precio restablecido al sugerido');
  };


  return {
    navigate, empresa, user, profile, urlClienteId,
    step, setStep, clienteId, setClienteId, clienteNombre, setClienteNombre, clienteListaNombre,
    clienteNotasFiscales: (selectedClienteData as any)?.notas_fiscales as string | undefined,
    clienteCredito, setClienteCredito, cart, setCart, ticketLineas, devoluciones, setDevoluciones,
    searchCliente, setSearchCliente, searchProducto, setSearchProducto,
    searchDevProducto, setSearchDevProducto, saving, tipoVenta, setTipoVenta,
    condicionPago, setCondicionPago, notas, setNotas, fechaEntrega, setFechaEntrega,
    pagos, setPagos, saldoFavorDisp,
    cuentasPendientes, showDevSearch, setShowDevSearch,
    showReemplazoFor, setShowReemplazoFor, searchReemplazo, setSearchReemplazo,
    ticketInfo, sinCompra, setSinCompra, soloDevolucion: soloDevolucion, motivoSinCompra, setMotivoSinCompra, savingSinCompra, setSavingSinCompra, sinImpuestos, setSinImpuestos,
    entregaInmediata, stockAbordo, usandoAlmacen: useFallbackStock, clientes, productos, filteredClientes,
    filteredProductos, filteredDevProductos, filteredReemplazoProductos, pedidoSugerido,
    promoResults, totals, creditoDisponible, excedeCredito, totalAplicarCuentas,
    totalACobrar, montoRecibidoNum, cambio, saldoPendienteTotal, cambioItems, chargedItems,
    currentStepIdx, routeSteps, goBack, goToPayment, fmt, fmtM, currSym, markVisited, saveVisita,
    addToCart, addGranelLine, updateQty, removeFromCart, getItemInCart, getMaxQty, getDispSigned, setItemQty,
    pendingGratis, autoPromosOn,

    addDevolucion, updateDevQty, updateDevMotivo, updateDevAccion, batchUpdateDevDefaults, setReemplazo, removeDevolucion,
    processDevolucionesAndGoToProductos, initCuentasPendientes, liquidarTodas, updateCuentaMonto,
    handleSave, saveSoloDevolucion, setSoloDevolucion,
    // Insights & smart actions
    insights, bannerDismissed, setBannerDismissed,
    applySmartSuggestion, applyManualList, applyHistorialAvg, repeatLastSale, findProductByCode,
    // Price overrides
    getSuggestedPrice, getSuggestedDisplayPrice, getLineDisplayPrice, setItemPriceManual, setItemPriceFromLista, resetItemToSuggested,
    // Permisos
    canChangePrice, canChangeLista, canApplyDiscount, canDoDevoluciones,
    // Descuento extra
    descuentoExtraTipo, setDescuentoExtraTipo,
    descuentoExtraValor, setDescuentoExtraValor,
    descuentoExtraMotivo, setDescuentoExtraMotivo,
    // Apartado de stock en pedidos
    apartadoActivoPedido, pedidoAlmacenId, setPedidoAlmacenId,
  };
}
