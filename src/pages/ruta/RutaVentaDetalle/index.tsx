import { useVentaDetalle } from './useVentaDetalle';
import { TicketView } from './TicketView';
import { EditarView } from './EditarView';
import { CobrarView } from './CobrarView';
import { DetalleView } from './DetalleView';

export default function RutaVentaDetalle() {
  const h = useVentaDetalle();

  if (h.isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground text-[13px]">Cargando...</p></div>;
  if (!h.venta) return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2"><p className="text-muted-foreground text-[13px]">Venta no encontrada</p><button onClick={() => h.navigate(-1)} className="text-primary text-[13px] font-medium">Volver</button></div>;

  const lineas = (h.venta as any).venta_lineas ?? [];
  const clienteNombre = (h.venta as any).clientes?.nombre ?? 'Sin cliente';
  const vendedorNombre = (h.venta as any).vendedores?.nombre ?? '—';

  if (h.view === 'ticket' && h.ticketData) {
    return <TicketView ticketData={h.ticketData} clienteNombre={clienteNombre} cuentasPendientes={h.cuentasPendientes} lineas={lineas} ventaTotal={h.venta.total ?? 0} onDone={() => h.navigate('/ruta/ventas')} fmt={h.fmt} />;
  }

  if (h.view === 'editar') {
    return <EditarView venta={h.venta} editLineas={h.editLineas} editCondicion={h.editCondicion} setEditCondicion={h.setEditCondicion} editNotas={h.editNotas} setEditNotas={h.setEditNotas} editTotals={h.editTotals} clienteData={h.clienteData} saldoPendienteOtras={h.saldoPendienteOtras} creditoDisponible={h.creditoDisponible} excedeCredito={h.excedeCredito} saving={h.saving} showProductSearch={h.showProductSearch} setShowProductSearch={h.setShowProductSearch} searchProducto={h.searchProducto} setSearchProducto={h.setSearchProducto} filteredProductos={h.filteredProductos} addProductToEdit={h.addProductToEdit} updateEditQty={h.updateEditQty} removeEditLine={h.removeEditLine} handleSaveEdits={h.handleSaveEdits} onBack={() => h.setView('detalle')} fmt={h.fmt} />;
  }

  if (h.view === 'cobrar') {
    return <CobrarView venta={h.venta} clienteNombre={clienteNombre} saldoActual={h.saldoActual} cuentasPendientes={h.cuentasPendientes} totalAplicarOtras={h.totalAplicarOtras} totalACobrar={h.totalACobrar} metodoPago={h.metodoPago} setMetodoPago={h.setMetodoPago} montoRecibido={h.montoRecibido} setMontoRecibido={h.setMontoRecibido} referenciaPago={h.referenciaPago} setReferenciaPago={h.setReferenciaPago} cambio={h.cambio} saving={h.saving} handleCobrar={h.handleCobrar} updateCuentaMonto={h.updateCuentaMonto} liquidarTodas={h.liquidarTodas} onBack={() => h.setView('detalle')} fmt={h.fmt} />;
  }

  return <DetalleView venta={h.venta} clienteNombre={clienteNombre} vendedorNombre={vendedorNombre} clienteData={h.clienteData} lineas={lineas} empresa={h.empresa} ecPdfBlob={h.ecPdfBlob} showEcPreview={h.showEcPreview} setShowEcPreview={h.setShowEcPreview} showWADialog={h.showWADialog} setShowWADialog={h.setShowWADialog} waPhone={h.waPhone} setWaPhone={h.setWaPhone} sendingWA={h.sendingWA} saving={h.saving} handleWhatsAppSend={h.handleWhatsAppSend} handleDownloadPDF={h.handleDownloadPDF} handleEstadoCuenta={h.handleEstadoCuenta} initEditar={h.initEditar} initCobrar={h.initCobrar} handleCancelar={h.handleCancelar} onBack={() => h.navigate(-1)} fmt={h.fmt} />;
}
