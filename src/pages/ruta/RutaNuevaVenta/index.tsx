import { ArrowLeft } from 'lucide-react';
import TicketVenta from '@/components/ruta/TicketVenta';
import { STEPS, STEP_LABELS } from './types';
import { useRutaVenta } from './useRutaVenta';
import { StepTipo } from './StepTipo';
import { StepSinCompra } from './StepSinCompra';
import { StepCliente } from './StepCliente';
import { StepDevoluciones } from './StepDevoluciones';
import { StepProductos } from './StepProductos';
import { StepResumen } from './StepResumen';
import { StepPago } from './StepPago';

export default function RutaNuevaVenta() {
  const h = useRutaVenta();

  if (h.ticketInfo) {
    return (
      <TicketVenta
        empresa={{ nombre: h.empresa?.nombre ?? '', telefono: h.empresa?.telefono, direccion: h.empresa?.direccion, logo_url: h.empresa?.logo_url, rfc: h.empresa?.rfc }}
        folio={h.ticketInfo.folio} fecha={h.ticketInfo.fecha} clienteNombre={h.clienteNombre}
        lineas={h.cart.map(item => { const lineSub = item.precio_unitario * item.cantidad; const lineIeps = item.tiene_ieps ? lineSub * (item.ieps_pct / 100) : 0; const lineIva = item.tiene_iva ? (lineSub + lineIeps) * (item.iva_pct / 100) : 0; return { nombre: item.nombre, cantidad: item.cantidad, precio: item.precio_unitario, subtotal: lineSub, iva_monto: lineIva, ieps_monto: lineIeps, descuento_pct: 0, total: lineSub + lineIeps + lineIva, esCambio: item.es_cambio }; })}
        subtotal={h.totals.subtotal} iva={h.totals.iva} ieps={h.totals.ieps} total={h.totals.total}
        descuentoDevolucion={h.totals.descuentoDevolucion ?? 0}
        devoluciones={h.devoluciones.map(d => ({ nombre: d.nombre, cantidad: d.cantidad, motivo: d.motivo, accion: d.accion, monto: d.precio_unitario * d.cantidad }))}
        condicionPago={h.condicionPago} pagos={h.pagos} montoRecibido={h.montoRecibidoNum} cambio={h.cambio}
        saldoAnterior={h.saldoPendienteTotal} pagoAplicado={h.totalAplicarCuentas}
        saldoNuevo={h.saldoPendienteTotal - h.totalAplicarCuentas + (h.condicionPago === 'credito' ? h.totals.total : 0)}
        onClose={() => h.navigate('/ruta')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={h.goBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all"><ArrowLeft className="h-[18px] w-[18px] text-foreground" /></button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Nueva venta</span>
        </div>
        <div className="flex px-3 pb-2.5 gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-[3px] w-full rounded-full transition-colors ${i <= h.currentStepIdx ? 'bg-primary' : 'bg-border'}`} />
              <span className={`text-[9px] font-medium transition-colors ${i <= h.currentStepIdx ? 'text-primary' : 'text-muted-foreground/60'}`}>{STEP_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </header>

      {h.step === 'tipo' && !h.sinCompra && <StepTipo sinCompra={h.sinCompra} setSinCompra={h.setSinCompra} setTipoVenta={h.setTipoVenta} setCondicionPago={h.setCondicionPago} setStep={h.setStep} urlClienteId={h.urlClienteId} />}
      {h.step === 'tipo' && h.sinCompra && <StepSinCompra clienteNombre={h.clienteNombre} motivoSinCompra={h.motivoSinCompra} setMotivoSinCompra={h.setMotivoSinCompra} notas={h.notas} setNotas={h.setNotas} savingSinCompra={h.savingSinCompra} setSavingSinCompra={h.setSavingSinCompra} setSinCompra={h.setSinCompra} saveVisita={h.saveVisita} markVisited={h.markVisited} clienteId={h.clienteId} urlClienteId={h.urlClienteId} navigate={h.navigate} />}
      {h.step === 'cliente' && <StepCliente searchCliente={h.searchCliente} setSearchCliente={h.setSearchCliente} filteredClientes={h.filteredClientes} clienteId={h.clienteId} setClienteId={h.setClienteId} setClienteNombre={h.setClienteNombre} setClienteCredito={h.setClienteCredito} setCondicionPago={h.setCondicionPago} setStep={h.setStep} />}
      {h.step === 'devoluciones' && <StepDevoluciones clienteNombre={h.clienteNombre} searchDevProducto={h.searchDevProducto} setSearchDevProducto={h.setSearchDevProducto} filteredDevProductos={h.filteredDevProductos} devoluciones={h.devoluciones} addDevolucion={h.addDevolucion} updateDevQty={h.updateDevQty} updateDevMotivo={h.updateDevMotivo} updateDevAccion={h.updateDevAccion} batchUpdateDevDefaults={h.batchUpdateDevDefaults} showReemplazoFor={h.showReemplazoFor} setShowReemplazoFor={h.setShowReemplazoFor} searchReemplazo={h.searchReemplazo} setSearchReemplazo={h.setSearchReemplazo} filteredReemplazoProductos={h.filteredReemplazoProductos} setReemplazo={h.setReemplazo} processDevolucionesAndGoToProductos={h.processDevolucionesAndGoToProductos} fmt={h.fmt} />}
      {h.step === 'productos' && <StepProductos clienteNombre={h.clienteNombre} devoluciones={h.devoluciones} searchProducto={h.searchProducto} setSearchProducto={h.setSearchProducto} filteredProductos={h.filteredProductos} cart={h.cart} cambioItems={h.cambioItems} tipoVenta={h.tipoVenta} totals={h.totals} addToCart={h.addToCart} updateQty={h.updateQty} removeFromCart={h.removeFromCart} getItemInCart={h.getItemInCart} getMaxQty={h.getMaxQty} setStep={h.setStep} setCart={h.setCart} stockAbordo={h.stockAbordo} usandoAlmacen={h.usandoAlmacen} fmt={h.fmt} />}
      {h.step === 'resumen' && <StepResumen clienteNombre={h.clienteNombre} devoluciones={h.devoluciones} cambioItems={h.cambioItems} chargedItems={h.chargedItems} promoResults={h.promoResults} totals={h.totals} saldoPendienteTotal={h.saldoPendienteTotal} setStep={h.setStep} goToPayment={h.goToPayment} navigate={h.navigate} cart={h.cart} fmt={h.fmt} />}
      {h.step === 'pago' && <StepPago tipoVenta={h.tipoVenta} entregaInmediata={h.entregaInmediata} fechaEntrega={h.fechaEntrega} setFechaEntrega={h.setFechaEntrega} condicionPago={h.condicionPago} setCondicionPago={h.setCondicionPago} clienteCredito={h.clienteCredito} excedeCredito={h.excedeCredito} creditoDisponible={h.creditoDisponible} saldoPendienteTotal={h.saldoPendienteTotal} cuentasPendientes={h.cuentasPendientes} liquidarTodas={h.liquidarTodas} updateCuentaMonto={h.updateCuentaMonto} totalAplicarCuentas={h.totalAplicarCuentas} pagos={h.pagos} setPagos={h.setPagos} notas={h.notas} setNotas={h.setNotas} totals={h.totals} totalACobrar={h.totalACobrar} cambio={h.cambio} saving={h.saving} cart={h.cart} devoluciones={h.devoluciones} sinImpuestos={h.sinImpuestos} setSinImpuestos={h.setSinImpuestos} handleSave={h.handleSave} navigate={h.navigate} fmt={h.fmt} />}
    </div>
  );
}
