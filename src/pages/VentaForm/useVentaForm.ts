import { todayLocal } from '@/lib/utils';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useVenta, useSaveVenta, useSaveVentaLinea, useDeleteVentaLinea, useDeleteVenta } from '@/hooks/useVentas';
import { useProductosForSelect, useAlmacenes, useTarifasForSelect } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { useEntregasByPedido, useCrearEntrega, calcRemainingQty } from '@/hooks/useEntregas';
import { supabase } from '@/lib/supabase';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { buildPosLinePricing, type PosPricingItem, type BasePrecioMode } from '@/lib/posPricing';
import { buildManualSalePricingFromGross, buildSalePricingSnapshot } from '@/lib/salePricing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Venta, VentaLinea, StatusVenta } from '@/types';
import { toast } from 'sonner';
import { usePinAuth } from '@/hooks/usePinAuth';
import { usePromocionesActivas, evaluatePromociones, type PromoResult, type CartItemForPromo } from '@/hooks/usePromociones';
import { usePermisos } from '@/hooks/usePermisos';

const COL_COUNT = 4;

export function emptyVenta(): Partial<Venta> {
  return {
    tipo: 'pedido', status: 'borrador', condicion_pago: 'por_definir',
    fecha: todayLocal(), entrega_inmediata: false,
    subtotal: 0, descuento_total: 0, iva_total: 0, ieps_total: 0, total: 0,
  };
}

export function emptyLine(): Partial<VentaLinea> & { unidad_label?: string; impuestos_label?: string } {
  return {
    cantidad: 1, precio_unitario: 0, descuento_pct: 0,
    iva_pct: 0, ieps_pct: 0, subtotal: 0, iva_monto: 0, ieps_monto: 0, total: 0,
    unidad_label: '', impuestos_label: '',
  };
}

export const VENTA_STEPS_FULL: { key: StatusVenta; label: string }[] = [
  { key: 'borrador', label: 'Borrador' }, { key: 'confirmado', label: 'Confirmado' },
  { key: 'entregado', label: 'Entregado' }, { key: 'facturado', label: 'Facturado' },
];

export const VENTA_STEPS_INMEDIATA: { key: StatusVenta; label: string }[] = [
  { key: 'borrador', label: 'Borrador' }, { key: 'confirmado', label: 'Confirmado' },
  { key: 'facturado', label: 'Facturado' },
];

export function useVentaForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, user, empresa } = useAuth();
  const isNew = id === 'nuevo';
  const { data: existingVenta, isLoading } = useVenta(isNew ? undefined : id);
  const saveVenta = useSaveVenta();
  const saveLinea = useSaveVentaLinea();
  const deleteLinea = useDeleteVentaLinea();
  const deleteVenta = useDeleteVenta();
  const queryClient = useQueryClient();
  const { data: clientesList } = useClientes();
  const { data: productosListRaw } = useProductosForSelect();
  const { data: tarifasList } = useTarifasForSelect();
  const { data: almacenesList } = useAlmacenes();
  const crearEntrega = useCrearEntrega();
  const [form, setForm] = useState<Partial<Venta>>(emptyVenta());
  const [lineas, setLineas] = useState<Partial<VentaLinea>[]>([emptyLine()]);
  const [dirty, setDirty] = useState(false);
  const loadedVentaIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const { requestPin, PinDialog } = usePinAuth();
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showFacturaDrawer, setShowFacturaDrawer] = useState(false);
  const [sinImpuestos, setSinImpuestos] = useState(false);
  const { hasPermiso } = usePermisos();
  const canEditVenta = hasPermiso('ventas', 'editar');
  const canCreateVenta = hasPermiso('ventas', 'crear');
  const readOnly = isNew ? !canCreateVenta : (form.status !== 'borrador' || !canEditVenta);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Fetch stock per almacen for filtering products on venta_directa
  const { data: stockAlmacenData } = useQuery({
    queryKey: ['stock-almacen-form', form.almacen_id],
    enabled: !!form.almacen_id && form.tipo === 'venta_directa',
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('stock_almacen')
        .select('producto_id, cantidad')
        .eq('almacen_id', form.almacen_id!);
      return data ?? [];
    },
  });

  // For venta_directa, hide products with 0 stock (unless vender_sin_stock) and enrich with stock qty
  const productosList = useMemo(() => {
    if (!productosListRaw) return productosListRaw;
    if (form.tipo !== 'venta_directa') return productosListRaw;
    const stockMap = new Map((stockAlmacenData ?? []).map((s: any) => [s.producto_id, s.cantidad ?? 0]));
    return productosListRaw.filter((p: any) => {
      if (p.vender_sin_stock) return true;
      const qty = form.almacen_id ? (stockMap.get(p.id) ?? 0) : (p.cantidad ?? 0);
      return qty > 0;
    }).map((p: any) => ({
      ...p,
      _stock: form.almacen_id ? (stockMap.get(p.id) ?? 0) : (p.cantidad ?? 0),
    }));
  }, [productosListRaw, form.tipo, form.almacen_id, stockAlmacenData]);

  const setCellRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    const key = `${row}-${col}`;
    if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key);
  }, []);

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current.get(`${row}-${col}`);
    if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
  }, []);

  // Tarifa rules
  const { data: tarifaRules } = useQuery({
    queryKey: ['tarifa-rules-venta', form.tarifa_id], enabled: !!form.tarifa_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifa_lineas')
        .select('aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id')
        .eq('tarifa_id', form.tarifa_id!);
      if (error) throw error;
      return (data ?? []) as TarifaLineaRule[];
    },
  });

  // Entregas
  const { data: entregasExistentes } = useEntregasByPedido(!isNew && form.tipo === 'pedido' ? form.id : undefined);
  const hayEntregas = (entregasExistentes ?? []).length > 0;
  const entregasActivas = (entregasExistentes ?? []).filter(e => e.status !== 'cancelado');
  const remaining = useMemo(() => {
    if (!lineas || !entregasActivas.length) return null;
    const validLineas = lineas.filter(l => l.producto_id && Number(l.cantidad) > 0).map(l => ({ producto_id: l.producto_id!, cantidad: Number(l.cantidad) }));
    return calcRemainingQty(validLineas, entregasActivas as any);
  }, [lineas, entregasActivas]);
  const fullyDelivered = remaining !== null && remaining.length === 0;
  const canCreateEntrega = !isNew && form.tipo === 'pedido' && (form.status === 'confirmado' || form.status === 'entregado') && !fullyDelivered;

  const lineDeliverySummary = useMemo(() => {
    const delivered: Record<string, number> = {};
    for (const e of entregasActivas) {
      for (const l of (e.entrega_lineas ?? [])) { delivered[l.producto_id] = (delivered[l.producto_id] ?? 0) + Number(l.cantidad_entregada); }
    }
    return delivered;
  }, [entregasActivas]);

  // Pagos
  const { data: pagosData } = useQuery({
    queryKey: ['venta-pagos', form.id], enabled: !!form.id,
    queryFn: async () => {
      const { data } = await supabase.from('cobro_aplicaciones')
        .select('id, monto_aplicado, created_at, cobro_id, cobros(fecha, metodo_pago, referencia)')
        .eq('venta_id', form.id!).order('created_at', { ascending: false });
      return data ?? [];
    },
  });
  const totalPagado = useMemo(() => (pagosData ?? []).reduce((s: number, p: any) => s + (p.monto_aplicado ?? 0), 0), [pagosData]);
  const saldoPendiente = (form.total ?? 0) - totalPagado;

  // Load existing venta — only once per venta id
  useEffect(() => {
    if (!existingVenta) {
      if (isNew) {
        const defaultTarifa = tarifasList?.find((t: any) => t.tipo === 'general')?.id;
        setForm(prev => ({
          ...prev,
          vendedor_id: profile?.id,
          ...(defaultTarifa ? { tarifa_id: defaultTarifa } : {}),
          ...(profile?.almacen_id ? { almacen_id: profile.almacen_id } : {}),
        }));
      }
      return;
    }
    const ventaId = (existingVenta as any).id;
    if (loadedVentaIdRef.current === ventaId) return;
    loadedVentaIdRef.current = ventaId;

    setForm(existingVenta);
    const existingLines = ((existingVenta as any).venta_lineas ?? []).map((l: any) => {
      const prod = (l as any).productos;
      const unidadData = (l as any).unidades;
      const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';
      const taxes: string[] = [];
      if (l.iva_pct > 0) taxes.push(`IVA ${l.iva_pct}%`);
      if (l.ieps_pct > 0) taxes.push(`IEPS ${l.ieps_pct}%`);
      return { ...l, unidad_label: unidadLabel, impuestos_label: taxes.join(', ') };
    });
    const isReadOnly = existingVenta.status !== 'borrador';
    setLineas(isReadOnly ? existingLines : [...existingLines, emptyLine()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(existingVenta as any)?.id, isNew]);

  // Build raw pricing map from tarifa for promo-before-rounding logic
  const rawPricingMap = useMemo(() => {
    const m = new Map<string, { rawUnitPrice: number; rawDisplayPrice: number; basePrecio: string; redondeo: string }>();
    if (!tarifaRules?.length || !productosList) return m;
    const listaPrecioId = (form as any).lista_precio_id || null;
    lineas.forEach(l => {
      if (!l.producto_id || m.has(l.producto_id)) return;
      const prod = productosList.find((p: any) => p.id === l.producto_id);
      if (!prod) return;
      const pf: ProductForPricing = { id: l.producto_id, precio_principal: Number(prod.precio_principal) || 0, costo: Number(prod.costo) || 0, clasificacion_id: prod.clasificacion_id, tiene_iva: prod.tiene_iva, iva_pct: Number(prod.iva_pct ?? 16), tiene_ieps: prod.tiene_ieps, ieps_pct: Number(prod.ieps_pct ?? 0), ieps_tipo: prod.ieps_tipo, usa_listas_precio: prod.usa_listas_precio };
      const r = resolveProductPricing(tarifaRules, pf, listaPrecioId);
      m.set(l.producto_id, { rawUnitPrice: r.rawUnitPrice, rawDisplayPrice: r.rawDisplayPrice, basePrecio: r.basePrecio, redondeo: r.appliedRule?.redondeo ?? 'ninguno' });
    });
    return m;
  }, [tarifaRules, lineas, productosList, (form as any).lista_precio_id]);

  // Totals (line-level: manual discount only, no promos yet)
  const totals = useMemo(() => {
    let subtotal = 0, descuento_total = 0, iva_total = 0, ieps_total = 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    lineas.forEach(l => {
      const qty = Number(l.cantidad) || 0, price = Number(l.precio_unitario) || 0, desc = Number(l.descuento_pct) || 0;
      const lineSubtotal = r2(qty * price), discountAmt = r2(lineSubtotal * (desc / 100)), base = r2(lineSubtotal - discountAmt);
      if (!sinImpuestos) {
        const ieps = r2(base * ((Number(l.ieps_pct) || 0) / 100)), iva = r2((base + ieps) * ((Number(l.iva_pct) || 0) / 100));
        iva_total += iva; ieps_total += ieps;
      }
      subtotal += lineSubtotal; descuento_total += discountAmt;
    });
    // Extra discount
    const extraTipo = (form as any).descuento_extra_tipo || 'porcentaje';
    const extraVal = Number((form as any).descuento_extra) || 0;
    const preExtraTotal = r2(subtotal - descuento_total + iva_total + ieps_total);
    const extraAmt = r2(extraTipo === 'porcentaje' ? preExtraTotal * (extraVal / 100) : extraVal);
    return { subtotal: r2(subtotal), descuento_total: r2(descuento_total + extraAmt), descuento_extra_amt: r2(extraAmt), iva_total: r2(iva_total), ieps_total: r2(ieps_total), total: r2(Math.max(0, preExtraTotal - extraAmt)) };
  }, [lineas, sinImpuestos, (form as any).descuento_extra, (form as any).descuento_extra_tipo]);

  // ---- Promotions engine ----
  const { data: promocionesActivas } = usePromocionesActivas();

  const promoResults = useMemo(() => {
    if (!promocionesActivas?.length || lineas.length === 0) return [] as PromoResult[];
    const cartForPromo: CartItemForPromo[] = lineas
      .filter(l => l.producto_id && Number(l.cantidad) > 0)
      .map(l => {
        const prod = productosList?.find((p: any) => p.id === l.producto_id);
        return {
          producto_id: l.producto_id!,
          clasificacion_id: prod?.clasificacion_id ?? undefined,
          precio_unitario: Number(l.precio_unitario) || 0,
          cantidad: Number(l.cantidad) || 0,
        };
      });
    return evaluatePromociones(promocionesActivas, cartForPromo, form.cliente_id ?? undefined, undefined);
  }, [promocionesActivas, lineas, productosList, form.cliente_id]);

  // Build per-product promo discount map
  const promoByProduct = useMemo(() => {
    const m = new Map<string, number>();
    promoResults.forEach(r => {
      if (r.producto_id) m.set(r.producto_id, (m.get(r.producto_id) ?? 0) + r.descuento);
    });
    return m;
  }, [promoResults]);

  // Combine totals with promo discounts using buildPosLinePricing (promo before rounding)
  const finalTotals = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let promoEffective = 0;
    lineas.forEach(l => {
      if (!l.producto_id) return;
      const promoDisc = promoByProduct.get(l.producto_id) ?? 0;
      if (promoDisc <= 0) return;
      const raw = rawPricingMap.get(l.producto_id);
      const pricingItem: PosPricingItem = {
        precio_unitario: Number(l.precio_unitario) || 0,
        precio_unitario_sin_redondeo: raw?.rawUnitPrice ?? (Number(l.precio_unitario) || 0),
        precio_display_sin_redondeo: raw?.rawDisplayPrice ?? (Number(l.precio_unitario) || 0),
        cantidad: Number(l.cantidad) || 1,
        tiene_iva: sinImpuestos ? false : !!(l as any).iva_pct,
        iva_pct: Number(l.iva_pct) || 0,
        tiene_ieps: sinImpuestos ? false : !!(l as any).ieps_pct,
        ieps_pct: Number(l.ieps_pct) || 0,
        base_precio: (raw?.basePrecio ?? 'sin_impuestos') as BasePrecioMode,
        redondeo: raw?.redondeo ?? 'ninguno',
      };
      const lp = buildPosLinePricing(pricingItem, promoDisc);
      promoEffective += lp.effectiveDiscount;
    });
    return {
      ...totals,
      descuento_total: r2(totals.descuento_total + promoEffective),
      descuento_promo: r2(promoEffective),
      total: r2(Math.max(0, totals.total - promoEffective)),
    };
  }, [totals, promoByProduct, rawPricingMap, lineas, sinImpuestos]);

  // Re-price existing lines when tarifa rules or lista_precio changes
  useEffect(() => {
    if (!tarifaRules?.length || !productosList || readOnly) return;
    const listaPrecioId = (form as any).lista_precio_id || null;
    setLineas(prev => prev.map(l => {
      if (!l.producto_id) return l;
      const prod = productosList.find((p: any) => p.id === l.producto_id);
      if (!prod) return l;
      const prodForPricing: ProductForPricing = {
        id: l.producto_id, precio_principal: Number(prod.precio_principal) || 0, costo: Number(prod.costo) || 0,
        clasificacion_id: prod.clasificacion_id, tiene_iva: prod.tiene_iva, iva_pct: Number(prod.iva_pct ?? 16),
        tiene_ieps: prod.tiene_ieps, ieps_pct: Number(prod.ieps_pct ?? 0), ieps_tipo: prod.ieps_tipo,
        usa_listas_precio: prod.usa_listas_precio,
      };
      const pricing = resolveProductPricing(tarifaRules, prodForPricing, listaPrecioId);
      const snap = buildSalePricingSnapshot(prodForPricing, pricing);
      if (snap.unitPrice === Number(l.precio_unitario)) return l;
      return { ...l, precio_unitario: snap.unitPrice, display_unit_price: snap.displayPrice } as any;
    }));
  }, [tarifaRules, (form as any).lista_precio_id]);

  const set = (field: string, val: any) => { if (readOnly) return; setForm(prev => ({ ...prev, [field]: val })); setDirty(true); };

  const handleProductSelect = (idx: number, productoId: string) => {
    if (readOnly) return;
    if (!productoId) { updateLine(idx, 'producto_id', ''); return; }
    const producto = productosList?.find((p: any) => p.id === productoId);
    if (!producto) return;
    const ivaPct = producto.tiene_iva ? Number(producto.iva_pct ?? 16) : 0;
    const iepsPct = producto.tiene_ieps ? Number(producto.ieps_pct ?? 0) : 0;
    const unidadId = producto.unidad_venta_id || producto.unidad_compra_id || null;
    const unidadData = (producto as any).unidades_venta;
    const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';
    const taxes: string[] = [];
    if (producto.tiene_iva) taxes.push(`IVA ${ivaPct}%`);
    if (producto.tiene_ieps) { taxes.push(producto.ieps_tipo === 'cuota' ? 'IEPS cuota' : `IEPS ${iepsPct}%`); }
    const prodForPricing: ProductForPricing = {
      id: productoId, precio_principal: Number(producto.precio_principal) || 0, costo: Number(producto.costo) || 0,
      clasificacion_id: producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: Number(producto.iva_pct ?? 16),
      tiene_ieps: producto.tiene_ieps, ieps_pct: Number(producto.ieps_pct ?? 0), ieps_tipo: producto.ieps_tipo,
      usa_listas_precio: producto.usa_listas_precio,
    };
    const pricing = tarifaRules?.length ? resolveProductPricing(tarifaRules, prodForPricing, (form as any).lista_precio_id) : null;
    const snap = pricing ? buildSalePricingSnapshot(prodForPricing, pricing) : null;
    const finalUnitPrice = snap ? snap.unitPrice : Number(producto.precio_principal) || 0;
    const finalDisplayPrice = snap ? snap.displayPrice : finalUnitPrice;
    setLineas(prev => { const next = [...prev]; next[idx] = { ...next[idx], producto_id: productoId, descripcion: producto.nombre, precio_unitario: finalUnitPrice, display_unit_price: finalDisplayPrice, unidad_id: unidadId, iva_pct: ivaPct, ieps_pct: iepsPct, unidad_label: unidadLabel, impuestos_label: taxes.join(', ') } as any; return next; });
    setDirty(true);
  };

  const navigateCell = useCallback((rowIdx: number, colIdx: number, dir: 'next' | 'prev') => {
    if (dir === 'next') { if (colIdx < COL_COUNT - 1) focusCell(rowIdx, colIdx + 1); else if (rowIdx >= lineas.length - 1) { setLineas(prev => [...prev, emptyLine()]); setDirty(true); setTimeout(() => focusCell(rowIdx + 1, 0), 50); } else focusCell(rowIdx + 1, 0); }
    else { if (colIdx > 0) focusCell(rowIdx, colIdx - 1); else if (rowIdx > 0) focusCell(rowIdx - 1, COL_COUNT - 1); }
  }, [lineas.length, focusCell]);

  const handleCellKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); navigateCell(rowIdx, colIdx, e.shiftKey ? 'prev' : 'next'); }
  };

  const addLine = () => { if (readOnly) return; setLineas(prev => [...prev, emptyLine()]); setDirty(true); setTimeout(() => focusCell(lineas.length, 0), 50); };
  const updateLine = (idx: number, field: string, val: any) => {
    if (readOnly) return;
    // Validate max stock for entrega inmediata
    if (field === 'cantidad' && form.tipo === 'venta_directa' && form.entrega_inmediata) {
      const line = lineas[idx];
      if (line?.producto_id) {
        const prod = productosList?.find((p: any) => p.id === line.producto_id);
        const stock = prod?._stock ?? Infinity;
        if (prod && !prod.vender_sin_stock && Number(val) > stock) {
          toast.error(`Stock máximo para "${prod.nombre}": ${stock}`);
          val = stock;
        }
      }
    }
    // When tax fields change, recalculate pricing with new tax settings so rounding still applies
    if ((field === 'iva_pct' || field === 'ieps_pct') && tarifaRules?.length) {
      const line = lineas[idx];
      if (line?.producto_id) {
        const prod = productosList?.find((p: any) => p.id === line.producto_id);
        if (prod) {
          const newIvaPct = field === 'iva_pct' ? Number(val) : Number(line.iva_pct);
          const newIepsPct = field === 'ieps_pct' ? Number(val) : Number(line.ieps_pct);
          const prodForPricing: ProductForPricing = {
            id: line.producto_id!, precio_principal: Number(prod.precio_principal) || 0, costo: Number(prod.costo) || 0,
            clasificacion_id: prod.clasificacion_id,
            tiene_iva: newIvaPct > 0, iva_pct: newIvaPct > 0 ? newIvaPct : Number(prod.iva_pct ?? 16),
            tiene_ieps: newIepsPct > 0, ieps_pct: newIepsPct > 0 ? newIepsPct : Number(prod.ieps_pct ?? 0),
            ieps_tipo: prod.ieps_tipo,
            usa_listas_precio: prod.usa_listas_precio,
          };
          const pricing = resolveProductPricing(tarifaRules, prodForPricing, (form as any).lista_precio_id);
          const snap = buildSalePricingSnapshot(prodForPricing, pricing);
          setLineas(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: val, precio_unitario: snap.unitPrice, display_unit_price: snap.displayPrice } as any;
            return next;
          });
          setDirty(true);
          return;
        }
      }
    }
    setLineas(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: val }; return next; });
    setDirty(true);
  };
  const removeLine = async (idx: number) => { if (readOnly) return; const line = lineas[idx]; if (line.id) await deleteLinea.mutateAsync(line.id); const newLineas = lineas.filter((_, i) => i !== idx); setLineas(newLineas.length === 0 ? [emptyLine()] : newLineas); setDirty(true); };

  const handleSave = async (autoConfirm = false): Promise<string | undefined> => {
    if (readOnly) return;
    if (savingRef.current) return;
    savingRef.current = true;
    if (!form.cliente_id) { toast.error('Selecciona un cliente'); savingRef.current = false; return; }
    if (!form.almacen_id) { toast.error('Selecciona un almacén'); savingRef.current = false; return; }
    const vendedorId = profile?.id;
    if (!vendedorId) {
      toast.error('No se pudo determinar el vendedor');
      savingRef.current = false;
      return;
    }
    try {
      // Validate stock for ALL venta_directa (immediate or not — you shouldn't sell what you don't have)
      if (form.tipo === 'venta_directa' && form.almacen_id) {
        const productIds = lineas.filter(l => l.producto_id).map(l => l.producto_id!);
        if (productIds.length > 0) {
          const { data: stockRows } = await supabase
            .from('stock_almacen')
            .select('producto_id, cantidad')
            .eq('almacen_id', form.almacen_id)
            .in('producto_id', productIds);

          const { data: prodFlags } = await supabase
            .from('productos')
            .select('id, nombre, vender_sin_stock')
            .in('id', productIds);

          const stockMap = new Map((stockRows ?? []).map(s => [s.producto_id, s.cantidad]));
          const prodMap = new Map((prodFlags ?? []).map(p => [p.id, p]));

          for (const l of lineas) {
            if (!l.producto_id) continue;
            const prod = prodMap.get(l.producto_id);
            if (prod?.vender_sin_stock) continue;
            const disponible = stockMap.get(l.producto_id) ?? 0;
            const qty = Number(l.cantidad) || 0;
            if (qty > disponible) {
              toast.error(`Stock insuficiente para "${prod?.nombre ?? 'Producto'}". Disponible: ${disponible}, solicitado: ${qty}`);
              return;
            }
          }
        }
      }

      const payload = { ...form, ...finalTotals, vendedor_id: vendedorId };
      const saved = await saveVenta.mutateAsync(payload as any);
      const ventaId = saved.id || form.id;
      const linePromises: Promise<any>[] = [];
      for (const l of lineas) {
        if (!l.producto_id) continue;
        const qty = Number(l.cantidad) || 0, price = Number(l.precio_unitario) || 0, desc = Number(l.descuento_pct) || 0;
        const lineSubtotal = qty * price, discountAmt = lineSubtotal * (desc / 100), base = lineSubtotal - discountAmt;
        const ieps = sinImpuestos ? 0 : base * ((Number(l.ieps_pct) || 0) / 100);
        const iva = sinImpuestos ? 0 : (base + ieps) * ((Number(l.iva_pct) || 0) / 100);
        const savedIvaPct = sinImpuestos ? 0 : (Number(l.iva_pct) || 0);
        const savedIepsPct = sinImpuestos ? 0 : (Number(l.ieps_pct) || 0);
        const linePayload = { ...l, venta_id: ventaId, subtotal: base, iva_pct: savedIvaPct, iva_monto: iva, ieps_pct: savedIepsPct, ieps_monto: ieps, total: base + iva + ieps };
        const clean = { ...linePayload } as any;
        delete clean.unidad_label;
        delete clean.impuestos_label;
        delete clean.productos;
        delete clean.unidades;
        linePromises.push(saveLinea.mutateAsync(clean));
      }
      await Promise.all(linePromises);
      if (isNew && autoConfirm) {
        const saldo = finalTotals.total;
        await saveVenta.mutateAsync({ id: ventaId, status: 'confirmado', saldo_pendiente: saldo } as any);
        toast.success('Venta confirmada');
      } else { toast.success('Venta guardada'); }
      // Invalidate venta query once after all saves complete
      queryClient.invalidateQueries({ queryKey: ['venta', ventaId] });
      loadedVentaIdRef.current = null; // allow reload
      if (isNew) navigate(`/ventas/${ventaId}`, { replace: true });
      setDirty(false);
      return ventaId;
    } catch (e: any) { toast.error(e.message); return undefined; }
  };

  const handleDelete = async () => { if (!form.id) return; await deleteVenta.mutateAsync(form.id); toast.success('Venta eliminada'); navigate('/ventas'); };

  const logHistorial = async (ventaId: string, accion: string, detalles: any = {}) => {
    try {
      await supabase.from('venta_historial').insert({
        venta_id: ventaId,
        empresa_id: empresa!.id,
        user_id: user!.id,
        user_nombre: profile?.nombre ?? user?.email ?? '',
        accion,
        detalles,
      });
    } catch (e) { console.error('Error logging historial', e); }
  };

  const handleStatusChange = async (newStatus: StatusVenta) => {
    if (!form.id) return;
    if (newStatus === 'cancelado') {
      requestPin('Cancelar venta', 'Ingresa tu PIN de autorización para cancelar esta venta.', async () => {
        const prevStatus = form.status;
        setForm(prev => ({ ...prev, status: newStatus }));
        await saveVenta.mutateAsync({ id: form.id!, status: newStatus } as any);
        // Cancel associated cobros
        const { data: apps } = await supabase.from('cobro_aplicaciones').select('id, cobro_id, monto_aplicado').eq('venta_id', form.id!);
        if (apps && apps.length > 0) {
          const cobroIds = [...new Set(apps.map(a => a.cobro_id))];
          for (const cid of cobroIds) {
            const { data: allApps } = await supabase.from('cobro_aplicaciones').select('venta_id').eq('cobro_id', cid);
            const onlyThisVenta = (allApps ?? []).every(a => a.venta_id === form.id!);
            if (onlyThisVenta) {
              await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cid);
            }
          }
        }
        await logHistorial(form.id!, 'cancelada', { status: { anterior: prevStatus, nuevo: 'cancelado' } });
        toast.success('Venta cancelada');
        queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
      });
      return;
    }
    if (newStatus === 'borrador') {
      if (['entregado', 'facturado'].includes(form.status ?? '') || form.entrega_inmediata) {
        toast.error('Una venta entregada no puede volver a borrador, solo cancelar');
        return;
      }
      const prevStatus = form.status;
      setForm(prev => ({ ...prev, status: 'borrador' }));
      await saveVenta.mutateAsync({ id: form.id, status: 'borrador' } as any);
      await logHistorial(form.id!, 'vuelta_borrador', { status: { anterior: prevStatus, nuevo: 'borrador' } });
      toast.success('Venta regresada a borrador');
      queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
      return;
    }
    const prevStatus = form.status;
    setForm(prev => ({ ...prev, status: newStatus }));
    await saveVenta.mutateAsync({ id: form.id, status: newStatus } as any);
    await logHistorial(form.id!, newStatus === 'confirmado' ? 'confirmada' : newStatus === 'entregado' ? 'entregada' : newStatus === 'facturado' ? 'facturada' : 'editada', { status: { anterior: prevStatus, nuevo: newStatus } });
    if (newStatus === 'confirmado' && form.vendedor_id && form.tarifa_id) {
      try {
        const { data: tarifaLineas } = await supabase.from('tarifa_lineas').select('comision_pct, aplica_a, producto_ids, clasificacion_ids').eq('tarifa_id', form.tarifa_id);
        if (tarifaLineas?.length) {
          const comisionRows = lineas.filter(l => l.id && l.producto_id && l.total && l.total > 0).map(l => {
            const match = tarifaLineas.find(tl => { if (tl.aplica_a === 'todos') return true; if (tl.aplica_a === 'producto' && tl.producto_ids?.includes(l.producto_id!)) return true; return false; });
            const comPct = match?.comision_pct ?? 0;
            if (comPct <= 0) return null;
            return { empresa_id: empresa!.id, venta_id: form.id!, venta_linea_id: l.id!, vendedor_id: form.vendedor_id!, producto_id: l.producto_id!, monto_venta: l.total!, comision_pct: comPct, comision_monto: Math.round((l.total! * comPct / 100) * 100) / 100, fecha_venta: form.fecha || todayLocal() };
          }).filter(Boolean);
          if (comisionRows.length > 0) await supabase.from('venta_comisiones').insert(comisionRows as any);
        }
      } catch (err) { console.error('Error generating commissions', err); }
    }
    toast.success(`Estado: ${newStatus}`);
  };

  const handleAddPago = async (monto: number, metodo: string, referencia: string) => {
    if (!form.id || !form.cliente_id || !user?.id || !empresa?.id) return;
    if (monto > saldoPendiente + 0.01) { toast.error('El monto excede el saldo pendiente'); return; }
    const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({ empresa_id: empresa.id, cliente_id: form.cliente_id, monto, metodo_pago: metodo, referencia: referencia || null, user_id: user.id }).select('id').single();
    if (cobroErr) throw cobroErr;
    const { error: appErr } = await supabase.from('cobro_aplicaciones').insert({ cobro_id: cobro.id, venta_id: form.id, monto_aplicado: monto });
    if (appErr) throw appErr;
    await supabase.from('ventas').update({ saldo_pendiente: Math.max(0, saldoPendiente - monto) }).eq('id', form.id!);
    toast.success('Pago registrado');
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  return {
    id, isNew, form, lineas, setLineas, dirty, readOnly, isLoading,
    profile, user, empresa, navigate, queryClient,
    clientesList, productosList, tarifasList, almacenesList,
    entregasExistentes, entregasActivas, hayEntregas, remaining, fullyDelivered, canCreateEntrega, lineDeliverySummary,
    pagosData, totalPagado, saldoPendiente, totals: finalTotals, promoResults, tarifaRules,
    pdfBlob, setPdfBlob, showPdfModal, setShowPdfModal, showFacturaDrawer, setShowFacturaDrawer,
    sinImpuestos, setSinImpuestos,
    saveVenta, crearEntrega, PinDialog, requestPin,
    set, handleProductSelect, handleSave, handleDelete, handleStatusChange, handleAddPago,
    addLine, updateLine, removeLine, setCellRef, handleCellKeyDown, navigateCell,
  };
}
