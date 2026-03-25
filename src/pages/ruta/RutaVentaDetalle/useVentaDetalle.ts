import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useVenta } from '@/hooks/useVentas';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { buildTicketHTML as buildUnifiedTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { buildEscPosBytes } from '@/lib/escpos';
import { isBluetoothAvailable, connectPrinter, sendBytes } from '@/lib/bluetoothPrinter';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import { toPng } from 'html-to-image';
import type { View, CuentaPendiente, EditLinea } from './types';
import { useCurrency } from '@/hooks/useCurrency';

export function useVentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, empresa } = useAuth();
  const queryClient = useQueryClient();
  const { data: venta, isLoading } = useVenta(id);

  const [view, setView] = useState<View>('detalle');
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [cuentasPendientes, setCuentasPendientes] = useState<CuentaPendiente[]>([]);
  const [saving, setSaving] = useState(false);
  const [ticketData, setTicketData] = useState<{ monto: number; cambio: number; metodo: string; folio: string; fecha: string } | null>(null);
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
  const { symbol: currSym } = useCurrency();
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const fmtM = (n: number) => `${currSym}${fmt(n)}`;

  const { data: clienteData } = useQuery({
    queryKey: ['ruta-cliente-detalle', clienteId], enabled: !!clienteId,
    queryFn: async () => { const { data } = await supabase.from('clientes').select('id, nombre, telefono, credito, limite_credito, dias_credito').eq('id', clienteId!).single(); return data; },
  });

  const { data: productos } = useQuery({
    queryKey: ['ruta-productos-edit', empresa?.id], enabled: !!empresa?.id && view === 'editar',
    queryFn: async () => { const { data } = await supabase.from('productos').select('id, codigo, nombre, precio_principal, tiene_iva, tasa_iva_id, unidades:unidad_venta_id(nombre, abreviatura), tasas_iva:tasa_iva_id(porcentaje)').eq('empresa_id', empresa!.id).eq('se_puede_vender', true).eq('status', 'activo').order('nombre'); return data ?? []; },
  });

  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-cuentas-pendientes-detalle', clienteId, id], enabled: !!clienteId && view === 'cobrar',
    queryFn: async () => { const { data } = await supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!).in('status', ['borrador', 'confirmado', 'entregado', 'facturado']).order('fecha', { ascending: true }); return data ?? []; },
  });

  const { data: ventasPendientesCredito } = useQuery({
    queryKey: ['ruta-saldo-total-credito', clienteId], enabled: !!clienteId && view === 'editar',
    queryFn: async () => { const { data } = await supabase.from('ventas').select('saldo_pendiente').eq('cliente_id', clienteId!).gt('saldo_pendiente', 0).neq('id', id!); return (data ?? []).reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0); },
  });

  const editTotals = useMemo(() => {
    let subtotal = 0, iva = 0;
    editLineas.forEach(item => { const s = item.precio_unitario * item.cantidad; subtotal += s; if (item.tiene_iva) iva += s * (item.iva_pct / 100); });
    return { subtotal, iva, total: subtotal + iva };
  }, [editLineas]);

  const saldoPendienteOtras = ventasPendientesCredito ?? 0;
  const creditoDisponible = clienteData ? (clienteData.limite_credito ?? 0) - saldoPendienteOtras : 0;
  const excedeCredito = editCondicion === 'credito' && editTotals.total > creditoDisponible;
  const saldoActual = venta?.saldo_pendiente ?? 0;
  const totalAplicarOtras = cuentasPendientes.reduce((s, c) => s + c.montoAplicar, 0);
  const totalACobrar = saldoActual + totalAplicarOtras;
  const montoRecibidoNum = parseFloat(montoRecibido) || 0;
  const cambio = montoRecibidoNum > totalACobrar ? montoRecibidoNum - totalACobrar : 0;

  const filteredProductos = productos?.filter(p => !searchProducto || p.nombre.toLowerCase().includes(searchProducto.toLowerCase()) || p.codigo.toLowerCase().includes(searchProducto.toLowerCase()));

  const initEditar = () => {
    if (!venta) return;
    const lineas = (venta as any).venta_lineas ?? [];
    setEditLineas(lineas.map((l: any) => ({ id: l.id, producto_id: l.producto_id, nombre: l.productos?.nombre ?? l.descripcion ?? '', codigo: l.productos?.codigo ?? '', cantidad: l.cantidad, precio_unitario: l.precio_unitario, unidad: l.unidades?.abreviatura ?? 'pz', tiene_iva: (l.iva_pct ?? 0) > 0, iva_pct: l.iva_pct ?? 0 })));
    setEditCondicion(venta.condicion_pago as any);
    setEditNotas(venta.notas ?? '');
    setView('editar');
  };

  const addProductToEdit = (p: any) => {
    const existing = editLineas.find(l => l.producto_id === p.id);
    if (existing) { setEditLineas(prev => prev.map(l => l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)); }
    else { setEditLineas(prev => [...prev, { producto_id: p.id, nombre: p.nombre, codigo: p.codigo, cantidad: 1, precio_unitario: p.precio_principal ?? 0, unidad: (p.unidades as any)?.abreviatura || 'pz', tiene_iva: p.tiene_iva ?? false, iva_pct: p.tiene_iva ? ((p.tasas_iva as any)?.porcentaje ?? 16) : 0 }]); }
  };

  const updateEditQty = (idx: number, delta: number) => { setEditLineas(prev => prev.map((l, i) => i !== idx ? l : l.cantidad + delta > 0 ? { ...l, cantidad: l.cantidad + delta } : l)); };
  const removeEditLine = (idx: number) => { setEditLineas(prev => prev.filter((_, i) => i !== idx)); };

  const handleSaveEdits = async () => {
    if (editLineas.length === 0) { toast.error('Agrega al menos un producto'); return; }
    setSaving(true);
    try {
      await supabase.from('venta_lineas').delete().eq('venta_id', id!);
      const newLineas = editLineas.map(item => ({ venta_id: id!, producto_id: item.producto_id, descripcion: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario, subtotal: item.precio_unitario * item.cantidad, iva_pct: item.iva_pct, iva_monto: item.tiene_iva ? item.precio_unitario * item.cantidad * (item.iva_pct / 100) : 0, ieps_pct: 0, ieps_monto: 0, descuento_pct: 0, total: item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0)) }));
      const { error: linErr } = await supabase.from('venta_lineas').insert(newLineas);
      if (linErr) throw linErr;
      const { error: ventaErr } = await supabase.from('ventas').update({ condicion_pago: editCondicion as any, notas: editNotas || null, subtotal: editTotals.subtotal, iva_total: editTotals.iva, total: editTotals.total, saldo_pendiente: editTotals.total }).eq('id', id!);
      if (ventaErr) throw ventaErr;
      toast.success('Venta actualizada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      setView('detalle');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const initCobrar = () => {
    if (otrasPendientes?.length) { setCuentasPendientes(otrasPendientes.map(v => ({ id: v.id, folio: v.folio, fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, montoAplicar: 0 }))); } else { setCuentasPendientes([]); }
    setMetodoPago('efectivo');
    setMontoRecibido(saldoActual > 0 ? saldoActual.toString() : '');
    setReferenciaPago('');
    setView('cobrar');
  };

  const updateCuentaMonto = (cid: string, monto: number) => { setCuentasPendientes(prev => prev.map(c => c.id === cid ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c)); };
  const liquidarTodas = () => { setCuentasPendientes(prev => prev.map(c => ({ ...c, montoAplicar: c.saldo_pendiente }))); };

  const handleCobrar = async () => {
    if (!user || !venta || totalACobrar <= 0) return;
    setSaving(true);
    try {
      if (!empresa?.id) throw new Error('Sin empresa');
      const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({ empresa_id: empresa.id, cliente_id: clienteId, user_id: user.id, monto: totalACobrar, metodo_pago: metodoPago, referencia: referenciaPago || null }).select('id').single();
      if (cobroErr) throw cobroErr;
      const aplicaciones: { cobro_id: string; venta_id: string; monto_aplicado: number }[] = [];
      if (saldoActual > 0) { aplicaciones.push({ cobro_id: cobro.id, venta_id: venta.id, monto_aplicado: saldoActual }); await supabase.from('ventas').update({ saldo_pendiente: 0, status: venta.status === 'borrador' ? 'confirmado' as const : venta.status }).eq('id', venta.id); }
      for (const cuenta of cuentasPendientes) { if (cuenta.montoAplicar > 0) { aplicaciones.push({ cobro_id: cobro.id, venta_id: cuenta.id, monto_aplicado: cuenta.montoAplicar }); await supabase.from('ventas').update({ saldo_pendiente: cuenta.saldo_pendiente - cuenta.montoAplicar }).eq('id', cuenta.id); } }
      if (aplicaciones.length > 0) { const { error: appErr } = await supabase.from('cobro_aplicaciones').insert(aplicaciones); if (appErr) throw appErr; }
      setTicketData({ monto: totalACobrar, cambio, metodo: metodoPago, folio: venta.folio ?? 'Sin folio', fecha: new Date().toLocaleString('es-MX') });
      setView('ticket');
      toast.success('¡Cobro registrado!');
      ['venta', 'ruta-ventas', 'ruta-stats', 'ventas', 'ruta-cuentas-pendientes'].forEach(k => queryClient.invalidateQueries({ queryKey: [k === 'venta' ? 'venta' : k, ...(k === 'venta' ? [id] : [])] }));
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const handleCancelar = async () => {
    if (!venta) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('ventas').update({ status: 'cancelado' as const }).eq('id', venta.id);
      if (error) throw error;
      toast.success('Venta cancelada');
      queryClient.invalidateQueries({ queryKey: ['venta', id] });
      queryClient.invalidateQueries({ queryKey: ['ruta-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['stock-almacen'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  const getTicketData = (): TicketData | null => {
    if (!venta) return null;
    const e = empresa as any;
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
      lineas: ((venta as any).venta_lineas ?? []).map((l: any) => ({
        nombre: l.productos?.nombre ?? l.descripcion ?? '—',
        cantidad: l.cantidad,
        precio: l.precio_unitario ?? 0,
        total: l.total ?? 0,
        iva_monto: l.iva_monto ?? 0,
        ieps_monto: l.ieps_monto ?? 0,
        descuento_pct: l.descuento_porcentaje ?? l.descuento_pct ?? 0,
      })),
      subtotal: venta.subtotal ?? 0,
      iva: venta.iva_total ?? 0,
      ieps: (venta as any).ieps_total ?? 0,
      total: venta.total ?? 0,
      condicionPago: venta.condicion_pago,
      metodoPago: (venta as any).metodo_pago ?? undefined,
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

  const ticketAncho = (empresa as any)?.ticket_ancho ?? '80';

  const handleDownloadPDF = async () => {
    const td = getTicketData(); if (!td) return;
    const container = document.createElement('div'); container.style.position = 'fixed'; container.style.left = '-9999px'; container.style.top = '0'; container.innerHTML = buildUnifiedTicketHTML(td, { ticketAncho }); document.body.appendChild(container);
    try { await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200))); const dataUrl = await toPng(container.firstElementChild as HTMLElement, { cacheBust: true, pixelRatio: 3, backgroundColor: '#ffffff' }); const a = document.createElement('a'); a.href = dataUrl; a.download = `${venta?.folio ?? 'ticket'}.png`; a.click(); toast.success('Ticket descargado'); } catch { toast.error('Error generando imagen'); } finally { document.body.removeChild(container); }
  };

  const handlePrintTicket = async () => {
    const td = getTicketData();
    if (!td) return;

    // 1) Try direct BLE ESC/POS
    if (isBluetoothAvailable()) {
      try {
        const conn = await connectPrinter();
        const escposBytes = buildEscPosBytes(td, { ticketAncho });
        await sendBytes(conn, escposBytes);
        toast.success('Ticket impreso');
        return;
      } catch (e) {
        console.warn('BLE falló, usando imagen:', e);
      }
    }

    // 2) Fallback: PNG share / download
    const html = buildUnifiedTicketHTML(td, { ticketAncho, forPrint: true });
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0';
    container.innerHTML = html;
    document.body.appendChild(container);
    const el = container.firstElementChild as HTMLElement;
    try {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${td.folio}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Ticket ${td.folio}` });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
    } catch {
      toast.error('Error generando imagen');
    } finally {
      document.body.removeChild(container);
    }
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
      `Subtotal: ${fmtM(td.subtotal)}`,
      td.iva > 0 ? `IVA: ${fmtM(td.iva)}` : '',
      (td.ieps ?? 0) > 0 ? `IEPS: ${fmtM(td.ieps!)}` : '',
      `TOTAL: ${fmtM(td.total)}`,
      '', 'Elaborado por Uniline — Innovación en la nube',
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
      const blob = generarEstadoCuentaPdf({ empresa: { nombre: empresa.nombre, razon_social: empresa.razon_social ?? undefined, rfc: empresa.rfc ?? undefined, direccion: empresa.direccion ?? undefined, telefono: empresa.telefono ?? undefined, email: empresa.email ?? undefined, logo_url: empresa.logo_url ?? undefined }, cliente: { nombre: clienteData.nombre, telefono: clienteData.telefono ?? undefined, credito: clienteData.credito ?? false, limite_credito: clienteData.limite_credito ?? 0, dias_credito: clienteData.dias_credito ?? 0 }, ventas: (ventasRes.data ?? []).map(v => ({ folio: v.folio ?? '—', fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, status: v.status, condicion_pago: v.condicion_pago })), cobros: (cobrosRes.data ?? []).map(c => ({ fecha: c.fecha, monto: c.monto ?? 0, metodo_pago: c.metodo_pago, referencia: c.referencia ?? undefined })) });
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
    filteredProductos, initEditar, addProductToEdit, updateEditQty, removeEditLine,
    handleSaveEdits, initCobrar, updateCuentaMonto, liquidarTodas, handleCobrar,
    handleCancelar, handleWhatsAppSend, handleDownloadPDF, handlePrintTicket, handleShareTicket, handleEstadoCuenta,
  };
}
