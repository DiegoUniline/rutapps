import { RutaOperacionGate } from '@/components/ruta/RutaOperacionGate';
import { ArrowLeft, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import TicketVenta from '@/components/ruta/TicketVenta';
import { STEP_LABELS } from './types';
import { useRutaVenta } from './useRutaVenta';
import { printTicket } from '@/lib/printTicketUtil';
import type { TicketData } from '@/lib/ticketHtml';
import { fmtDate } from '@/lib/utils';
import { StepTipo } from './StepTipo';
import { StepSinCompra } from './StepSinCompra';
import { StepCliente } from './StepCliente';
import { StepDevoluciones } from './StepDevoluciones';
import { StepProductos } from './StepProductos';
import { StepResumen } from './StepResumen';
import { StepPago } from './StepPago';
import { useAlmacenGuard } from '@/hooks/useAlmacenGuard';
import { usePermisos } from '@/hooks/usePermisos';
import MobileNoAccess from '@/components/ruta/MobileNoAccess';

function RutaNuevaVentaInner() {
  const { hasPermisoMovil } = usePermisos();
  const { checkAlmacen, AlmacenDialog } = useAlmacenGuard();
  const h = useRutaVenta({ onAlmacenMissing: () => checkAlmacen() });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (!hasPermisoMovil('ruta.vender')) {
    return <MobileNoAccess titulo="Sin permiso para vender" mensaje="Tu rol no permite crear ventas desde la ruta." />;
  }

  const ticketAncho = (h.empresa as any)?.ticket_ancho ?? '58';

  const handlePrintTicket = useCallback(async () => {
    if (!h.ticketInfo) return;
    const totalPagadoAhora = h.pagos.reduce((a, p) => a + Number(p.monto || 0), 0);
    const saldoRestanteEstaVenta = h.condicionPago !== 'contado' ? Math.max(0, h.totals.total - totalPagadoAhora) : 0;
    const saldoAnteriorRestante = Math.max(0, h.saldoPendienteTotal - h.totalAplicarCuentas);
    const saldoNuevoCalc = saldoAnteriorRestante + saldoRestanteEstaVenta;
    const td: TicketData = {
      empresa: { nombre: h.empresa?.nombre ?? '', telefono: h.empresa?.telefono, direccion: h.empresa?.direccion, logo_url: h.empresa?.logo_url, rfc: h.empresa?.rfc, razon_social: (h.empresa as any)?.razon_social, colonia: (h.empresa as any)?.colonia, ciudad: (h.empresa as any)?.ciudad, estado: (h.empresa as any)?.estado, cp: (h.empresa as any)?.cp, email: (h.empresa as any)?.email, moneda: (h.empresa as any)?.moneda, notas_ticket: (h.empresa as any)?.notas_ticket, ticket_campos: (h.empresa as any)?.ticket_campos },
      folio: h.ticketInfo.folio, fecha: fmtDate(h.ticketInfo.fecha), clienteNombre: h.clienteNombre,
      vendedorNombre: h.profile?.nombre ?? '',
      vendedorTelefono: (h.profile as any)?.telefono ?? null,
      lineas: h.ticketLineas,
      subtotal: h.totals.subtotal,
      descuento: h.totals.descuentoDevolucion ?? 0,
      iva: h.totals.iva,
      ieps: h.totals.ieps,
      total: h.totals.total,
      condicionPago: h.condicionPago, metodoPago: h.pagos.map(p => p.metodo_pago).join(', '),
      montoRecibido: h.montoRecibidoNum, cambio: h.cambio,
      saldoAnterior: h.saldoPendienteTotal,
      pagoAplicado: h.totalAplicarCuentas + totalPagadoAhora,
      saldoNuevo: saldoNuevoCalc > 0 ? saldoNuevoCalc : undefined,
      promociones: h.promoResults.filter(r => r.descuento > 0).map(r => ({ descripcion: r.descripcion, descuento: r.descuento, producto_id: r.producto_id, tipo: r.tipo, cantidad_gratis: r.cantidad_gratis })),
      pagos: h.pagos.map(p => ({ metodo: p.metodo_pago, monto: Number(p.monto), fecha: fmtDate(h.ticketInfo.fecha), referencia: (p as any).referencia ?? undefined })),
      devoluciones: h.devoluciones.map(d => ({ nombre: d.nombre, cantidad: Number(d.cantidad) || 0, motivo: d.motivo, accion: d.accion, monto: (d.precio_unitario ?? 0) * (Number(d.cantidad) || 0) })),
    };
    await printTicket(td, { ticketAncho });
  }, [h.ticketInfo, h.ticketLineas, h.empresa, h.clienteNombre, h.totals, h.condicionPago, h.pagos, h.montoRecibidoNum, h.cambio, h.saldoPendienteTotal, h.totalAplicarCuentas, h.promoResults, h.devoluciones, h.profile, ticketAncho]);


  if (h.ticketInfo) {
    return (
      <TicketVenta
        empresa={{ nombre: h.empresa?.nombre ?? '', telefono: h.empresa?.telefono, direccion: h.empresa?.direccion, logo_url: h.empresa?.logo_url, rfc: h.empresa?.rfc, moneda: (h.empresa as any)?.moneda, razon_social: (h.empresa as any)?.razon_social, colonia: (h.empresa as any)?.colonia, ciudad: (h.empresa as any)?.ciudad, estado: (h.empresa as any)?.estado, cp: (h.empresa as any)?.cp, email: (h.empresa as any)?.email, notas_ticket: (h.empresa as any)?.notas_ticket, ticket_campos: (h.empresa as any)?.ticket_campos }}
        folio={h.ticketInfo.folio} fecha={h.ticketInfo.fecha} clienteNombre={h.clienteNombre}
        vendedorNombre={h.profile?.nombre ?? ''}
        vendedorTelefono={(h.profile as any)?.telefono ?? null}
        lineas={h.ticketLineas}
        subtotal={h.totals.subtotal} iva={h.totals.iva} ieps={h.totals.ieps} total={h.totals.total}
        descuentoDevolucion={h.totals.descuentoDevolucion ?? 0}
        devoluciones={h.devoluciones.map(d => ({ nombre: d.nombre, cantidad: d.cantidad, motivo: d.motivo, accion: d.accion, monto: d.precio_unitario * d.cantidad }))}
        condicionPago={h.condicionPago} metodoPago={h.pagos.map(p => p.metodo_pago).join(', ')} montoRecibido={h.montoRecibidoNum} cambio={h.cambio}
        saldoAnterior={h.saldoPendienteTotal} pagoAplicado={h.totalAplicarCuentas}
        saldoNuevo={h.saldoPendienteTotal - h.totalAplicarCuentas + (h.condicionPago !== 'contado' ? Math.max(0, h.totals.total - (h.pagos.reduce((a, p) => a + Number(p.monto || 0), 0))) : 0)}
        promociones={h.promoResults.filter(r => r.descuento > 0).map(r => ({ descripcion: r.descripcion, descuento: r.descuento, producto_id: r.producto_id, tipo: r.tipo, cantidad_gratis: r.cantidad_gratis }))}
        pagos={h.pagos.map(p => ({ metodo: p.metodo_pago, monto: Number(p.monto), fecha: h.ticketInfo.fecha }))}
        productosList={h.productos as any}
        onPrintTicket={handlePrintTicket}
        onClose={() => h.navigate('/ruta')}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {AlmacenDialog}
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={h.goBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all"><ArrowLeft className="h-[18px] w-[18px] text-foreground" /></button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Nueva venta</span>
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-destructive/10 text-destructive text-[12px] font-semibold active:scale-95 transition-all"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
        </div>
        <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar esta venta?</AlertDialogTitle>
              <AlertDialogDescription>Se perderán los cambios que hayas hecho.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar venta</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { setShowCancelConfirm(false); h.navigate('/ruta'); }}
              >
                Sí, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="flex px-3 pb-2.5 gap-1">
          {h.routeSteps.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-[3px] w-full rounded-full transition-colors ${i <= h.currentStepIdx ? 'bg-primary' : 'bg-border'}`} />
              <span className={`text-[9px] font-medium transition-colors ${i <= h.currentStepIdx ? 'text-primary' : 'text-muted-foreground/60'}`}>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </header>

      {h.clienteId && h.step !== 'cliente' && h.clienteNotasFiscales && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
          <div className="font-semibold mb-0.5">📄 Notas fiscales del cliente</div>
          <div className="whitespace-pre-wrap leading-snug">{h.clienteNotasFiscales}</div>
        </div>
      )}

      {h.step === 'tipo' && !h.sinCompra && <StepTipo sinCompra={h.sinCompra} setSinCompra={h.setSinCompra} setTipoVenta={h.setTipoVenta} setCondicionPago={h.setCondicionPago} setStep={h.setStep} urlClienteId={h.urlClienteId} clienteId={h.clienteId} canDoDevoluciones={h.canDoDevoluciones} setSoloDevolucion={h.setSoloDevolucion} />}
      {h.step === 'tipo' && h.sinCompra && <StepSinCompra clienteNombre={h.clienteNombre} motivoSinCompra={h.motivoSinCompra} setMotivoSinCompra={h.setMotivoSinCompra} notas={h.notas} setNotas={h.setNotas} savingSinCompra={h.savingSinCompra} setSavingSinCompra={h.setSavingSinCompra} setSinCompra={h.setSinCompra} saveVisita={h.saveVisita} markVisited={h.markVisited} clienteId={h.clienteId} urlClienteId={h.urlClienteId} navigate={h.navigate} />}
      {h.step === 'cliente' && <StepCliente searchCliente={h.searchCliente} setSearchCliente={h.setSearchCliente} filteredClientes={h.filteredClientes} clienteId={h.clienteId} setClienteId={h.setClienteId} setClienteNombre={h.setClienteNombre} setClienteCredito={h.setClienteCredito} setCondicionPago={h.setCondicionPago} setStep={h.setStep} sinCompra={h.sinCompra} canDoDevoluciones={h.canDoDevoluciones} soloDevolucion={h.soloDevolucion} />}

      {h.step === 'devoluciones' && h.canDoDevoluciones && <StepDevoluciones clienteNombre={h.clienteNombre} searchDevProducto={h.searchDevProducto} setSearchDevProducto={h.setSearchDevProducto} filteredDevProductos={h.filteredDevProductos} devoluciones={h.devoluciones} addDevolucion={h.addDevolucion} updateDevQty={h.updateDevQty} updateDevMotivo={h.updateDevMotivo} updateDevAccion={h.updateDevAccion} batchUpdateDevDefaults={h.batchUpdateDevDefaults} showReemplazoFor={h.showReemplazoFor} setShowReemplazoFor={h.setShowReemplazoFor} searchReemplazo={h.searchReemplazo} setSearchReemplazo={h.setSearchReemplazo} filteredReemplazoProductos={h.filteredReemplazoProductos} setReemplazo={h.setReemplazo} processDevolucionesAndGoToProductos={h.processDevolucionesAndGoToProductos} fmt={h.fmt} soloDevolucion={h.soloDevolucion} saveSoloDevolucion={h.saveSoloDevolucion} saving={h.saving} />}
      {h.step === 'devoluciones' && !h.canDoDevoluciones && <StepProductos clienteNombre={h.clienteNombre} clienteListaNombre={h.clienteListaNombre} devoluciones={[]} searchProducto={h.searchProducto} setSearchProducto={h.setSearchProducto} filteredProductos={h.filteredProductos} cart={h.cart} cambioItems={h.cambioItems} tipoVenta={h.tipoVenta} totals={h.totals} addToCart={h.addToCart} addGranelLine={h.addGranelLine} updateQty={h.updateQty} removeFromCart={h.removeFromCart} getItemInCart={h.getItemInCart} getMaxQty={h.getMaxQty} getDispSigned={h.getDispSigned} setStep={h.setStep} setCart={h.setCart} stockAbordo={h.stockAbordo} usandoAlmacen={h.usandoAlmacen} fmt={h.fmt} insights={h.insights} bannerDismissed={h.bannerDismissed} setBannerDismissed={h.setBannerDismissed} applyManualList={h.applyManualList} applyHistorialAvg={h.applyHistorialAvg} repeatLastSale={h.repeatLastSale} findProductByCode={h.findProductByCode} setItemQty={h.setItemQty} getSuggestedPrice={h.getSuggestedPrice} getSuggestedDisplayPrice={h.getSuggestedDisplayPrice} getLineDisplayPrice={h.getLineDisplayPrice} setItemPriceManual={h.setItemPriceManual} setItemPriceFromLista={h.setItemPriceFromLista} resetItemToSuggested={h.resetItemToSuggested} canChangePrice={h.canChangePrice} canChangeLista={h.canChangeLista} apartadoActivoPedido={h.apartadoActivoPedido} pedidoAlmacenId={h.pedidoAlmacenId} setPedidoAlmacenId={h.setPedidoAlmacenId} />}
      {h.step === 'productos' && <StepProductos clienteNombre={h.clienteNombre} clienteListaNombre={h.clienteListaNombre} devoluciones={h.devoluciones} searchProducto={h.searchProducto} setSearchProducto={h.setSearchProducto} filteredProductos={h.filteredProductos} cart={h.cart} cambioItems={h.cambioItems} tipoVenta={h.tipoVenta} totals={h.totals} addToCart={h.addToCart} addGranelLine={h.addGranelLine} updateQty={h.updateQty} removeFromCart={h.removeFromCart} getItemInCart={h.getItemInCart} getMaxQty={h.getMaxQty} getDispSigned={h.getDispSigned} setStep={h.setStep} setCart={h.setCart} stockAbordo={h.stockAbordo} usandoAlmacen={h.usandoAlmacen} fmt={h.fmt} insights={h.insights} bannerDismissed={h.bannerDismissed} setBannerDismissed={h.setBannerDismissed} applyManualList={h.applyManualList} applyHistorialAvg={h.applyHistorialAvg} repeatLastSale={h.repeatLastSale} findProductByCode={h.findProductByCode} setItemQty={h.setItemQty} getSuggestedPrice={h.getSuggestedPrice} getSuggestedDisplayPrice={h.getSuggestedDisplayPrice} getLineDisplayPrice={h.getLineDisplayPrice} setItemPriceManual={h.setItemPriceManual} setItemPriceFromLista={h.setItemPriceFromLista} resetItemToSuggested={h.resetItemToSuggested} canChangePrice={h.canChangePrice} canChangeLista={h.canChangeLista} apartadoActivoPedido={h.apartadoActivoPedido} pedidoAlmacenId={h.pedidoAlmacenId} setPedidoAlmacenId={h.setPedidoAlmacenId} />}
      {h.step === 'resumen' && <StepResumen clienteNombre={h.clienteNombre} devoluciones={h.devoluciones} cambioItems={h.cambioItems} chargedItems={h.chargedItems} promoResults={h.promoResults} totals={h.totals} saldoPendienteTotal={h.saldoPendienteTotal} setStep={h.setStep} goToPayment={h.goToPayment} navigate={h.navigate} cart={h.cart} ticketLineas={h.ticketLineas} fmt={h.fmt} canApplyDiscount={h.canApplyDiscount} descuentoExtraTipo={h.descuentoExtraTipo} setDescuentoExtraTipo={h.setDescuentoExtraTipo} descuentoExtraValor={h.descuentoExtraValor} setDescuentoExtraValor={h.setDescuentoExtraValor} descuentoExtraMotivo={h.descuentoExtraMotivo} setDescuentoExtraMotivo={h.setDescuentoExtraMotivo} />}
      {h.step === 'pago' && <StepPago tipoVenta={h.tipoVenta} entregaInmediata={h.entregaInmediata} fechaEntrega={h.fechaEntrega} setFechaEntrega={h.setFechaEntrega} condicionPago={h.condicionPago} setCondicionPago={h.setCondicionPago} clienteCredito={h.clienteCredito} excedeCredito={h.excedeCredito} creditoDisponible={h.creditoDisponible} saldoPendienteTotal={h.saldoPendienteTotal} cuentasPendientes={h.cuentasPendientes} liquidarTodas={h.liquidarTodas} updateCuentaMonto={h.updateCuentaMonto} totalAplicarCuentas={h.totalAplicarCuentas} pagos={h.pagos} setPagos={h.setPagos} saldoFavorDisp={h.saldoFavorDisp} notas={h.notas} setNotas={h.setNotas} totals={h.totals} totalACobrar={h.totalACobrar} cambio={h.cambio} saving={h.saving} cart={h.cart} devoluciones={h.devoluciones} sinImpuestos={h.sinImpuestos} setSinImpuestos={h.setSinImpuestos} handleSave={h.handleSave} navigate={h.navigate} fmt={h.fmt} canApplyDiscount={h.canApplyDiscount} descuentoExtraTipo={h.descuentoExtraTipo} setDescuentoExtraTipo={h.setDescuentoExtraTipo} descuentoExtraValor={h.descuentoExtraValor} setDescuentoExtraValor={h.setDescuentoExtraValor} descuentoExtraMotivo={h.descuentoExtraMotivo} setDescuentoExtraMotivo={h.setDescuentoExtraMotivo} />}
    </div>
  );
}

/**
 * Portero offline: sin los datos indispensables en el dispositivo, la
 * operación no se puede iniciar (fail-closed).
 */
export default function RutaNuevaVenta() {
  return (
    <RutaOperacionGate operacion="venta">
      <RutaNuevaVentaInner />
    </RutaOperacionGate>
  );
}
