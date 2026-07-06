import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { printTicket } from '@/lib/printTicketUtil';
import { toPng } from 'html-to-image';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import { marcarEntregaHechaYSincronizarPedido } from '@/lib/entregaStatus';
import { fetchEntregaWithFallback, fetchVentaForEntregaWithFallback, fetchOtrasPendientesWithFallback } from '@/lib/offlineEntrega';
import { queueOperation } from '@/lib/syncQueue';
import {
  ArrowLeft, Check, User, Package, MapPin, Calendar,
  Banknote, FileText, Download, Printer, Share2, MessageCircle,
  Receipt, X, Truck, Loader2, Clock, XCircle, AlertTriangle, CalendarClock,
  Pencil, Minus, Plus, PackageX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermisos } from '@/hooks/usePermisos';

const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  surtido: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  asignado: 'bg-accent text-accent-foreground',
  cargado: 'bg-warning/10 text-warning',
  en_ruta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  hecho: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  no_entregado: 'bg-destructive/10 text-destructive',
  cancelado: 'bg-destructive/10 text-destructive',
};

const MOTIVOS_NO_ENTREGA = [
  'Cerrado',
  'Cliente ausente',
  'Cliente rechazó pedido',
  'Sin dinero',
  'Dirección incorrecta',
  'No hubo acceso',
  'Producto dañado',
];

export default function RutaEntregaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const queryClient = useQueryClient();
  const { symbol: s, fmt } = useCurrency();
  const { hasPermisoMovil } = usePermisos();
  const canEditEntrega = hasPermisoMovil('ruta.editar_entrega');

  const [saving, setSaving] = useState(false);
  const [showWADialog, setShowWADialog] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [sendingWA, setSendingWA] = useState(false);
  const [ecPdfBlob, setEcPdfBlob] = useState<Blob | null>(null);
  const [showEcPreview, setShowEcPreview] = useState(false);
  const [showTax, setShowTax] = useState(true);
  const [showCobrarPrompt, setShowCobrarPrompt] = useState(false);
  const [showNoEntregadoModal, setShowNoEntregadoModal] = useState(false);
  const [motivoSeleccionado, setMotivoSeleccionado] = useState<string>('');
  const [motivoCustom, setMotivoCustom] = useState('');
  const [savingNoEntregado, setSavingNoEntregado] = useState(false);
  const [showReprogramarModal, setShowReprogramarModal] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [savingReprog, setSavingReprog] = useState(false);
  const [editLinea, setEditLinea] = useState<any | null>(null);
  const [editCantidad, setEditCantidad] = useState(0);
  const [editMotivo, setEditMotivo] = useState('');
  const [savingLinea, setSavingLinea] = useState(false);

  const { data: entrega, isLoading } = useQuery({
    queryKey: ['ruta-entrega-detalle', id],
    enabled: !!id,
    networkMode: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const data = await fetchEntregaWithFallback(id!);
      if (!data) throw new Error('Entrega no encontrada');
      return data;
    },
  });

  const pedidoId = (entrega as any)?.pedido_id;
  const { data: venta } = useQuery({
    queryKey: ['ruta-entrega-venta', pedidoId],
    enabled: !!pedidoId,
    networkMode: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => fetchVentaForEntregaWithFallback(pedidoId!),
  });

  const clienteId = (entrega as any)?.cliente_id;
  const { data: otrasPendientes } = useQuery({
    queryKey: ['ruta-entrega-cuentas', clienteId],
    enabled: !!clienteId,
    networkMode: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => fetchOtrasPendientesWithFallback(clienteId!),
  });

  const ventaId = (venta as any)?.id ?? pedidoId;
  const { data: devolucionesVenta } = useQuery({
    queryKey: ['ruta-entrega-devoluciones', ventaId],
    enabled: !!ventaId,
    networkMode: 'always',
    queryFn: async () => {
      const { data: heads } = await supabase.from('devoluciones').select('id').eq('venta_id', ventaId!);
      const ids = (heads ?? []).map((h: any) => h.id);
      if (ids.length === 0) return [] as any[];
      const { data } = await supabase
        .from('devolucion_lineas')
        .select('cantidad, motivo, accion, monto_credito, producto:productos!devolucion_lineas_producto_id_fkey(nombre)')
        .in('devolucion_id', ids);
      return data ?? [];
    },
  });



  // Auto-marcar como entregado si la venta ya fue cobrada totalmente
  const autoMarkedRef = useRef(false);
  useEffect(() => {
    if (!entrega || !venta || autoMarkedRef.current) return;
    const status = (entrega as any).status;
    const saldo = (venta as any).saldo_pendiente ?? 0;
    const condicion = (venta as any).condicion_pago;
    // Solo auto-marcar si está en estados activos de ruta y saldo está en 0 (contado/pagado)
    if (navigator.onLine && saldo <= 0 && condicion !== 'credito' && ['cargado', 'en_ruta', 'surtido', 'asignado'].includes(status)) {
      autoMarkedRef.current = true;
      const now = new Date().toISOString();
      marcarEntregaHechaYSincronizarPedido(id!, pedidoId, now)
        .then(() => {
          toast.success('Entrega marcada como entregada automáticamente');
          queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
          queryClient.invalidateQueries({ queryKey: ['entregas'] });
          queryClient.invalidateQueries({ queryKey: ['entregas-list'] });
          queryClient.invalidateQueries({ queryKey: ['venta', pedidoId] });
          queryClient.invalidateQueries({ queryKey: ['ventas'] });
          queryClient.invalidateQueries({ queryKey: ['logistica-pedidos'] });
        })
        .catch(() => {
          autoMarkedRef.current = false;
        });
    }
  }, [entrega, venta, id, pedidoId, queryClient]);


  if (isLoading) return <div className="min-h-[100dvh] bg-background flex items-center justify-center"><p className="text-muted-foreground text-[13px]">Cargando...</p></div>;
  if (!entrega) return <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-2"><p className="text-muted-foreground text-[13px]">Entrega no encontrada</p><button onClick={() => navigate(-1)} className="text-primary text-[13px] font-medium">Volver</button></div>;

  const cliente = (entrega as any).clientes;
  const clienteNombre = cliente?.nombre ?? '—';
  const vendedorNombre = (entrega as any).vendedores?.nombre ?? '—';
  const lineas = (entrega as any).entrega_lineas ?? [];
  const isDelivered = entrega.status === 'hecho';
  const isNoEntregado = entrega.status === 'no_entregado';
  const isClosedState = isDelivered || isNoEntregado || entrega.status === 'cancelado';

  const ventaLineas = (venta as any)?.venta_lineas ?? [];
  const ventaTotal = venta?.total ?? 0;
  const ventaSaldo = venta?.saldo_pendiente ?? 0;

  // Only lines that were actually surtidas (cantidad_entregada > 0) are part of THIS delivery.
  // Lines with cantidad_entregada = 0 (sin stock) must not appear in Productos nor be charged.
  const lineasSurtidas = (lineas as any[]).filter(l => Number(l.cantidad_entregada ?? 0) > 0);
  const lineasNoSurtidas = (lineas as any[]).length - lineasSurtidas.length;

  // Recompute totals for this delivery only, prorating taxes per venta_linea by delivered ratio.
  const computeEntregaTotals = () => {
    let subtotal = 0, iva = 0, ieps = 0, total = 0;
    for (const l of lineasSurtidas) {
      const cant = Number(l.cantidad_entregada) || 0;
      const vl = ventaLineas.find((v: any) => v.producto_id === l.producto_id);
      const precio = vl?.precio_unitario ?? l.productos?.precio_principal ?? 0;
      if (vl) {
        const pedida = Number(vl.cantidad) || 0;
        const ratio = pedida > 0 ? cant / pedida : 0;
        subtotal += Number(vl.subtotal ?? precio * cant) * (pedida > 0 ? ratio : 1);
        iva += Number(vl.iva_monto ?? 0) * ratio;
        ieps += Number(vl.ieps_monto ?? 0) * ratio;
        total += Number(vl.total ?? precio * cant) * (pedida > 0 ? ratio : 1);
      } else {
        const t = precio * cant;
        subtotal += t;
        total += t;
      }
    }
    return { subtotal, iva, ieps, total };
  };
  const entregaTotals = computeEntregaTotals();
  const entregaTotal = entregaTotals.total;

  const handleMarcarClick = () => {
    // If there's any pending balance (this order or other accounts), prompt
    const tienePendiente = (ventaSaldo > 0) || (totalSaldoPendiente > 0);
    if (tienePendiente) {
      setShowCobrarPrompt(true);
      return;
    }
    void marcarEntregado();
  };

  const marcarEntregado = async (goToCobrarAfter = false) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();

      // El descuento de inventario lo realiza el trigger de base de datos
      // `trg_apply_entrega_hecho_inventory` al cambiar el status a 'hecho'.
      // No descontamos desde el cliente para evitar duplicados y race conditions.

      // Marcar la entrega como hecha (solo si no lo está ya)
      if (entrega.status !== 'hecho') {
        if (navigator.onLine) {
          await marcarEntregaHechaYSincronizarPedido(id!, pedidoId, now);
        } else {
          // Offline: encolar update de entregas. El trigger del servidor reconciliará
          // inventario y status del pedido cuando sincronice.
          await queueOperation('entregas', 'update', {
            id: id!,
            status: 'hecho',
            validado_at: now,
            fecha_entrega: now,
          });
          toast.message('Sin conexión: entrega marcada localmente, se sincronizará');
        }
      }

      toast.success('¡Entrega completada!');
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['entregas'] });
      queryClient.invalidateQueries({ queryKey: ['entregas-list'] });
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-venta'] });
      queryClient.invalidateQueries({ queryKey: ['venta'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['logistica-pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['stock-almacen'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      if (goToCobrarAfter && pedidoId) {
        navigate(`/ruta/ventas/${pedidoId}`);
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const marcarNoEntregado = async () => {
    const motivo = (motivoSeleccionado === 'Otro' ? motivoCustom : motivoSeleccionado).trim();
    if (!motivo) { toast.error('Selecciona o escribe un motivo'); return; }
    setSavingNoEntregado(true);
    try {
      const now = new Date().toISOString();
      const nuevaNota = `No entregado: ${motivo}`;
      const notasFinales = entrega.notas ? `${entrega.notas}\n${nuevaNota}` : nuevaNota;
      const payload = {
        id: id!,
        status: 'no_entregado',
        motivo_no_entrega: motivo,
        notas: notasFinales,
        fecha_entrega: now,
        validado_at: now,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from('entregas').update(payload as any).eq('id', id!);
        if (error) throw error;
      } else {
        await queueOperation('entregas', 'update', payload);
        toast.message('Sin conexión: guardado localmente, se sincronizará');
      }
      toast.success('Entrega marcada como no entregada');
      setShowNoEntregadoModal(false);
      setMotivoSeleccionado('');
      setMotivoCustom('');
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['entregas'] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSavingNoEntregado(false); }
  };

  const reprogramarFecha = async () => {
    if (!nuevaFecha) { toast.error('Selecciona una fecha'); return; }
    setSavingReprog(true);
    try {
      const payload = { id: id!, fecha: nuevaFecha };
      if (navigator.onLine) {
        const { error } = await supabase.from('entregas').update({ fecha: nuevaFecha } as any).eq('id', id!);
        if (error) throw error;
      } else {
        await queueOperation('entregas', 'update', payload);
        toast.message('Sin conexión: reprogramada localmente, se sincronizará');
      }
      toast.success('Entrega reprogramada');
      setShowReprogramarModal(false);
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['entregas'] });
      queryClient.invalidateQueries({ queryKey: ['entregas-list'] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSavingReprog(false); }
  };

  const openEditLinea = (l: any) => {
    setEditLinea(l);
    setEditCantidad(Number(l.cantidad_entregada) || 0);
    setEditMotivo(l.motivo_no_entrega ?? '');
  };

  const guardarLineaEditada = async () => {
    if (!editLinea) return;
    const cargada = Number(editLinea.cantidad_entregada) || 0;
    const nueva = Math.max(0, Math.min(editCantidad, cargada));
    const quitada = cargada - nueva;
    if (quitada <= 0) { setEditLinea(null); return; }
    const motivo = editMotivo.trim();
    if (!motivo) { toast.error('Indica el motivo por el que se quita el producto'); return; }
    setSavingLinea(true);
    try {
      // Reducir cantidad_entregada deja el producto en el camión (no se descuenta
      // del inventario al marcar 'hecho', porque el trigger descuenta por
      // cantidad_entregada). Registramos el motivo por línea.
      const payload = {
        id: editLinea.id,
        cantidad_entregada: nueva,
        hecho: nueva > 0,
        motivo_no_entrega: motivo,
      };
      if (navigator.onLine) {
        const { error } = await supabase.from('entrega_lineas').update({
          cantidad_entregada: nueva,
          hecho: nueva > 0,
          motivo_no_entrega: motivo,
        } as any).eq('id', editLinea.id);
        if (error) throw error;
      } else {
        await queueOperation('entrega_lineas', 'update', payload);
        toast.message('Sin conexión: cambio guardado localmente, se sincronizará');
      }
      const prod = editLinea.productos?.nombre ?? 'Producto';
      toast.success(nueva === 0
        ? `${prod} quitado de la entrega (regresa al camión)`
        : `${prod}: ${quitada} ${quitada === 1 ? 'pieza' : 'piezas'} regresan al camión`);
      setEditLinea(null);
      queryClient.invalidateQueries({ queryKey: ['ruta-entrega-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['entregas'] });
      queryClient.invalidateQueries({ queryKey: ['entregas-list'] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSavingLinea(false); }
  };

  const getTicketData = (): TicketData | null => {
    const e = empresa as any;
    if (!e) return null;
    const empresaData = {
      nombre: e?.nombre ?? '', rfc: e?.rfc ?? null, razon_social: e?.razon_social ?? null,
      telefono: e?.telefono ?? null, direccion: e?.direccion ?? null, colonia: e?.colonia ?? null,
      ciudad: e?.ciudad ?? null, estado: e?.estado ?? null, cp: e?.cp ?? null,
      email: e?.email ?? null, logo_url: e?.logo_url ?? null, moneda: e?.moneda ?? 'MXN',
      notas_ticket: e?.notas_ticket ?? null, ticket_campos: e?.ticket_campos ?? null,
    };

    // Build ticket only with lines that were surtidas in THIS delivery.
    const surtidoPorProd = new Map<string, number>();
    for (const l of lineasSurtidas) {
      surtidoPorProd.set(l.producto_id, (surtidoPorProd.get(l.producto_id) ?? 0) + (Number(l.cantidad_entregada) || 0));
    }

    if (venta) {
      const lineasTicket = ventaLineas
        .filter((l: any) => (surtidoPorProd.get(l.producto_id) ?? 0) > 0)
        .map((l: any) => {
          const pedida = Number(l.cantidad) || 0;
          const surtida = surtidoPorProd.get(l.producto_id) ?? 0;
          const ratio = pedida > 0 ? surtida / pedida : 1;
          return {
            nombre: l.productos?.nombre ?? l.descripcion ?? '—',
            cantidad: surtida,
            precio: l.precio_unitario ?? 0,
            total: Number(l.total ?? 0) * ratio,
            iva_monto: Number(l.iva_monto ?? 0) * ratio,
            ieps_monto: Number(l.ieps_monto ?? 0) * ratio,
            descuento_pct: l.descuento_porcentaje ?? l.descuento_pct ?? 0,
            producto_id: l.producto_id,
          };
        });
      return {
        empresa: empresaData,
        folio: venta.folio ?? 'Sin folio',
        fecha: fmtDate(venta.fecha),
        clienteNombre,
        lineas: lineasTicket,
        subtotal: entregaTotals.subtotal, iva: entregaTotals.iva,
        ieps: entregaTotals.ieps, total: entregaTotal,
        condicionPago: venta.condicion_pago,
        metodoPago: (venta as any).metodo_pago ?? undefined,
        saldoNuevo: ventaSaldo > 0 ? ventaSaldo : undefined,
        promociones: ((venta as any).venta_promociones ?? []).filter((p: any) => (p.descuento ?? 0) > 0).map((p: any) => ({
          descripcion: p.descripcion ?? p.nombre ?? '', descuento: p.descuento ?? 0, producto_id: p.producto_id,
        })),
        devoluciones: (devolucionesVenta ?? []).map((d: any) => ({
          nombre: d.producto?.nombre ?? 'Producto',
          cantidad: Number(d.cantidad) || 0,
          motivo: d.motivo,
          accion: d.accion,
          monto: Number(d.monto_credito ?? 0) || 0,
        })),
      };
    }

    // Fallback: build ticket from entrega lines (surtidas only)
    return {
      empresa: empresaData,
      folio: entrega.folio ?? 'Sin folio',
      fecha: fmtDate(entrega.fecha),
      clienteNombre,
      lineas: lineasSurtidas.map((l: any) => {
        const precio = l.productos?.precio_principal ?? 0;
        const cant = Number(l.cantidad_entregada) || 0;
        return {
          nombre: l.productos?.nombre ?? '—',
          cantidad: cant, precio, total: precio * cant,
          iva_monto: 0, ieps_monto: 0, descuento_pct: 0,
          producto_id: l.producto_id,
        };
      }),
      subtotal: entregaTotal, iva: 0, ieps: 0, total: entregaTotal,
    };
  };

  const ticketAncho = (empresa as any)?.ticket_ancho ?? '80';

  const handlePrintTicket = async () => {
    const td = getTicketData();
    if (!td) { toast.error('No hay datos para imprimir'); return; }
    await printTicket(td, { ticketAncho });
  };

  const handleDownloadTicket = async () => {
    let td = getTicketData();
    if (!td) { toast.error('No hay datos para descargar'); return; }
    if (td.empresa.logo_url && !td.empresa.logo_url.startsWith('data:')) {
      try {
        const resp = await fetch(td.empresa.logo_url, { mode: 'cors' });
        const blob = await resp.blob();
        td = { ...td, empresa: { ...td.empresa, logo_url: await new Promise<string>((res) => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(blob); }) } };
      } catch { td = { ...td, empresa: { ...td.empresa, logo_url: null } }; }
    }
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0';
    container.innerHTML = buildTicketHTML(td, { ticketAncho });
    document.body.appendChild(container);
    try {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
      const dataUrl = await toPng(container.firstElementChild as HTMLElement, { cacheBust: true, pixelRatio: 3, backgroundColor: '#ffffff' });
      const a = document.createElement('a'); a.href = dataUrl; a.download = `entrega-${entrega.folio ?? id}.png`; a.click();
      toast.success('Ticket descargado');
    } catch { toast.error('Error generando imagen'); }
    finally { document.body.removeChild(container); }
  };

  const handleShareTicket = async () => {
    const td = getTicketData();
    if (!td) return;
    const fmtM = (n: number) => `${fmt(n)}`;
    const text = [
      td.empresa.nombre, td.empresa.rfc ? `RFC: ${td.empresa.rfc}` : '', td.empresa.direccion ?? '',
      '─'.repeat(30), `Folio: ${td.folio}`, `Fecha: ${td.fecha}`, `Cliente: ${td.clienteNombre}`,
      '─'.repeat(30),
      ...td.lineas.map(l => `${l.cantidad}x ${l.nombre} ${fmtM(l.total)}`),
      '─'.repeat(30),
      `Sub total: ${fmtM(td.subtotal)}`,
      `Descuentos: ${fmtM(td.descuento ?? 0)}`,
      `Impuestos: ${fmtM((td.iva ?? 0) + (td.ieps ?? 0))}`,
      `Total pagado: ${fmtM(td.total)}`,
      `Saldo: ${fmtM(td.saldoNuevo ?? 0)}`,
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: `Ticket ${td.folio}`, text }); } catch { }
    } else {
      await navigator.clipboard.writeText(text); toast.success('Copiado al portapapeles');
    }
  };

  const handleWhatsAppSend = async () => {
    if (!waPhone.trim()) return;
    const td = getTicketData();
    if (!td) { toast.error('No hay datos'); return; }
    setSendingWA(true);
    try {
      const { sendReceiptWhatsApp } = await import('@/lib/whatsappReceipt');
      const result = await sendReceiptWhatsApp({ data: td, empresaId: empresa?.id ?? '', phone: waPhone, referencia_id: venta?.id ?? id ?? '' });
      if (result.success) { toast.success('Enviado por WhatsApp'); setShowWADialog(false); } else toast.error(result.error || 'Error');
    } catch (err: any) { toast.error(err.message); }
    finally { setSendingWA(false); }
  };

  const handleEstadoCuenta = async () => {
    if (!empresa || !cliente) { toast.error('Cargando datos...'); return; }
    try {
      const [ventasRes, cobrosRes] = await Promise.all([
        supabase.from('ventas').select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).neq('status', 'cancelado').order('fecha', { ascending: false }).limit(200),
        supabase.from('cobros').select('id, fecha, monto, metodo_pago, referencia').eq('cliente_id', clienteId!).eq('empresa_id', empresa.id).neq('status', 'cancelado').order('fecha', { ascending: false }).limit(200),
      ]);
      const blob = await generarEstadoCuentaPdf({
        empresa: { nombre: empresa.nombre, razon_social: empresa.razon_social ?? undefined, rfc: empresa.rfc ?? undefined, direccion: empresa.direccion ?? undefined, telefono: empresa.telefono ?? undefined, email: empresa.email ?? undefined, logo_url: empresa.logo_url ?? undefined },
        cliente: { nombre: cliente.nombre, telefono: cliente.telefono ?? undefined, credito: cliente.credito ?? false, limite_credito: cliente.limite_credito ?? 0, dias_credito: cliente.dias_credito ?? 0 },
        ventas: (ventasRes.data ?? []).map(v => ({ folio: v.folio ?? '—', fecha: v.fecha, total: v.total ?? 0, saldo_pendiente: v.saldo_pendiente ?? 0, status: v.status, condicion_pago: v.condicion_pago })),
        cobros: (cobrosRes.data ?? []).map(c => ({ fecha: c.fecha, monto: c.monto ?? 0, metodo_pago: c.metodo_pago, referencia: c.referencia ?? undefined })),
      });
      setEcPdfBlob(blob); setShowEcPreview(true);
    } catch { toast.error('Error generando estado de cuenta'); }
  };

  const goToCobrar = () => {
    if (!pedidoId) { toast.error('No hay pedido asociado'); return; }
    navigate(`/ruta/ventas/${pedidoId}`);
  };

  const totalSaldoPendiente = (otrasPendientes ?? []).reduce((acc, v) => acc + (v.saldo_pendiente ?? 0), 0);

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1"><ArrowLeft className="h-5 w-5 text-foreground" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground truncate">{entrega.folio ?? 'Entrega'}</h1>
          <p className="text-[11px] text-muted-foreground">Entrega de pedido</p>
        </div>
        <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0', statusColors[entrega.status] ?? '')}>
          {entrega.status === 'hecho' ? 'Entregado' : entrega.status === 'no_entregado' ? 'No entregado' : entrega.status === 'en_ruta' ? 'En ruta' : entrega.status}
        </span>
      </div>

      {showWADialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowWADialog(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-[15px] font-bold text-foreground">Enviar por WhatsApp</h3><button onClick={() => setShowWADialog(false)} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button></div>
            <div className="space-y-1.5"><label className="text-[11px] text-muted-foreground font-medium">Número de WhatsApp</label><input type="tel" inputMode="tel" className="w-full bg-accent/40 rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={waPhone} placeholder="521234567890" onChange={e => setWaPhone(e.target.value)} /></div>
            <button onClick={handleWhatsAppSend} disabled={sendingWA || !waPhone.trim()} className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40">{sendingWA ? 'Enviando...' : <><MessageCircle className="h-4 w-4" /> Enviar</>}</button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 pb-28">
        <div className="grid grid-cols-5 gap-1">
          {[
            { icon: MessageCircle, label: 'WhatsApp', color: 'text-[#25D366]', onClick: () => { setWaPhone(cliente?.telefono ?? ''); setShowWADialog(true); }, disabled: false },
            { icon: Download, label: 'Descargar', color: 'text-primary', onClick: handleDownloadTicket, disabled: false },
            { icon: Printer, label: 'Imprimir', color: 'text-primary', onClick: handlePrintTicket, disabled: false },
            { icon: Share2, label: 'Compartir', color: 'text-primary', onClick: handleShareTicket, disabled: false },
            { icon: Receipt, label: 'Edo. Cuenta', color: 'text-primary', onClick: handleEstadoCuenta, disabled: !cliente },
          ].map(a => (
            <button key={a.label} onClick={a.onClick} disabled={a.disabled}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-card border border-border active:scale-95 transition-transform disabled:opacity-40">
              <a.icon className={`h-5 w-5 ${a.color}`} />
              <span className="text-[10px] font-medium text-foreground leading-tight">{a.label}</span>
            </button>
          ))}
        </div>

        {venta && (
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[11px] text-muted-foreground mb-1">Total de esta entrega</p>
            <p className="text-[28px] font-bold text-foreground">{fmt(entregaTotal)}</p>
            {entregaTotal < ventaTotal - 0.005 && (
              <p className="text-[11px] text-muted-foreground mt-1">Pedido original: {fmt(ventaTotal)}</p>
            )}
            {ventaSaldo > 0 && <p className="text-[12px] text-destructive font-medium mt-1">Saldo pendiente: {fmt(ventaSaldo)}</p>}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          <div className="flex items-center gap-3 px-4 py-3"><User className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Cliente</span><span className="text-[13px] font-medium text-foreground truncate">{clienteNombre}</span></div>
          {(cliente?.direccion || cliente?.colonia) && (
            <div className="flex items-center gap-3 px-4 py-3"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Dirección</span><span className="text-[13px] font-medium text-foreground truncate">{[cliente?.direccion, cliente?.colonia].filter(Boolean).join(', ')}</span></div>
          )}
          <div className="flex items-center gap-3 px-4 py-3">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-[12px] text-muted-foreground w-20 shrink-0">Fecha</span>
            <span className="text-[13px] font-medium text-foreground flex-1">{fmtDate(entrega.fecha)}</span>
            {!isClosedState && (
              <button
                onClick={() => { setNuevaFecha(entrega.fecha ?? ''); setShowReprogramarModal(true); }}
                className="text-[11px] font-medium text-primary px-2 py-1 rounded-md border border-primary/30 active:bg-primary/10 flex items-center gap-1"
              >
                <CalendarClock className="h-3 w-3" /> Reprogramar
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-3"><Truck className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Vendedor</span><span className="text-[13px] font-medium text-foreground truncate">{vendedorNombre}</span></div>
          {venta && (
            <div className="flex items-center gap-3 px-4 py-3"><FileText className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Pedido</span><span className="text-[13px] font-medium text-primary truncate">{venta.folio ?? '—'}</span></div>
          )}
          {venta?.condicion_pago && (
            <div className="flex items-center gap-3 px-4 py-3"><Banknote className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-[12px] text-muted-foreground w-20 shrink-0">Pago</span><span className="text-[13px] font-medium text-foreground capitalize">{venta.condicion_pago}</span></div>
          )}
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Productos ({lineasSurtidas.length})</h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {lineasSurtidas.length === 0 && <p className="text-muted-foreground text-[12px] p-4 text-center">Sin productos surtidos</p>}
            {lineasSurtidas.map((l: any) => {
              const prod = l.productos;
              const vl = ventaLineas.find((vl: any) => vl.producto_id === l.producto_id);
              const precio = vl?.precio_unitario ?? prod?.precio_principal ?? 0;
              const cant = Number(l.cantidad_entregada) || 0;
              const pedida = Number(vl?.cantidad) || 0;
              const ratio = pedida > 0 ? cant / pedida : 1;
              const total = vl ? Number(vl.total ?? precio * cant) * (pedida > 0 ? ratio : 1) : precio * cant;
              const pedidaLinea = Number(vl?.cantidad ?? l.cantidad) || 0;
              const reducida = pedidaLinea > 0 && cant < pedidaLinea;
              return (
                <div key={l.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{prod?.nombre ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{cant} × {fmt(precio)}</p>
                      {reducida && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          Pedido {pedidaLinea} · se entregan {cant}
                          {l.motivo_no_entrega ? ` · ${l.motivo_no_entrega}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-[14px] font-bold text-foreground">{fmt(total)}</p>
                        {l.hecho && <span className="text-[9px] text-green-600 font-medium">✓ Surtido</span>}
                      </div>
                      {canEditEntrega && !isClosedState && (
                        <button
                          onClick={() => openEditLinea(l)}
                          title="Quitar o reducir este producto"
                          className="p-1.5 rounded-lg border border-border text-muted-foreground active:bg-accent active:scale-95 transition-transform">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {lineasNoSurtidas > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
              {lineasNoSurtidas} producto{lineasNoSurtidas === 1 ? '' : 's'} sin surtir no se {lineasNoSurtidas === 1 ? 'incluye' : 'incluyen'} en esta entrega
            </p>
          )}
        </div>

        {venta && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Totales</span>
              <button onClick={() => setShowTax(!showTax)} className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${showTax ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {showTax ? 'Con impuestos' : 'Sin impuestos'}
              </button>
            </div>
            {showTax && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">Subtotal</span><span className="text-[13px] text-foreground">{fmt(entregaTotals.subtotal)}</span></div>}
            {showTax && entregaTotals.iva > 0 && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">IVA</span><span className="text-[13px] text-foreground">{fmt(entregaTotals.iva)}</span></div>}
            {showTax && entregaTotals.ieps > 0 && <div className="flex justify-between"><span className="text-[12px] text-muted-foreground">IEPS</span><span className="text-[13px] text-foreground">{fmt(entregaTotals.ieps)}</span></div>}
            <div className="border-t border-border pt-2 flex justify-between"><span className="text-[14px] font-bold text-foreground">Total</span><span className="text-[14px] font-bold text-foreground">{fmt(entregaTotal)}</span></div>
          </div>
        )}

        {totalSaldoPendiente > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-destructive mb-2">Cuentas pendientes del cliente</p>
            <div className="space-y-1.5">
              {(otrasPendientes ?? []).filter(v => (v.saldo_pendiente ?? 0) > 0).slice(0, 5).map(v => (
                <div key={v.id} className="flex justify-between text-[12px]">
                  <span className="text-foreground">{v.folio ?? '—'} <span className="text-muted-foreground">({fmtDate(v.fecha)})</span></span>
                  <span className="font-medium text-destructive">{fmt(v.saldo_pendiente ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-destructive/20 mt-2 pt-2 flex justify-between">
              <span className="text-[12px] font-semibold text-foreground">Total pendiente</span>
              <span className="text-[13px] font-bold text-destructive">{fmt(totalSaldoPendiente)}</span>
            </div>
          </div>
        )}

        {isNoEntregado && (entrega as any).motivo_no_entrega && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Motivo de no entrega
            </p>
            <p className="text-[13px] font-medium text-foreground">{(entrega as any).motivo_no_entrega}</p>
          </div>
        )}

        {entrega.notas && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11px] text-muted-foreground mb-1">Notas</p>
            <p className="text-[13px] text-foreground whitespace-pre-line">{entrega.notas}</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="flex flex-col gap-2">
          {totalSaldoPendiente > 0 && !isClosedState && (
            <button onClick={goToCobrar}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-semibold active:scale-[0.98] shadow-lg flex items-center justify-center gap-1.5">
              <Banknote className="h-4 w-4" /> Cobrar {fmt(totalSaldoPendiente)}
            </button>
          )}
          {isClosedState ? (
            <button onClick={goToCobrar}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] shadow-lg flex items-center justify-center gap-1.5">
              <FileText className="h-5 w-5" /> Ver pedido
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setShowNoEntregadoModal(true)} disabled={saving}
                className="flex-1 bg-card border border-destructive/40 text-destructive rounded-xl py-3.5 text-[13px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                <XCircle className="h-4 w-4" /> No entregado
              </button>
              <button onClick={handleMarcarClick} disabled={saving}
                className="flex-1 bg-success text-success-foreground rounded-xl py-3.5 text-[14px] font-bold active:scale-[0.98] shadow-lg shadow-success/20 flex items-center justify-center gap-1.5 disabled:opacity-40">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {saving ? 'Entregando...' : 'Marcar entregado'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showCobrarPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowCobrarPrompt(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-foreground">Saldo pendiente</h3>
              <button onClick={() => setShowCobrarPrompt(false)} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Este cliente tiene un saldo pendiente de <span className="font-bold text-destructive">{fmt(Math.max(ventaSaldo, totalSaldoPendiente))}</span>.
              ¿Deseas cobrarlo ahora o marcar como entregado y cobrar después?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { setShowCobrarPrompt(false); void marcarEntregado(true); }}
                disabled={saving}
                className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                <Banknote className="h-4 w-4" /> Entregar y cobrar
              </button>
              <button
                onClick={() => { setShowCobrarPrompt(false); void marcarEntregado(false); }}
                disabled={saving}
                className="w-full bg-success text-success-foreground rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                <Check className="h-4 w-4" /> Solo entregar (cobrar después)
              </button>
              <button
                onClick={() => setShowCobrarPrompt(false)}
                className="w-full bg-card border border-border text-muted-foreground rounded-xl py-2.5 text-[13px] font-medium">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoEntregadoModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !savingNoEntregado && setShowNoEntregadoModal(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> No entregado</h3>
              <button onClick={() => setShowNoEntregadoModal(false)} disabled={savingNoEntregado} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <p className="text-[12px] text-muted-foreground">Selecciona el motivo por el cual no se pudo entregar este pedido.</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_NO_ENTREGA.map(m => (
                <button key={m} onClick={() => { setMotivoSeleccionado(m); setMotivoCustom(''); }}
                  className={cn("px-3 py-2.5 rounded-lg text-[12px] font-medium border transition-colors text-left",
                    motivoSeleccionado === m ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border active:bg-accent")}>
                  {m}
                </button>
              ))}
              <button onClick={() => setMotivoSeleccionado('Otro')}
                className={cn("px-3 py-2.5 rounded-lg text-[12px] font-medium border transition-colors text-left col-span-2",
                  motivoSeleccionado === 'Otro' ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border active:bg-accent")}>
                Otro motivo…
              </button>
            </div>
            {motivoSeleccionado === 'Otro' && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">Describe el motivo</label>
                <textarea value={motivoCustom} onChange={e => setMotivoCustom(e.target.value)} rows={3} placeholder="Escribe el motivo…"
                  className="w-full bg-accent/40 rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNoEntregadoModal(false)} disabled={savingNoEntregado}
                className="flex-1 bg-card border border-border text-muted-foreground rounded-xl py-2.5 text-[13px] font-medium">Cancelar</button>
              <button onClick={marcarNoEntregado}
                disabled={savingNoEntregado || !motivoSeleccionado || (motivoSeleccionado === 'Otro' && !motivoCustom.trim())}
                className="flex-1 bg-destructive text-destructive-foreground rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                {savingNoEntregado ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showReprogramarModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !savingReprog && setShowReprogramarModal(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Reprogramar entrega</h3>
              <button onClick={() => setShowReprogramarModal(false)} disabled={savingReprog} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <p className="text-[12px] text-muted-foreground">Selecciona la nueva fecha de entrega.</p>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground font-medium">Nueva fecha</label>
              <input
                type="date"
                value={nuevaFecha}
                onChange={e => setNuevaFecha(e.target.value)}
                className="w-full bg-accent/40 rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowReprogramarModal(false)} disabled={savingReprog}
                className="flex-1 bg-card border border-border text-muted-foreground rounded-xl py-2.5 text-[13px] font-medium">Cancelar</button>
              <button onClick={reprogramarFecha} disabled={savingReprog || !nuevaFecha}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                {savingReprog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {editLinea && (() => {
        const cargada = Number(editLinea.cantidad_entregada) || 0;
        const nueva = Math.max(0, Math.min(editCantidad, cargada));
        const quitada = cargada - nueva;
        return (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !savingLinea && setEditLinea(null)}>
            <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2"><PackageX className="h-4 w-4 text-amber-500" /> Quitar producto</h3>
                <button onClick={() => setEditLinea(null)} disabled={savingLinea} className="p-1"><X className="h-4 w-4 text-muted-foreground" /></button>
              </div>
              <div>
                <p className="text-[14px] font-medium text-foreground">{editLinea.productos?.nombre ?? '—'}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">El cliente rechazó parte o todo este producto. Lo que quites regresa al camión y no se cobra.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Cantidad a entregar</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditCantidad(Math.max(0, nueva - 1))}
                    disabled={nueva <= 0}
                    className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-foreground active:bg-accent disabled:opacity-30">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-[18px] font-bold text-foreground w-8 text-center">{nueva}</span>
                  <button
                    onClick={() => setEditCantidad(Math.min(cargada, nueva + 1))}
                    disabled={nueva >= cargada}
                    className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-foreground active:bg-accent disabled:opacity-30">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <button onClick={() => setEditCantidad(0)} className="text-amber-600 dark:text-amber-400 font-medium">Quitar todo ({cargada})</button>
                <span className="text-muted-foreground">Cargado: {cargada}{quitada > 0 ? ` · regresan ${quitada}` : ''}</span>
              </div>
              {quitada > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Motivo</label>
                  <input
                    type="text"
                    value={editMotivo}
                    onChange={e => setEditMotivo(e.target.value)}
                    placeholder="Ej. cliente no lo quiso, producto dañado…"
                    className="w-full bg-accent/40 rounded-lg px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40" />
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditLinea(null)} disabled={savingLinea}
                  className="flex-1 bg-card border border-border text-muted-foreground rounded-xl py-2.5 text-[13px] font-medium">Cancelar</button>
                <button onClick={guardarLineaEditada} disabled={savingLinea || quitada <= 0 || !editMotivo.trim()}
                  className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40">
                  {savingLinea ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <DocumentPreviewModal open={showEcPreview} onClose={() => setShowEcPreview(false)} pdfBlob={ecPdfBlob} fileName={`Estado-Cuenta-${clienteNombre.replace(/\s+/g, '-')}.pdf`} empresaId={empresa?.id ?? ''} defaultPhone={cliente?.telefono ?? ''} caption={`Estado de cuenta - ${clienteNombre}`} tipo="estado_cuenta" />
    </div>
  );
}
