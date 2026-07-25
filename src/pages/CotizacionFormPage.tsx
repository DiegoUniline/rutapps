import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCotizacion, useSaveCotizacion, useSetCotizacionEstado,
  validarStockCotizacion, type Cotizacion, type CotizacionLinea,
} from '@/hooks/useCotizaciones';
import { useClientes } from '@/hooks/useClientes';
import { useProductosForSelect, useAlmacenes, useTarifasForSelect } from '@/hooks/useData';
import { getCurrencyConfig } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, FileDown, Send, CheckCircle2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { todayLocal } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';
import { SingleDatePicker } from '@/components/shared/SingleDatePicker';
import { buildCotizacionPdf, buildCotizacionWhatsappMessage, cotizacionPublicUrl } from '@/lib/cotizacionPdf';
import { VentaLineasTab } from './VentaForm/VentaLineasTab';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { buildSalePricingSnapshot, calculateSaleLineAmounts } from '@/lib/salePricing';
import type { VentaLinea } from '@/types';

type Linea = Partial<VentaLinea> & { unidad_label?: string; impuestos_label?: string; lista_precio_id?: string | null; precio_manual?: boolean; display_unit_price?: number };

function emptyLine(): Linea {
  return {
    cantidad: 1, precio_unitario: 0, descuento_pct: 0,
    iva_pct: 0, ieps_pct: 0, subtotal: 0, iva_monto: 0, ieps_monto: 0, total: 0,
    unidad_label: '', impuestos_label: '',
  };
}

// Fecha de hoy en la zona horaria de la empresa (no la del dispositivo).
function todayISO() {
  return todayLocal();
}

export default function CotizacionFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'nuevo';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa, user, profile } = useAuth();
  const { data: existing, isLoading, isFetching, isError, error } = useCotizacion(isNew ? undefined : id);
  const { data: clientes } = useClientes();
  const { data: productosList } = useProductosForSelect();
  const { data: tarifasList } = useTarifasForSelect();
  const { data: almacenes } = useAlmacenes();
  const save = useSaveCotizacion();
  const setEstado = useSetCotizacionEstado();

  const [form, setForm] = useState<Partial<Cotizacion>>({
    fecha: todayISO(), vigencia_dias: 15, estado: 'borrador',
    subtotal: 0, descuento: 0, impuestos: 0, total: 0,
    descuento_extra: 0, descuento_extra_tipo: 'porcentaje',
  });
  const [lineas, setLineas] = useState<Linea[]>([emptyLine()]);
  const [sinImpuestos, setSinImpuestos] = useState(false);
  const [stockDialog, setStockDialog] = useState<{ open: boolean; rows: any[]; ok: boolean }>({ open: false, rows: [], ok: true });
  const [converting, setConverting] = useState(false);
  const loadedRef = useRef<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  const readOnly = !isNew && (form.estado === 'convertida' || form.estado === 'cancelada');
  const selectedTarifa = useMemo(() => (tarifasList ?? []).find((t: any) => t.id === form.tarifa_id), [tarifasList, form.tarifa_id]);
  const effectiveCurrencyCode = ((selectedTarifa as any)?.moneda || form.moneda || empresa?.moneda || 'MXN') as string;

  // Cargar default tarifa + almacen del perfil en nuevo
  useEffect(() => {
    if (isNew && !form.tarifa_id) {
      const def = tarifasList?.find((t: any) => t.tipo === 'general')?.id;
      setForm(f => ({
        ...f,
        ...(def ? { tarifa_id: def } : {}),
        ...(profile?.almacen_id ? { almacen_id: profile.almacen_id } : {}),
        vendedor_id: profile?.id ?? user?.id ?? null,
      }));
    }
  }, [isNew, tarifasList, profile, user]);

  // Cargar cotización existente
  useEffect(() => {
    if (!existing) return;
    if (loadedRef.current === existing.id) return;
    loadedRef.current = existing.id!;
    setForm({ ...existing, fecha: existing.fecha?.slice(0, 10) ?? todayISO() });
    const ls = (existing.cotizacion_lineas ?? []).map((l: any) => {
      const unidadData = l.unidades;
      const unidadLabel = unidadData?.abreviatura || unidadData?.nombre || '';
      const taxes: string[] = [];
      if (Number(l.iva_pct) > 0) taxes.push(`IVA ${l.iva_pct}%`);
      if (Number(l.ieps_pct) > 0) taxes.push(`IEPS ${l.ieps_pct}%`);
      return {
        ...l,
        unidad_label: unidadLabel,
        impuestos_label: taxes.join(', '),
      } as Linea;
    });
    const isRO = existing.estado === 'convertida' || existing.estado === 'cancelada';
    setLineas(isRO ? ls : [...ls, emptyLine()]);
  }, [existing?.id]);

  // Tarifa rules
  const { data: tarifaRules } = useQuery({
    queryKey: ['tarifa-rules-cot', form.tarifa_id], enabled: !!form.tarifa_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('tarifa_lineas')
        .select('aplica_a, producto_ids, clasificacion_ids, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id')
        .eq('tarifa_id', form.tarifa_id!);
      if (error) throw error;
      return (data ?? []) as TarifaLineaRule[];
    },
  });

  // Totales estilo venta (IVA + IEPS + descuento extra)
  const totals = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let subtotal = 0, descuento_total = 0, iva_total = 0, ieps_total = 0;
    lineas.forEach(l => {
      const lineAmounts = calculateSaleLineAmounts(l as any, sinImpuestos);
      iva_total += lineAmounts.iva; ieps_total += lineAmounts.ieps;
      subtotal += lineAmounts.subtotal; descuento_total += lineAmounts.discount;
    });
    const extraTipo = form.descuento_extra_tipo || 'porcentaje';
    const extraVal = Number(form.descuento_extra) || 0;
    const preExtra = r2(subtotal - descuento_total + iva_total + ieps_total);
    const extraAmt = r2(extraTipo === 'porcentaje' ? preExtra * (extraVal / 100) : extraVal);
    return {
      subtotal: r2(subtotal),
      descuento_total: r2(descuento_total + extraAmt),
      descuento_extra_amt: r2(extraAmt),
      iva_total: r2(iva_total),
      ieps_total: r2(ieps_total),
      total: r2(Math.max(0, preExtra - extraAmt)),
    };
  }, [lineas, sinImpuestos, form.descuento_extra, form.descuento_extra_tipo]);

  // Helpers líneas
  const setCellRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    const k = `${row}-${col}`; if (el) cellRefs.current.set(k, el); else cellRefs.current.delete(k);
  }, []);
  const navigateCell = useCallback((row: number, col: number, dir: 'next' | 'prev') => {
    const nr = dir === 'next' ? row + 1 : row - 1;
    const el = cellRefs.current.get(`${nr}-${col}`);
    if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
  }, []);
  const onCellKeyDown = useCallback((_e: React.KeyboardEvent, _row: number, _col: number) => {/* no-op */}, []);

  const addLine = () => setLineas(prev => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx));

  const ensureTrailingEmpty = (next: Linea[]): Linea[] => {
    const last = next[next.length - 1];
    if (!last || last.producto_id) return [...next, emptyLine()];
    return next;
  };

  const updateLine = (idx: number, field: string, val: any) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      (next[idx] as any) = { ...(next[idx] as any), [field]: val };
      return ensureTrailingEmpty(next);
    });
  };

  const handleProductSelect = (idx: number, productoId: string) => {
    if (readOnly) return;
    if (!productoId) { updateLine(idx, 'producto_id', ''); return; }
    const producto = (productosList ?? []).find((p: any) => p.id === productoId);
    if (!producto) return;
    const ivaPct = producto.tiene_iva ? Number(producto.iva_pct ?? 16) : 0;
    const iepsPct = producto.tiene_ieps ? Number(producto.ieps_pct ?? 0) : 0;
    const taxes: string[] = [];
    if (producto.tiene_iva) taxes.push(`IVA ${ivaPct}%`);
    if (producto.tiene_ieps) taxes.push(`IEPS ${iepsPct}%`);
    const prodForPricing: ProductForPricing = {
      id: producto.id, precio_principal: Number(producto.precio_principal) || 0, costo: Number(producto.costo) || 0,
      clasificacion_id: producto.clasificacion_id, tiene_iva: producto.tiene_iva, iva_pct: ivaPct,
      tiene_ieps: producto.tiene_ieps, ieps_pct: iepsPct, ieps_tipo: producto.ieps_tipo,
      usa_listas_precio: (producto as any).usa_listas_precio,
    };
    const listaPrecioId = (form as any).lista_precio_id || null;
    const pricing = resolveProductPricing(tarifaRules ?? [], prodForPricing, listaPrecioId);
    const snap = buildSalePricingSnapshot(prodForPricing, pricing);
    const unidadLabel = (producto as any).unidades_venta?.abreviatura || (producto as any).unidades_venta?.nombre || (producto as any).unidades_compra?.abreviatura || '';
    setLineas(prev => {
      const next = [...prev];
      (next[idx] as any) = {
        ...(next[idx] as any),
        producto_id: producto.id,
        descripcion: producto.nombre,
        cantidad: Number(next[idx].cantidad) || 1,
        precio_unitario: snap.unitPrice,
        display_unit_price: snap.displayPrice,
        precio_unitario_sin_redondeo: snap.rawUnitPrice,
        precio_display_sin_redondeo: snap.rawDisplayPrice,
        base_precio: snap.basePrecio,
        redondeo: snap.redondeo,
        iva_pct: ivaPct, ieps_pct: iepsPct,
        unidad_id: producto.unidad_venta_id || producto.unidad_compra_id || null,
        unidad_label: unidadLabel,
        impuestos_label: taxes.join(', '),
        productos: { id: producto.id, codigo: producto.codigo, nombre: producto.nombre, es_granel: (producto as any).es_granel, unidad_granel: (producto as any).unidad_granel },
        precio_manual: false,
      };
      return ensureTrailingEmpty(next);
    });
  };

  // Recalcular monto IVA/IEPS y total por línea cuando cambian campos
  useEffect(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    setLineas(prev => prev.map(l => {
      const lineAmounts = calculateSaleLineAmounts(l as any, sinImpuestos);
      return { ...l, subtotal: lineAmounts.subtotal, iva_monto: lineAmounts.iva, ieps_monto: lineAmounts.ieps, total: lineAmounts.total };
    }));
  }, [lineas.map(l => `${l.producto_id}|${l.cantidad}|${l.precio_unitario}|${l.descuento_pct}|${l.iva_pct}|${l.ieps_pct}`).join('~'), sinImpuestos]);

  async function handleSave(estadoOverride?: Cotizacion['estado']) {
    const lineasToSave = lineas.filter(l => l.producto_id || l.descripcion);
    const payload: Partial<Cotizacion> = {
      ...form,
      subtotal: totals.subtotal,
      descuento: totals.descuento_total,
      impuestos: totals.iva_total + totals.ieps_total,
      iva_total: totals.iva_total,
      ieps_total: totals.ieps_total,
      total: totals.total,
      moneda: effectiveCurrencyCode,
      estado: estadoOverride ?? form.estado ?? 'borrador',
      id: isNew ? undefined : (form.id as string),
    };
    try {
      const newId = await save.mutateAsync({ cotizacion: payload, lineas: lineasToSave as any });
      toast.success('Cotización guardada');
      if (isNew) navigate(`/cotizaciones/${newId}`, { replace: true });
      else qc.invalidateQueries({ queryKey: ['cotizacion', newId] });
      return newId;
    } catch (e: any) {
      toast.error(e?.message || 'Error');
      return null;
    }
  }

  async function handleDownloadPdf() {
    if (isNew || !form.id) { toast.info('Guarda la cotización primero.'); return; }
    const { data: emp } = await supabase.from('empresas')
      .select('nombre, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, razon_social, moneda')
      .eq('id', empresa!.id).maybeSingle();
    const { data: cot } = await supabase.from('cotizaciones')
      .select('*, clientes:cliente_id(nombre, telefono, rfc, direccion), cotizacion_lineas(*)')
      .eq('id', form.id).single();
    const { data: tarifa } = (cot as any)?.tarifa_id
      ? await supabase.from('tarifas').select('moneda').eq('id', (cot as any).tarifa_id).maybeSingle()
      : { data: null } as any;
    const sym = getCurrencyConfig((tarifa as any)?.moneda || (cot as any)?.moneda || (emp as any)?.moneda).symbol;
    const blob = await buildCotizacionPdf(cot as any, emp as any, sym);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${cot.folio}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleSendWhatsApp() {
    const newId = isNew ? await handleSave('enviada') : (form.id as string);
    if (!newId) return;
    const { data: emp } = await supabase.from('empresas')
      .select('nombre, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, razon_social, moneda')
      .eq('id', empresa!.id).maybeSingle();
    const { data: cot } = await supabase.from('cotizaciones')
      .select('*, clientes:cliente_id(nombre, telefono, rfc, direccion), cotizacion_lineas(*)')
      .eq('id', newId).single();
    if (!cot) return;
    const tel = (cot as any).clientes?.telefono?.replace(/\D/g, '') ?? '';
    if (!tel) { toast.error('El cliente no tiene teléfono'); return; }
    const { data: tarifa } = (cot as any)?.tarifa_id
      ? await supabase.from('tarifas').select('moneda').eq('id', (cot as any).tarifa_id).maybeSingle()
      : { data: null } as any;
    const sym = getCurrencyConfig((tarifa as any)?.moneda || (cot as any)?.moneda || (emp as any)?.moneda).symbol;
    const msg = buildCotizacionWhatsappMessage(cot as any, empresa?.nombre || 'Rutapp', sym);
    const { data: cfg } = await supabase.from('whatsapp_config').select('activo').eq('empresa_id', empresa!.id).maybeSingle();
    let sentViaApi = false;
    if (cfg?.activo) {
      try {
        const { sendDocumentWhatsApp } = await import('@/lib/whatsappDocument');
        const blob = await buildCotizacionPdf(cot as any, emp as any, sym);
        const res = await sendDocumentWhatsApp({
          blob, fileName: `${(cot as any).folio}.pdf`, empresaId: empresa!.id,
          phone: tel, caption: msg, tipo: 'cotizacion', referencia_id: newId,
        });
        if (res.success) { sentViaApi = true; toast.success('Cotización enviada por WhatsApp'); }
        else toast.error(res.error || 'No se pudo enviar por API, abriendo WhatsApp Web');
      } catch (e: any) { toast.error(e?.message || 'Error enviando por API'); }
    }
    if (!sentViaApi) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    if ((cot as any).estado === 'borrador') {
      await setEstado.mutateAsync({ id: newId, estado: 'enviada', extra: { enviada_wa_at: new Date().toISOString() } });
      setForm(f => ({ ...f, estado: 'enviada' }));
    } else {
      await supabase.from('cotizaciones').update({ enviada_wa_at: new Date().toISOString() }).eq('id', newId);
    }
  }

  async function handleApprove() {
    if (!form.id) return;
    await setEstado.mutateAsync({ id: form.id as string, estado: 'aprobada' });
    setForm(f => ({ ...f, estado: 'aprobada' }));
    toast.success('Cotización aprobada');
  }

  async function handleConvertToSale() {
    if (!form.id) { toast.info('Guarda primero'); return; }
    if (!form.almacen_id) { toast.error('Selecciona un almacén para validar stock'); return; }
    setConverting(true);
    try {
      const rows = await validarStockCotizacion(form.id as string, form.almacen_id as string);
      setStockDialog({ open: true, rows, ok: rows.every(r => r.ok) });
    } catch (e: any) { toast.error(e?.message || 'Error validando stock'); }
    finally { setConverting(false); }
  }

  async function confirmConvertToSale() {
    if (!form.id || !empresa?.id) return;
    try {
      const ventaPayload: any = {
        empresa_id: empresa.id,
        cliente_id: form.cliente_id ?? null,
        vendedor_id: form.vendedor_id ?? user?.id ?? null,
        tarifa_id: form.tarifa_id ?? null,
        almacen_id: form.almacen_id ?? null,
        fecha: form.fecha,
        tipo: 'pedido',
        status: 'borrador',
        condicion_pago: 'por_definir',
        subtotal: totals.subtotal,
        descuento_total: totals.descuento_total,
        iva_total: totals.iva_total,
        ieps_total: totals.ieps_total,
        total: totals.total,
        saldo_pendiente: totals.total,
        descuento_extra: form.descuento_extra ?? 0,
        descuento_extra_tipo: form.descuento_extra_tipo ?? 'porcentaje',
        notas: form.notas ? `[Conv. de ${form.folio}] ${form.notas}` : `Conv. de ${form.folio}`,
      };
      const { data: venta, error } = await supabase.from('ventas').insert(ventaPayload).select('id, folio').single();
      if (error) throw error;
      const ventaLineas = lineas.filter(l => l.producto_id || l.descripcion).map(l => ({
        venta_id: venta.id,
        producto_id: l.producto_id ?? null,
        descripcion: l.descripcion ?? null,
        cantidad: Number(l.cantidad ?? 0),
        unidad_id: l.unidad_id ?? null,
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento_pct: Number(l.descuento_pct ?? 0),
        subtotal: Number(l.subtotal ?? 0),
        iva_pct: Number(l.iva_pct ?? 0),
        ieps_pct: Number(l.ieps_pct ?? 0),
        iva_monto: Number(l.iva_monto ?? 0),
        ieps_monto: Number(l.ieps_monto ?? 0),
        total: Number(l.total ?? 0),
        lista_precio_id: l.lista_precio_id ?? null,
        precio_manual: !!l.precio_manual,
      }));
      if (ventaLineas.length) {
        const { error: errL } = await supabase.from('venta_lineas').insert(ventaLineas as any);
        if (errL) throw errL;
      }
      await supabase.from('cotizaciones').update({ estado: 'convertida', venta_id: venta.id }).eq('id', form.id);
      toast.success(`Convertida a venta ${venta.folio || ''}`);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      setStockDialog({ open: false, rows: [], ok: true });
      navigate(`/ventas/${venta.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al convertir');
    }
  }

  const onClienteChange = (cId: string) => {
    setForm(f => ({ ...f, cliente_id: cId }));
    const c = (clientes ?? []).find((x: any) => x.id === cId);
    if (!c) return;
    const tarifaId = (c as any).tarifa_id || tarifasList?.find((t: any) => t.tipo === 'general')?.id;
    if (tarifaId) setForm(f => ({ ...f, tarifa_id: tarifaId }));
    const lista = (c as any).lista_precio_id ?? null;
    setForm(f => ({ ...f, lista_precio_id: lista }));
  };

  const hasChanges = useMemo(() => {
    const currentLineas = lineas.filter(l => l.producto_id || l.descripcion).map(l => ({
      producto_id: l.producto_id ?? null,
      descripcion: l.descripcion ?? null,
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: Number(l.precio_unitario) || 0,
      descuento_pct: Number(l.descuento_pct) || 0,
      iva_pct: Number(l.iva_pct) || 0,
      ieps_pct: Number(l.ieps_pct) || 0,
      unidad_id: l.unidad_id ?? null,
    }));
    const currentForm = {
      cliente_id: form.cliente_id ?? null,
      fecha: form.fecha ?? '',
      vigencia_dias: form.vigencia_dias ?? 15,
      tarifa_id: form.tarifa_id ?? null,
      almacen_id: form.almacen_id ?? null,
      descuento_extra: form.descuento_extra ?? 0,
      descuento_extra_tipo: form.descuento_extra_tipo ?? 'porcentaje',
      notas: form.notas ?? '',
      vendedor_id: form.vendedor_id ?? null,
    };
    if (isNew) {
      const isEmpty =
        currentForm.cliente_id === null &&
        currentForm.almacen_id === null &&
        currentForm.tarifa_id === null &&
        currentForm.notas === '' &&
        currentForm.descuento_extra === 0 &&
        currentLineas.length === 0;
      return !isEmpty;
    }
    if (!existing) return false;
    const originalLineas = (existing.cotizacion_lineas ?? []).map((l: any) => ({
      producto_id: l.producto_id ?? null,
      descripcion: l.descripcion ?? null,
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: Number(l.precio_unitario) || 0,
      descuento_pct: Number(l.descuento_pct) || 0,
      iva_pct: Number(l.iva_pct) || 0,
      ieps_pct: Number(l.ieps_pct) || 0,
      unidad_id: l.unidad_id ?? null,
    }));
    const originalForm = {
      cliente_id: existing.cliente_id ?? null,
      fecha: existing.fecha?.slice(0, 10) ?? '',
      vigencia_dias: existing.vigencia_dias ?? 15,
      tarifa_id: existing.tarifa_id ?? null,
      almacen_id: existing.almacen_id ?? null,
      descuento_extra: existing.descuento_extra ?? 0,
      descuento_extra_tipo: existing.descuento_extra_tipo ?? 'porcentaje',
      notas: existing.notas ?? '',
      vendedor_id: existing.vendedor_id ?? null,
    };
    if (JSON.stringify(currentForm) !== JSON.stringify(originalForm)) return true;
    if (currentLineas.length !== originalLineas.length) return true;
    for (let i = 0; i < currentLineas.length; i++) {
      if (JSON.stringify(currentLineas[i]) !== JSON.stringify(originalLineas[i])) return true;
    }
    return false;
  }, [isNew, form, lineas, existing]);

  if (!isNew && isError) return <div className="p-6 text-destructive">Error al cargar la cotización: {(error as any)?.message || 'desconocido'}</div>;
  if (!isNew && !existing && (isLoading || isFetching)) return <div className="p-6 text-muted-foreground">Cargando…</div>;

  const clienteOptions = (clientes ?? []).map((c: any) => ({ value: c.id, label: `${c.codigo ? c.codigo + ' · ' : ''}${c.nombre}` }));
  const tarifaOptions = (tarifasList ?? []).map((t: any) => ({ value: t.id, label: t.nombre }));
  const almacenOptions = (almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }));

  return (
    <div className="p-3 sm:p-5 max-w-[1200px] space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/cotizaciones')}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">{isNew ? 'Nueva cotización' : (form.folio || 'Cotización')}</h1>
            <p className="text-xs text-muted-foreground uppercase">{form.estado}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!readOnly && (
            <Button onClick={() => handleSave()} disabled={save.isPending} variant={hasChanges ? 'default' : 'outline'}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          )}
          {!isNew && (
            <>
              <Button variant="outline" onClick={handleDownloadPdf}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
              <Button variant="outline" onClick={handleSendWhatsApp}><Send className="h-4 w-4 mr-1" /> Enviar por WhatsApp</Button>
              {form.estado !== 'aprobada' && form.estado !== 'convertida' && (
                <Button variant="outline" onClick={handleApprove}><CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar</Button>
              )}
              {form.estado !== 'convertida' && (
                <Button onClick={handleConvertToSale} disabled={converting}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Convertir a venta
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-md p-5 grid gap-4 md:grid-cols-3">
        <div className="space-y-3">
          <div>
            <Label className="label-odoo label-required">Cliente</Label>
            <SearchableSelect options={clienteOptions} value={form.cliente_id ?? ''} onChange={onClienteChange} placeholder="Buscar cliente..." />
          </div>
          <div>
            <Label className="label-odoo">Lista de precios (tarifa)</Label>
            <SearchableSelect options={tarifaOptions} value={form.tarifa_id ?? ''} onChange={(v) => setForm({ ...form, tarifa_id: v || null })} placeholder="Selecciona tarifa..." />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="label-odoo">Fecha</Label>
            <div><SingleDatePicker value={form.fecha ?? ''} disabled={readOnly}
              onChange={(iso) => setForm({ ...form, fecha: iso })} /></div>
          </div>
          <div>
            <Label className="label-odoo">Vigencia (días)</Label>
            <Input type="number" min={1} value={form.vigencia_dias ?? 15} disabled={readOnly}
              onChange={(e) => setForm({ ...form, vigencia_dias: Number(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="label-odoo label-required">Almacén</Label>
            <SearchableSelect options={almacenOptions} value={form.almacen_id ?? ''} onChange={(v) => setForm({ ...form, almacen_id: v || null })} placeholder="Selecciona almacén..." />
          </div>
          <div>
            <Label className="label-odoo">Descuento extra</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} step={0.01} value={form.descuento_extra ?? 0} disabled={readOnly}
                onChange={(e) => setForm({ ...form, descuento_extra: Number(e.target.value) || 0 })} className="flex-1" />
              <Button type="button" variant="outline" size="sm"
                onClick={() => setForm({ ...form, descuento_extra_tipo: form.descuento_extra_tipo === 'porcentaje' ? 'monto' : 'porcentaje' })}>
                {form.descuento_extra_tipo === 'porcentaje' ? '%' : '$'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Lineas: mismo componente que ventas */}
      <div className="bg-card border border-border rounded-md">
        <VentaLineasTab
          lineas={lineas as any}
          productosList={productosList ?? []}
          readOnly={readOnly}
          totals={totals}
          onProductSelect={handleProductSelect}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          onAddLine={addLine}
          setCellRef={setCellRef}
          onCellKeyDown={onCellKeyDown}
          navigateCell={navigateCell}
          setLineas={setLineas as any}
          sinImpuestos={sinImpuestos}
          setSinImpuestos={setSinImpuestos}
          readOnlyForm={readOnly}
          currencyCode={effectiveCurrencyCode}
        />
      </div>

      {/* Notas */}
      <div className="bg-card border border-border rounded-md p-4">
        <Label className="label-odoo">Notas</Label>
        <Textarea rows={3} placeholder="Condiciones, observaciones…" disabled={readOnly}
          value={form.notas ?? ''}
          onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        {form.token_publico && (
          <div className="pt-2 text-xs text-muted-foreground">
            Enlace público: <a className="text-primary underline break-all" target="_blank" rel="noreferrer" href={cotizacionPublicUrl(form.token_publico)}>{cotizacionPublicUrl(form.token_publico)}</a>
          </div>
        )}
      </div>

      {/* Validación stock */}
      <Dialog open={stockDialog.open} onOpenChange={(o) => setStockDialog(s => ({ ...s, open: o }))}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {stockDialog.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Validación de stock
            </DialogTitle>
            <DialogDescription>
              {stockDialog.ok
                ? 'Hay stock suficiente. Puedes convertir a venta.'
                : 'Algunas líneas no tienen stock suficiente. Puedes continuar bajo tu responsabilidad o cancelar.'}
            </DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left px-2 py-1.5">Producto</th>
                <th className="text-right px-2 py-1.5">Solicitada</th>
                <th className="text-right px-2 py-1.5">Disponible</th>
                <th className="text-right px-2 py-1.5">Faltante</th>
              </tr>
            </thead>
            <tbody>
              {stockDialog.rows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${!r.ok ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1.5">{r.descripcion}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.cantidad_solicitada)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.stock_disponible)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${!r.ok ? 'text-destructive font-semibold' : ''}`}>{Number(r.faltante)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog({ open: false, rows: [], ok: true })}>Cancelar</Button>
            <Button onClick={confirmConvertToSale} className={stockDialog.ok ? '' : 'bg-amber-600 hover:bg-amber-700'}>
              {stockDialog.ok ? 'Convertir a venta' : 'Convertir de todos modos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
