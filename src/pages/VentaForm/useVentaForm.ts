import { todayLocal } from '@/lib/utils';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useVenta, useSaveVenta, useSaveVentaLinea, useDeleteVentaLinea, useDeleteVenta } from '@/hooks/useVentas';
import { useProductosForSelect, useAlmacenes, useTarifasForSelect } from '@/hooks/useData';
import { useClientes } from '@/hooks/useClientes';
import { useEntregasByPedido, useCrearEntrega, calcRemainingQty } from '@/hooks/useEntregas';
import { supabase } from '@/lib/supabase';
import { buildPromoAplicadaRows, promoPersistHabilitado, replacePromocionesAplicadas } from '@/lib/promoPersist';
import { aplicarPromoALinea, promoLineaHabilitado, separarDescuentoPromo } from '@/lib/promoLinea';
import { buildDesgloseLinea, desgloseLineaHabilitado } from '@/lib/ventaLineaDesglose';

import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { buildPosLinePricing, type PosPricingItem, type BasePrecioMode } from '@/lib/posPricing';
import { buildManualSalePricingFromGross, buildSalePricingSnapshot, calculateSaleLineAmounts, calculateSaleLineEffectivePrices } from '@/lib/salePricing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Venta, VentaLinea, StatusVenta } from '@/types';
import { toast } from 'sonner';
import { usePinAuth } from '@/hooks/usePinAuth';
import { usePromocionesActivas, evaluatePromociones, type PromoResult, type CartItemForPromo } from '@/hooks/usePromociones';
import { usePermisos } from '@/hooks/usePermisos';

const COL_COUNT = 4;

export function emptyVenta(): Partial<Venta> {
  return {
    tipo: 'venta_directa', status: 'borrador', condicion_pago: 'por_definir',
    fecha: todayLocal(), entrega_inmediata: true,
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
  // Selección de lote al vender (venta directa de producto por lote).
  const [loteParaLinea, setLoteParaLinea] = useState<{ idx: number; producto: { id: string; nombre: string } } | null>(null);
  const setLineaLote = (idx: number, loteId: string, codigo: string) => {
    setLineas(prev => { const next = [...prev]; next[idx] = { ...next[idx], lote_id: loteId, lote_codigo: codigo } as any; return next; });
    setDirty(true);
  };
  const [dirty, setDirty] = useState(false);
  const loadedVentaIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const statusChangingRef = useRef(false);
  const { requestPin, PinDialog } = usePinAuth();
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showFacturaDrawer, setShowFacturaDrawer] = useState(false);
  const [sinImpuestos, setSinImpuestosState] = useState(false);
  const { hasPermiso } = usePermisos();
  const canEditVenta = hasPermiso('ventas', 'editar');
  const canCreateVenta = hasPermiso('ventas', 'crear');
  const readOnly = isNew ? !canCreateVenta : (form.status !== 'borrador' || !canEditVenta);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Feature apartado: si la empresa lo activa y el almacén está en la lista,
  // para pedidos mostramos disponible = stock - apartado (respeta reservas).
  const apartadoEnabled = !!empresa?.apartar_stock_pedidos
    && !!form.almacen_id
    && (empresa?.apartado_almacenes_ids ?? []).includes(form.almacen_id)
    && form.tipo !== 'venta_directa';

  // Fetch stock per almacen for filtering / enriching products (real-time in both pedido & venta_directa)
  const { data: stockAlmacenData } = useQuery({
    queryKey: ['stock-almacen-form', form.almacen_id, apartadoEnabled],
    enabled: !!form.almacen_id,
    staleTime: 30_000,
    queryFn: async () => {
      const [stockRes, apartRes] = await Promise.all([
        supabase.from('stock_almacen').select('producto_id, cantidad').eq('almacen_id', form.almacen_id!),
        apartadoEnabled
          ? supabase.from('stock_apartado').select('producto_id, cantidad').eq('almacen_id', form.almacen_id!)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const map = new Map<string, number>();
      (stockRes.data ?? []).forEach((r: any) => map.set(r.producto_id, Number(r.cantidad) || 0));
      (apartRes.data ?? []).forEach((r: any) => {
        map.set(r.producto_id, (map.get(r.producto_id) ?? 0) - (Number(r.cantidad) || 0));
      });
      return map;
    },
  });

  // Always enrich each product with its live _stock. For venta_directa we ALSO hide
  // products with 0 stock (unless vender_sin_stock). Pedidos show everything.
  const productosList = useMemo(() => {
    if (!productosListRaw) return productosListRaw;
    const stockMap = stockAlmacenData ?? new Map<string, number>();
    const enriched = productosListRaw.map((p: any) => ({
      ...p,
      _stock: form.almacen_id ? (stockMap.get(p.id) ?? 0) : (p.cantidad ?? 0),
    }));
    // Solo ocultamos productos sin stock cuando hay un almacén seleccionado
    // (ahí sí conocemos la existencia real). Sin almacén no filtramos: de lo
    // contrario el buscador aparece vacío y no se puede agregar nada.
    if (form.tipo !== 'venta_directa' || !form.almacen_id) return enriched;
    return enriched.filter((p: any) => p.vender_sin_stock || (p._stock ?? 0) > 0);
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

  // Las reglas de la tarifa aún no llegan: no se puede precificar todavía.
  // Sin esto, `resolveProductPricing` cae al fallback (precio_principal) y
  // captura precios equivocados mientras carga el cliente / su lista.
  const tarifaRulesLoading = !!form.tarifa_id && tarifaRules === undefined;
  const pricingReady = !!form.cliente_id && !tarifaRulesLoading;

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
  const canCreateEntrega = !isNew && form.tipo === 'pedido' && (form.status === 'confirmado' || form.status === 'entregado') && !fullyDelivered && !(form as any).cerrado_at;

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
        .select('id, monto_aplicado, created_at, cobro_id, cobros(fecha, metodo_pago, referencia, status)')
        .eq('venta_id', form.id!).order('created_at', { ascending: false });
      return data ?? [];
    },
  });
  const totalPagado = useMemo(
    () => (pagosData ?? []).reduce((s: number, p: any) => s + (((p.cobros?.status ?? 'activo') !== 'cancelado') ? Number(p.monto_aplicado ?? 0) : 0), 0),
    [pagosData],
  );
  // Always derive from total - totalPagado so it stays reactive when pagos change.
  // totalPagado already excludes cancelled cobros. If the pedido is cerrado
  // parcial, use the effective total (total_efectivo) instead of the original.
  const totalReferencia = (form as any).cerrado_at
    ? Number((form as any).total_efectivo ?? form.total ?? 0)
    : Number(form.total ?? 0);
  const saldoPendiente = Math.max(0, totalReferencia - totalPagado);


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
      const prodUnidad = prod?.unidades_venta;
      const unidadLabel = unidadData?.abreviatura || unidadData?.nombre
        || prodUnidad?.abreviatura || prodUnidad?.nombre
        || (prod?.es_granel ? prod?.unidad_granel : '')
        || '';
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
    if (!productosList) return m;
    const listaPrecioId = (form as any).lista_precio_id || null;
    lineas.forEach(l => {
      if (!l.producto_id || m.has(l.producto_id)) return;
      const prod = productosList.find((p: any) => p.id === l.producto_id);
      if (!prod) return;
      const pf: ProductForPricing = { id: l.producto_id, precio_principal: Number(prod.precio_principal) || 0, costo: Number(prod.costo) || 0, clasificacion_id: prod.clasificacion_id, tiene_iva: prod.tiene_iva, iva_pct: Number(prod.iva_pct ?? 16), tiene_ieps: prod.tiene_ieps, ieps_pct: Number(prod.ieps_pct ?? 0), ieps_tipo: prod.ieps_tipo, usa_listas_precio: prod.usa_listas_precio };
      const r = resolveProductPricing(tarifaRules ?? [], pf, listaPrecioId);
      m.set(l.producto_id, { rawUnitPrice: r.rawUnitPrice, rawDisplayPrice: r.rawDisplayPrice, basePrecio: r.basePrecio, redondeo: r.appliedRule?.redondeo ?? 'ninguno' });
    });
    return m;
  }, [tarifaRules, lineas, productosList, (form as any).lista_precio_id]);

  // Totals (line-level: manual discount only, no promos yet)
  const totals = useMemo(() => {
    let subtotal = 0, descuento_total = 0, iva_total = 0, ieps_total = 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    lineas.forEach(l => {
      const lineAmounts = calculateSaleLineAmounts(l as any, sinImpuestos);
      iva_total += lineAmounts.iva; ieps_total += lineAmounts.ieps;
      subtotal += lineAmounts.subtotal; descuento_total += lineAmounts.discount;
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
        // Base BRUTA (con impuestos y redondeo) para que el descuento sea sobre
        // lo que realmente paga el cliente y el IVA quede proporcional.
        const bruto = calculateSaleLineAmounts(l as any, sinImpuestos);
        const qty = Number(l.cantidad) || 0;
        return {
          producto_id: l.producto_id!,
          clasificacion_id: prod?.clasificacion_id ?? undefined,
          precio_unitario: qty > 0 ? bruto.total / qty : 0,
          cantidad: qty,
        };
      });
    return evaluatePromociones(promocionesActivas, cartForPromo, form.cliente_id ?? undefined, undefined, (empresa as any)?.zona_horaria);
  }, [promocionesActivas, lineas, productosList, form.cliente_id, sinImpuestos]);

  // Build per-product promo discount map
  const promoByProduct = useMemo(() => {
    const m = new Map<string, number>();
    promoResults.forEach(r => {
      if (r.producto_id) m.set(r.producto_id, (m.get(r.producto_id) ?? 0) + r.descuento);
    });
    return m;
  }, [promoResults]);

  // Descuento EFECTIVO de promoción por producto (ya viene en bruto)
  const promoEffectiveByProduct = useMemo(() => {
    const m = new Map<string, number>();
    const r2 = (n: number) => Math.round(n * 100) / 100;
    lineas.forEach(l => {
      if (!l.producto_id) return;
      const bruto = calculateSaleLineAmounts(l as any, sinImpuestos);
      const qty = Number(l.cantidad) || 0;
      const promoParts = separarDescuentoPromo(
        promoResults,
        l.producto_id,
        qty > 0 ? bruto.total / qty : 0,
      );
      const efectivo = Math.min(
        bruto.total,
        r2(promoParts.descuentoRegular + promoParts.descuentoGratisBruto),
      );
      if (efectivo > 0) {
        m.set(l.producto_id, r2((m.get(l.producto_id) ?? 0) + efectivo));
      }
    });
    return m;
  }, [promoResults, lineas, sinImpuestos]);

  // Totales del encabezado sumando las líneas YA netas de promoción, para que
  // siempre se cumpla subtotal + IVA + IEPS = total.
  const finalTotals = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let iva = 0, ieps = 0, promoEffective = 0;
    const pendiente = new Map<string, number>(promoEffectiveByProduct);
    lineas.forEach(l => {
      const bruto = calculateSaleLineAmounts(l as any, sinImpuestos);
      const rem = l.producto_id ? (pendiente.get(l.producto_id) ?? 0) : 0;
      const aplicado = rem > 0 ? Math.min(rem, bruto.total) : 0;
      if (aplicado > 0 && l.producto_id) pendiente.set(l.producto_id, rem - aplicado);
      const ajustado = aplicado > 0 ? aplicarPromoALinea(bruto, aplicado) : bruto;
      iva += ajustado.iva;
      ieps += ajustado.ieps;
      promoEffective += aplicado;
    });
    return {
      ...totals,
      iva_total: r2(iva),
      ieps_total: r2(ieps),
      descuento_total: r2(totals.descuento_total + promoEffective),
      descuento_promo: r2(promoEffective),
      total: r2(Math.max(0, totals.total - promoEffective)),
    };
  }, [totals, promoEffectiveByProduct, lineas, sinImpuestos]);



  const displayTotals = useMemo(() => {
    if (isNew || !readOnly) return finalTotals;
    const subtotal = Number(form.subtotal) || 0;
    const iva_total = Number(form.iva_total) || 0;
    const ieps_total = Number(form.ieps_total) || 0;
    const total = Number(form.total) || 0;
    const impliedDiscount = Math.max(0, subtotal + iva_total + ieps_total - total);
    const cerrado = !!(form as any).cerrado_at;
    const totalEf = Number((form as any).total_efectivo ?? total) || 0;
    const ratio = cerrado && total > 0 ? Math.min(1, totalEf / total) : 1;
    return {
      subtotal: subtotal * ratio,
      iva_total: iva_total * ratio,
      ieps_total: ieps_total * ratio,
      total: cerrado ? totalEf : total,
      descuento_total: Math.max(Number(form.descuento_total) || 0, impliedDiscount) * ratio,
      descuento_extra_amt: (Number((form as any).descuento_extra) > 0 ? finalTotals.descuento_extra_amt : 0) * ratio,
      descuento_promo: (finalTotals.descuento_promo ?? 0) * ratio,
    };
  }, [finalTotals, (form as any).descuento_extra, form.descuento_total, form.ieps_total, form.iva_total, form.subtotal, form.total, (form as any).cerrado_at, (form as any).total_efectivo, isNew, readOnly]);

  const applyEffectiveLinePricing = useCallback((line: Partial<VentaLinea>, currentSinImpuestos: boolean) => {
    const effective = calculateSaleLineEffectivePrices(line as any, currentSinImpuestos);
    const currentUnit = Number(line.precio_unitario) || 0;
    const currentDisplay = Number((line as any).display_unit_price) || currentUnit;
    if (Math.abs(currentUnit - effective.unitPrice) < 0.000001 && Math.abs(currentDisplay - effective.displayPrice) < 0.000001) return line;
    return { ...line, precio_unitario: effective.unitPrice, display_unit_price: effective.displayPrice } as Partial<VentaLinea>;
  }, []);

  // Cambio de cliente → cambio de lista: pedimos confirmación antes de
  // reprecificar líneas ya capturadas (los precios manuales nunca se tocan).
  const [pendingReprice, setPendingReprice] = useState<{ listaPrecioId: string | null; listaNombre: string; count: number; manualCount: number } | null>(null);
  const [repriceNonce, setRepriceNonce] = useState(0);
  const repricedListaRef = useRef<string | null | undefined>(undefined);

  // Re-price existing lines when tarifa rules or lista_precio changes (skip manual lines).
  // Una línea con lista_precio_id propio NO se reprecifica desde la lista/tarifa global:
  // solo se re-aplica el redondeo efectivo con el nuevo estado de impuestos.
  useEffect(() => {
    if (!productosList || readOnly) return;
    // Espera a que carguen las reglas de la tarifa del cliente: repreciar
    // ahora daría el fallback (precio_principal) en vez del precio de lista.
    if (tarifaRulesLoading) return;
    const formListaPrecioId = (form as any).lista_precio_id || null;

    // Si la lista cambió y ya hay líneas capturadas, no repreciar en silencio:
    // se pregunta al usuario (ver `confirmReprice` / `dismissReprice`).
    if (repricedListaRef.current !== undefined && repricedListaRef.current !== formListaPrecioId) {
      const autoLines = lineas.filter(l => l.producto_id && !(l as any).precio_manual);
      const manualLines = lineas.filter(l => l.producto_id && (l as any).precio_manual);
      if (autoLines.length || manualLines.length) {
        const nombre = (tarifasList ?? []).find((t: any) => t.id === form.tarifa_id)?.nombre ?? 'la nueva lista';
        setPendingReprice({ listaPrecioId: formListaPrecioId, listaNombre: nombre, count: autoLines.length, manualCount: manualLines.length });
        return;
      }
    }
    repricedListaRef.current = formListaPrecioId;

    setLineas(prev => prev.map(l => {
      if (!l.producto_id) return l;
      // Línea congelada: el usuario declinó el reprecio al cambiar de cliente.
      if ((l as any)._precio_congelado) return l;
      if ((l as any).precio_manual) return l;
      const lineOwnLista = (l as any).lista_precio_id ?? null;

      // Caso 1: la línea tiene su propia lista. NUNCA sobrescribir con la lista/tarifa
      // global. Solo re-aplicar impuestos/redondeo sobre el snapshot existente.
      if (lineOwnLista) {
        const rawNet = Number((l as any).precio_unitario_sin_redondeo);
        if (!Number.isFinite(rawNet) || rawNet <= 0) {
          if (typeof console !== 'undefined') {
            console.warn('[line-price-list-unresolved]', {
              listaPrecioId: lineOwnLista,
              tarifaId: (l as any).tarifa_id ?? null,
            });
          }
          return l;
        }
        return applyEffectiveLinePricing(l, sinImpuestos) as any;
      }

      // Caso 2: la línea no tiene lista propia → reprecificar con lista/tarifa global.
      // Sin `return` temprano por falta de reglas: `resolveProductPricing` cae en
      // el fallback (precio_principal = precio final) cuando no hay regla.
      const prod = productosList.find((p: any) => p.id === l.producto_id);
      if (!prod) return l;
      const prodForPricing: ProductForPricing = {
        id: l.producto_id, precio_principal: Number(prod.precio_principal) || 0, costo: Number(prod.costo) || 0,
        clasificacion_id: prod.clasificacion_id, tiene_iva: prod.tiene_iva, iva_pct: Number(prod.iva_pct ?? 16),
        tiene_ieps: prod.tiene_ieps, ieps_pct: Number(prod.ieps_pct ?? 0), ieps_tipo: prod.ieps_tipo,
        usa_listas_precio: prod.usa_listas_precio,
      };
      const pricing = resolveProductPricing(tarifaRules ?? [], prodForPricing, formListaPrecioId);
      const snap = buildSalePricingSnapshot(prodForPricing, pricing);
      const merged: any = {
        ...l,
        precio_unitario: snap.unitPrice,
        display_unit_price: snap.displayPrice,
        precio_unitario_sin_redondeo: snap.rawUnitPrice,
        precio_display_sin_redondeo: snap.rawDisplayPrice,
        base_precio: snap.basePrecio,
        redondeo: snap.redondeo,
      };
      const effective = applyEffectiveLinePricing(merged, sinImpuestos) as any;
      if (
        effective.precio_unitario === Number(l.precio_unitario) &&
        effective.display_unit_price === Number((l as any).display_unit_price)
      ) return l;
      return effective;
    }));
  // `lineas` se lee dentro pero NO va en deps: el map crea un array nuevo en
  // cada corrida y provocaría un ciclo infinito de renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifaRules, tarifaRulesLoading, (form as any).lista_precio_id, sinImpuestos, applyEffectiveLinePricing, productosList, readOnly, repriceNonce]);

  // Acepta el reprecio pendiente: descongela las líneas y libera el ref para
  // que el efecto recalcule con la lista nueva.
  const confirmReprice = useCallback(() => {
    repricedListaRef.current = undefined;
    setLineas(prev => prev.map(l => ((l as any)._precio_congelado ? { ...l, _precio_congelado: false } as any : l)));
    setPendingReprice(null);
    setRepriceNonce(n => n + 1);
    setDirty(true);
  }, []);

  // Rechaza el reprecio: congela las líneas ya capturadas para que conserven
  // su precio y marca la lista como atendida.
  const dismissReprice = useCallback(() => {
    repricedListaRef.current = (form as any).lista_precio_id || null;
    setLineas(prev => prev.map(l => (l.producto_id ? { ...l, _precio_congelado: true } as any : l)));
    setPendingReprice(null);
  }, [(form as any).lista_precio_id]);






  const setSinImpuestos = useCallback((value: boolean) => {
    setSinImpuestosState(value);
    setLineas(prev => prev.map(l => applyEffectiveLinePricing(l, value)));
    setDirty(true);
  }, [applyEffectiveLinePricing]);

  const set = (field: string, val: any) => { if (readOnly) return; setForm(prev => ({ ...prev, [field]: val })); setDirty(true); };

  const handleProductSelect = (idx: number, productoId: string) => {
    if (readOnly) return;
    if (!productoId) { updateLine(idx, 'producto_id', ''); return; }
    const producto = productosList?.find((p: any) => p.id === productoId);
    if (!producto) return;
    const ivaPct = producto.tiene_iva ? Number(producto.iva_pct ?? 16) : 0;
    // Trata IEPS como activo si tiene_ieps=true o si ieps_pct > 0 (por si el flag no se marcó explícito)
    const hasIeps = !!producto.tiene_ieps || Number(producto.ieps_pct ?? 0) > 0;
    const iepsPct = hasIeps ? Number(producto.ieps_pct ?? 0) : 0;
    const unidadId = producto.unidad_venta_id || producto.unidad_compra_id || null;
    const unidadData = (producto as any).unidades_venta;
    const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';
    const taxes: string[] = [];
    if (producto.tiene_iva) taxes.push(`IVA ${ivaPct}%`);
    if (hasIeps) { taxes.push(producto.ieps_tipo === 'cuota' ? 'IEPS cuota' : `IEPS ${iepsPct}%`); }
    const prodForPricing: ProductForPricing = {
      id: productoId, precio_principal: Number(producto.precio_principal) || 0, costo: Number(producto.costo) || 0,
      clasificacion_id: producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: Number(producto.iva_pct ?? 16),
      tiene_ieps: hasIeps, ieps_pct: iepsPct, ieps_tipo: producto.ieps_tipo,
      usa_listas_precio: producto.usa_listas_precio,
    };
    // Siempre resolvemos con el resolver: aunque la lista NO tenga reglas,
    // `resolveProductPricing` cae en `precioPrincipalFallback`, donde
    // `precio_principal` ES el precio FINAL (con impuestos) y el neto se deriva
    // dividiendo. Sin este camino, un producto sin regla tomaba precio_principal
    // como neto y le sumaba impuestos (97 → 104.76 en vez de 97).
    const pricing = resolveProductPricing(tarifaRules ?? [], prodForPricing, (form as any).lista_precio_id);
    const snap = buildSalePricingSnapshot(prodForPricing, pricing);
    const finalUnitPrice = snap.unitPrice;
    const finalDisplayPrice = snap.displayPrice;
    setLineas(prev => { const next = [...prev]; next[idx] = { ...next[idx], producto_id: productoId, descripcion: producto.nombre, precio_unitario: finalUnitPrice, display_unit_price: finalDisplayPrice, precio_unitario_sin_redondeo: snap?.rawUnitPrice ?? finalUnitPrice, precio_display_sin_redondeo: snap?.rawDisplayPrice ?? finalDisplayPrice, base_precio: snap?.basePrecio ?? 'con_impuestos', redondeo: snap?.redondeo ?? 'ninguno', unidad_id: unidadId, iva_pct: ivaPct, ieps_pct: iepsPct, unidad_label: unidadLabel, impuestos_label: taxes.join(', '), lista_precio_id: (form as any).lista_precio_id ?? null, precio_manual: false, lote_id: null, lote_codigo: null } as any; return next; });
    setDirty(true);
    // Producto por lote en venta directa → pedir el lote (FEFO).
    if ((producto as any).maneja_lote && form.tipo === 'venta_directa') {
      setLoteParaLinea({ idx, producto: { id: productoId, nombre: producto.nombre } });
    }
  };

  // Cambio de lista de precios a nivel de línea: usamos el snapshot ya calculado
  // por ListaPrecioPicker (que resuelve con las reglas de la tarifa de esa lista,
  // no con las reglas de la tarifa global del formulario). Reemplazamos por
  // completo el snapshot de la línea sin conservar valores de la lista anterior.
  const changeLineListaPrecio = useCallback((
    idx: number,
    selection: {
      listaPrecioId: string | null;
      listaPrecioNombre?: string;
      tarifaId: string | null;
      unitPrice: number;
      displayPrice: number;
      rawUnitPrice: number;
      rawDisplayPrice: number;
      basePrecio: string;
      redondeo: string;
    },
  ) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      const line: any = next[idx];
      if (!line?.producto_id) return prev;
      const updated: any = {
        ...line,
        lista_precio_id: selection.listaPrecioId,
        precio_unitario: selection.unitPrice,
        display_unit_price: selection.displayPrice,
        precio_unitario_sin_redondeo: selection.rawUnitPrice,
        precio_display_sin_redondeo: selection.rawDisplayPrice,
        base_precio: selection.basePrecio,
        redondeo: selection.redondeo,
        precio_manual: false,
      };
      if ('tarifa_id' in line) updated.tarifa_id = selection.tarifaId;
      next[idx] = applyEffectiveLinePricing(updated, sinImpuestos) as any;
      if (typeof console !== 'undefined') {
        console.debug('[price-list-change]', {
          previousListId: line.lista_precio_id ?? null,
          selectedListId: selection.listaPrecioId,
          selectionUnitPrice: selection.unitPrice,
          selectionDisplayPrice: selection.displayPrice,
          selectionRawUnitPrice: selection.rawUnitPrice,
          assignedUnitPrice: (next[idx] as any).precio_unitario,
          assignedDisplayPrice: (next[idx] as any).display_unit_price,
        });
      }
      return next;
    });
    setDirty(true);
  }, [readOnly, sinImpuestos, applyEffectiveLinePricing]);

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
    // Tax toggles (iva_pct/ieps_pct): keep the stored NET precio_unitario intact so
    // removing a tax lowers the total by exactly the tax amount (and adding it back
    // raises it accordingly). Do NOT re-resolve pricing from the price list here —
    // that would re-interpret a "con_impuestos" rule and undo the discount the user
    // expects when unchecking a tax.
    if (field === 'iva_pct' || field === 'ieps_pct') {
      setLineas(prev => { const next = [...prev]; const updated = { ...next[idx], [field]: val } as any; next[idx] = applyEffectiveLinePricing(updated, sinImpuestos) as any; return next; });
      setDirty(true);
      return;
    }
    // Manual price edit: if the line is priced "con impuestos" (Base chip),
    // the value in the input is a GROSS price that includes IVA/IEPS. Decompose
    // it into net so the totals honor the taxes the user configured.
    if (field === 'precio_unitario') {
      setLineas(prev => {
        const next = [...prev];
        const line = next[idx] as any;
        const gross = Number(val) || 0;
        const basePrecio = (line.base_precio ?? 'sin_impuestos');
        if (basePrecio === 'con_impuestos') {
          const snap = buildManualSalePricingFromGross(
            { tiene_iva: Number(line.iva_pct) > 0, iva_pct: Number(line.iva_pct) || 0, tiene_ieps: Number(line.ieps_pct) > 0, ieps_pct: Number(line.ieps_pct) || 0 },
            gross,
          );
          next[idx] = { ...line, precio_unitario: snap.unitPrice, display_unit_price: snap.displayPrice, precio_unitario_sin_redondeo: snap.rawUnitPrice, precio_display_sin_redondeo: snap.rawDisplayPrice, redondeo: 'ninguno', precio_manual: true };
        } else {
          // El precio manual es la nueva fuente de verdad: hay que re-anclar el
          // neto crudo, si no `calculateSaleLineEffectivePrices` seguiría usando
          // el `precio_unitario_sin_redondeo` de la lista de precios y el precio
          // escrito por el usuario se perdería al recalcular la línea.
          next[idx] = { ...line, precio_unitario: gross, display_unit_price: gross, precio_unitario_sin_redondeo: gross, precio_display_sin_redondeo: gross, redondeo: 'ninguno', precio_manual: true };
        }

        return next;
      });
      setDirty(true);
      return;
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
    // Venta directa: los productos por lote exigen lote elegido en la línea.
    if (form.tipo === 'venta_directa') {
      const faltaLote = lineas.some(l => {
        if (!l.producto_id || Number(l.cantidad) <= 0) return false;
        const prod = productosList?.find((p: any) => p.id === l.producto_id) as any;
        return prod?.maneja_lote && !(l as any).lote_id;
      });
      if (faltaLote) {
        toast.error('Elige el lote de los productos que manejan lote antes de guardar.');
        savingRef.current = false;
        return;
      }
    }
    if (form.tipo !== 'venta_directa' && !form.entrega_inmediata && !form.fecha_entrega) {
      toast.error('La fecha de entrega es obligatoria');
      savingRef.current = false;
      return;
    }
    // Preserve original vendedor on edits — never overwrite with the current viewer.
    // Only fall back to the current user when creating a brand-new venta.
    const vendedorId = (form.vendedor_id as string | undefined) || profile?.id;
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

      // Con la bandera activa, cada línea se guarda YA NETA de su promoción.
      const netearLineas = promoLineaHabilitado((empresa as any)?.licencia);
      const promoPendientePorProducto = new Map<string, number>(promoEffectiveByProduct);

      // Pre-cálculo de líneas ANTES de guardar el encabezado: si la promoción
      // ya viene descontada en la línea, el encabezado NO debe volver a restarla
      // (eso provocaba un descuento doble en el total de la venta).
      const preparadas: { producto_id: string; pricedLine: any; lineAmounts: ReturnType<typeof calculateSaleLineAmounts>; brutoAmounts: ReturnType<typeof calculateSaleLineAmounts> }[] = [];
      for (const l of lineas) {
        if (!l.producto_id) continue;
        const pricedLine = applyEffectiveLinePricing(l, sinImpuestos) as any;
        let lineAmounts = calculateSaleLineAmounts(pricedLine as any, sinImpuestos);
        const brutoAmounts = lineAmounts;
        if (netearLineas) {
          const pend = promoPendientePorProducto.get(l.producto_id) ?? 0;
          if (pend > 0) {
            const aplicar = Math.min(pend, lineAmounts.total);
            lineAmounts = { ...lineAmounts, ...aplicarPromoALinea({ subtotal: lineAmounts.subtotal, iva: lineAmounts.iva, ieps: lineAmounts.ieps, total: lineAmounts.total }, aplicar) };
            promoPendientePorProducto.set(l.producto_id, pend - aplicar);
          }
        }
        preparadas.push({ producto_id: l.producto_id, pricedLine, lineAmounts, brutoAmounts });
      }


      const r2h = (n: number) => Math.round(n * 100) / 100;
      let headerTotals: typeof finalTotals = finalTotals;
      if (netearLineas) {
        const sumSub = r2h(preparadas.reduce((s, p) => s + p.lineAmounts.subtotal, 0));
        const sumIva = r2h(preparadas.reduce((s, p) => s + p.lineAmounts.iva, 0));
        const sumIeps = r2h(preparadas.reduce((s, p) => s + p.lineAmounts.ieps, 0));
        const sumTotalLineas = r2h(preparadas.reduce((s, p) => s + p.lineAmounts.total, 0));
        const extraAmt = Number(finalTotals.descuento_extra_amt) || 0;
        const promoAmt = Number(finalTotals.descuento_promo) || 0;
        const manualDesc = r2h(Math.max(0, (Number(finalTotals.descuento_total) || 0) - promoAmt - extraAmt));
        headerTotals = {
          ...finalTotals,
          subtotal: sumSub,
          iva_total: sumIva,
          ieps_total: sumIeps,
          // La promoción ya está restada en las líneas: no se vuelve a restar aquí.
          descuento_total: r2h(manualDesc + extraAmt),
          descuento_promo: 0,
          total: r2h(Math.max(0, sumTotalLineas - extraAmt)),
        };
      }

      const payload = { ...form, ...headerTotals, vendedor_id: vendedorId };
      const saved = await saveVenta.mutateAsync(payload as any);
      const ventaId = saved.id || form.id;
      const linePromises: Promise<any>[] = [];
      const lineProductoIds: string[] = [];
      const lineTotalByProduct = new Map<string, number>();
      const guardarDesglose = desgloseLineaHabilitado((empresa as any)?.licencia);
      for (const { producto_id, pricedLine, lineAmounts, brutoAmounts } of preparadas) {
        const savedIvaPct = sinImpuestos ? 0 : (Number(pricedLine.iva_pct) || 0);
        const savedIepsPct = sinImpuestos ? 0 : (Number(pricedLine.ieps_pct) || 0);
        let desglose: Record<string, any> = {};
        if (guardarDesglose) {
          const promosLinea = promoResults.filter(p => p.producto_id === producto_id && Number(p.descuento) > 0);
          const promoDominante = promosLinea.slice().sort((a, b) => Number(b.descuento || 0) - Number(a.descuento || 0))[0];
          desglose = buildDesgloseLinea({
            cantidad: Number(pricedLine.cantidad) || 0,
            precioListaUnitario: Number(pricedLine.precio_unitario_sin_redondeo) || Number(pricedLine.precio_unitario) || 0,
            breakdownBruto: brutoAmounts,
            breakdownNeto: lineAmounts,
            descuentoPromoMonto: Math.max(0, Math.round((brutoAmounts.total - lineAmounts.total) * 100) / 100),
            descuentoManualMonto: Number(brutoAmounts.discount) || 0,
            cantidadBonificada: promosLinea.reduce((s, p) => s + (Number(p.cantidad_gratis) || 0), 0),
            promocion: promoDominante ? { id: promoDominante.promocion_id, nombre: promoDominante.nombre } : null,
            usuarioId: profile?.id || null,
            objetoImpuesto: (pricedLine as any).objeto_impuesto ?? null,
          });
        }
        const linePayload = { ...pricedLine, venta_id: ventaId, subtotal: lineAmounts.subtotal, iva_pct: savedIvaPct, iva_monto: lineAmounts.iva, ieps_pct: savedIepsPct, ieps_monto: lineAmounts.ieps, total: lineAmounts.total, ...desglose };
        const clean = { ...linePayload } as any;
        delete clean.unidad_label;
        delete clean.impuestos_label;
        delete clean.productos;
        delete clean.unidades;
        lineProductoIds.push(producto_id);
        lineTotalByProduct.set(producto_id, (lineTotalByProduct.get(producto_id) ?? 0) + lineAmounts.total);
        linePromises.push(saveLinea.mutateAsync(clean));
      }

      const savedLines = await Promise.all(linePromises);

      // Registrar el desglose de promociones aplicadas (solo informativo para reportes).
      if (promoPersistHabilitado((empresa as any)?.licencia)) {
        try {
          const lineIdByProduct = new Map<string, string>();
          savedLines.forEach((row: any, i) => {
            const pid = lineProductoIds[i];
            if (pid && row?.id && !lineIdByProduct.has(pid)) lineIdByProduct.set(pid, row.id);
          });
          const rows = buildPromoAplicadaRows({
            ventaId,
            promoResults,
            effectiveByProduct: promoEffectiveByProduct,
            lineIdByProduct,
            lineTotalByProduct,
          });
          await replacePromocionesAplicadas(ventaId, rows);
        } catch (e) {
          console.error('No se pudo registrar promocion_aplicada', e);
        }
      }

      if (isNew && autoConfirm) {
        const saldo = headerTotals.total;
        await saveVenta.mutateAsync({ id: ventaId, status: 'confirmado', saldo_pendiente: saldo } as any);
        toast.success('Venta confirmada');
      } else { toast.success('Venta guardada'); }
      // Invalidate venta query once after all saves complete
      queryClient.invalidateQueries({ queryKey: ['venta', ventaId] });
      loadedVentaIdRef.current = null; // allow reload
      if (isNew) navigate(`/ventas/${ventaId}`, { replace: true });
      setDirty(false);
      return ventaId;
    } catch (e: any) { toast.error(e.message); return undefined; } finally { savingRef.current = false; }
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
    if (statusChangingRef.current) return;
    statusChangingRef.current = true;
    try {
      return await _handleStatusChangeInner(newStatus);
    } finally {
      statusChangingRef.current = false;
    }
  };
  const _handleStatusChangeInner = async (newStatus: StatusVenta) => {
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
      if (['entregado', 'facturado'].includes(form.status ?? '')) {
        toast.error('Una venta entregada o facturada no puede volver a borrador, solo cancelar');
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
    // If transitioning out of borrador, persist any pending line edits + recalculated totals first
    if (prevStatus === 'borrador') {
      const savedId = await handleSave();
      if (!savedId) return; // save failed or aborted
    }
    setForm(prev => ({ ...prev, status: newStatus }));
    await saveVenta.mutateAsync({ id: form.id, status: newStatus } as any);
    await logHistorial(form.id!, newStatus === 'confirmado' ? 'confirmada' : newStatus === 'entregado' ? 'entregada' : newStatus === 'facturado' ? 'facturada' : 'editada', { status: { anterior: prevStatus, nuevo: newStatus } });
    if (newStatus === 'confirmado' && form.vendedor_id && form.tarifa_id) {
      try {
        // Si el vendedor tiene esquema de comisión por volumen, NO se generan filas por línea.
        const { data: prof } = await supabase.from('profiles').select('comision_esquema_id' as any).eq('id', form.vendedor_id).maybeSingle();
        if (!(prof as any)?.comision_esquema_id) {
          const { data: tarifaLineas } = await supabase.from('tarifa_lineas').select('comision_pct, aplica_a, producto_ids, clasificacion_ids').eq('tarifa_id', form.tarifa_id);
          if (tarifaLineas?.length) {
            // Obtener clasificaciones de los productos involucrados para resolver jerarquía Producto > Categoría > Todos
            const prodIds = [...new Set(lineas.map(l => l.producto_id).filter(Boolean))] as string[];
            const { data: prodsData } = prodIds.length > 0
              ? await supabase.from('productos').select('id, clasificacion_id').in('id', prodIds)
              : { data: [] as any[] };
            const prodCat = new Map<string, string | null>((prodsData ?? []).map((p: any) => [p.id, p.clasificacion_id ?? null]));

            const comisionRows = lineas.filter(l => l.id && l.producto_id && l.total && l.total > 0).map(l => {
              const catId = prodCat.get(l.producto_id!) ?? null;
              // Prioridad: 1) regla por producto específico, 2) regla por categoría, 3) regla "todos"
              const matchProducto = tarifaLineas.find(tl => tl.aplica_a === 'producto' && tl.producto_ids?.includes(l.producto_id!));
              const matchCategoria = !matchProducto && catId
                ? tarifaLineas.find(tl => tl.aplica_a === 'categoria' && tl.clasificacion_ids?.includes(catId))
                : null;
              const matchTodos = !matchProducto && !matchCategoria
                ? tarifaLineas.find(tl => tl.aplica_a === 'todos')
                : null;
              const match = matchProducto || matchCategoria || matchTodos;
              const comPct = match?.comision_pct ?? 0;
              if (comPct <= 0) return null;
              return { empresa_id: empresa!.id, venta_id: form.id!, venta_linea_id: l.id!, vendedor_id: form.vendedor_id!, producto_id: l.producto_id!, monto_venta: l.total!, comision_pct: comPct, comision_monto: Math.round((l.total! * comPct / 100) * 100) / 100, fecha_venta: form.fecha || todayLocal() };
            }).filter(Boolean);
            if (comisionRows.length > 0) await supabase.from('venta_comisiones').insert(comisionRows as any);
          }
        }
      } catch (err) { console.error('Error generating commissions', err); }
    }
    toast.success(`Estado: ${newStatus}`);
  };

  const handleAddPago = async (monto: number, metodo: string, referencia: string) => {
    if (!form.id || !form.cliente_id || !user?.id || !empresa?.id) return;
    if (monto > saldoPendiente + 0.01) { toast.error('El monto excede el saldo pendiente'); return; }
    // Cobro + aplicación atómico (aplicar_cobro): o entran los dos, o ninguno.
    const { data: cobroId, error: cobroErr } = await (supabase as any).rpc('aplicar_cobro', {
      p_empresa_id: empresa.id,
      p_cliente_id: form.cliente_id,
      p_monto: monto,
      p_metodo: metodo,
      p_referencia: referencia || null,
      p_fecha: todayLocal(),
      p_aplicaciones: [{ venta_id: form.id, monto_aplicado: monto }],
      p_user_id: user.id,
    });
    if (cobroErr) throw cobroErr;
    toast.success('Pago registrado');
    import('@/lib/enviarReciboCobro').then(m => m.enviarReciboCobro(cobroId, empresa.id));
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  const handleCancelPago = async (cobroId: string) => {
    if (!form.id) return;
    const { error } = await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cobroId);
    if (error) { toast.error(error.message); return; }
    toast.success('Pago cancelado');
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  const handleReactivarPago = async (cobroId: string) => {
    if (!form.id) return;
    const { error } = await supabase.from('cobros').update({ status: 'activo' } as any).eq('id', cobroId);
    if (error) { toast.error(error.message); return; }
    toast.success('Pago reactivado');
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  const handleDeletePago = async (aplicacionId: string, cobroId: string) => {
    if (!form.id) return;
    const { error: delAppErr } = await supabase.from('cobro_aplicaciones').delete().eq('id', aplicacionId);
    if (delAppErr) { toast.error(delAppErr.message); return; }
    const { count } = await supabase.from('cobro_aplicaciones').select('id', { count: 'exact', head: true }).eq('cobro_id', cobroId);
    if (!count || count === 0) {
      await supabase.from('cobros').delete().eq('id', cobroId);
    }
    toast.success('Pago eliminado');
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  const handleUpdatePago = async (aplicacionId: string, cobroId: string, nuevoMonto: number) => {
    if (!form.id || nuevoMonto <= 0) return;
    const { data: apps } = await supabase.from('cobro_aplicaciones').select('id').eq('cobro_id', cobroId);
    const isSingle = (apps ?? []).length === 1;
    const { error: appErr } = await supabase.from('cobro_aplicaciones').update({ monto_aplicado: nuevoMonto } as any).eq('id', aplicacionId);
    if (appErr) { toast.error(appErr.message); return; }
    if (isSingle) {
      await supabase.from('cobros').update({ monto: nuevoMonto } as any).eq('id', cobroId);
    }
    toast.success('Pago actualizado');
    queryClient.invalidateQueries({ queryKey: ['venta-pagos', form.id] });
    queryClient.invalidateQueries({ queryKey: ['venta', form.id] });
  };

  return {
    id, isNew, form, lineas, setLineas, dirty, readOnly, isLoading,
    profile, user, empresa, navigate, queryClient,
    clientesList, productosList, tarifasList, almacenesList,
    entregasExistentes, entregasActivas, hayEntregas, remaining, fullyDelivered, canCreateEntrega, lineDeliverySummary,
    pagosData, totalPagado, saldoPendiente, totals: displayTotals, promoResults, tarifaRules,
    pdfBlob, setPdfBlob, showPdfModal, setShowPdfModal, showFacturaDrawer, setShowFacturaDrawer,
    sinImpuestos, setSinImpuestos, pricingReady, tarifaRulesLoading,
    pendingReprice, confirmReprice, dismissReprice,
    saveVenta, crearEntrega, PinDialog, requestPin,
    set, handleProductSelect, handleSave, handleDelete, handleStatusChange, handleAddPago,
    handleCancelPago, handleReactivarPago, handleDeletePago, handleUpdatePago,
    addLine, updateLine, removeLine, setCellRef, handleCellKeyDown, navigateCell, changeLineListaPrecio,
    loteParaLinea, setLoteParaLinea, setLineaLote,
  };
}
