import { ESTADOS_CXC } from '@/lib/mobileReceivables';
import { useState, useMemo, useEffect, useRef } from 'react';
import { queueOperation, queueOperations } from '@/lib/syncQueue';
import { getOfflineTable } from '@/lib/offlineDb';
import { deterministicUuid } from '@/lib/deterministicId';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { useVenta } from '@/hooks/useVentas';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fmtDate, roundMoney, todayInTimezone } from '@/lib/utils';
import type { TicketData } from '@/lib/ticketHtml';
import { generarTicketPdf, nombreArchivoTicket, ticketAnchoEmpresa } from '@/lib/ticketPdf';
import { compartirPdf } from '@/lib/pdfAcciones';
import { downloadBlob } from '@/lib/mergePdfs';
import { printTicket } from '@/lib/printTicketUtil';
import { isBluetoothAvailable, connectPrinter, sendBytes } from '@/lib/bluetoothPrinter';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import type { View, CuentaPendiente, EditLinea } from './types';
import { useCurrency } from '@/hooks/useCurrency';
import { marcarEntregaHechaYSincronizarPedido } from '@/lib/entregaStatus';
import { useSaldoFavor } from '@/hooks/useSaldoFavor';
import { SALDO_FAVOR_METODO } from '@/lib/saldoFavor';
import { resolveProductPricing, type ProductForPricing, type TarifaLineaRule } from '@/lib/priceResolver';
import { buildSalePricingSnapshot, calculateSaleLineAmounts } from '@/lib/salePricing';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { saldoVentaTrasEditar } from '@/lib/ventaEditBalance';
import { resolvePublicGeneralClientId } from '@/lib/publicGeneralClient';
import { useExcedentePrompt } from '@/components/venta/ExcedenteDialog';
import { useCancelarPagoPrompt } from '@/components/venta/CancelarPagoDialog';
import { cancelarVenta, type DestinoPagoCancelacion } from '@/lib/cancelarVenta';
import { ejecutarConExcedente, type RpcSinTipos as RpcEditar } from '@/lib/excedente';
import { usePermisos } from '@/hooks/usePermisos';
import { puedeConvertirPedido, type ResultadoConversion } from '@/lib/convertirPedido';

export function useVentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { user, empresa, profile } = useAuth();
  const queryClient = useQueryClient();
  const { pedirDestino, excedenteDialog } = useExcedentePrompt();
  const { pedirDestinoPago, cancelarPagoDialog } = useCancelarPagoPrompt();
  const { data: venta, isLoading } = useVenta(id);
  const { hasPermiso } = usePermisos();

  const [view, setView] = useState<View>('detalle');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'saldo_favor'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [cuentasPendientes, setCuentasPendientes] = useState<CuentaPendiente[]>([]);
  const [saving, setSaving] = useState(false);
  const [montoAplicarActual, setMontoAplicarActual] = useState(0);
  const [ticketData, setTicketData] = useState<{ monto: number; cambio: number; metodo: string; folio: string; fecha: string; aplicaciones: { folio: string; monto: number; saldoRestante: number }[] } | null>(null);
  const [sendingWA, setSendingWA] = useState(false);
  const [showWADialog, setShowWADialog] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [ecPdfBlob, setEcPdfBlob] = useState<Blob | null>(null);
  const [showEcPreview, setShowEcPreview] = useState(false);
  const [editLineas, setEditLineas] = useState<EditLinea[]>([]);
  const [editCondicion, setEditCondicion] = useState<'contado' | 'credito' | 'por_definir'>('contado');
  const [editNotas, setEditNotas] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [searchProducto, setSearchProducto] = useState('');

  const clienteId = (venta as any)?.cliente_id;
  const { symbol: currSym, fmt } = useCurrency();
  const fmtM = fmt;

  // Saldo a favor del cliente (crédito por notas de crédito). Funciona offline.
  const { disponible: saldoFavorDisp } = useSaldoFavor(clienteId);

  // Ventas del cliente desde la caché local (para fallbacks offline).
  const ventasLocalesDelCliente = async () => {
    const t = getOfflineTable('ventas');
    const all = t ? ((await t.toArray().catch(() => [])) as any[]) : [];
    return all.filter(v => v.cliente_id === clienteId);
  };

  const { data: clienteData } = useQuery({
    queryKey: ['ruta-cliente-detalle', clienteId], enabled: !!clienteId, networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('clientes').select('id, nombre, telefono, credito, limite_credito, dias_credito, tarifa_id, lista_precio_id').eq('id', clienteId!).single();
        if (error) throw error; return data;
      } catch {
        const t = getOfflineTable('clientes');
        return t ? await t.get(clienteId!).catch(() => null) : null;
      }
    },
  });

  const { data: productos } = useQuery({
    queryKey: ['ruta-productos-edit', empresa?.id], enabled: !!empresa?.id && view === 'editar', networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('productos').select('id, codigo, nombre, precio_principal, costo, costo_incluye_impuestos, clasificacion_id, usa_listas_precio, lista_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, maneja_lote, unidad_venta_id, unidades:unidad_venta_id(nombre, abreviatura)').eq('empresa_id', empresa!.id).eq('se_puede_vender', true).eq('status', 'activo').order('nombre');
        if (error) throw error; return data ?? [];
      } catch {
        const t = getOfflineTable('productos');
        const all = t ? ((await t.toArray().catch(() => [])) as any[]) : [];
        return all.filter(p => p.empresa_id === empresa!.id && p.se_puede_vender && p.status === 'activo')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      }
    },
  });

  // La venta conserva la tarifa elegida al crearla. Para documentos legacy sin
  // tarifa, se usa la configuración actual del mismo cliente. La lista vive en
  // el cliente y queda fotografiada en cada línea, no en el encabezado de venta.
  const tarifaIdEdicion = (venta as any)?.tarifa_id ?? (clienteData as any)?.tarifa_id ?? null;
  const listaPrecioIdEdicion = (clienteData as any)?.lista_precio_id ?? null;
  const { data: tarifaRules } = useQuery({
    queryKey: ['ruta-tarifa-rules-edit', tarifaIdEdicion],
    enabled: view === 'editar' && !!tarifaIdEdicion,
    networkMode: 'always',
    queryFn: async () => {
      try {
        return await fetchAllPages<TarifaLineaRule>((from, to) => supabase.from('tarifa_lineas')
          .select('aplica_a, producto_ids, clasificacion_ids, grupos, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id')
          .eq('tarifa_id', tarifaIdEdicion!)
          .order('created_at')
          .order('id')
          .range(from, to));
      } catch {
        const t = getOfflineTable('tarifa_lineas');
        const all = t ? ((await t.toArray().catch(() => [])) as any[]) : [];
        return all.filter(r => r.tarifa_id === tarifaIdEdicion) as TarifaLineaRule[];
      }
    },
  });

  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-cuentas-pendientes-detalle', clienteId, id], enabled: !!clienteId && view === 'cobrar', networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!).in('status', ESTADOS_CXC as any).order('fecha', { ascending: true });
        if (error) throw error; return data ?? [];
      } catch {
        return (await ventasLocalesDelCliente())
          .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.id !== id && ESTADOS_CXC.includes(v.status))
          .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      }
    },
  });

  const { data: ventasPendientesCredito } = useQuery({
    queryKey: ['ruta-saldo-total-credito', clienteId, id],
    enabled: !!clienteId && !!id, networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('ventas').select('saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!).in('status', ESTADOS_CXC as any);
        if (error) throw error; return (data ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
      } catch {
        return (await ventasLocalesDelCliente())
          .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.id !== id && ESTADOS_CXC.includes(v.status))
          .reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
      }
    },
  });

  const { data: devolucionesVenta } = useQuery({
    queryKey: ['ruta-venta-devoluciones', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: heads } = await supabase.from('devoluciones').select('id').eq('venta_id', id!);
      const ids = (heads ?? []).map((h: any) => h.id);
      if (ids.length === 0) return [] as Array<{ cantidad: number; motivo: string; accion: string; monto_credito: number | null; producto: { nombre: string } | null }>;
      const { data } = await supabase
        .from('devolucion_lineas')
        .select('cantidad, motivo, accion, monto_credito, producto:productos!devolucion_lineas_producto_id_fkey(nombre)')
        .in('devolucion_id', ids);
      return (data ?? []) as any;
    },
  });

  // Pagos aplicados a esta venta (cobros)
  const { data: pagosVenta } = useQuery({
    queryKey: ['ruta-venta-pagos', id],
    enabled: !!id,
    networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('cobro_aplicaciones')
          .select('id, monto_aplicado, cobro_id, cobros(fecha, metodo_pago, referencia, status)')
          .eq('venta_id', id!)
          .order('created_at');
        if (error) throw error;
        return data ?? [];
      } catch {
        const appsTable = getOfflineTable('cobro_aplicaciones');
        const cobrosTable = getOfflineTable('cobros');
        const apps = appsTable ? ((await appsTable.toArray().catch(() => [])) as any[]) : [];
        const cobros = cobrosTable ? ((await cobrosTable.toArray().catch(() => [])) as any[]) : [];
        const cobrosById = new Map(cobros.map(c => [c.id, c]));
        return apps
          .filter(a => a.venta_id === id)
          .map(a => ({ ...a, cobros: cobrosById.get(a.cobro_id) ?? null }));
      }
    },
  });

  const editTotals = useMemo(() => {
    let subtotal = 0, iva = 0, ieps = 0, totalLineas = 0;
    editLineas.forEach(item => {
      const amounts = calculateSaleLineAmounts(item);
      subtotal += amounts.subtotal;
      iva += amounts.iva;
      ieps += amounts.ieps;
      totalLineas += amounts.total;
    });
    const extra = Number((venta as any)?.descuento_extra) || 0;
    const extraTipo = (venta as any)?.descuento_extra_tipo || 'porcentaje';
    const extraMonto = extraTipo === 'monto' ? extra : totalLineas * extra / 100;
    return {
      subtotal: roundMoney(subtotal),
      iva: roundMoney(iva),
      ieps: roundMoney(ieps),
      total: roundMoney(Math.max(0, totalLineas - extraMonto)),
    };
  }, [editLineas, (venta as any)?.descuento_extra, (venta as any)?.descuento_extra_tipo]);

  // D-062: entregas no canceladas del pedido (servidor; sin señal, la caché local).
  const esPedido = (venta as { tipo?: string } | undefined)?.tipo === 'pedido';
  const { data: entregasActivasPedido } = useQuery({
    queryKey: ['ruta-pedido-entregas-activas', empresa?.id, id],
    enabled: !!id && !!empresa?.id && esPedido,
    networkMode: 'always',
    queryFn: async () => {
      try {
        const { count, error } = await supabase.from('entregas').select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa!.id).eq('pedido_id', id!).neq('status', 'cancelado');
        if (error) throw error;
        return count ?? 0;
      } catch {
        const t = getOfflineTable('entregas');
        const all = t ? ((await t.toArray().catch(() => [])) as { pedido_id?: string; status?: string }[]) : [];
        return all.filter(e => e.pedido_id === id && e.status !== 'cancelado').length;
      }
    },
  });
  const puedeConvertir = entregasActivasPedido !== undefined
    && puedeConvertirPedido(venta as Parameters<typeof puedeConvertirPedido>[0], { entregasActivas: entregasActivasPedido, tienePermiso: hasPermiso('ventas', 'editar') });

  const saldoPendienteOtras = ventasPendientesCredito ?? 0;
  const creditoDisponible = clienteData ? (clienteData.limite_credito ?? 0) - saldoPendienteOtras : 0;
  const excedeCredito = editCondicion === 'credito' && editTotals.total > creditoDisponible;
  const saldoActual = roundMoney(venta?.saldo_pendiente ?? 0);
  const totalAplicarOtras = roundMoney(cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0));
  const totalACobrar = roundMoney(montoAplicarActual + totalAplicarOtras);
  const montoRecibidoNum = roundMoney(parseFloat(montoRecibido) || 0);
  // Con saldo a favor no hay efectivo recibido, por lo tanto no hay cambio.
  const cambio = metodoPago === SALDO_FAVOR_METODO
    ? 0
    : (montoRecibidoNum > totalACobrar ? roundMoney(montoRecibidoNum - totalACobrar) : 0);

  const updateMontoAplicarActual = (monto: number) => {
    const montoNormalizado = roundMoney(monto);
    setMontoAplicarActual(roundMoney(Math.min(Math.max(0, montoNormalizado), saldoActual)));
  };

  const filteredProductos = productos?.filter(p => !searchProducto || p.nombre.toLowerCase().includes(searchProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchProducto.toLowerCase()));

  // ── Lotes en edición móvil ───────────────────────────────────────────────
  const manejaLotesEmpresa = !!(empresa as any)?.maneja_lotes;
  const almacenLotesBase = (venta as any)?.almacen_id ?? ((profile as any)?.almacen_id ?? null);
  const productoManejaLote = (productoId: string) =>
    manejaLotesEmpresa && !!productos?.find((p: any) => p.id === productoId)?.maneja_lote;
  const lotePendienteEdit = (l: EditLinea) => {
    if (!productoManejaLote(l.producto_id)) return 0;
    const asignado = (l.lotes ?? []).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
    return Math.round((l.cantidad - asignado) * 1000) / 1000;
  };
  const setEditLineaLotes = (idx: number, lotes: { lote_id: string; codigo: string; cantidad: number }[]) => {
    setEditLineas(prev => prev.map((l, i) => i === idx ? { ...l, lotes } : l));
  };

  const initEditar = async () => {
    if (!venta) return;
    const lineas = (venta as any).venta_lineas ?? [];
    let lotesPorLinea: Record<string, { lote_id: string; codigo: string; cantidad: number }[]> = {};
    if (manejaLotesEmpresa && navigator.onLine) {
      try {
        const { data } = await supabase
          .from('venta_linea_lotes')
          .select('venta_linea_id, lote_id, cantidad, lotes(codigo)')
          .eq('venta_id', venta.id);
        for (const r of (data ?? []) as any[]) {
          (lotesPorLinea[r.venta_linea_id] ??= []).push({
            lote_id: r.lote_id, codigo: r.lotes?.codigo ?? '—', cantidad: Number(r.cantidad) || 0,
          });
        }
      } catch { /* offline o sin permisos: se re-asigna FEFO al guardar */ }
    }
    setEditLineas(lineas.map((l: any) => ({
      id: l.id,
      producto_id: l.producto_id,
      nombre: l.productos?.nombre ?? l.descripcion ?? '',
      codigo: l.productos?.codigo ?? '',
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: Number(l.precio_unitario) || 0,
      precio_unitario_sin_redondeo: l.precio_unitario_sin_redondeo == null ? undefined : Number(l.precio_unitario_sin_redondeo),
      precio_display_sin_redondeo: l.precio_display_sin_redondeo == null ? undefined : Number(l.precio_display_sin_redondeo),
      base_precio: l.base_precio ?? undefined,
      redondeo: l.redondeo ?? 'ninguno',
      descuento_pct: Number(l.descuento_pct) || 0,
      lista_precio_id: l.lista_precio_id ?? null,
      precio_manual: !!l.precio_manual,
      unidad_id: l.unidad_id ?? null,
      unidad: l.unidades?.abreviatura ?? 'pz',
      tiene_iva: Number(l.iva_pct ?? 0) > 0,
      iva_pct: Number(l.iva_pct) || 0,
      tiene_ieps: Number(l.ieps_pct ?? 0) > 0,
      ieps_pct: Number(l.ieps_pct) || 0,
      lotes: lotesPorLinea[l.id] ?? [],
    })));
    setEditCondicion(venta.condicion_pago as any);
    setEditNotas(venta.notas ?? '');
    setView('editar');
  };

  const addProductToEdit = (p: any) => {
    const existing = editLineas.find(l => l.producto_id === p.id);
    if (existing) { setEditLineas(prev => prev.map(l => l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)); }
    else {
      if (tarifaIdEdicion && tarifaRules === undefined) {
        toast.error('Espera a que cargue la lista de precios del cliente');
        return;
      }
      const productForPricing: ProductForPricing = {
        id: p.id,
        precio_principal: Number(p.precio_principal) || 0,
        costo: Number(p.costo) || 0,
        costo_incluye_impuestos: !!p.costo_incluye_impuestos,
        clasificacion_id: p.clasificacion_id ?? null,
        usa_listas_precio: p.usa_listas_precio,
        lista_id: p.lista_id ?? null,
        tiene_iva: !!p.tiene_iva,
        iva_pct: Number(p.iva_pct ?? 16),
        tiene_ieps: !!p.tiene_ieps || Number(p.ieps_pct ?? 0) > 0,
        ieps_pct: Number(p.ieps_pct ?? 0),
        ieps_tipo: p.ieps_tipo,
      };
      const pricing = resolveProductPricing(tarifaRules ?? [], productForPricing, listaPrecioIdEdicion);
      const snapshot = buildSalePricingSnapshot(productForPricing, pricing);
      setEditLineas(prev => [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        cantidad: 1,
        precio_unitario: snapshot.unitPrice,
        precio_unitario_sin_redondeo: snapshot.rawUnitPrice,
        precio_display_sin_redondeo: snapshot.rawDisplayPrice,
        display_unit_price: snapshot.displayPrice,
        base_precio: snapshot.basePrecio,
        redondeo: snapshot.redondeo,
        descuento_pct: 0,
        lista_precio_id: listaPrecioIdEdicion,
        precio_manual: false,
        unidad_id: p.unidad_venta_id ?? null,
        unidad: (p.unidades as any)?.abreviatura || 'pz',
        tiene_iva: !!p.tiene_iva,
        iva_pct: p.tiene_iva ? Number(p.iva_pct ?? 16) : 0,
        tiene_ieps: !!p.tiene_ieps || Number(p.ieps_pct ?? 0) > 0,
        ieps_pct: Number(p.ieps_pct ?? 0),
      }]);
    }
  };

  const updateEditQty = (idx: number, delta: number) => { setEditLineas(prev => prev.map((l, i) => i !== idx ? l : l.cantidad + delta > 0 ? { ...l, cantidad: l.cantidad + delta } : l)); };
  const removeEditLine = (idx: number) => { setEditLineas(prev => prev.filter((_, i) => i !== idx)); };

  const handleSaveEdits = async () => {
    if (editLineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
    if (pagosVenta === undefined) { toast.error('Espera a que carguen los pagos del pedido'); return; }
    // Lotes: lo loteado debe cuadrar EXACTO con la cantidad de cada línea.
    if (manejaLotesEmpresa) {
      const sinLotear = editLineas.filter(l => lotePendienteEdit(l) !== 0);
      if (sinLotear.length > 0) {
        toast.error(`Falta asignar lotes en: ${sinLotear.map(l => l.nombre).join(', ')}`);
        return;
      }
    }
    setSaving(true);
    try {
      // Venta ya confirmada/entregada: se guarda en UNA operación (editar_venta);
      // stock por diferencia y saldo los recalcula la BD.
      if (venta && venta.status !== 'borrador') {
        const ids = await Promise.all(editLineas.map(item =>
          item.id ?? deterministicUuid('vlinea-edit', id!, item.producto_id)));
        const pLineas = editLineas.map((item, idx) => {
          const amounts = calculateSaleLineAmounts(item);
          const lotes = (item.lotes ?? []).filter(l => Number(l.cantidad) > 0).map(l => ({ lote_id: l.lote_id, cantidad: Number(l.cantidad) }));
          return {
            id: ids[idx],
            producto_id: item.producto_id,
            descripcion: item.nombre,
            cantidad: item.cantidad,
            unidad_id: item.unidad_id ?? null,
            precio_unitario: item.precio_unitario,
            precio_unitario_sin_redondeo: item.precio_unitario_sin_redondeo ?? item.precio_unitario,
            descuento_pct: item.descuento_pct ?? 0,
            subtotal: amounts.subtotal,
            iva_pct: item.tiene_iva ? item.iva_pct : 0,
            iva_monto: amounts.iva,
            ieps_pct: item.tiene_ieps ? (item.ieps_pct ?? 0) : 0,
            ieps_monto: amounts.ieps,
            total: amounts.total,
            lista_precio_id: item.lista_precio_id ?? null,
            precio_manual: item.precio_manual ?? false,
            ...(lotes.length ? { lotes } : {}),
          };
        });
        const args = {
          p_venta_id: id!,
          p_lineas: pLineas,
          p_version: (venta as { updated_at?: string }).updated_at ?? null,
          p_header: { notas: editNotas || null },
        };
        if (navigator.onLine) {
          // D-025: si el nuevo total queda abajo de lo pagado, se pregunta qué hacer con el excedente.
          const { error: rpcErr, cancelado } = await ejecutarConExcedente(excedente => (supabase.rpc as unknown as RpcEditar)('editar_venta', {
            ...args,
            p_header: { ...args.p_header, ...(excedente ? { excedente } : {}) },
          }), pedirDestino);
          if (cancelado) { toast.info('No se guardó: la edición sigue abierta.'); return; }
          if (rpcErr) throw new Error(rpcErr.message);
        } else {
          await queueOperation('rpc:editar_venta', 'rpc', args, 'p_venta_id');
          // Vista local mientras sincroniza: renglones nuevos y totales estimados.
          const lineasLocal = getOfflineTable('venta_lineas');
          const ventasLocal = getOfflineTable('ventas');
          const antes = (venta as { venta_lineas?: { id: string }[] } | undefined)?.venta_lineas ?? [];
          if (lineasLocal) {
            for (const l of antes) if (!ids.includes(l.id)) await lineasLocal.delete(l.id);
            await lineasLocal.bulkPut(pLineas.map(({ lotes: _l, ...r }) => ({ ...r, venta_id: id! })));
          }
          if (ventasLocal) {
            const actual = await ventasLocal.get(id!);
            if (actual) await ventasLocal.put({ ...actual, notas: editNotas || null, subtotal: editTotals.subtotal, iva_total: editTotals.iva, ieps_total: editTotals.ieps, total: editTotals.total });
          }
          toast.info('Sin señal: la edición se aplicará completa al reconectar.');
        }
        toast.success('Venta actualizada');
        queryClient.invalidateQueries({ queryKey: ['venta', id] });
        queryClient.invalidateQueries({ queryKey: ['ventas'] });
        queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
        setView('detalle');
        return;
      }

      if ((venta as any)?.cerrado_at && !navigator.onLine) {
        throw new Error('Conéctate a internet para reabrir este pedido cerrado antes de editarlo.');
      }
      if ((venta as any)?.cerrado_at) {
        const { error: reopenErr } = await supabase.rpc('reabrir_pedido_parcial', { p_venta_id: id! });
        if (reopenErr) throw reopenErr;
      }

      // Las líneas existentes conservan su ID; las nuevas usan un ID estable por
      // venta + producto. Reintentar el guardado no inserta duplicados.
      const newIds = await Promise.all(editLineas.map(item =>
        item.id ?? deterministicUuid('vlinea-edit', id!, item.producto_id)));
      const newLineas = editLineas.map((item, idx) => {
        const amounts = calculateSaleLineAmounts(item);
        return {
          id: newIds[idx],
          venta_id: id!,
          producto_id: item.producto_id,
          descripcion: item.nombre,
          cantidad: item.cantidad,
          unidad_id: item.unidad_id ?? null,
          precio_unitario: item.precio_unitario,
          precio_unitario_sin_redondeo: item.precio_unitario_sin_redondeo ?? item.precio_unitario,
          descuento_pct: item.descuento_pct ?? 0,
          subtotal: amounts.subtotal,
          iva_pct: item.tiene_iva ? item.iva_pct : 0,
          iva_monto: amounts.iva,
          ieps_pct: item.tiene_ieps ? (item.ieps_pct ?? 0) : 0,
          ieps_monto: amounts.ieps,
          total: amounts.total,
          lista_precio_id: item.lista_precio_id ?? null,
          precio_manual: item.precio_manual ?? false,
          lote_id: item.lotes?.[0]?.lote_id ?? null,
        };
      });

      const loteRows: any[] = [];
      for (let idx = 0; idx < editLineas.length; idx++) {
        for (const l of editLineas[idx].lotes ?? []) {
          if (!(Number(l.cantidad) > 0)) continue;
          loteRows.push({
            id: await deterministicUuid('vlinlote-edit', newIds[idx], l.lote_id),
            empresa_id: empresa!.id, venta_id: id!, venta_linea_id: newIds[idx],
            producto_id: editLineas[idx].producto_id, lote_id: l.lote_id,
            almacen_id: almacenLotesBase, cantidad: Number(l.cantidad), user_id: profile?.id ?? null,
          });
        }
      }

      // El saldo nuevo se calcula contra cobros REALES activos. Nunca se infiere
      // como total anterior - saldo anterior, porque eso marcaría como pagados
      // los productos recién agregados a un pedido ya liquidado.
      const ventaUpdate = {
        condicion_pago: editCondicion as any,
        notas: editNotas || null,
        subtotal: editTotals.subtotal,
        iva_total: editTotals.iva,
        ieps_total: editTotals.ieps,
        total: editTotals.total,
        saldo_pendiente: saldoVentaTrasEditar(editTotals.total, pagosVenta as any[]),
      };

      if (navigator.onLine) {
        // Los lotes previos se borran primero (FK a venta_linea_id) y se
        // reconstruyen con el reparto vigente.
        await supabase.from('venta_linea_lotes').delete().eq('venta_id', id!);
        const { error: linErr } = await supabase.from('venta_lineas').upsert(newLineas as any).select('id');
        if (linErr) throw linErr;
        // Se eliminan las líneas que ya no forman parte de la venta.
        const { error: deleteErr } = await supabase.from('venta_lineas').delete().eq('venta_id', id!).not('id', 'in', `(${newIds.join(',')})`);
        if (deleteErr) throw deleteErr;
        if (loteRows.length > 0) {
          const { error: llErr } = await supabase.from('venta_linea_lotes').insert(loteRows as any);
          if (llErr) throw llErr;
        }
        const { error: ventaErr } = await supabase.from('ventas').update(ventaUpdate).eq('id', id!);
        if (ventaErr) throw ventaErr;
      } else {
        // Offline: encola el reemplazo COMPLETO de líneas (antes se perdían los
        // cambios de productos: solo se guardaban los totales).
        const oldLineas = ((venta as any)?.venta_lineas ?? []) as any[];
        // Ids determinísticos por (venta, posición): reintentar/reenviar la misma
        // edición reusa los mismos ids → el upsert no duplica líneas.
        const nuevasOps = newLineas.map(nl => ({
          table: 'venta_lineas' as const,
          operation: 'insert' as const,
          data: nl,
        }));
        await queueOperations([
          ...oldLineas
            .filter(l => l?.id)
            .map(l => ({ table: 'venta_lineas', operation: 'delete' as const, data: { id: l.id } })),
          ...nuevasOps,
          ...loteRows.map(r => ({ table: 'venta_linea_lotes' as const, operation: 'insert' as const, data: r })),
          { table: 'ventas', operation: 'update' as const, data: { id: id!, ...ventaUpdate } },
        ]);
      }

      toast.success('Venta actualizada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      setView('detalle');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const initCobrar = () => abrirCobro(saldoActual);
  const abrirCobro = (saldoVenta: number) => {
    if (otrasPendientes?.length) {
      setCuentasPendientes(otrasPendientes.map(v => ({
        id: v.id,
        folio: v.folio,
        fecha: v.fecha,
        total: roundMoney(v.total ?? 0),
        saldo_pendiente: roundMoney(v.saldo_pendiente ?? 0),
        montoAplicar: 0,
      })));
    } else {
      setCuentasPendientes([]);
    }
    setMetodoPago('efectivo');
    setMontoAplicarActual(roundMoney(saldoVenta));
    setMontoRecibido(saldoVenta > 0 ? roundMoney(saldoVenta).toFixed(2) : '');
    setReferenciaPago('');
    setView('cobrar');
  };

  // Auto-open cobrar view when ?cobrar=1 is in URL (from entrega Cobrar button)
  const autoCobrarRef = useRef(false);
  // Guardia síncrona anti doble-cobro: setSaving re-renderiza con retraso, así
  // que un doble-toque rápido podía disparar dos cobros (offline ya deduplica
  // por id determinístico, pero online la RPC crearía dos). El ref bloquea de
  // inmediato la segunda llamada.
  const cobrarRef = useRef(false);
  // Pedido de contado (desde la entrega): la entrega se marca al completar el cobro.
  const [entregaPorCobrar, setEntregaPorCobrar] = useState<{ id: string; minimo: number } | null>(null);
  useEffect(() => {
    if (autoCobrarRef.current) return;
    if (!venta) return;
    if (searchParams.get('cobrar') !== '1') return;
    autoCobrarRef.current = true;
    const entregarId = searchParams.get('entregar');
    if (entregarId) setEntregaPorCobrar({ id: entregarId, minimo: roundMoney(Number(searchParams.get('minimo')) || 0) });
    initCobrar();
    const next = new URLSearchParams(searchParams);
    next.delete('cobrar');
    next.delete('entregar');
    next.delete('minimo');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, searchParams]);


  const updateCuentaMonto = (cid: string, monto: number) => {
    const montoNormalizado = roundMoney(monto);
    setCuentasPendientes(prev => prev.map(c => c.id === cid ? {
      ...c,
      montoAplicar: roundMoney(Math.min(Math.max(0, montoNormalizado), roundMoney(c.saldo_pendiente))),
    } : c));
  };
  const liquidarTodas = () => {
    setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: roundMoney(c.saldo_pendiente) })));
  };

  const handleCobrar = async () => {
    if (!user || !venta || totalACobrar <= 0) return;
    // Con saldo a favor sólo se puede aplicar hasta el crédito disponible; no
    // hay dinero recibido ni cambio (es crédito del cliente, no ingreso nuevo).
    if (metodoPago === SALDO_FAVOR_METODO && totalACobrar > saldoFavorDisp + 0.01) {
      toast.error(`Saldo a favor insuficiente. Disponible: ${fmt(saldoFavorDisp)}`);
      return;
    }
    if (cobrarRef.current) return;   // ya hay un cobro en curso → ignora el doble-toque
    cobrarRef.current = true;
    setSaving(true);
    try {
      if (!empresa?.id) throw new Error('Sin empresa');
      const online = typeof navigator === 'undefined' || navigator.onLine;

      // Repara de forma segura ventas históricas de Público general que fueron
      // creadas offline con cliente_id nulo. La venta se corrige ANTES del
      // cobro; si no existe una identidad comprobable, no se registra nada.
      const cobroClienteId = clienteId ?? await resolvePublicGeneralClientId(empresa.id);
      if (!cobroClienteId) {
        throw new Error('Esta venta no tiene cliente asociado y Público general no está sincronizado. Conéctate y sincroniza antes de cobrar.');
      }
      if (!clienteId) {
        if (online) {
          const { error: repairError } = await supabase
            .from('ventas')
            .update({ cliente_id: cobroClienteId })
            .eq('id', venta.id)
            .eq('empresa_id', empresa.id);
          if (repairError) throw repairError;
        } else {
          await queueOperation('ventas', 'update', { id: venta.id, cliente_id: cobroClienteId });
        }
      }

      const fechaCobro = todayInTimezone(empresa.zona_horaria);
      const cobroPayload = {
        empresa_id: empresa.id,
        cliente_id: cobroClienteId,
        user_id: user.id,
        monto: roundMoney(totalACobrar),
        metodo_pago: metodoPago,
        referencia: referenciaPago || null,
        fecha: fechaCobro,
      };

      const aplicaciones: { venta_id: string; monto_aplicado: number }[] = [];
      const ticketApps: { folio: string; monto: number; saldoRestante: number }[] = [];

      // Apply to current sale
      if (montoAplicarActual > 0) {
        aplicaciones.push({ venta_id: venta.id, monto_aplicado: roundMoney(montoAplicarActual) });
        const newSaldo = roundMoney(saldoActual - montoAplicarActual);
        if (newSaldo <= 0.01 && venta.status === 'borrador') {
          if (online) {
            await supabase.from('ventas').update({ status: 'confirmado' as const }).eq('id', venta.id);
          } else {
            await queueOperation('ventas', 'update', { id: venta.id, status: 'confirmado' });
          }
        }
        ticketApps.push({ folio: venta.folio ?? 'Sin folio', monto: roundMoney(montoAplicarActual), saldoRestante: roundMoney(Math.max(0, newSaldo)) });
      }

      // Apply to other pending sales
      for (const cuenta of cuentasPendientes) {
        if (cuenta.montoAplicar > 0) {
          aplicaciones.push({ venta_id: cuenta.id, monto_aplicado: roundMoney(cuenta.montoAplicar) });
          const newSaldo = roundMoney(cuenta.saldo_pendiente - cuenta.montoAplicar);
          ticketApps.push({ folio: cuenta.folio ?? '—', monto: roundMoney(cuenta.montoAplicar), saldoRestante: roundMoney(Math.max(0, newSaldo)) });
        }
      }

      // Id DETERMINÍSTICO del cobro (mismo criterio que RutaCobrar): derivado del
      // contenido del pago. Si se reenvía offline (doble-toque, resync) el id
      // coincide y el upsert no duplica. Online, la RPC asigna el id real.
      const firmaCobro = aplicaciones.map(a => `${a.venta_id}:${a.monto_aplicado}`).sort().join(',');
      let cobroId = await deterministicUuid('cobro', empresa.id, cobroClienteId, fechaCobro, metodoPago, roundMoney(totalACobrar), firmaCobro);

      if (aplicaciones.length > 0) {
        if (online) {
          const { data: createdCobroId, error: cobroErr } = await (supabase as any).rpc('aplicar_cobro', {
            p_empresa_id: empresa.id,
            p_cliente_id: cobroClienteId,
            p_monto: roundMoney(totalACobrar),
            p_metodo: metodoPago,
            p_referencia: referenciaPago || null,
            p_fecha: fechaCobro,
            p_aplicaciones: aplicaciones.map(ap => ({ venta_id: ap.venta_id, monto_aplicado: ap.monto_aplicado })),
            p_notas: null,
            p_user_id: user.id,
          });
          if (cobroErr) throw cobroErr;
          cobroId = createdCobroId;
        } else {
          await queueOperations([
            { table: 'cobros', operation: 'insert', data: { id: cobroId, ...cobroPayload } },
            ...await Promise.all(aplicaciones.map(async ap => ({
              table: 'cobro_aplicaciones',
              operation: 'insert' as const,
              // Id determinístico por (cobro, venta) → la aplicación tampoco se duplica.
              data: { id: await deterministicUuid('capp', cobroId, ap.venta_id), cobro_id: cobroId, venta_id: ap.venta_id, monto_aplicado: ap.monto_aplicado },
            }))),
          ]);
        }
      }

      // Recibo automático (sólo si hay conexión)
      if (online) {
        import('@/lib/enviarReciboCobro').then(m => m.enviarReciboCobro(cobroId, empresa.id));
      }

      // Cobrar no marca entregas por sí solo (D-059). Excepción: pedido de contado que el
      // repartidor mandó a «Cobrar y entregar»; se entrega solo si cubrió lo requerido.
      if (entregaPorCobrar) {
        const pagado = roundMoney(montoAplicarActual);
        if (pagado + 0.01 >= entregaPorCobrar.minimo) {
          const ahora = new Date().toISOString();
          if (online) {
            await marcarEntregaHechaYSincronizarPedido(entregaPorCobrar.id, venta.id, ahora);
          } else {
            await queueOperation('entregas', 'update', { id: entregaPorCobrar.id, status: 'hecho', validado_at: ahora, fecha_entrega: ahora });
          }
          toast.success('¡Entrega completada!');
          setEntregaPorCobrar(null);
        } else {
          toast.warning(`Cobro parcial: la entrega sigue pendiente. Falta ${fmt(roundMoney(entregaPorCobrar.minimo - pagado))} para entregar.`);
          setEntregaPorCobrar({ ...entregaPorCobrar, minimo: roundMoney(entregaPorCobrar.minimo - pagado) });
        }
      }

      setTicketData({ monto: roundMoney(totalACobrar), cambio: roundMoney(cambio), metodo: metodoPago, folio: venta.folio ?? 'Sin folio', fecha: new Date().toLocaleString('es-MX'), aplicaciones: ticketApps });
      setView('ticket');
      toast.success(online ? '¡Cobro registrado!' : 'Cobro guardado localmente, se sincronizará');
      ['venta', 'ruta-ventas', 'ruta-stats', 'ventas', 'ruta-cuentas-pendientes', 'ruta-entrega-detalle', 'ruta-entrega-venta', 'entregas', 'entregas-list', 'ruta-entregas', 'logistica-pedidos'].forEach(k => queryClient.invalidateQueries({ queryKey: [k === 'venta' ? 'venta' : k, ...(k === 'venta' ? [id] : [])] }));
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); cobrarRef.current = false; }
  };

  const logHistorial = async (ventaId: string, accion: string, detalles: any = {}) => {
    try {
      await supabase.from('venta_historial').insert({
        venta_id: ventaId,
        empresa_id: empresa!.id,
        user_id: user!.id,
        user_nombre: (user as any)?.user_metadata?.full_name ?? user?.email ?? '',
        accion,
        detalles,
      });
    } catch (e) { console.error('Error logging historial', e); }
  };

  // Entregas NO canceladas de este pedido (desde la caché local, offline-safe).
  // Un pedido con entregas no se puede cancelar ni volver a borrador: primero
  // hay que cancelar/reversar sus entregas (ahí el stock regresa correctamente).
  const entregasActivasDelPedido = async (): Promise<string[]> => {
    const t = getOfflineTable('entregas');
    if (!t) return [];
    const all = (await t.toArray().catch(() => [])) as any[];
    return all
      .filter(e => e.pedido_id === venta?.id && e.status !== 'cancelado')
      .map(e => e.folio || e.id);
  };

  const handleCancelar = async () => {
    if (!venta) return;
    const activas = await entregasActivasDelPedido();
    if (activas.length > 0) {
      toast.error(`Este pedido tiene entregas activas (${activas.join(', ')}). Cancela o reversa primero sus entregas.`);
      return;
    }
    setSaving(true);
    try {
      if (navigator.onLine) {
        // D-020: una sola operación en la BD; si hay pagos pregunta qué hacer con el dinero.
        const r = await cancelarVenta(venta.id, pedirDestinoPago);
        if (r.cancelado) return;
        if (r.error) throw new Error(r.error.message);
      } else {
        // Offline: se encola la misma operación de la BD. Si la caché local muestra pagos,
        // se pregunta ya; si no, por seguridad cualquier pago que aparezca queda como saldo a favor.
        let destino: DestinoPagoCancelacion = 'saldo_favor';
        const caTable = getOfflineTable('cobro_aplicaciones');
        if (caTable) {
          const allCa = (await caTable.toArray().catch(() => [])) as { venta_id?: string; monto_aplicado?: number }[];
          const pagadoLocal = allCa.filter(a => a.venta_id === venta.id).reduce((s, a) => s + (Number(a.monto_aplicado) || 0), 0);
          if (pagadoLocal > 0.009) {
            const elegido = await pedirDestinoPago({ monto: pagadoLocal, mensaje: '' });
            if (!elegido) return;
            destino = elegido;
          }
        }
        await queueOperations([{ table: 'rpc:cancelar_venta', operation: 'rpc', data: { p_venta_id: venta.id, p_destino_pago: destino, p_motivo: null } }]);
        const vt = getOfflineTable('ventas');
        if (vt) await vt.update(venta.id, { status: 'cancelado' }).catch(() => undefined);
      }
      toast.success('Venta cancelada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['stock-almacen'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  // D-062: tras convertir (RPC en línea) se refresca la venta y, si queda saldo, se abre el cobro.
  const onPedidoConvertido = async (r: ResultadoConversion) => {
    const vt = getOfflineTable('ventas');
    if (vt && id) {
      await vt.update(id, {
        tipo: 'venta_directa', entrega_inmediata: true, status: r.status,
        almacen_id: r.almacen_id, saldo_pendiente: r.saldo_pendiente,
      }).catch(() => toast.error('La venta se convirtió, pero la copia del teléfono se verá al sincronizar.'));
    }
    queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
    queryClient.invalidateQueries({ queryKey: ['ruta-pedido-entregas-activas', empresa?.id, id] });
    queryClient.invalidateQueries({ queryKey: ['productos'] });
    queryClient.invalidateQueries({ queryKey: ['stock-almacen'] });
    queryClient.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['venta', empresa?.id, id] });
    if (r.saldo_pendiente > 0.005) abrirCobro(r.saldo_pendiente);
  };

  const handleVolverBorrador = async () => {
    if (!venta || venta.status === 'borrador' || venta.status === 'cancelado') return;
    const activasVB = await entregasActivasDelPedido();
    if (activasVB.length > 0) {
      toast.error(`Este pedido tiene entregas activas (${activasVB.join(', ')}). Cancela o reversa primero sus entregas.`);
      return;
    }
    if (['entregado', 'facturado'].includes(venta.status)) {
      toast.error('Una venta entregada no puede volver a borrador, solo cancelar');
      return;
    }
    setSaving(true);
    try {
      const prevStatus = venta.status;
      if (navigator.onLine) {
        // Un cierre congela total_efectivo. Antes de permitir nuevas líneas hay
        // que liberar formalmente ese cierre; cambiar solo el status dejaba el
        // saldo anclado al total anterior y los productos nuevos parecían pagados.
        if ((venta as any).cerrado_at) {
          const { error: reopenErr } = await supabase.rpc('reabrir_pedido_parcial', { p_venta_id: venta.id });
          if (reopenErr) throw reopenErr;
        }
        const { error } = await supabase.from('ventas').update({ status: 'borrador' as const }).eq('id', venta.id);
        if (error) throw error;
        await logHistorial(venta.id, 'vuelta_borrador', { status: { anterior: prevStatus, nuevo: 'borrador' } });
      } else {
        if ((venta as any).cerrado_at) {
          throw new Error('Conéctate a internet para reabrir este pedido cerrado.');
        }
        await queueOperation('ventas', 'update', { id: venta.id, status: 'borrador' });
      }
      toast.success('Venta regresada a borrador');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const getTicketData = (): TicketData | null => {
    if (!venta) return null;
    const e = empresa as any;
    const lineasVenta = ((venta as any).venta_lineas ?? []) as any[];

    // Pagos aplicados (cobros)
    const pagos = (pagosVenta ?? []).map((p: any) => ({
      metodo: (p.cobros as any)?.metodo_pago ?? '',
      monto: Number(p.monto_aplicado) || 0,
      referencia: (p.cobros as any)?.referencia ?? undefined,
    }));
    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);
    const total = Number(venta.total ?? 0);
    const saldoPendiente = Number(venta.saldo_pendiente ?? 0);
    // Saldo anterior = suma de saldos pendientes de OTRAS ventas del cliente (excluye la actual)
    const saldoAnterior = Number(ventasPendientesCredito ?? 0);

    return {
      empresa: {
        nombre: e?.nombre ?? '',
        rfc: e?.rfc ?? null,
        razon_social: e?.razon_social ?? null,
        telefono: e?.telefono ?? null,
        direccion: e?.direccion ?? null,
        colonia: e?.colonia ?? null,
        ciudad: e?.ciudad ?? null,
        estado: e?.estado ?? null,
        cp: e?.cp ?? null,
        email: e?.email ?? null,
        logo_url: e?.logo_url ?? null,
        moneda: e?.moneda ?? 'MXN',
        notas_ticket: e?.notas_ticket ?? null,
        ticket_campos: e?.ticket_campos ?? null,
      },
      folio: venta.folio ?? 'Sin folio',
      fecha: fmtDate(venta.fecha),
      clienteNombre: (venta as any).clientes?.nombre ?? 'Sin cliente',
      clienteRfc: (venta as any).clientes?.rfc ?? null,
      clienteTelefono: (venta as any).clientes?.telefono ?? null,
      clienteDireccion: [(venta as any).clientes?.direccion, (venta as any).clientes?.colonia].filter(Boolean).join(', ') || null,
      vendedorNombre: (venta as any).vendedores?.nombre ?? '',
      vendedorTelefono: (venta as any).vendedores?.telefono ?? null,
      lineas: lineasVenta.map((l: any) => ({
        nombre: l.productos?.nombre ?? l.descripcion ?? '—',
        codigo: l.productos?.codigo ?? null,
        cantidad: l.cantidad,
        precio: l.precio_unitario ?? 0,
        subtotal: l.subtotal ?? undefined,
        total: l.total ?? 0,
        iva_monto: l.iva_monto ?? 0,
        ieps_monto: l.ieps_monto ?? 0,
        iva_pct: l.iva_pct ?? 0,
        ieps_pct: l.ieps_pct ?? 0,
        // Columnas de desglose: sin ellas el ticket recalculaba el subtotal desde
        // el total con impuestos y quedaba distinto al ticket de escritorio.
        precio_lista_unitario: l.precio_lista_unitario ?? null,
        descuento_promocion_monto: l.descuento_promocion_monto ?? 0,
        descuento_manual_monto: l.descuento_manual_monto ?? 0,
        descuento_pct: l.descuento_porcentaje ?? l.descuento_pct ?? 0,
        producto_id: l.producto_id,
      })),
      subtotal: venta.subtotal ?? 0,
      descuento: (venta as any).descuento_total ?? 0,
      iva: venta.iva_total ?? 0,
      ieps: (venta as any).ieps_total ?? 0,
      total,
      condicionPago: venta.condicion_pago,
      metodoPago: (venta as any).metodo_pago ?? (pagos.length ? pagos.map(p => p.metodo).join(', ') : undefined),
      saldoAnterior,
      pagoAplicado: totalPagado,
      // Saldo real (también 0): el ticket ya no supone pagado lo de contado sin cobros.
      saldoNuevo: Math.max(saldoAnterior + saldoPendiente, 0),
      pagos,
      // Promociones: se toman de lo YA PERSISTIDO en las líneas (promocion_nombre +
      // descuento_promocion_monto), agrupadas por promoción. No se reevalúa el motor,
      // así una reimpresión vieja siempre coincide con lo cobrado.
      promociones: (() => {
        const map = new Map<string, { descripcion: string; descuento: number; producto_id?: string }>();
        for (const l of lineasVenta) {
          const nombre = (l as any).promocion_nombre;
          const monto = Number((l as any).descuento_promocion_monto) || 0;
          if (!nombre || monto <= 0.005) continue;
          const key = (l as any).promocion_id ?? nombre;
          const prev = map.get(key);
          if (prev) prev.descuento += monto;
          else map.set(key, { descripcion: nombre, descuento: monto, producto_id: l.producto_id ?? undefined });
        }
        return Array.from(map.values()).map(p => ({ ...p, descuento: Math.round(p.descuento * 100) / 100 }));
      })(),
      devoluciones: (devolucionesVenta ?? []).map((d: any) => ({
        nombre: d.producto?.nombre ?? 'Producto',
        cantidad: Number(d.cantidad) || 0,
        motivo: d.motivo,
        accion: d.accion,
        monto: Number(d.monto_credito ?? 0) || 0,
      })),
    };
  };


  const handleWhatsAppSend = async () => {
    if (!waPhone.trim() || !venta) return;
    setSendingWA(true);
    try {
      const { sendReceiptWhatsApp } = await import('@/lib/whatsappReceipt');
      const td = getTicketData()!;
      const result = await sendReceiptWhatsApp({ data: td, empresaId: empresa?.id ?? '', phone: waPhone, referencia_id: venta.id, ticketAncho: ticketAnchoEmpresa(empresa) });
      if (result.success) { toast.success('Enviado por WhatsApp'); setShowWADialog(false); } else toast.error(result.error || 'Error al enviar');
    } catch (err: any) { toast.error(err.message); } finally { setSendingWA(false); }
  };

  // Ticket PDF por código (D-051): mismo modelo y campos del diseñador que la
  // impresión; ancho del diseñador (80 mm por omisión). Se reutiliza al
  // Descargar y al Compartir.
  const generarTicketPdfVenta = async (): Promise<{ blob: Blob; fileName: string; folio: string } | null> => {
    const td = getTicketData(); if (!td) return null;
    const blob = await generarTicketPdf(td, { ticketAncho: ticketAnchoEmpresa(empresa) });
    return { blob, fileName: nombreArchivoTicket(td.folio), folio: td.folio };
  };

  const handleDownloadPDF = async () => {
    try {
      const pdf = await generarTicketPdfVenta();
      if (!pdf) return;
      downloadBlob(pdf.blob, pdf.fileName);
      toast.success('Ticket descargado');
    } catch (err) {
      toast.error(err instanceof Error ? `Error generando el PDF: ${err.message}` : 'Error generando el PDF');
    }
  };

  const handlePrintTicket = async () => {
    const td = getTicketData();
    if (!td) return;
    await printTicket(td);
  };

  const handleShareTicket = async () => {
    // Comparte el ticket como archivo PDF; si el teléfono no puede compartir archivos, lo descarga.
    try {
      const pdf = await generarTicketPdfVenta();
      if (!pdf) return;
      const r = await compartirPdf(pdf.blob, pdf.fileName, `Ticket ${pdf.folio}`);
      if (r === 'descargado') toast.success('Ticket descargado (PDF)');
    } catch (err) {
      toast.error(err instanceof Error ? `Error generando el PDF: ${err.message}` : 'Error generando el PDF');
    }
  };

  const handleEstadoCuenta = async () => {
    if (!empresa || !clienteData) { toast.error('Cargando datos...'); return; }
    try {
      const [ventasRes, cobrosRes] = await Promise.all([supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).in('status', ESTADOS_CXC as any).order('fecha', { ascending: false }).limit(200), supabase.from('cobros').select('id, fecha, monto, metodo_pago, referencia').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).order('fecha', { ascending: false }).limit(200)]);
      const ventaIds = (ventasRes.data ?? []).map(v => v.id);
      let productosVendidos: { nombre: string; cantidad: number; total: number }[] = [];
      let productosDevueltos: { nombre: string; cantidad: number; motivo?: string }[] = [];
      if (ventaIds.length > 0) {
        const [linRes, devRes] = await Promise.all([
          supabase.from('venta_lineas').select('cantidad, total, descripcion, producto:productos(nombre)').in('venta_id', ventaIds),
          supabase.from('devoluciones').select('id, devolucion_lineas(cantidad, motivo, producto:productos(nombre))').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).limit(200),
        ]);
        const mapV = new Map<string, { nombre: string; cantidad: number; total: number }>();
        (linRes.data ?? []).forEach((l: any) => {
          const nombre = l.producto?.nombre || l.descripcion || 'Producto';
          const cur = mapV.get(nombre) ?? { nombre, cantidad: 0, total: 0 };
          cur.cantidad += Number(l.cantidad ?? 0);
          cur.total += Number(l.total ?? 0);
          mapV.set(nombre, cur);
        });
        productosVendidos = Array.from(mapV.values()).sort((a, b) => b.total - a.total).slice(0, 30);
        const mapD = new Map<string, { nombre: string; cantidad: number; motivo?: string }>();
        (devRes.data ?? []).forEach((d: any) => {
          (d.devolucion_lineas ?? []).forEach((l: any) => {
            const nombre = l.producto?.nombre || 'Producto';
            const key = `${nombre}|${l.motivo ?? ''}`;
            const cur = mapD.get(key) ?? { nombre, cantidad: 0, motivo: l.motivo };
            cur.cantidad += Number(l.cantidad ?? 0);
            mapD.set(key, cur);
          });
        });
        productosDevueltos = Array.from(mapD.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 30);
      }
      const blob = await generarEstadoCuentaPdf({ empresa: { nombre: empresa.nombre, razon_social: empresa.razon_social ?? undefined, rfc: empresa.rfc ?? undefined, direccion: empresa.direccion ?? undefined, telefono: empresa.telefono ?? undefined, email: empresa.email ?? undefined, logo_url: empresa.logo_url ?? undefined }, cliente: { nombre: clienteData.nombre, telefono: clienteData.telefono ?? undefined, credito: clienteData.credito ?? false, limite_credito: clienteData.limite_credito ?? 0, dias_credito: clienteData.dias_credito ?? 0 }, ventas: (ventasRes.data ?? []).map(v => ({ folio: v.folio ?? '—', fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, status: v.status, condicion_pago: v.condicion_pago })), cobros: (cobrosRes.data ?? []).map(c => ({ fecha: c.fecha, monto: c.monto ?? 0, metodo_pago: c.metodo_pago, referencia: c.referencia ?? undefined })), productosVendidos, productosDevueltos });
      setEcPdfBlob(blob); setShowEcPreview(true);
    } catch { toast.error('Error generando estado de cuenta'); }
  };

  return {
    id, navigate, venta, isLoading, view, setView, fmt, fmtM, currSym, clienteData, clienteId,
    metodoPago, setMetodoPago, montoRecibido, setMontoRecibido, referenciaPago, setReferenciaPago,
    cuentasPendientes, setCuentasPendientes, saving, ticketData,
    sendingWA, showWADialog, setShowWADialog, waPhone, setWaPhone,
    ecPdfBlob, showEcPreview, setShowEcPreview, empresa,
    editLineas, setEditLineas, editCondicion, setEditCondicion, editNotas, setEditNotas,
    showProductSearch, setShowProductSearch, searchProducto, setSearchProducto,
    editTotals, saldoPendienteOtras, creditoDisponible, excedeCredito,
    saldoActual, totalAplicarOtras, totalACobrar, montoRecibidoNum, cambio,
    saldoFavorDisp,
    montoAplicarActual, updateMontoAplicarActual,
    filteredProductos, initEditar, addProductToEdit, updateEditQty, removeEditLine,
    // Lotes en edición
    manejaLotesEmpresa, productoManejaLote, lotePendienteEdit, setEditLineaLotes, almacenLotesBase,
    handleSaveEdits, initCobrar, updateCuentaMonto, liquidarTodas, handleCobrar,
    puedeConvertir, onPedidoConvertido,
    excedenteDialog,
    cancelarPagoDialog,
    handleCancelar, handleVolverBorrador, handleWhatsAppSend, handleDownloadPDF, handlePrintTicket, handleShareTicket, handleEstadoCuenta,
  };
}
