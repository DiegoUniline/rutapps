import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { todayInTimezone } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Minus, Trash2, X, User, ShoppingCart, CreditCard,
  Wallet, Banknote, Check, Barcode, ArrowLeft, Receipt, Package, Gift, Tag, Warehouse
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import TicketVenta from '@/components/ruta/TicketVenta';
import { resolveProductPricing, type TarifaLineaRule } from '@/lib/priceResolver';
import { buildPosLinePricing, getTaxMultiplier as posGetTaxMult, round2 as posR2, type BasePrecioMode } from '@/lib/posPricing';
import { printTicket, buildTicketDataFromVenta } from '@/lib/printTicketUtil';
import { fmtDate, fmtNum } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { usePromocionesActivas, evaluatePromociones, type PromoResult, type CartItemForPromo } from '@/hooks/usePromociones';
import { useIsMobile } from '@/hooks/use-mobile';

const CATALOG_STALE = 5 * 60 * 1000;
const r2 = posR2;
const getTaxMultiplier = posGetTaxMult;

const applyDisplayRedondeo = (precio: number, redondeo: string) => {
  if (!redondeo || redondeo === 'ninguno') return precio;
  if (redondeo === 'arriba') return Math.ceil(precio);
  if (redondeo === 'abajo') return Math.floor(precio);
  return Math.round(precio);
};

interface PosItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  precio_unitario_sin_redondeo: number;
  precio_display_sin_redondeo: number;
  cantidad: number;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  unidad: string;
  base_precio: BasePrecioMode;
  redondeo: string;
}

type PayMethod = 'efectivo' | 'transferencia' | 'tarjeta';
type PayMode = 'efectivo' | 'transferencia' | 'tarjeta' | 'mixto';

export default function PuntoVentaPage() {
  const navigate = useNavigate();
  const { empresa, user, profile, overrideEmpresaId } = useAuth();
  const { symbol: s, fmt: fmtC } = useCurrency();
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<PosItem[]>([]);
  const [filterClasificacion, setFilterClasificacion] = useState<string | null>(null);
  const [filterMarca, setFilterMarca] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState('Público general');
  const [showClientes, setShowClientes] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showPago, setShowPago] = useState(false);
  const [payEfectivo, setPayEfectivo] = useState('');
  const [payTransferencia, setPayTransferencia] = useState('');
  const [payTarjeta, setPayTarjeta] = useState('');
  const [refTransferencia, setRefTransferencia] = useState('');
  const [refTarjeta, setRefTarjeta] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [lastVentaData, setLastVentaData] = useState<any>(null);
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado');
  const [scanBuffer, setScanBuffer] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const [clienteTarifaId, setClienteTarifaId] = useState<string | null>(null);
  const [clienteListaPrecioId, setClienteListaPrecioId] = useState<string | null>(null);
  const [clienteListaNombre, setClienteListaNombre] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  const [sinImpuestos, setSinImpuestos] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>('efectivo');
  const [clienteCredito, setClienteCredito] = useState(false);
  const [clienteDiasCredito, setClienteDiasCredito] = useState(0);
  const [clienteLimiteCredito, setClienteLimiteCredito] = useState(0);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const isMobile = useIsMobile();

  

  // When viewing another company (super admin), fetch its first almacen instead of using profile's
  const { data: overrideAlmacen } = useQuery({
    queryKey: ['pos-override-almacen', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!overrideEmpresaId && !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes')
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('nombre')
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const almacenId = overrideEmpresaId ? (overrideAlmacen?.id ?? null) : (profile?.almacen_id || null);

  // Almacen name
  const { data: almacenData } = useQuery({
    queryKey: ['pos-almacen-name', almacenId],
    staleTime: CATALOG_STALE,
    enabled: !!almacenId && !overrideEmpresaId,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('nombre').eq('id', almacenId!).maybeSingle();
      return data;
    },
  });
  const almacenNombre = overrideEmpresaId ? (overrideAlmacen?.nombre ?? null) : (almacenData?.nombre ?? null);

  // Products
  const { data: productosRaw } = useQuery({
    queryKey: ['pos-productos', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('productos')
        .select('id, codigo, nombre, precio_principal, costo, cantidad, imagen_url, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, clave_alterna, unidad_venta_id, se_puede_vender, status, clasificacion_id, marca_id, vender_sin_stock, es_granel, unidad_granel')
        .eq('empresa_id', empresa!.id)
        .eq('se_puede_vender', true)
        .eq('status', 'activo')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Stock by warehouse (user's assigned warehouse)
  const { data: stockAlmacen } = useQuery({
    queryKey: ['pos-stock-almacen', empresa?.id, almacenId],
    staleTime: 30_000,
    enabled: !!empresa?.id && !!almacenId,
    queryFn: async () => {
      const { data } = await supabase.from('stock_almacen')
        .select('producto_id, cantidad')
        .eq('empresa_id', empresa!.id)
        .eq('almacen_id', almacenId!);
      return data ?? [];
    },
  });

  // Merge: use warehouse stock when user has almacen_id, otherwise global
  const productos = useMemo(() => {
    if (!productosRaw) return undefined;
    if (!almacenId) return productosRaw;
    const stockMap = new Map((stockAlmacen ?? []).map((s: any) => [s.producto_id, s.cantidad ?? 0]));
    return productosRaw.map(p => ({ ...p, cantidad: stockMap.get(p.id) ?? 0 }));
  }, [productosRaw, stockAlmacen, almacenId]);

  // Clients
  const { data: clientes } = useQuery({
    queryKey: ['pos-clientes', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('clientes')
        .select('id, codigo, nombre, credito, limite_credito, dias_credito, tarifa_id, lista_precio_id, lista_precios:lista_precio_id(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('nombre');
      return data ?? [];
    },
  });

  // Default lista de precios
  const { data: defaultListaPrecioData } = useQuery({
    queryKey: ['pos-default-lista-precio-full', empresa?.id],
    staleTime: CATALOG_STALE,
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('lista_precios')
        .select('tarifa_id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('es_principal', true)
        .maybeSingle();
      return data;
    },
  });
  const defaultTarifaId = defaultListaPrecioData?.tarifa_id ?? null;
  const defaultListaNombre = defaultListaPrecioData?.nombre ?? null;
  const effectiveListaNombre = clienteListaNombre || defaultListaNombre;

  // Use client tarifa if available, otherwise fall back to empresa's default
  const effectiveTarifaId = clienteTarifaId || defaultTarifaId;
  const { data: effectiveTarifaLineas } = useQuery({
    queryKey: ['pos-tarifa-lineas', effectiveTarifaId], enabled: !!effectiveTarifaId, staleTime: CATALOG_STALE,
    queryFn: async () => { const { data } = await supabase.from('tarifa_lineas').select('*').eq('tarifa_id', effectiveTarifaId!); return (data ?? []) as TarifaLineaRule[]; },
  });

  const productPricingMap = useMemo(() => {
    const pricingByProduct = new Map<string, ReturnType<typeof resolveProductPricing>>();
    if (!productos?.length) return pricingByProduct;

    productos.forEach((p: any) => {
      const fallbackPrice = r2(p.precio_principal ?? 0);
      const pricing = effectiveTarifaId && (effectiveTarifaLineas?.length ?? 0) > 0
        ? resolveProductPricing(
            effectiveTarifaLineas ?? [],
            {
              id: p.id,
              precio_principal: fallbackPrice,
              costo: p.costo ?? 0,
              clasificacion_id: p.clasificacion_id,
              tiene_iva: p.tiene_iva,
              iva_pct: p.iva_pct ?? 16,
              tiene_ieps: p.tiene_ieps,
              ieps_pct: p.ieps_pct ?? 0,
              ieps_tipo: p.ieps_tipo,
            },
            clienteListaPrecioId,
          )
        : {
            unitPrice: fallbackPrice,
            displayPrice: fallbackPrice,
            basePrecio: 'sin_impuestos' as const,
            appliedRule: null,
          };
      const pricingWithRaw = 'rawUnitPrice' in pricing ? pricing : { ...pricing, rawUnitPrice: pricing.unitPrice, rawDisplayPrice: pricing.displayPrice };

      pricingByProduct.set(p.id, pricingWithRaw as ReturnType<typeof resolveProductPricing>);
    });

    return pricingByProduct;
  }, [productos, effectiveTarifaId, effectiveTarifaLineas, clienteListaPrecioId]);

  const getProductPricing = useCallback((p: any) => {
    return productPricingMap.get(p.id) ?? {
      unitPrice: r2(p.precio_principal ?? 0),
      displayPrice: r2(p.precio_principal ?? 0),
      rawUnitPrice: r2(p.precio_principal ?? 0),
      rawDisplayPrice: r2(p.precio_principal ?? 0),
      basePrecio: 'sin_impuestos' as const,
      appliedRule: null,
    };
  }, [productPricingMap]);

  const getDisplayUnitPrice = useCallback((item: PosItem) => {
    const rawGrossPerUnit = item.base_precio === 'con_impuestos'
      ? item.precio_display_sin_redondeo
      : item.precio_unitario_sin_redondeo * getTaxMultiplier(item);
    return r2(applyDisplayRedondeo(rawGrossPerUnit, item.redondeo));
  }, []);

  const splitFinalGross = useCallback((item: PosItem, finalGross: number) => {
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
  }, []);

  useEffect(() => {
    if (cart.length === 0 || !productos) return;
    setCart(prev => prev.map(item => {
      const prod = productos.find(p => p.id === item.producto_id);
      if (!prod) return item;
      const pricing = getProductPricing(prod);
      return {
        ...item,
        precio_unitario: pricing.unitPrice,
        precio_unitario_sin_redondeo: pricing.rawUnitPrice,
        precio_display_sin_redondeo: pricing.rawDisplayPrice,
        base_precio: pricing.basePrecio as BasePrecioMode,
        redondeo: pricing.appliedRule?.redondeo ?? 'ninguno',
      };
    }));
  }, [cart.length, productos, getProductPricing]);

  // ---- Promotions engine ----
  const { data: promocionesActivas } = usePromocionesActivas();

  const promoResultsRaw = useMemo(() => {
    if (!promocionesActivas?.length || cart.length === 0) return [] as PromoResult[];
    const cartForPromo: CartItemForPromo[] = cart.map(item => {
      const prod = productos?.find(p => p.id === item.producto_id);
      return {
        producto_id: item.producto_id,
        clasificacion_id: prod?.clasificacion_id ?? undefined,
        precio_unitario: item.base_precio === 'con_impuestos'
          ? item.precio_display_sin_redondeo
          : item.precio_unitario_sin_redondeo,
        cantidad: item.cantidad,
      };
    });
    return evaluatePromociones(promocionesActivas, cartForPromo, clienteId ?? undefined, undefined);
  }, [promocionesActivas, cart, productos, clienteId]);

  // Build per-product raw promo discount map
  const promoRawByProduct = useMemo(() => {
    const m = new Map<string, number>();
    promoResultsRaw.forEach(pr => {
      if (!pr.producto_id || pr.descuento <= 0) return;
      m.set(pr.producto_id, r2((m.get(pr.producto_id) ?? 0) + pr.descuento));
    });
    return m;
  }, [promoResultsRaw]);

  // Build line pricing with promo applied before rounding
  const linePricingMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof buildPosLinePricing>>();
    cart.forEach(item => {
      m.set(item.producto_id, buildPosLinePricing(item, promoRawByProduct.get(item.producto_id) ?? 0));
    });
    return m;
  }, [cart, promoRawByProduct]);

  const getChargedLineTotal = useCallback((item: PosItem) => {
    const promoRaw = promoRawByProduct.get(item.producto_id) ?? 0;
    if (promoRaw > 0) {
      return linePricingMap.get(item.producto_id)?.finalGross ?? buildPosLinePricing(item, promoRaw).finalGross;
    }

    return r2(getDisplayUnitPrice(item) * item.cantidad);
  }, [promoRawByProduct, linePricingMap, getDisplayUnitPrice]);

  // Adjust displayed promo discounts to match effective (post-rounding) discount
  const promoResults = useMemo(() => {
    return promoResultsRaw.map(pr => {
      if (!pr.producto_id || pr.descuento <= 0) return pr;
      const rawTotal = promoRawByProduct.get(pr.producto_id) ?? 0;
      const effectiveTotal = linePricingMap.get(pr.producto_id)?.effectiveDiscount ?? rawTotal;
      if (rawTotal <= 0) return pr;
      return { ...pr, descuento: r2((pr.descuento / rawTotal) * effectiveTotal) };
    });
  }, [promoResultsRaw, promoRawByProduct, linePricingMap]);

  const promoGratis = useMemo(() => promoResults.filter(r => r.tipo === 'producto_gratis'), [promoResults]);

  // Barcode scanner: listen for rapid key presses
  useEffect(() => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout>;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input (except the scan field)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target !== scanRef.current && target.id !== 'pos-search') return;
      if (target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' && buffer.length > 2) {
        e.preventDefault();
        handleScan(buffer.trim());
        buffer = '';
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); clearTimeout(timer); };
  }, [productos, cart]);

  const handleScan = useCallback((code: string) => {
    if (!productos) return;
    const found = productos.find(p =>
      p.codigo.toLowerCase() === code.toLowerCase() ||
      (p.clave_alterna && p.clave_alterna.toLowerCase() === code.toLowerCase())
    );
    if (found) {
      addToCart(found);
      toast.success(`${found.nombre} agregado`);
    } else {
      toast.error(`Producto no encontrado: ${code}`);
    }
  }, [productos, cart]);

  const filteredProducts = useMemo(() => {
    if (!productos) return [];
    // Filter out products with no stock unless vender_sin_stock is enabled
    const available = productos.filter(p => p.vender_sin_stock || (p.cantidad ?? 0) > 0);
    if (!search) return available;
    const s = search.toLowerCase();
    return available.filter(p =>
      p.nombre.toLowerCase().includes(s) ||
      p.codigo.toLowerCase().includes(s) ||
      (p.clave_alterna && p.clave_alterna.toLowerCase().includes(s))
    );
  }, [productos, search]);

  const filteredClientes = useMemo(() => {
    if (!clientes) return [];
    if (!clienteSearch) return clientes;
    const s = clienteSearch.toLowerCase();
    return clientes.filter(c => c.nombre.toLowerCase().includes(s) || c.codigo?.toLowerCase().includes(s));
  }, [clientes, clienteSearch]);

  const addToCart = (p: any) => {
    const stock = p.cantidad ?? 0;
    const canSellWithout = p.vender_sin_stock;
    const pricing = getProductPricing(p);

    setCart(prev => {
      const existing = prev.find(c => c.producto_id === p.id);
      if (existing) {
        const newQty = existing.cantidad + 1;
        if (!canSellWithout && newQty > stock) {
          toast.error(`Stock máximo: ${stock}`);
          return prev;
        }
        return prev.map(c => c.producto_id === p.id ? { ...c, cantidad: newQty } : c);
      }
      if (!canSellWithout && stock < 1) {
        toast.error('Sin stock disponible');
        return prev;
      }
      return [...prev, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        precio_unitario: pricing.unitPrice,
        precio_unitario_sin_redondeo: pricing.rawUnitPrice,
        precio_display_sin_redondeo: pricing.rawDisplayPrice,
        cantidad: p.es_granel ? 0 : 1,
        tiene_iva: p.tiene_iva ?? false,
        iva_pct: p.tiene_iva ? (p.iva_pct ?? 16) : 0,
        tiene_ieps: p.tiene_ieps ?? false,
        ieps_pct: p.tiene_ieps ? (p.ieps_pct ?? 0) : 0,
        unidad: p.es_granel ? (p.unidad_granel ?? 'kg') : 'pz',
        base_precio: pricing.basePrecio as BasePrecioMode,
        redondeo: pricing.appliedRule?.redondeo ?? 'ninguno',
        _max_stock: canSellWithout ? Infinity : stock,
        _es_granel: p.es_granel ?? false,
      }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.producto_id !== id));
    } else {
      const item = cart.find(c => c.producto_id === id);
      const prod = productos?.find(p => p.id === id);
      const maxStock = prod?.vender_sin_stock ? Infinity : (prod?.cantidad ?? 0);
      if (qty > maxStock) {
        toast.error(`Stock máximo: ${maxStock}`);
        return;
      }
      setCart(prev => prev.map(c => c.producto_id === id ? { ...c, cantidad: qty } : c));
    }
  };

  const updatePrice = (id: string, price: number) => {
    setCart(prev => prev.map(c => {
      if (c.producto_id !== id) return c;
      const divisor = getTaxMultiplier(c);
      const grossPrice = Math.max(0, price);
      const rawNetPrice = divisor > 0 ? grossPrice / divisor : grossPrice;

      return {
        ...c,
        precio_unitario: r2(rawNetPrice),
        precio_unitario_sin_redondeo: rawNetPrice,
        precio_display_sin_redondeo: grossPrice,
      };
    }));
  };

  const removeItem = (id: string) => setCart(prev => prev.filter(c => c.producto_id !== id));

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, items = 0, descuento = 0, total = 0;
    cart.forEach(item => {
      const promoRaw = promoRawByProduct.get(item.producto_id) ?? 0;
      const lp = linePricingMap.get(item.producto_id) ?? buildPosLinePricing(item, promoRaw);
      const chargedLineTotal = getChargedLineTotal(item);
      const breakdown = splitFinalGross(item, chargedLineTotal);

      subtotal += breakdown.subtotal;
      iva += breakdown.iva;
      ieps += breakdown.ieps;
      descuento += lp.effectiveDiscount;
      total += chargedLineTotal;
      items += item.cantidad;
    });
    const finalTotal = sinImpuestos ? r2(subtotal - descuento) : r2(total);
    return { subtotal: r2(subtotal), iva: sinImpuestos ? 0 : r2(iva), ieps: sinImpuestos ? 0 : r2(ieps), descuento: r2(descuento), total: finalTotal, items };
  }, [cart, linePricingMap, promoRawByProduct, getChargedLineTotal, splitFinalGross, sinImpuestos]);

  const paySplitsComputed = useMemo(() => {
    const splits: { metodo: PayMethod; monto: number; referencia: string }[] = [];
    const ef = parseFloat(payEfectivo) || 0;
    const tr = parseFloat(payTransferencia) || 0;
    const ta = parseFloat(payTarjeta) || 0;
    if (ef > 0) splits.push({ metodo: 'efectivo', monto: ef, referencia: '' });
    if (tr > 0) splits.push({ metodo: 'transferencia', monto: tr, referencia: refTransferencia });
    if (ta > 0) splits.push({ metodo: 'tarjeta', monto: ta, referencia: refTarjeta });
    return splits;
  }, [payEfectivo, payTransferencia, payTarjeta, refTransferencia, refTarjeta]);

  const totalPagado = useMemo(() => paySplitsComputed.reduce((s, p) => s + p.monto, 0), [paySplitsComputed]);
  const cambio = totalPagado > totals.total ? totalPagado - totals.total : 0;
  const faltante = Math.max(0, totals.total - totalPagado);

  // Keyboard shortcuts: ESC close, F2 cobrar
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPago) { setShowPago(false); e.preventDefault(); return; }
        if (showTicket) { setShowTicket(false); setLastVentaData(null); }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (!showPago && !showTicket && cart.length > 0) {
          setPayMode('efectivo');
          setPayEfectivo(totals.total.toFixed(2));
          setPayTransferencia(''); setPayTarjeta('');
          setShowPago(true);
        } else if (showPago && faltante <= 0) {
          handleCobrar();
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [showPago, showTicket, cart.length, condicion, totals.total, faltante]);

  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtM = (n: number) => `${s}${fmt(n)}`;

  const clearAll = () => {
    setCart([]);
    setClienteId(null);
    setClienteNombre('Público general');
    setClienteTarifaId(null);
    setClienteListaPrecioId(null);
    setClienteListaNombre(null);
    setClienteCredito(false);
    setClienteDiasCredito(0);
    setClienteLimiteCredito(0);
    setCondicion('contado');
    setPayMode('efectivo');
    setShowPago(false);
    setPayEfectivo('');
    setPayTransferencia('');
    setPayTarjeta('');
    setRefTransferencia('');
    setRefTarjeta('');
    setFechaVencimiento('');
    setSearch('');
  };


  // Auto-print ticket when sale completes
  useEffect(() => {
    if (!showTicket || !lastVentaData) return;
    const timer = setTimeout(() => {
      const promoTicket = (lastVentaData.promoDetails ?? []) as { descripcion: string; descuento: number; producto_id?: string }[];
      const td = buildTicketDataFromVenta({
        empresa,
        venta: { folio: lastVentaData.folio, fecha: lastVentaData.fecha, subtotal: lastVentaData.subtotal, iva_total: lastVentaData.iva, ieps_total: lastVentaData.ieps, total: lastVentaData.total, saldo_pendiente: lastVentaData.saldoPendiente, condicion_pago: lastVentaData.condicionPago, metodo_pago: lastVentaData.metodoPago },
        clienteNombre: lastVentaData.clienteNombre,
        lineas: lastVentaData.lineas.map((l: any) => ({ nombre: l.nombre, cantidad: l.cantidad, precio_unitario: l.precio, total: l.total, iva_monto: l.iva_monto, ieps_monto: l.ieps_monto, producto_id: l.producto_id })),
        montoRecibido: lastVentaData.montoRecibido, cambio: lastVentaData.cambio, promociones: promoTicket,
        saldoAnterior: lastVentaData.saldoAnterior,
        saldoNuevo: lastVentaData.saldoNuevoCalc,
      });
      printTicket(td, { ticketAncho: (empresa as any)?.ticket_ancho ?? '58' });
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTicket]);

  // Save sale
  const handleCobrar = async () => {
    if (!empresa || !user || cart.length === 0) return;
    setSaving(true);
    try {
      const ventaId = crypto.randomUUID();
      const almacenId = profile?.almacen_id || null;
      if (!almacenId) {
        toast.error('No puedes vender sin un almacén asignado a tu perfil.');
        setSaving(false);
        return;
      }
      const today = todayInTimezone(empresa?.zona_horaria);

      if (!profile?.vendedor_id) {
        toast.error('Tu perfil no tiene un vendedor asignado. Contacta al administrador.');
        return;
      }

      // Fetch client's previous balance (sum of saldo_pendiente on all their ventas)
      let saldoAnteriorCliente = 0;
      if (clienteId) {
        const { data: saldoRows } = await supabase
          .from('ventas')
          .select('saldo_pendiente')
          .eq('empresa_id', empresa.id)
          .eq('cliente_id', clienteId)
          .gt('saldo_pendiente', 0);
        saldoAnteriorCliente = (saldoRows ?? []).reduce((s: number, r: any) => s + (r.saldo_pendiente ?? 0), 0);
      }

      // Resolve a valid client for "Público general" so contado sales can always register cobros
      let clientePublicoId: string | null = null;
      if (!clienteId && condicion === 'contado') {
        const { data: publicClient, error: publicClientLookupErr } = await supabase
          .from('clientes')
          .select('id')
          .eq('empresa_id', empresa.id)
          .eq('status', 'activo')
          .in('nombre', ['Público general', 'Publico general', 'Público General', 'Publico General'])
          .limit(1)
          .maybeSingle();

        if (publicClientLookupErr) throw publicClientLookupErr;

        if (publicClient?.id) {
          clientePublicoId = publicClient.id;
        } else {
          const { data: createdPublicClient, error: publicClientCreateErr } = await supabase
            .from('clientes')
            .insert({
              empresa_id: empresa.id,
              nombre: 'Público general',
              status: 'activo',
              credito: false,
              vendedor_id: profile.vendedor_id,
            })
            .select('id')
            .single();

          if (publicClientCreateErr) throw publicClientCreateErr;
          clientePublicoId = createdPublicClient.id;
        }
      }

      const ventaClienteId = clienteId ?? clientePublicoId;

      // 1. Insert venta
      const { data: ventaData, error: ventaErr } = await supabase.from('ventas').insert({
        id: ventaId,
        empresa_id: empresa.id,
        cliente_id: ventaClienteId,
        tipo: 'venta_directa',
        vendedor_id: profile.vendedor_id,
        condicion_pago: condicion,
        entrega_inmediata: true,
        status: 'confirmado',
        almacen_id: almacenId,
        subtotal: totals.subtotal,
        iva_total: totals.iva,
        ieps_total: totals.ieps,
        descuento_total: totals.descuento,
        total: totals.total,
        saldo_pendiente: condicion === 'credito' ? totals.total : 0,
        fecha: today,
      }).select('folio').single();
      if (ventaErr) throw ventaErr;

      // 2. Insert lines
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const lineas = cart.map(item => {
        const chargedLineTotal = getChargedLineTotal(item);
        const breakdown = splitFinalGross(item, chargedLineTotal);
        return {
          venta_id: ventaId,
          producto_id: item.producto_id,
          descripcion: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.cantidad > 0 ? r2(breakdown.subtotal / item.cantidad) : 0,
          subtotal: breakdown.subtotal,
          iva_pct: item.iva_pct,
          iva_monto: breakdown.iva,
          ieps_pct: item.ieps_pct,
          ieps_monto: breakdown.ieps,
          descuento_pct: 0,
          total: chargedLineTotal,
        };
      });
      const { error: linErr } = await supabase.from('venta_lineas').insert(lineas);
      if (linErr) throw linErr;

      // 3. Stock deduction + movement logging handled by DB trigger (apply_immediate_sale_inventory)

      // 4. Insert cobros if contado (one per method with amount)
      if (condicion === 'contado' && totals.total > 0) {
        const clienteCobroId = clienteId ?? clientePublicoId;
        if (!clienteCobroId) {
          throw new Error('No se pudo asignar un cliente para registrar el cobro.');
        }

        // Fallback: if no payment splits entered, create a single efectivo cobro for the full amount
        const splitsToUse = paySplitsComputed.length > 0
          ? paySplitsComputed
          : [{ metodo: 'efectivo' as PayMethod, monto: totals.total, referencia: '' }];
        for (const split of splitsToUse) {
          if (split.monto <= 0) continue;
          const cobroId = crypto.randomUUID();
          const { error: cobErr } = await supabase.from('cobros').insert({
            id: cobroId,
            empresa_id: empresa.id,
            cliente_id: clienteCobroId,
            user_id: user.id,
            monto: Math.min(split.monto, totals.total),
            metodo_pago: split.metodo,
            referencia: split.referencia || null,
            fecha: today,
          });
          if (!cobErr) {
            await supabase.from('cobro_aplicaciones').insert({
              cobro_id: cobroId,
              venta_id: ventaId,
              monto_aplicado: Math.min(split.monto, totals.total),
            });
          }
        }
      }

      // Save ticket data for display
      const metodosUsados = (paySplitsComputed.length > 0 ? paySplitsComputed : [{ metodo: 'efectivo' }]).map(s => s.metodo).join(' + ');
      setLastVentaData({
        folio: ventaData?.folio ?? ventaId.slice(0, 8),
        fecha: today,
        clienteNombre,
        lineas: cart.map(item => {
          const chargedLineTotal = getChargedLineTotal(item);
          const breakdown = splitFinalGross(item, chargedLineTotal);
          return {
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: getDisplayUnitPrice(item),
            subtotal: breakdown.subtotal,
            iva_monto: breakdown.iva,
            ieps_monto: breakdown.ieps,
            total: chargedLineTotal,
            producto_id: item.producto_id,
          };
        }),
        subtotal: totals.subtotal,
        iva: totals.iva,
        ieps: totals.ieps,
        descuento: totals.descuento,
        promos: promoResults.map(r => r.descripcion),
        promoDetails: promoResults.filter(r => r.descuento > 0).map(r => ({ descripcion: r.descripcion, descuento: r.descuento, producto_id: r.producto_id })),
        total: totals.total,
        condicionPago: condicion,
        metodoPago: metodosUsados || 'efectivo',
        montoRecibido: totalPagado > 0 ? totalPagado : undefined,
        cambio: cambio > 0 ? cambio : undefined,
        saldoPendiente: condicion === 'credito' ? totals.total : 0,
        saldoAnterior: saldoAnteriorCliente > 0 ? saldoAnteriorCliente : undefined,
        saldoNuevoCalc: condicion === 'credito' ? saldoAnteriorCliente + totals.total : (saldoAnteriorCliente > 0 ? saldoAnteriorCliente : undefined),
      });

      toast.success('¡Venta registrada!');
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['pos-productos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowTicket(true);
      setShowPago(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Quick amounts
  const quickAmounts = useMemo(() => {
    const t = totals.total;
    if (t <= 0) return [];
    const rounded = Math.ceil(t / 50) * 50;
    const amounts = [t];
    if (rounded !== t) amounts.push(rounded);
    if (rounded + 50 <= t * 3) amounts.push(rounded + 50);
    if (rounded + 100 <= t * 3) amounts.push(rounded + 100);
    return [...new Set(amounts)].sort((a, b) => a - b).slice(0, 4);
  }, [totals.total]);

  // Block POS if user has no warehouse assigned
  if (!almacenId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
        <Warehouse className="h-16 w-16 text-muted-foreground/40" />
        <h1 className="text-xl font-bold text-foreground">Sin almacén asignado</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          No puedes vender en Punto de Venta sin tener un almacén asignado a tu perfil. Contacta al administrador para que te asigne uno.
        </p>
        <button onClick={() => navigate(-1)} className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="bg-card border-b border-border shrink-0">
        <div className="h-12 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Volver">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <span className="text-[14px] sm:text-[16px] font-bold text-foreground tracking-tight truncate">Punto de venta</span>
          </div>
          <div className="flex-1" />
          {/* Sin impuestos switch */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">Sin imp.</span>
            <Switch checked={sinImpuestos} onCheckedChange={setSinImpuestos} className="scale-75" />
          </div>
          {/* Client selector */}
          <button
            onClick={() => setShowClientes(true)}
            className="flex items-center gap-1.5 bg-accent/60 hover:bg-accent rounded-lg px-2 sm:px-3 py-1.5 transition-colors min-w-0"
          >
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] sm:text-[12px] font-medium text-foreground max-w-[80px] sm:max-w-[140px] truncate">{clienteNombre}</span>
          </button>
          <button onClick={clearAll} className="text-[11px] text-destructive font-medium hover:underline shrink-0">
            Limpiar
          </button>
        </div>
        {/* Info bar: almacén + lista de precio */}
        <div className="flex items-center gap-3 px-3 sm:px-4 pb-1.5 text-[10px]">
          {almacenNombre && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Warehouse className="h-3 w-3" /> {almacenNombre}
            </span>
          )}
          {effectiveListaNombre && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Tag className="h-3 w-3" /> {effectiveListaNombre}
            </span>
          )}
          {sinImpuestos && (
            <span className="text-primary font-semibold">Sin impuestos</span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* ─── LEFT: Products ─── */}
        <div className={`${isMobile ? (mobileView === 'products' ? 'flex' : 'hidden') : 'flex'} flex-1 flex-col min-w-0 ${!isMobile ? 'border-r border-border' : ''}`}>
          {/* Search + scanner */}
          <div className="px-3 sm:px-4 pt-3 pb-2 flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="pos-search"
                type="text"
                placeholder="Buscar producto o escanear..."
                className="w-full bg-accent/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && search.trim()) {
                    const found = productos?.find(p =>
                      p.codigo.toLowerCase() === search.trim().toLowerCase() ||
                      (p.clave_alterna && p.clave_alterna.toLowerCase() === search.trim().toLowerCase())
                    );
                    if (found) {
                      addToCart(found);
                      setSearch('');
                      toast.success(`${found.nombre} agregado`);
                    }
                  }
                }}
                autoFocus={!isMobile}
              />
            </div>
            {!isMobile && (
              <div className="flex items-center gap-1 bg-accent/30 rounded-lg px-3 text-muted-foreground">
                <Barcode className="h-4 w-4" />
                <span className="text-[10px] font-medium">Escáner activo</span>
              </div>
            )}
          </div>

          {/* Active promotions banner */}
          {promocionesActivas && promocionesActivas.length > 0 && (
            <div className="px-3 sm:px-4 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {promocionesActivas.map(p => {
                  const isGratis = p.tipo === 'producto_gratis';
                  const isPct = p.tipo === 'descuento_porcentaje' || p.tipo === 'volumen';
                  const isMonto = p.tipo === 'descuento_monto';
                  const isPrecio = p.tipo === 'precio_especial';
                  return (
                    <div
                      key={p.id}
                      className="shrink-0 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 flex items-center gap-2 min-w-[160px] max-w-[240px]"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {isGratis ? <Gift className="h-3.5 w-3.5 text-primary" /> : <Tag className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-[11px] font-bold text-foreground truncate leading-tight">{p.nombre}</p>
                        <p className="text-[9px] sm:text-[10px] text-primary font-medium truncate">
                          {isGratis && `${p.cantidad_minima}×${(p.cantidad_minima || 1) - (p.cantidad_gratis || 1)} · Lleva ${p.cantidad_minima}, paga ${(p.cantidad_minima || 1) - (p.cantidad_gratis || 1)}`}
                          {isPct && `${p.valor}% de descuento`}
                          {isMonto && `$${p.valor} desc. por unidad`}
                          {isPrecio && `Precio especial $${p.valor}`}
                        </p>
                        {p.dias_semana && p.dias_semana.length > 0 && (
                          <p className="text-[9px] text-muted-foreground capitalize">{p.dias_semana.join(', ')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product grid */}
          <div className={`flex-1 overflow-auto px-3 sm:px-4 ${isMobile ? 'pb-24' : 'pb-4'}`}>
            <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'} gap-2`}>
              {filteredProducts.map(p => {
                const inCart = cart.find(c => c.producto_id === p.id);
                const stock = p.cantidad ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`relative rounded-xl border p-2.5 sm:p-3 text-left transition-all active:scale-[0.97] hover:shadow-md ${
                      inCart
                        ? 'border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/20'
                    }`}
                  >
                    {inCart && (
                      <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shadow-sm">
                        {inCart.cantidad}
                      </div>
                    )}
                    <div className="w-full aspect-square rounded-lg bg-accent/50 mb-1.5 sm:mb-2 flex items-center justify-center overflow-hidden">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/30" />
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] font-medium text-foreground truncate leading-tight">{p.nombre}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground font-mono mt-0.5">{p.codigo}</p>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-[12px] sm:text-[14px] font-bold text-primary">{fmtM(getProductPricing(p).displayPrice)}<span className="text-[8px] sm:text-[9px] font-normal text-muted-foreground ml-0.5">/{(p as any).es_granel ? (p as any).unidad_granel : 'pz'}</span></span>
                      <span className={`text-[8px] sm:text-[9px] font-medium ${stock > 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {fmtNum(stock)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[13px] text-muted-foreground">No se encontraron productos</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Mobile floating cart button ─── */}
        {isMobile && mobileView === 'products' && cart.length > 0 && (
          <button
            onClick={() => setMobileView('cart')}
            className="fixed bottom-6 right-4 z-40 bg-primary text-primary-foreground rounded-2xl px-5 py-3.5 shadow-xl shadow-primary/30 flex items-center gap-2.5 active:scale-95 transition-transform"
          >
            <Receipt className="h-5 w-5" />
            <span className="text-[14px] font-bold">{fmtM(totals.total)}</span>
            <span className="bg-primary-foreground/20 text-primary-foreground text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center">{cart.length}</span>
          </button>
        )}

        {/* ─── RIGHT: Cart ─── */}
        <div className={`${isMobile ? (mobileView === 'cart' ? 'fixed inset-0 z-50 flex' : 'hidden') : 'w-[380px] xl:w-[420px] flex shrink-0'} flex-col bg-card`}>
          {/* Cart header */}
          <div className={`px-4 ${isMobile ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : 'pt-3'} pb-2 border-b border-border`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                {isMobile && (
                  <button onClick={() => setMobileView('products')} className="p-1 rounded-md hover:bg-accent mr-1">
                    <ArrowLeft className="h-4 w-4 text-foreground" />
                  </button>
                )}
                <Receipt className="h-4 w-4 text-primary" />
                Ticket
                {cart.length > 0 && <span className="text-muted-foreground font-normal">({totals.items} art.)</span>}
              </h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-[10px] text-destructive font-medium hover:underline">
                  Vaciar
                </button>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-auto px-3 py-2 space-y-1">
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-40">
                <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">Escanea o selecciona productos</p>
              </div>
            )}
            {cart.map(item => {
              const displayUnitPrice = getDisplayUnitPrice(item);
              const lineTotal = getChargedLineTotal(item);
              const itemPromos = promoResults.filter(r => r.producto_id === item.producto_id && r.descuento > 0);
              return (
                <div key={item.producto_id} className="group rounded-lg px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{item.codigo}</p>
                    </div>
                    <button onClick={() => removeItem(item.producto_id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded">
                      <X className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex items-center bg-background rounded-md border border-border">
                      <button onClick={() => updateQty(item.producto_id, item.cantidad - 1)}
                        className="px-2 py-1 hover:bg-accent rounded-l-md transition-colors">
                        <Minus className="h-3 w-3 text-foreground" />
                      </button>
                      <input
                        type="number"
                        inputMode={(item as any)._es_granel ? "decimal" : "numeric"}
                        className="w-12 text-center text-[12px] font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                        value={item.cantidad}
                        step={(item as any)._es_granel ? "0.001" : "1"}
                        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) updateQty(item.producto_id, v); }}
                        onFocus={e => e.target.select()}
                      />
                      {(item as any)._es_granel && <span className="text-[9px] text-muted-foreground px-1">{item.unidad}</span>}
                      <button onClick={() => updateQty(item.producto_id, item.cantidad + 1)}
                        className="px-2 py-1 hover:bg-accent rounded-r-md transition-colors">
                        <Plus className="h-3 w-3 text-foreground" />
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">×</span>
                    <span className="text-[12px] font-medium text-foreground tabular-nums">{fmtM(displayUnitPrice)}</span>
                    <span className="flex-1 text-right text-[13px] font-bold text-foreground tabular-nums">{fmtM(lineTotal)}</span>
                  </div>
                  {itemPromos.length > 0 && (
                    <div className="mt-1">
                      {itemPromos.map((pr, i) => (
                        <p key={i} className="text-[10px] text-primary font-medium flex items-center gap-1">
                          <Tag className="h-3 w-3" /> 🏷️ {pr.descripcion} <span className="font-bold">-{fmtM(pr.descuento)}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Promotions applied */}
          {promoResults.length > 0 && (
            <div className="border-t border-border px-4 py-2 space-y-1 bg-accent/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-primary">Promociones aplicadas</span>
              </div>
              {promoResults.map((pr, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground flex items-center gap-1">
                    {pr.tipo === 'producto_gratis' ? <Gift className="h-3 w-3 text-primary" /> : <Tag className="h-3 w-3 text-primary" />}
                    {pr.descripcion}
                  </span>
                  {pr.descuento > 0 && (
                    <span className="font-bold text-primary tabular-nums">-{fmtM(pr.descuento)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Totals + Checkout */}
          <div className="border-t border-border px-4 py-3 space-y-2 bg-card">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground tabular-nums">{fmtM(totals.subtotal)}</span>
            </div>
            {totals.iva > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-medium text-foreground tabular-nums">{fmtM(totals.iva)}</span>
              </div>
            )}
            {totals.ieps > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">IEPS</span>
                <span className="font-medium text-foreground tabular-nums">{fmtM(totals.ieps)}</span>
              </div>
            )}
            {totals.descuento > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-primary font-medium flex items-center gap-1"><Tag className="h-3 w-3" /> Descuento promo</span>
                <span className="font-bold text-primary tabular-nums">-{fmtM(totals.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-border">
              <span className="text-[14px] font-bold text-foreground">Total</span>
              <span className="text-[24px] font-black text-primary tabular-nums">{fmtM(totals.total)}</span>
            </div>

            <button
              onClick={() => {
                setPayMode('efectivo');
                setPayEfectivo(totals.total.toFixed(2));
                setPayTransferencia('');
                setPayTarjeta('');
                setCondicion('contado');
                // Auto-set credit expiry
                if (clienteDiasCredito > 0) {
                  const d = new Date();
                  d.setDate(d.getDate() + clienteDiasCredito);
                  setFechaVencimiento(d.toISOString().slice(0, 10));
                }
                setShowPago(true);
              }}
              disabled={cart.length === 0}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[15px] font-bold disabled:opacity-30 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <CreditCard className="h-5 w-5" />
              Cobrar {fmtM(totals.total)}
              <kbd className="ml-2 text-[10px] opacity-60 bg-white/20 px-1.5 py-0.5 rounded">F2</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Client picker modal ─── */}
      {showClientes && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-start justify-center pt-20" onClick={() => setShowClientes(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-border" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-[14px] font-bold text-foreground mb-2">Seleccionar cliente</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  className="w-full bg-accent/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={clienteSearch}
                  onChange={e => setClienteSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-auto px-2 pb-2">
              <button
                onClick={() => { setClienteId(null); setClienteNombre('Público general'); setClienteTarifaId(null); setClienteListaPrecioId(null); setClienteListaNombre(null); setClienteCredito(false); setClienteDiasCredito(0); setClienteLimiteCredito(0); setShowClientes(false); setClienteSearch(''); if (condicion === 'credito') setCondicion('contado'); }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent text-[13px] text-foreground font-medium"
              >
                Público general
              </button>
              {filteredClientes.map(c => (
                <button
                  key={c.id}
                  onClick={() => { 
                    setClienteId(c.id); setClienteNombre(c.nombre); 
                    setClienteTarifaId((c as any).tarifa_id || null); 
                    setClienteListaPrecioId((c as any).lista_precio_id || null);
                    const lpName = (c as any).lista_precios?.nombre ?? null;
                    setClienteListaNombre(lpName);
                    setClienteCredito(!!(c as any).credito);
                    setClienteDiasCredito((c as any).dias_credito ?? 0);
                    setClienteLimiteCredito((c as any).limite_credito ?? 0);
                    setShowClientes(false); setClienteSearch(''); 
                    if (!(c as any).credito && condicion === 'credito') setCondicion('contado'); 
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors ${clienteId === c.id ? 'bg-primary/10' : ''}`}
                >
                  <p className="text-[13px] font-medium text-foreground truncate">{c.nombre}</p>
                  <div className="flex items-center gap-2">
                    {c.codigo && <span className="text-[10px] text-muted-foreground">{c.codigo}</span>}
                    {(c as any).credito && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Crédito</span>}
                    {(c as any).lista_precios?.nombre && <span className="text-[9px] text-muted-foreground">{(c as any).lista_precios.nombre}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment modal ─── */}
      {showPago && (
        <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => !saving && setShowPago(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden border border-border max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-foreground">Cobrar</h3>
                <button onClick={() => setShowPago(false)} className="p-1 rounded-md hover:bg-accent">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-[13px] text-muted-foreground">{clienteNombre} · {totals.items} artículos</span>
                <span className="text-[28px] font-black text-primary tabular-nums">{fmtM(totals.total)}</span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-auto flex-1">
              {/* Sin impuestos toggle */}
              <div className="flex items-center justify-between rounded-lg bg-accent/40 px-3 py-2">
                <span className="text-[12px] font-medium text-foreground">Sin impuestos</span>
                <Switch checked={sinImpuestos} onCheckedChange={setSinImpuestos} className="scale-90" />
              </div>

              {/* Condición de pago — solo mostrar Crédito si el cliente tiene crédito */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Condición de pago</label>
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => { setCondicion('contado'); setPayMode('efectivo'); setPayEfectivo(totals.total.toFixed(2)); setPayTransferencia(''); setPayTarjeta(''); }}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${condicion === 'contado' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'}`}>
                    Contado
                  </button>
                  {clienteCredito && (
                    <button onClick={() => {
                      setCondicion('credito');
                      setPayMode('efectivo');
                      setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta('');
                      if (clienteDiasCredito > 0) {
                        const d = new Date(); d.setDate(d.getDate() + clienteDiasCredito);
                        setFechaVencimiento(d.toISOString().slice(0, 10));
                      }
                    }}
                      className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all ${condicion === 'credito' ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'}`}>
                      Crédito
                    </button>
                  )}
                </div>
              </div>

              {/* Credit details */}
              {condicion === 'credito' && (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">Límite de crédito</span>
                    <span className="font-semibold text-foreground">{fmtM(clienteLimiteCredito)}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Fecha de vencimiento</label>
                    <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Se registrará a crédito — no se cobra ahora</p>
                </div>
              )}

              {/* Payment method selector — only for contado */}
              {condicion === 'contado' && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Método de pago</label>
                    <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                      {([
                        { key: 'efectivo' as PayMode, label: 'Efectivo', icon: Wallet },
                        { key: 'transferencia' as PayMode, label: 'Transfer.', icon: Banknote },
                        { key: 'tarjeta' as PayMode, label: 'Tarjeta', icon: CreditCard },
                        { key: 'mixto' as PayMode, label: 'Mixto', icon: Package },
                      ]).map(m => (
                        <button key={m.key} onClick={() => {
                          setPayMode(m.key);
                          if (m.key === 'efectivo') { setPayEfectivo(totals.total.toFixed(2)); setPayTransferencia(''); setPayTarjeta(''); }
                          else if (m.key === 'transferencia') { setPayEfectivo(''); setPayTransferencia(totals.total.toFixed(2)); setPayTarjeta(''); }
                          else if (m.key === 'tarjeta') { setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta(totals.total.toFixed(2)); }
                          else if (m.key === 'mixto') { setPayEfectivo(''); setPayTransferencia(''); setPayTarjeta(''); }
                        }}
                          className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${payMode === m.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground hover:bg-accent'}`}>
                          <m.icon className="h-4 w-4" />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Efectivo input */}
                  {(payMode === 'efectivo' || payMode === 'mixto') && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-[12px] font-semibold text-foreground flex-1">Efectivo</span>
                        {payMode === 'mixto' && (
                          <button onClick={() => {
                            const rest = Math.max(0, totals.total - (parseFloat(payTransferencia) || 0) - (parseFloat(payTarjeta) || 0));
                            setPayEfectivo(rest.toFixed(2));
                          }} className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">{s}</span>
                        <input type="number" inputMode="decimal"
                          className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[16px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={payEfectivo} placeholder="0.00" onChange={e => setPayEfectivo(e.target.value)} autoFocus
                        />
                      </div>
                      {payMode === 'efectivo' && quickAmounts.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {quickAmounts.map(a => (
                            <button key={a} onClick={() => setPayEfectivo(a.toString())}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${parseFloat(payEfectivo) === a ? 'bg-primary text-primary-foreground' : 'bg-accent/50 text-foreground border border-border hover:bg-accent'}`}>
                              {fmtM(a)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transferencia input */}
                  {(payMode === 'transferencia' || payMode === 'mixto') && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Banknote className="h-4 w-4 text-primary" />
                        <span className="text-[12px] font-semibold text-foreground flex-1">Transferencia</span>
                        {payMode === 'mixto' && (
                          <button onClick={() => {
                            const rest = Math.max(0, totals.total - (parseFloat(payEfectivo) || 0) - (parseFloat(payTarjeta) || 0));
                            setPayTransferencia(rest.toFixed(2));
                          }} className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">{s}</span>
                        <input type="number" inputMode="decimal"
                          className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={payTransferencia} placeholder="0.00" onChange={e => setPayTransferencia(e.target.value)}
                        />
                      </div>
                      <input type="text" className="w-full bg-accent/20 border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none mt-2"
                        value={refTransferencia} placeholder="Referencia (opcional)" onChange={e => setRefTransferencia(e.target.value)} />
                    </div>
                  )}

                  {/* Tarjeta input */}
                  {(payMode === 'tarjeta' || payMode === 'mixto') && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-primary" />
                        <span className="text-[12px] font-semibold text-foreground flex-1">Tarjeta</span>
                        {payMode === 'mixto' && (
                          <button onClick={() => {
                            const rest = Math.max(0, totals.total - (parseFloat(payEfectivo) || 0) - (parseFloat(payTransferencia) || 0));
                            setPayTarjeta(rest.toFixed(2));
                          }} className="text-[10px] text-primary font-semibold hover:underline">Exacto</button>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-medium">{s}</span>
                        <input type="number" inputMode="decimal"
                          className="w-full bg-accent/30 border border-border rounded-lg pl-7 pr-2 py-2.5 text-[14px] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={payTarjeta} placeholder="0.00" onChange={e => setPayTarjeta(e.target.value)}
                        />
                      </div>
                      <input type="text" className="w-full bg-accent/20 border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none mt-2"
                        value={refTarjeta} placeholder="Referencia (opcional)" onChange={e => setRefTarjeta(e.target.value)} />
                    </div>
                  )}

                  {/* Summary */}
                  <div className="rounded-lg bg-accent/40 px-4 py-2.5 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-3 text-[12px]">
                        <span className="text-muted-foreground">Total pagado:</span>
                        <span className="font-bold text-foreground tabular-nums">{fmtM(totalPagado)}</span>
                      </div>
                      {faltante > 0 && (
                        <div className="flex items-center gap-3 text-[12px]">
                          <span className="text-destructive font-medium">Faltante:</span>
                          <span className="font-bold text-destructive tabular-nums">{fmtM(faltante)}</span>
                        </div>
                      )}
                    </div>
                    {cambio > 0 && (
                      <div className="text-right">
                        <span className="text-[11px] text-primary font-medium">Cambio</span>
                        <p className="text-[20px] text-primary font-bold tabular-nums leading-tight">{fmtM(cambio)}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Confirm button */}
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={handleCobrar}
                disabled={saving || cart.length === 0 || (condicion === 'contado' && faltante > 0 && payMode !== 'efectivo')}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-4 text-[16px] font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Check className="h-5 w-5" />
                {saving ? 'Guardando...' : condicion === 'credito' ? 'Confirmar venta a crédito' : `Confirmar ${fmtM(totals.total)}`}
                <kbd className="ml-2 text-[10px] opacity-60 bg-white/20 px-1.5 py-0.5 rounded">F2</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Ticket modal after sale (auto-print) ─── */}
      {showTicket && lastVentaData && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center" onClick={() => { setShowTicket(false); setLastVentaData(null); clearAll(); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-border max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-2 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-foreground flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" /> Venta registrada
              </h3>
              <button onClick={() => { setShowTicket(false); setLastVentaData(null); clearAll(); }} className="p-1 rounded-md hover:bg-accent">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <TicketVenta
                empresa={{
                  nombre: empresa?.nombre ?? '',
                  telefono: empresa?.telefono,
                  direccion: empresa?.direccion,
                  logo_url: empresa?.logo_url,
                  rfc: empresa?.rfc,
                  moneda: empresa?.moneda,
                }}
                folio={lastVentaData.folio}
                fecha={lastVentaData.fecha}
                clienteNombre={lastVentaData.clienteNombre}
                lineas={lastVentaData.lineas}
                subtotal={lastVentaData.subtotal}
                iva={lastVentaData.iva}
                ieps={lastVentaData.ieps}
                total={lastVentaData.total}
                condicionPago={lastVentaData.condicionPago}
                metodoPago={lastVentaData.metodoPago}
                montoRecibido={lastVentaData.montoRecibido}
                cambio={lastVentaData.cambio}
                saldoAnterior={lastVentaData.saldoAnterior}
                saldoNuevo={lastVentaData.saldoNuevoCalc}
                promociones={lastVentaData.promoDetails ?? []}
                onPrintTicket={() => {
                  const promoTicket = (lastVentaData.promoDetails ?? []) as { descripcion: string; descuento: number; producto_id?: string }[];
                  const td = buildTicketDataFromVenta({
                    empresa,
                    venta: {
                      folio: lastVentaData.folio,
                      fecha: lastVentaData.fecha,
                      subtotal: lastVentaData.subtotal,
                      iva_total: lastVentaData.iva,
                      ieps_total: lastVentaData.ieps,
                      total: lastVentaData.total,
                      condicion_pago: lastVentaData.condicionPago,
                      metodo_pago: lastVentaData.metodoPago,
                    },
                    clienteNombre: lastVentaData.clienteNombre,
                    lineas: lastVentaData.lineas.map((l: any) => ({
                      nombre: l.nombre,
                      cantidad: l.cantidad,
                      precio_unitario: l.precio,
                      total: l.total,
                      iva_monto: l.iva_monto,
                      ieps_monto: l.ieps_monto,
                      producto_id: l.producto_id,
                    })),
                    montoRecibido: lastVentaData.montoRecibido,
                    cambio: lastVentaData.cambio,
                    promociones: promoTicket,
                    saldoAnterior: lastVentaData.saldoAnterior,
                    saldoNuevo: lastVentaData.saldoNuevoCalc,
                  });
                  const ticketAncho = (empresa as any)?.ticket_ancho ?? '58';
                  printTicket(td, { ticketAncho });
                }}
                onClose={() => {
                  setShowTicket(false);
                  setLastVentaData(null);
                  clearAll();
                }}
              />
            </div>
            <div className="px-5 pb-4 pt-2 border-t border-border flex gap-2">
              <button
                onClick={() => {
                  const promoTicket = (lastVentaData.promoDetails ?? []) as { descripcion: string; descuento: number; producto_id?: string }[];
                  const td = buildTicketDataFromVenta({
                    empresa,
                    venta: { folio: lastVentaData.folio, fecha: lastVentaData.fecha, subtotal: lastVentaData.subtotal, iva_total: lastVentaData.iva, ieps_total: lastVentaData.ieps, total: lastVentaData.total, condicion_pago: lastVentaData.condicionPago, metodo_pago: lastVentaData.metodoPago },
                    clienteNombre: lastVentaData.clienteNombre,
                    lineas: lastVentaData.lineas.map((l: any) => ({ nombre: l.nombre, cantidad: l.cantidad, precio_unitario: l.precio, total: l.total, iva_monto: l.iva_monto, ieps_monto: l.ieps_monto, producto_id: l.producto_id })),
                    montoRecibido: lastVentaData.montoRecibido, cambio: lastVentaData.cambio, promociones: promoTicket,
                    saldoAnterior: lastVentaData.saldoAnterior,
                    saldoNuevo: lastVentaData.saldoNuevoCalc,
                  });
                  printTicket(td, { ticketAncho: (empresa as any)?.ticket_ancho ?? '58' });
                }}
                className="flex-1 bg-accent text-foreground rounded-xl py-3 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/80 transition-colors"
              >
                <Receipt className="h-4 w-4" /> Reimprimir
              </button>
              <button
                onClick={() => { setShowTicket(false); setLastVentaData(null); clearAll(); }}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <Check className="h-4 w-4" /> Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
