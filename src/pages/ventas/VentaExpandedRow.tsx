import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Pencil, Trash2, ChevronUp, FileText, Printer, MessageCircle, Loader2, Banknote, Ban, Check, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { CONDICION_LABELS } from './ventasConstants';
import { generateVentaPdfById } from '@/lib/ventaPdfFromId';
import { printTicket, buildTicketDataFromVenta } from '@/lib/printTicketUtil';
import { usePromocionesActivas, evaluatePromociones, type CartItemForPromo } from '@/hooks/usePromociones';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import WhatsAppPreviewDialog from '@/components/WhatsAppPreviewDialog';
import { phoneWithLada } from '@/lib/phoneWithLada';

import { toast } from 'sonner';
import { ProductoLink } from '@/components/links/EntityLinks';
import { VentaCobroQuickModal } from '@/components/venta/VentaCobroQuickModal';
import { CerrarPedidoButton } from '@/components/venta/CerrarPedidoButton';
import { usePermisos } from '@/hooks/usePermisos';

import { saldoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';
import { computeResumenFromLineas } from '@/lib/ventaResumen';

interface Props {
  venta: any;
  fmt: (v: number | null | undefined) => string;
  canDelete: boolean;
  onDeleteTarget: (id: string) => void;
  onCancelTarget?: (id: string) => void;
  onCollapse: () => void;
  empresaId?: string;
  empresa?: any;
  clientesList?: any[];
  productosList?: any[];
  colSpan?: number;
}

export function VentaExpandedRow({ venta, fmt, canDelete, onDeleteTarget, onCancelTarget, onCollapse, empresaId, empresa, clientesList, productosList, colSpan = 13 }: Props) {
  const navigate = useNavigate();
  const { hasPermiso } = usePermisos();

  const [lineas, setLineas] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [cobradores, setCobradores] = useState<Record<string, string>>({});
  const [ventaListaNombre, setVentaListaNombre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entregadoPorProd, setEntregadoPorProd] = useState<Record<string, number>>({});
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [pdfCaption, setPdfCaption] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waPdfBlob, setWaPdfBlob] = useState<Blob | null>(null);
  const [waPdfName, setWaPdfName] = useState('');
  const [generatingWa, setGeneratingWa] = useState(false);
  const [printingTicket, setPrintingTicket] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { data: promocionesActivas } = usePromocionesActivas();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const eidLoad = empresaId || venta.empresa_id;
      const [lRes, pRes, tRes, cRes, plRes] = await Promise.all([
        supabase
          .from('venta_lineas')
          .select('id, cantidad, precio_unitario, precio_lista_unitario, descuento_pct, descuento_promocion_monto, descuento_manual_monto, subtotal, iva_pct, iva_monto, ieps_pct, ieps_monto, total, producto_id, unidad_id, lista_precio_id, precio_manual, productos(nombre, es_granel, unidad_granel, unidades_venta:unidades!unidad_venta_id(abreviatura, nombre)), unidades(abreviatura, nombre), lista_precios(nombre, es_principal)')
          .eq('venta_id', venta.id)
          .order('created_at'),
        supabase
          .from('cobro_aplicaciones')
          .select('id, monto_aplicado, cobros(fecha, metodo_pago, referencia, status, user_id)')
          .eq('venta_id', venta.id)
          .order('created_at'),
        venta.tarifa_id
          ? supabase.from('tarifas').select('nombre').eq('id', venta.tarifa_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        // Lista de precio asignada al cliente (las ventas de ruta no guardan
        // lista_precio_id por línea, así que sin esto la columna "Lista" queda vacía).
        venta.cliente_id
          ? supabase.from('clientes').select('lista_precios(nombre)').eq('id', venta.cliente_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        // Último respaldo: la lista principal de la empresa.
        eidLoad
          ? supabase.from('lista_precios').select('nombre').eq('empresa_id', eidLoad).eq('es_principal', true).eq('activa', true).order('created_at').limit(1)
          : Promise.resolve({ data: null } as any),
      ]);
      if (!cancelled) {
        setLineas(lRes.data ?? []);
        const pagosData = pRes.data ?? [];
        setPagos(pagosData);
        // Resolver el nombre de quien registró cada pago (cobros.user_id → profiles.nombre).
        // No hay FK directa cobros→profiles, por eso se resuelve aparte.
        const cobradorUids = Array.from(new Set(pagosData.map((p: any) => p.cobros?.user_id).filter(Boolean))) as string[];
        if (cobradorUids.length) {
          const { data: cobProfs } = await supabase
            .from('profiles').select('user_id, nombre')
            .eq('empresa_id', eidLoad).in('user_id', cobradorUids);
          const cmap: Record<string, string> = {};
          (cobProfs ?? []).forEach((pr: any) => { if (pr.user_id && !cmap[pr.user_id]) cmap[pr.user_id] = pr.nombre ?? '—'; });
          if (!cancelled) setCobradores(cmap);
        } else {
          setCobradores({});
        }
        // Cadena de respaldo del NOMBRE DE LISTA (columna "Lista"). Debe ser una
        // lista de precio, no una tarifa: lista asignada al cliente
        // (clientes.lista_precio_id) → lista principal de la empresa → como
        // último recurso el nombre de la tarifa de la venta.
        const clienteListaNombre = (cRes as any)?.data?.lista_precios?.nombre ?? null;
        const principalNombre = (plRes as any)?.data?.[0]?.nombre ?? null;
        const tarifaNombre = (tRes as any)?.data?.nombre ?? null;
        setVentaListaNombre(clienteListaNombre ?? principalNombre ?? tarifaNombre ?? null);

        // Cantidades ENTREGADAS por producto (solo pedidos con entregas separadas).
        if (venta.tipo === 'pedido') {
          const { data: ents } = await (supabase as any)
            .from('entregas')
            .select('status, entrega_lineas(producto_id, cantidad_entregada)')
            .eq('pedido_id', venta.id);
          const map: Record<string, number> = {};
          for (const e of (ents ?? [])) {
            if (e.status !== 'hecho') continue;
            for (const el of (e.entrega_lineas ?? [])) {
              map[el.producto_id] = (map[el.producto_id] ?? 0) + Number(el.cantidad_entregada ?? 0);
            }
          }
          if (!cancelled) setEntregadoPorProd(map);
        } else {
          if (!cancelled) setEntregadoPorProd({});
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [venta.id, venta.tarifa_id, reloadKey]);

  const clienteNombre = venta.clientes?.nombre || (venta.cliente_id ? '—' : 'Público en general');
  const eId = empresaId || venta.empresa_id;

  // Resumen VISUAL reconstruido desde las líneas (misma lógica que usa la lista):
  // Subtotal sin impuestos → Descuentos → Subtotal gravable → IVA/IEPS por
  // separado → Total. No cambia ningún dato guardado.
  const resumen = useMemo(() => computeResumenFromLineas(lineas), [lineas]);
  const totalReal = Number(venta.total) || 0;
  const pagado = Math.max(0, totalEfectivoVenta(venta) - saldoRealVenta(venta));
  const saldoPend = saldoRealVenta(venta);

  // Promociones aplicadas al carrito (para el badge por línea y la tarjeta).
  const promoResults = useMemo(() => {
    if (!promocionesActivas || lineas.length === 0) return [] as any[];
    const cart: CartItemForPromo[] = lineas.filter((l: any) => l.producto_id).map((l: any) => {
      const prod: any = productosList?.find((p: any) => p.id === l.producto_id);
      return {
        producto_id: l.producto_id,
        clasificacion_id: prod?.clasificacion_id ?? undefined,
        precio_unitario: Number(l.precio_unitario) || 0,
        cantidad: Number(l.cantidad) || 0,
      };
    });
    if (cart.length === 0) return [] as any[];
    return evaluatePromociones(promocionesActivas as any, cart, venta.cliente_id ?? undefined, undefined, (empresa as any)?.zona_horaria);
  }, [promocionesActivas, lineas, productosList, venta.cliente_id, empresa]);

  const promosConDescuento = promoResults.filter((r: any) => (Number(r.descuento) || 0) > 0 || r.tipo === 'producto_gratis');

  // Valores de display: impuestos y gravable derivados del TOTAL real (siempre
  // cuadran); el descuento toma el mayor entre líneas, promo en vivo, promo
  // guardada y el del encabezado — así el "gratis" aparece aunque no esté en las
  // líneas guardadas.
  const ivaMontoV = Number(venta.iva_total) || 0;
  const iepsMontoV = Number(venta.ieps_total) || 0;
  const gravableDisp = Math.max(0, totalReal - ivaMontoV - iepsMontoV);
  const promoLive = promoResults.reduce((s: number, pr: any) => s + (Number(pr.descuento) || 0), 0);
  const promoAplicada = (venta.promocion_aplicada ?? []).reduce((s: number, p: any) => s + (Number(p?.descuento_aplicado) || 0), 0);
  // Mismas columnas y mismo orden de redondeo que VentaLineasTab/VentaTotals:
  // precio_lista_unitario × cantidad por línea, redondeado antes de sumar.
  const r2v = (n: number) => Math.round(n * 100) / 100;
  const subtotalNetoGuardado = r2v(lineas.reduce((s: number, l: any) => {
    const lista = Number(l.precio_lista_unitario);
    const qty = Number(l.cantidad) || 0;
    return s + (Number.isFinite(lista) ? r2v(lista * qty) : 0);
  }, 0));
  const descuentoNetoGuardado = r2v(lineas.reduce((s: number, l: any) => {
    const desc = (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0);
    if (desc <= 0) return s;
    const divisor = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
    return s + r2v(divisor > 0 ? desc / divisor : desc);
  }, 0));
  const promoGuardado = r2v(lineas.reduce((s: number, l: any) => s + (Number(l.descuento_promocion_monto) || 0), 0));
  const promoTotalBruto = promoGuardado > 0 ? promoGuardado : Math.max(promoLive, promoAplicada);
  const promoNeto = totalReal > 0 ? r2v(promoTotalBruto * (gravableDisp / totalReal)) : promoTotalBruto;
  const manualNeto = r2v(lineas.reduce((s: number, l: any) => {
    const desc = Number(l.descuento_manual_monto) || 0;
    if (desc <= 0) return s;
    const divisor = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
    return s + r2v(divisor > 0 ? desc / divisor : desc);
  }, 0));
  const descuentoCalc = r2v(promoNeto + manualNeto);
  const usarGuardado = subtotalNetoGuardado > 0;
  const sinImpDisp = usarGuardado ? subtotalNetoGuardado : r2v(gravableDisp + descuentoCalc);
  const descuentoDisp = usarGuardado
    ? (descuentoNetoGuardado > 0 ? descuentoNetoGuardado : r2v(sinImpDisp - gravableDisp))
    : (descuentoCalc > 0 ? descuentoCalc : Math.max(0, resumen.descuento));
  const gravableShown = usarGuardado ? r2v(sinImpDisp - descuentoDisp) : gravableDisp;


  // Etiqueta de promo por producto (línea gratis o con descuento).
  const promoPorProducto = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pr of promoResults as any[]) {
      const pid = pr.producto_gratis_id || pr.producto_id;
      if (!pid) continue;
      if (pr.tipo === 'producto_gratis') {
        map[pid] = `${pr.cantidad_gratis ?? 1}x gratis`;
      } else if (!map[pid]) {
        map[pid] = pr.descripcion || 'Promo';
      }
    }
    return map;
  }, [promoResults]);

  const handlePdf = async () => {
    setGeneratingPdf(true);
    try {
      const { blob, fileName, caption } = await generateVentaPdfById(venta.id, eId);
      setPdfBlob(blob);
      setPdfName(fileName);
      setPdfCaption(caption);
      setShowPdf(true);
    } catch (err: any) {
      toast.error(err.message || 'Error generando PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleTicket = async () => {
    setPrintingTicket(true);
    try {
      // Fetch devoluciones for this venta
      const { data: heads } = await supabase.from('devoluciones').select('id').eq('venta_id', venta.id);
      const devIds = (heads ?? []).map((h: any) => h.id);
      let devLineas: any[] = [];
      if (devIds.length > 0) {
        const { data } = await supabase
          .from('devolucion_lineas')
          .select('cantidad, motivo, accion, monto_credito, producto:productos!devolucion_lineas_producto_id_fkey(nombre)')
          .in('devolucion_id', devIds);
        devLineas = data ?? [];
      }
      // Compute promotions applied to this cart
      const cartForPromo: CartItemForPromo[] = lineas.filter((l: any) => l.producto_id).map((l: any) => {
        const prod: any = productosList?.find((p: any) => p.id === l.producto_id);
        return {
          producto_id: l.producto_id,
          clasificacion_id: prod?.clasificacion_id ?? undefined,
          precio_unitario: Number(l.precio_unitario) || 0,
          cantidad: Number(l.cantidad) || 0,
        };
      });
      const promoResults = (promocionesActivas && cartForPromo.length > 0)
        ? evaluatePromociones(promocionesActivas as any, cartForPromo, venta.cliente_id ?? undefined, undefined, (empresa as any)?.zona_horaria)
        : [];
      const td = buildTicketDataFromVenta({
        empresa: empresa ?? {},
        venta: {
          folio: venta.folio,
          // Usa la fecha de negocio (zona horaria de la empresa), no created_at
          // (UTC), que cerca de medianoche muestra otro día.
          fecha: fmtDate(venta.fecha ?? venta.created_at),
          subtotal: venta.subtotal,
          descuento_total: venta.descuento_total,
          iva_total: venta.iva_total,
          ieps_total: venta.ieps_total,
          total: venta.total,
          saldo_pendiente: venta.saldo_pendiente,
          condicion_pago: venta.condicion_pago,
          status: venta.status,
        },
        clienteNombre,
        clienteRfc: (venta.clientes as any)?.rfc ?? null,
        clienteTelefono: (venta.clientes as any)?.telefono ?? null,
        clienteDireccion: [(venta.clientes as any)?.direccion, (venta.clientes as any)?.colonia].filter(Boolean).join(', ') || null,
        vendedorNombre: venta.vendedores?.nombre ?? '',
        vendedorTelefono: (venta.vendedores as any)?.telefono ?? null,
        lineas: lineas.map((l: any) => ({
          nombre: (l.productos as any)?.nombre ?? '—',
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          total: l.total,
          iva_monto: l.iva_monto,
          ieps_monto: l.ieps_monto,
          descuento_pct: l.descuento_pct,
          producto_id: l.producto_id,
          precio_lista_unitario: l.precio_lista_unitario,
          descuento_promocion_monto: l.descuento_promocion_monto,
          descuento_manual_monto: l.descuento_manual_monto,
          iva_pct: l.iva_pct,
          ieps_pct: l.ieps_pct,
        })),
        pagos: pagos.map((p: any) => ({
          metodo: (p.cobros as any)?.metodo_pago ?? '',
          monto: p.monto_aplicado ?? 0,
          referencia: (p.cobros as any)?.referencia,
        })),
        devoluciones: devLineas.map((d: any) => ({
          nombre: d.producto?.nombre ?? 'Producto',
          cantidad: Number(d.cantidad) || 0,
          motivo: d.motivo,
          accion: d.accion,
          monto: Number(d.monto_credito ?? 0) || 0,
        })),
        promociones: promoResults.filter((r: any) => r.descuento > 0).map((r: any) => ({ descripcion: r.descripcion, descuento: r.descuento, producto_id: r.producto_id, tipo: r.tipo, cantidad_gratis: r.cantidad_gratis })),
      });
      await printTicket(td);
    } catch (err: any) {
      toast.error(err.message || 'Error imprimiendo ticket');
    } finally {
      setPrintingTicket(false);
    }
  };

  const handleWhatsApp = async () => {
    setGeneratingWa(true);
    try {
      const { blob, fileName, caption } = await generateVentaPdfById(venta.id, eId);
      const cliente = clientesList?.find(c => c.id === venta.cliente_id);
      setWaPdfBlob(blob);
      setWaPdfName(fileName);
      setWaPhone(phoneWithLada(cliente?.telefono, (cliente as any)?.lada, (empresa as any)?.lada || '52'));
      setWaMessage(caption);
      setWaOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Error generando PDF');
    } finally {
      setGeneratingWa(false);
    }
  };

  return (
    <>
      <tr>
        <td colSpan={colSpan} className="p-0">
          <div className="bg-card border-b border-border px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
            {/* Header: pegado al borde izquierdo aunque la tabla tenga scroll horizontal */}
            <div className="sticky left-0 w-fit max-w-full space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">



                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handlePdf} disabled={generatingPdf}>
                  {generatingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleTicket} disabled={printingTicket || loading}>
                  {printingTicket ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                  Ticket
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleWhatsApp} disabled={generatingWa}>
                  {generatingWa ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                  WhatsApp
                </Button>
                {venta.status !== 'borrador' && saldoRealVenta(venta) > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setCobroOpen(true)}>
                    <Banknote className="h-3 w-3" /> Cobrar
                  </Button>
                )}
                <CerrarPedidoButton venta={{ ...venta, venta_lineas: lineas }} fmt={(n) => fmt(n) ?? ''} compact />
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => navigate(`/ventas/${venta.id}`)}>
                  <Pencil className="h-3 w-3" /> Editar
                </Button>

                {onCancelTarget && canDelete && venta.status !== 'borrador' && venta.status !== 'cancelado' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive" onClick={() => onCancelTarget(venta.id)}>
                    <Ban className="h-3 w-3" /> Cancelar
                  </Button>
                )}
                {(venta.status === 'borrador' || (venta.status === 'cancelado' && canDelete)) && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1.5" onClick={() => onDeleteTarget(venta.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <button onClick={onCollapse} className="p-1 rounded hover:bg-accent text-muted-foreground">
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-muted-foreground py-2">Cargando detalles...</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
                {/* Columna izquierda: productos + pagos */}
                <div className="space-y-4 min-w-0">
                  {/* Líneas */}
                  <div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="text-left py-1 font-medium">Producto</th>
                            <th className="text-left py-1 font-medium">Lista</th>
                            <th className="text-right py-1 font-medium w-16">Precio base</th>
                            <th className="text-right py-1 font-medium w-12">Cant</th>
                            {venta.tipo === 'pedido' && <th className="text-right py-1 font-medium w-14">Entreg.</th>}
                            <th className="text-center py-1 font-medium w-10">Ud</th>
                            <th className="text-right py-1 font-medium w-12">Desc</th>
                            <th className="text-left py-1 font-medium w-20">Impuestos</th>
                            <th className="text-right py-1 font-medium w-20">Precio final</th>
                            <th className="text-center py-1 font-medium w-20">Promo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineas.map((l: any) => {
                            const dpct = Number(l.descuento_pct) || 0;
                            const neto = (Number(l.subtotal) || 0) * (1 - dpct / 100);
                            const ivaP = (Number(l.iva_monto) || 0) > 0 && neto > 0 ? Math.round((Number(l.iva_monto) / neto) * 100) : 0;
                            const iepsP = (Number(l.ieps_monto) || 0) > 0 && neto > 0 ? Math.round((Number(l.ieps_monto) / neto) * 100) : 0;
                            const impLabel = [iepsP ? 'IEPS' : null, ivaP ? 'IVA' : null].filter(Boolean).join(' + ') || '—';
                            const lp = (l as any).lista_precios;
                            const listaLabel = l.precio_manual ? 'Manual' : (lp?.nombre ?? ventaListaNombre ?? '—');
                            const promoLabel = promoPorProducto[l.producto_id];
                            return (
                              <tr key={l.id} className="border-b border-border/40">
                                <td className="py-1.5"><ProductoLink id={l.producto_id}>{(l.productos as any)?.nombre ?? '—'}</ProductoLink></td>
                                <td className="py-1.5 text-muted-foreground text-[11px]">{listaLabel}</td>
                                <td className="text-right py-1.5 tabular-nums">{fmt(l.precio_unitario)}</td>
                                <td className="text-right py-1.5 tabular-nums">{l.cantidad}</td>
                                {venta.tipo === 'pedido' && (() => {
                                  const ent = entregadoPorProd[l.producto_id] ?? 0;
                                  const ped = Number(l.cantidad ?? 0);
                                  const parcial = ent > 0 && ent < ped;
                                  const completo = ent >= ped && ped > 0;
                                  return (
                                    <td className={`text-right py-1.5 tabular-nums font-medium ${completo ? 'text-success' : parcial ? 'text-warning' : 'text-muted-foreground'}`}>
                                      {ent}
                                    </td>
                                  );
                                })()}
                                <td className="py-1.5 text-center text-muted-foreground">{
                                  (l as any).unidades?.abreviatura
                                  || (l as any).productos?.unidades_venta?.abreviatura
                                  || ((l.productos as any)?.es_granel ? (l.productos as any)?.unidad_granel : '')
                                  || 'Pz'
                                }</td>
                                <td className="text-right py-1.5 tabular-nums">{dpct > 0 ? <span className="text-primary font-medium">{dpct}%</span> : <span className="text-muted-foreground">0%</span>}</td>
                                <td className="py-1.5 text-muted-foreground text-[11px] whitespace-nowrap">{impLabel}</td>
                                <td className="text-right py-1.5 tabular-nums font-medium">{fmt(l.total)}</td>
                                <td className="py-1.5 text-center">
                                  {promoLabel ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                                      <Gift className="h-3 w-3 shrink-0" />{promoLabel}
                                    </span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {lineas.length === 0 && (
                            <tr><td colSpan={venta.tipo === 'pedido' ? 10 : 9} className="text-center py-3 text-muted-foreground text-xs">Sin productos</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagos */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Pagos recibidos</h4>
                    {pagos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-1 font-medium">Método</th>
                              <th className="text-left py-1 font-medium">Cobrador</th>
                              <th className="text-left py-1 font-medium">Referencia</th>
                              <th className="text-left py-1 font-medium">Fecha</th>
                              <th className="text-right py-1 font-medium">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagos.map((p: any) => {
                              const cobro = p.cobros as any;
                              const cancelado = (cobro?.status ?? 'activo') === 'cancelado';
                              return (
                                <tr key={p.id} className={`border-b border-border/40 ${cancelado ? 'opacity-50 line-through' : ''}`}>
                                  <td className="py-1.5 capitalize">{cobro?.metodo_pago ?? '—'}{cancelado && <span className="ml-1 text-[10px] text-destructive no-underline">(cancelado)</span>}</td>
                                  <td className="py-1.5 text-muted-foreground">{cobradores[cobro?.user_id] ?? '—'}</td>
                                  <td className="py-1.5 text-muted-foreground">{cobro?.referencia || '—'}</td>
                                  <td className="py-1.5 text-muted-foreground">{fmtDate(cobro?.fecha)}</td>
                                  <td className="py-1.5 text-right font-medium tabular-nums">{fmt(p.monto_aplicado)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-border font-semibold">
                              <td colSpan={4} className="py-1.5">Total pagado</td>
                              <td className="py-1.5 text-right text-success tabular-nums">{fmt(pagos.reduce((s: number, p: any) => s + (((p.cobros?.status ?? 'activo') !== 'cancelado') ? Number(p.monto_aplicado ?? 0) : 0), 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Sin pagos registrados</p>
                    )}
                  </div>
                </div>

                {/* Columna derecha: Resumen + Promociones aplicadas */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-card p-3 text-[12px] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal sin impuestos</span>
                      <span className="tabular-nums">{fmt(sinImpDisp)}</span>
                    </div>
                    {manualNeto > 0.005 && (
                      <div className="flex justify-between text-primary">
                        <span>Descuento manual</span>
                        <span className="tabular-nums">-{fmt(manualNeto)}</span>
                      </div>
                    )}
                    {promoNeto > 0.005 && (
                      <div className="flex justify-between text-primary">
                        <span>Desc. promociones</span>
                        <span className="tabular-nums">-{fmt(promoNeto)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal gravable</span>
                      <span className="tabular-nums">{fmt(gravableShown)}</span>
                    </div>

                    {iepsMontoV > 0.005 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IEPS</span>
                        <span className="tabular-nums">{fmt(iepsMontoV)}</span>
                      </div>
                    )}
                    {ivaMontoV > 0.005 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IVA</span>
                        <span className="tabular-nums">{fmt(ivaMontoV)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1.5 font-bold text-[13px]">
                      <span>Total</span>
                      <span className="tabular-nums">{fmt(totalReal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pagado</span>
                      <span className="tabular-nums">{fmt(pagado)}</span>
                    </div>
                    {saldoPend > 0.005 && (
                      <div className="flex justify-between font-medium text-warning">
                        <span>Saldo pendiente</span>
                        <span className="tabular-nums">{fmt(saldoPend)}</span>
                      </div>
                    )}
                    {saldoPend < -0.005 && (
                      <div className="flex justify-between font-medium text-success">
                        <span>Saldo a favor</span>
                        <span className="tabular-nums">{fmt(Math.abs(saldoPend))}</span>
                      </div>
                    )}
                  </div>

                  {promosConDescuento.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase">Promociones aplicadas</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{promosConDescuento.length} promo</span>
                      </div>
                      <div className="space-y-1">
                        {promosConDescuento.map((pr: any, i: number) => (
                          <div key={i} className="flex items-center gap-1.5 text-[12px]">
                            <Check className="h-3.5 w-3.5 text-success shrink-0" />
                            <span className="text-foreground">{pr.descripcion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>

      {showPdf && (
        <tr className="hidden">
          <td>
            <DocumentPreviewModal
              open={showPdf}
              onClose={() => { setShowPdf(false); setPdfBlob(null); }}
              pdfBlob={pdfBlob}
              fileName={pdfName}
              empresaId={eId}
              defaultPhone={(() => { const c = clientesList?.find(x => x.id === venta.cliente_id); return phoneWithLada(c?.telefono, (c as any)?.lada, (empresa as any)?.lada || '52'); })()}
              caption={pdfCaption}
              tipo="venta"
              referencia_id={venta.id}
            />
          </td>
        </tr>
      )}

      {waOpen && (
        <tr className="hidden">
          <td>
            <WhatsAppPreviewDialog
              open={waOpen}
              onClose={() => { setWaOpen(false); setWaPdfBlob(null); }}
              phone={waPhone}
              message={waMessage}
              empresaId={eId}
              tipo="venta"
              pdfBlob={waPdfBlob}
              pdfFileName={waPdfName}
            />
          </td>
        </tr>
      )}

      {cobroOpen && (
        <tr className="hidden">
          <td>
            <VentaCobroQuickModal
              open={cobroOpen}
              onClose={() => setCobroOpen(false)}
              venta={venta}
              fmt={fmt}
              onSuccess={() => setReloadKey(k => k + 1)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
