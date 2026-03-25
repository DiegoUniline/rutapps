import { useIsMobile } from '@/hooks/use-mobile';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { VentaFormHeader } from '@/components/venta/VentaFormHeader';
import { VentaPagosTab } from '@/components/venta/VentaPagosTab';
import { VentaEntregasTab } from '@/components/venta/VentaEntregasTab';
import { VentaDevolucionesTab } from '@/components/venta/VentaDevolucionesTab';
import { FacturaDrawer } from '@/components/facturacion/FacturaDrawer';
import { CfdiHistory } from '@/components/facturacion/CfdiHistory';
import { TableSkeleton } from '@/components/TableSkeleton';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { toast } from 'sonner';
import type { StatusVenta } from '@/types';
import { useVentaForm, VENTA_STEPS_FULL, VENTA_STEPS_INMEDIATA } from './useVentaForm';
import { VentaFormFields } from './VentaFormFields';
import { VentaLineasTab } from './VentaLineasTab';
import { generarVentaPdf } from './VentaPdfHandler';
import { printTicket, buildTicketDataFromVenta } from '@/lib/printTicketUtil';
import { fmtDate } from '@/lib/utils';

export default function VentaFormPage() {
  const isMobile = useIsMobile();
  const h = useVentaForm();
  const {
    id, isNew, form, lineas, setLineas, readOnly, isLoading,
    profile, user, empresa, navigate,
    clientesList, productosList, tarifasList, almacenesList,
    entregasExistentes, entregasActivas, hayEntregas, remaining, fullyDelivered, canCreateEntrega, lineDeliverySummary,
    pagosData, totalPagado, saldoPendiente, totals,
    pdfBlob, setPdfBlob, showPdfModal, setShowPdfModal, showFacturaDrawer, setShowFacturaDrawer,
    sinImpuestos, setSinImpuestos,
    saveVenta, crearEntrega, PinDialog,
    set, handleProductSelect, handleSave, handleDelete, handleStatusChange, handleAddPago,
    addLine, updateLine, removeLine, setCellRef, handleCellKeyDown, navigateCell,
  } = h;

  if (!isNew && isLoading) return <div className="p-4 min-h-full"><TableSkeleton rows={6} cols={4} /></div>;

  const clienteOptions = (clientesList ?? []).map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + ' · ' : ''}${c.nombre}` }));
  const tarifaOptions = (tarifasList ?? []).map(t => ({ value: t.id, label: t.nombre }));
  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const clienteNombre = clientesList?.find(c => c.id === form.cliente_id)?.nombre;
  const steps = form.entrega_inmediata ? VENTA_STEPS_INMEDIATA : VENTA_STEPS_FULL;

  const handleGenerarPdf = async () => {
    const clienteData = clientesList?.find(c => c.id === form.cliente_id);
    const almacenName = almacenesList?.find((a: any) => a.id === form.almacen_id)?.nombre;
    const blob = await generarVentaPdf({
      form, empresa, profile, userEmail: user?.email, clienteData, almacenName,
      lineas, productosList: productosList ?? [], entregasExistentes: entregasExistentes ?? [], pagosData: pagosData ?? [],
    });
    setPdfBlob(blob);
    setShowPdfModal(true);
  };

  const handlePrintTicket = () => {
    const clienteData = clientesList?.find(c => c.id === form.cliente_id);
    const td = buildTicketDataFromVenta({
      empresa,
      venta: {
        folio: form.folio,
        fecha: fmtDate(form.fecha),
        subtotal: totals.subtotal,
        iva_total: totals.iva_total,
        ieps_total: totals.ieps_total,
        total: totals.total,
        condicion_pago: form.condicion_pago,
      },
      clienteNombre: clienteData?.nombre ?? 'Sin cliente',
      lineas: lineas.filter(l => l.producto_id).map(l => ({
        nombre: productosList?.find(p => p.id === l.producto_id)?.nombre ?? l.descripcion ?? '—',
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario),
        total: Number(l.total ?? 0),
        iva_monto: Number(l.iva_monto ?? 0),
        ieps_monto: Number(l.ieps_monto ?? 0),
        descuento_pct: Number(l.descuento_porcentaje ?? 0),
      })),
    });
    const ticketAncho = (empresa as any)?.ticket_ancho ?? '58';
    printTicket(td, { ticketAncho });
  };

    set('cliente_id', cId);
    const c = clientesList?.find(cl => cl.id === cId);
    const clienteTarifa = c?.tarifa_id || tarifasList?.find(t => t.tipo === 'general')?.id;
    if (clienteTarifa) set('tarifa_id', clienteTarifa);
    if (c && (c as any).lista_precio_id) set('lista_precio_id', (c as any).lista_precio_id);
    else set('lista_precio_id', null);
    if (c?.requiere_factura) set('requiere_factura', true);
  };

  return (
    <div className="min-h-full">
      <VentaFormHeader
        isNew={isNew} folio={form.folio} clienteNombre={clienteNombre} status={form.status}
        entregaInmediata={form.entrega_inmediata} tipo={form.tipo}
        requiereFactura={(form as any).requiere_factura} readOnly={readOnly}
        canCreateEntrega={canCreateEntrega} hayEntregas={hayEntregas}
        entregasExistentes={(entregasExistentes ?? []).map(e => ({ id: e.id, folio: e.folio, status: e.status }))}
        lineasPendientesFactura={lineas.filter(l => l.producto_id && !l.facturado).length}
        isSaving={saveVenta.isPending} isCreatingEntrega={crearEntrega.isPending}
        onBack={() => navigate('/ventas')} onSave={handleSave} onDelete={handleDelete} onStatusChange={handleStatusChange}
        onCreateEntrega={async () => {
          const linesToUse = remaining?.length ? remaining.map(r => ({ producto_id: r.producto_id, unidad_id: lineas.find(l => l.producto_id === r.producto_id)?.unidad_id, cantidad_pedida: r.cantidad_pendiente }))
            : (lineas ?? []).filter(l => l.producto_id && Number(l.cantidad) > 0).map(l => ({ producto_id: l.producto_id!, unidad_id: l.unidad_id, cantidad_pedida: Number(l.cantidad) }));
          if (!linesToUse.length) { toast.error('No hay líneas pendientes'); return; }
          try { const result = await crearEntrega.mutateAsync({ pedidoId: form.id, vendedorId: form.vendedor_id, clienteId: form.cliente_id, almacenId: form.almacen_id, lineas: linesToUse }); toast.success('Entrega creada'); navigate(`/logistica/entregas/${result.id}`); } catch (e: any) { toast.error(e.message); }
        }}
        onNavigateEntrega={(eid) => navigate(`/logistica/entregas/${eid}`)}
        onGenerarPdf={handleGenerarPdf}
        onFacturar={() => setShowFacturaDrawer(true)}
      />
      {!isNew && <div className="px-5 pt-3"><OdooStatusbar steps={steps} current={form.status as string} onStepClick={readOnly ? undefined : (k => handleStatusChange(k as StatusVenta))} /></div>}
      <div className="p-3 sm:p-5 space-y-4 max-w-[1200px]">
        <div className="bg-card border border-border rounded-md p-5">
          {readOnly && <div className="mb-3 text-xs text-muted-foreground bg-muted/60 border border-border px-3 py-2 rounded flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" />Esta venta está {form.status} y no se puede editar.</div>}
          <VentaFormFields form={form} readOnly={readOnly} isNew={isNew} clienteOptions={clienteOptions} tarifaOptions={tarifaOptions} almacenOptions={almacenOptions} clienteNombre={clienteNombre} totalPagado={totalPagado} saldoPendiente={saldoPendiente} set={set} onClienteChange={onClienteChange} />
        </div>
        <div className="bg-card border border-border rounded-md">
          <OdooTabs tabs={[
            { key: 'lineas', label: 'Líneas de venta', content: <VentaLineasTab lineas={lineas} productosList={productosList ?? []} readOnly={readOnly} totals={totals} onProductSelect={handleProductSelect} onUpdateLine={updateLine} onRemoveLine={removeLine} onAddLine={addLine} setCellRef={setCellRef} onCellKeyDown={handleCellKeyDown} navigateCell={navigateCell} setLineas={setLineas} sinImpuestos={sinImpuestos} setSinImpuestos={setSinImpuestos} readOnlyForm={readOnly} /> },
            ...(!isNew ? [{ key: 'pagos', label: `Pagos (${(pagosData ?? []).length})`, content: <VentaPagosTab pagos={(pagosData ?? []) as any} totalPagado={totalPagado} saldoPendiente={saldoPendiente} isMobile={isMobile} onAddPago={handleAddPago} /> }] : []),
            ...(!isNew && form.tipo === 'pedido' ? [{ key: 'entregas', label: `Entregas (${entregasActivas.length})`, content: <VentaEntregasTab lineas={lineas} productosList={(productosList ?? []).map((p: any) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }))} entregasExistentes={(entregasExistentes ?? []) as any} entregasActivas={entregasActivas as any} lineDeliverySummary={lineDeliverySummary} canCreateEntrega={canCreateEntrega} fullyDelivered={fullyDelivered} remaining={remaining} isCreatingEntrega={crearEntrega.isPending} isMobile={isMobile} onCreateEntrega={async (items) => { try { const entrega = await crearEntrega.mutateAsync({ pedidoId: form.id, vendedorId: form.vendedor_id ?? undefined, clienteId: form.cliente_id ?? undefined, almacenId: form.almacen_id ?? undefined, lineas: items }); toast.success(`Entrega ${entrega.folio} creada`); } catch (e: any) { toast.error(e.message); } }} /> }] : []),
            ...(!isNew ? [{ key: 'devoluciones', label: 'Devoluciones', content: <VentaDevolucionesTab ventaId={form.id!} /> }] : []),
            { key: 'notas', label: 'Notas', content: <div className="p-4">{readOnly ? <p className="text-[13px] text-foreground whitespace-pre-wrap">{form.notas || 'Sin notas'}</p> : <textarea className="input-odoo w-full min-h-[100px]" value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} placeholder="Notas internas de la venta..." />}</div> },
            ...(!isNew && (form as any).requiere_factura ? [{ key: 'facturacion', label: `Facturación (${lineas.filter(l => l.producto_id && l.facturado).length}/${lineas.filter(l => l.producto_id).length})`, content: <div className="p-4"><CfdiHistory ventaId={form.id!} lineas={lineas} productosList={productosList ?? []} />{lineas.every(l => !l.producto_id || l.facturado) && lineas.some(l => l.facturado) && <div className="text-sm font-medium flex items-center gap-2 text-muted-foreground mt-4"><span className="inline-block w-2 h-2 rounded-full bg-primary" />Todas las líneas facturadas</div>}{!lineas.some(l => l.facturado) && <p className="text-muted-foreground text-sm">Sin facturas emitidas aún</p>}</div> }] : []),
          ]} />
        </div>
      </div>
      <DocumentPreviewModal open={showPdfModal} onClose={() => { setShowPdfModal(false); setPdfBlob(null); }} pdfBlob={pdfBlob} fileName={`${form.folio ?? 'pedido'}.pdf`} empresaId={empresa?.id ?? ''} defaultPhone={clientesList?.find(c => c.id === form.cliente_id)?.telefono ?? ''} caption={`Documento ${form.folio}`} tipo="pedido" referencia_id={form.id} />
      {showFacturaDrawer && form.id && form.cliente_id && <FacturaDrawer open={showFacturaDrawer} onClose={() => setShowFacturaDrawer(false)} ventaId={form.id} cliente={clientesList?.find(c => c.id === form.cliente_id) as any} lineas={lineas as any} productosList={productosList ?? []} />}
      <PinDialog />
    </div>
  );
}
