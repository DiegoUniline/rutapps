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
import { buildTicketHTML as buildUnifiedTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { printTicket } from '@/lib/printTicketUtil';
import { isBluetoothAvailable, connectPrinter, sendBytes } from '@/lib/bluetoothPrinter';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import { toPng } from 'html-to-image';
import type { View, CuentaPendiente, EditLinea } from './types';
import { useCurrency } from '@/hooks/useCurrency';
import { marcarEntregaHechaYSincronizarPedido } from '@/lib/entregaStatus';
import { useSaldoFavor } from '@/hooks/useSaldoFavor';
import { SALDO_FAVOR_METODO } from '@/lib/saldoFavor';

export function useVentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { user, empresa, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: venta, isLoading } = useVenta(id);

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
        const { data, error } = await supabase.from('clientes').select('id, nombre, telefono, credito, limite_credito, dias_credito').eq('id', clienteId!).single();
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
        const { data, error } = await supabase.from('productos').select('id, codigo, nombre, precio_principal, tiene_iva, iva_pct, maneja_lote, unidades:unidad_venta_id(nombre, abreviatura)').eq('empresa_id', empresa!.id).eq('se_puede_vender', true).eq('status', 'activo').order('nombre');
        if (error) throw error; return data ?? [];
      } catch {
        const t = getOfflineTable('productos');
        const all = t ? ((await t.toArray().catch(() => [])) as any[]) : [];
        return all.filter(p => p.empresa_id === empresa!.id && p.se_puede_vender && p.status === 'activo')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      }
    },
  });

  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-cuentas-pendientes-detalle', clienteId, id], enabled: !!clienteId && view === 'cobrar', networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!).in('status', ['borrador', 'confirmado', 'entregado', 'facturado']).order('fecha', { ascending: true });
        if (error) throw error; return data ?? [];
      } catch {
        return (await ventasLocalesDelCliente())
          .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.id !== id && ['borrador', 'confirmado', 'entregado', 'facturado'].includes(v.status))
          .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      }
    },
  });

  const { data: ventasPendientesCredito } = useQuery({
    queryKey: ['ruta-saldo-total-credito', clienteId, id],
    enabled: !!clienteId && !!id, networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('ventas').select('saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!).in('status', ['borrador', 'confirmado', 'entregado', 'facturado']);
        if (error) throw error; return (data ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
      } catch {
        return (await ventasLocalesDelCliente())
          .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.id !== id && ['borrador', 'confirmado', 'entregado', 'facturado'].includes(v.status))
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
    queryFn: async () => {
      const { data } = await supabase
        .from('cobro_aplicaciones')
        .select('id, monto_aplicado, cobros(fecha, metodo_pago, referencia, status)')
        .eq('venta_id', id!)
        .order('created_at');
      return data ?? [];
    },
  });

  const editTotals = useMemo(() => {
    let subtotal = 0, iva = 0;
    editLineas.forEach(item => { const s = item.precio_unitario * item.cantidad; subtotal += s; if (item.tiene_iva) iva += s * (item.iva_pct / 100); });
    return { subtotal, iva, total: subtotal + iva };
  }, [editLineas]);

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
    setEditLineas(lineas.map((l: any) => ({ id: l.id, producto_id: l.producto_id, nombre: l.productos?.nombre ?? l.descripcion ?? '', codigo: l.productos?.codigo ?? '', cantidad: l.cantidad, precio_unitario: l.precio_unitario, unidad: l.unidades?.abreviatura ?? 'pz', tiene_iva: (l.iva_pct ?? 0) > 0, iva_pct: l.iva_pct ?? 0, lotes: lotesPorLinea[l.id] ?? [] })));
    setEditCondicion(venta.condicion_pago as any);
    setEditNotas(venta.notas ?? '');
    setView('editar');
  };

  const addProductToEdit = (p: any) => {
    const existing = editLineas.find(l => l.producto_id === p.id);
    if (existing) { setEditLineas(prev => prev.map(l => l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)); }
    else { setEditLineas(prev => [...prev, { producto_id: p.id, nombre: p.nombre, codigo: p.codigo, cantidad: 1, precio_unitario: p.precio_principal ?? 0, unidad: (p.unidades as any)?.abreviatura || 'pz', tiene_iva: p.tiene_iva ?? false, iva_pct: p.tiene_iva ? (p.iva_pct ?? 16) : 0 }]); }
  };

  const updateEditQty = (idx: number, delta: number) => { setEditLineas(prev => prev.map((l, i) => i !== idx ? l : l.cantidad + delta > 0 ? { ...l, cantidad: l.cantidad + delta } : l)); };
  const removeEditLine = (idx: number) => { setEditLineas(prev => prev.filter((_, i) => i !== idx)); };

  const handleSaveEdits = async () => {
    if (editLineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
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
      // Ids determinísticos por (venta, posición): permiten colgar los lotes de
      // cada línea y que un reintento no duplique nada.
      const newIds = await Promise.all(editLineas.map((_, idx) => deterministicUuid('vlinea-edit', id!, idx)));
      const newLineas = editLineas.map((item, idx) => ({ id: newIds[idx], venta_id: id!, producto_id: item.producto_id, descripcion: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario, subtotal: item.precio_unitario * item.cantidad, iva_pct: item.iva_pct, iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0, ieps_pct: 0, ieps_monto: 0, descuento_pct: 0, total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)), lote_id: item.lotes?.[0]?.lote_id ?? null }));

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

      const ventaUpdate = { condicion_pago: editCondicion as any, notas: editNotas || null, subtotal: editTotals.subtotal, iva_total: editTotals.iva, total: editTotals.total, saldo_pendiente: editTotals.total };

      if (navigator.onLine) {
        // Los lotes previos se borran primero (FK a venta_linea_id) y se
        // reconstruyen con el reparto vigente.
        await supabase.from('venta_linea_lotes').delete().eq('venta_id', id!);
        const { error: linErr } = await supabase.from('venta_lineas').upsert(newLineas as any).select('id');
        if (linErr) throw linErr;
        // Se eliminan las líneas que ya no forman parte de la venta.
        await supabase.from('venta_lineas').delete().eq('venta_id', id!).not('id', 'in', `(${newIds.join(',')})`);
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

  const initCobrar = () => {
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
    setMontoAplicarActual(roundMoney(saldoActual));
    setMontoRecibido(saldoActual > 0 ? roundMoney(saldoActual).toFixed(2) : '');
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
  useEffect(() => {
    if (autoCobrarRef.current) return;
    if (!venta) return;
    if (searchParams.get('cobrar') !== '1') return;
    autoCobrarRef.current = true;
    initCobrar();
    const next = new URLSearchParams(searchParams);
    next.delete('cobrar');
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

      const fechaCobro = todayInTimezone(empresa.zona_horaria);
      const cobroPayload = {
        empresa_id: empresa.id,
        cliente_id: clienteId,
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
      let cobroId = await deterministicUuid('cobro', empresa.id, clienteId, fechaCobro, metodoPago, roundMoney(totalACobrar), firmaCobro);

      if (aplicaciones.length > 0) {
        if (online) {
          const { data: createdCobroId, error: cobroErr } = await (supabase as any).rpc('aplicar_cobro', {
            p_empresa_id: empresa.id,
            p_cliente_id: clienteId,
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

      const ventasLiquidadas = [
        ...(montoAplicarActual > 0 && roundMoney(saldoActual - montoAplicarActual) <= 0.01 ? [venta.id] : []),
        ...cuentasPendientes
          .filter(cuenta => cuenta.montoAplicar > 0 && roundMoney(cuenta.saldo_pendiente - cuenta.montoAplicar) <= 0.01)
          .map(cuenta => cuenta.id),
      ];

      if (online) {
        for (const ventaId of ventasLiquidadas) {
          const { data: entregasVenta, error: entregasErr } = await supabase
            .from('entregas')
            .select('id, status')
            .eq('pedido_id', ventaId)
            .limit(10);
          if (entregasErr) throw entregasErr;

          const entregasPendientes = (entregasVenta ?? []).filter((entrega: any) => ['cargado', 'en_ruta', 'surtido', 'asignado'].includes(entrega.status));
          if (entregasPendientes.length === 1) {
            await marcarEntregaHechaYSincronizarPedido(entregasPendientes[0].id, ventaId);
          } else if ((entregasVenta ?? []).length > 0 && entregasPendientes.length === 0) {
            await marcarEntregaHechaYSincronizarPedido((entregasVenta ?? [])[0].id, ventaId);
          }
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
      const prevStatus = venta.status;
      if (navigator.onLine) {
        const { error } = await supabase.from('ventas').update({ status: 'cancelado' as const }).eq('id', venta.id);
        if (error) throw error;
        // Cancel associated cobros
        const { data: apps } = await supabase.from('cobro_aplicaciones').select('id, cobro_id, monto_aplicado').eq('venta_id', venta.id);
        if (apps && apps.length > 0) {
          const cobroIds = [...new Set(apps.map(a => a.cobro_id))];
          for (const cid of cobroIds) {
            const { data: allApps } = await supabase.from('cobro_aplicaciones').select('venta_id').eq('cobro_id', cid);
            const onlyThisVenta = (allApps ?? []).every(a => a.venta_id === venta.id);
            if (onlyThisVenta) {
              await supabase.from('cobros').update({ status: 'cancelado' } as any).eq('id', cid);
            }
          }
        }
        await logHistorial(venta.id, 'cancelada', { status: { anterior: prevStatus, nuevo: 'cancelado' } });
      } else {
        // Offline: encola la cancelación (antes fallaba y no hacía nada).
        // Los cobros aplicados SOLO a esta venta se cancelan usando la caché
        // local de cobro_aplicaciones.
        const ops: any[] = [{ table: 'ventas', operation: 'update', data: { id: venta.id, status: 'cancelado' } }];
        const caTable = getOfflineTable('cobro_aplicaciones');
        if (caTable) {
          const allCa = (await caTable.toArray().catch(() => [])) as any[];
          const cobroIds = [...new Set(allCa.filter(a => a.venta_id === venta.id).map(a => a.cobro_id))];
          for (const cid of cobroIds) {
            const appsDeCobro = allCa.filter(a => a.cobro_id === cid);
            const onlyThisVenta = appsDeCobro.length > 0 && appsDeCobro.every(a => a.venta_id === venta.id);
            if (onlyThisVenta) ops.push({ table: 'cobros', operation: 'update', data: { id: cid, status: 'cancelado' } });
          }
        }
        await queueOperations(ops);
      }
      toast.success('Venta cancelada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['stock-almacen'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
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
        const { error } = await supabase.from('ventas').update({ status: 'borrador' as const }).eq('id', venta.id);
        if (error) throw error;
        await logHistorial(venta.id, 'vuelta_borrador', { status: { anterior: prevStatus, nuevo: 'borrador' } });
      } else {
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
      saldoNuevo: (saldoAnterior + saldoPendiente) > 0 ? (saldoAnterior + saldoPendiente) : undefined,
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
      const result = await sendReceiptWhatsApp({ data: td, empresaId: empresa?.id ?? '', phone: waPhone, referencia_id: venta.id });
      if (result.success) { toast.success('Enviado por WhatsApp'); setShowWADialog(false); } else toast.error(result.error || 'Error al enviar');
    } catch (err: any) { toast.error(err.message); } finally { setSendingWA(false); }
  };

  const ticketAncho = (empresa as any)?.ticket_ancho ?? '58';

  /** Convert remote logo URL to base64 to avoid CORS issues with toPng */
  const logoToBase64 = async (td: TicketData): Promise<TicketData> => {
    if (!td.empresa.logo_url || td.empresa.logo_url.startsWith('data:')) return td;
    const copy = { ...td, empresa: { ...td.empresa } };
    try {
      const resp = await fetch(copy.empresa.logo_url!, { mode: 'cors' });
      const blob = await resp.blob();
      copy.empresa.logo_url = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = copy.empresa.logo_url!;
        await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = fail; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        copy.empresa.logo_url = c.toDataURL('image/png');
      } catch { copy.empresa.logo_url = null; }
    }
    return copy;
  };

  const handleDownloadPDF = async () => {
    let td = getTicketData(); if (!td) return;
    td = await logoToBase64(td);
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = 'max-content';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-1';
    container.innerHTML = buildUnifiedTicketHTML(td, { ticketAncho });
    document.body.appendChild(container);
    try {
      await document.fonts?.ready;
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
      const ticketEl = container.firstElementChild as HTMLElement;
      ticketEl.style.width = '420px';
      ticketEl.style.minWidth = '420px';
      ticketEl.style.maxWidth = 'none';
      ticketEl.style.boxSizing = 'border-box';
      ticketEl.style.overflow = 'visible';
      const width = Math.ceil(Math.max(ticketEl.scrollWidth, ticketEl.offsetWidth, ticketEl.getBoundingClientRect().width));
      const height = Math.ceil(Math.max(ticketEl.scrollHeight, ticketEl.offsetHeight, ticketEl.getBoundingClientRect().height));
      const dataUrl = await toPng(ticketEl, { cacheBust: true, pixelRatio: 3, backgroundColor: '#ffffff', width, height, style: { width: `${width}px`, height: `${height}px`, maxWidth: 'none', overflow: 'visible' } });
      const a = document.createElement('a'); a.href = dataUrl; a.download = `${venta?.folio ?? 'ticket'}.png`; a.click(); toast.success('Ticket descargado');
    } catch { toast.error('Error generando imagen'); } finally { document.body.removeChild(container); }
  };

  const handlePrintTicket = async () => {
    const td = getTicketData();
    if (!td) return;
    await printTicket(td);
  };

  const handleShareTicket = async () => {
    const td = getTicketData(); if (!td) return;
    const text = [
      td.empresa.nombre,
      td.empresa.rfc ? `RFC: ${td.empresa.rfc}` : '',
      td.empresa.direccion ?? '',
      td.empresa.telefono ? `Tel: ${td.empresa.telefono}` : '',
      '─'.repeat(30),
      `Folio: ${td.folio}`, `Fecha: ${td.fecha}`, `Cliente: ${td.clienteNombre}`,
      `Pago: ${td.condicionPago === 'credito' ? 'Crédito' : td.condicionPago === 'contado' ? 'Contado' : 'Por definir'}`,
      td.metodoPago ? `Método: ${td.metodoPago}` : '',
      '─'.repeat(30),
      ...td.lineas.map(l => `${l.cantidad}x ${l.nombre} ${fmtM(l.total)}`),
      '─'.repeat(30),
      `Sub total: ${fmtM(td.subtotal)}`,
      `Descuentos: ${(td.descuento ?? 0) > 0 ? '-' : ''}${fmtM(td.descuento ?? 0)}`,
      `Impuestos: ${fmtM((td.iva ?? 0) + (td.ieps ?? 0))}`,
      `Total pagado: ${fmtM((td.pagos ?? []).reduce((s, p) => s + (p.monto ?? 0), 0) || (td.condicionPago === 'credito' ? 0 : td.total))}`,
      `Saldo: ${fmtM(td.saldoNuevo ?? 0)}`,
      '', 'rutapp.mx',
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: `Ticket ${td.folio}`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado al portapapeles');
    }
  };

  const handleEstadoCuenta = async () => {
    if (!empresa || !clienteData) { toast.error('Cargando datos...'); return; }
    try {
      const [ventasRes, cobrosRes] = await Promise.all([supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).neq('status', 'cancelado').order('fecha', { ascending: false }).limit(200), supabase.from('cobros').select('id, fecha, monto, metodo_pago, referencia').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).order('fecha', { ascending: false }).limit(200)]);
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
    handleCancelar, handleVolverBorrador, handleWhatsAppSend, handleDownloadPDF, handlePrintTicket, handleShareTicket, handleEstadoCuenta,
  };
}
