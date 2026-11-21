/**
 * Ticket de liquidación de ruta. Se arma como documento de ticket
 * (`DocumentoTicket`) y se dibuja con el MISMO motor que el ticket de venta
 * (`ticketLayout`): encabezado de empresa del diseñador, columnas fijas y
 * estilo monoespaciado. Sale en PDF por código (`ticketPdf`) o en HTML para
 * imprimir; nunca por captura de pantalla (D-051).
 */
import type { TicketEmpresa } from './ticketHtml';
import { documentoTicketHTML } from './ticketHtml';
import {
  construirEncabezadoTicket, resolverOpcionesTicket, crearFormatoTicket,
  MARCA_RUTAPP, MOTIVO_DEVOLUCION_LABELS, type RenglonTicket,
} from './ticketModelo';
import type { DocumentoTicket } from './ticketLayout';
import { documentoTicketPdf, nombreArchivoTicket, type OpcionesTicketPdf } from './ticketPdf';

export interface StockLineItem {
  nombre: string;
  codigo: string;
  cargada: number;
  vendida: number;
  devuelta: number;
  restante: number;
}

export interface LiquidacionTicketData {
  currencySymbol?: string;
  empresaNombre: string;
  /** Datos de la empresa para el encabezado (con `ticket_campos` del diseñador). */
  empresa?: TicketEmpresa;
  vendedorNombre: string;
  fechaInicio: string;
  fechaFin: string;
  status: string;
  efectivoEntregado: number;
  ventas: { folio: string; cliente: string; condicion: string; total: number }[];
  cobros: { cliente: string; metodo: string; monto: number }[];
  gastos: { concepto: string; monto: number }[];
  devoluciones: { nombre: string; cantidad: number; motivo: string }[];
  cuadre: {
    totalContado: number;
    totalCredito: number;
    cobrosEfectivo: number;
    cobrosTransferencia: number;
    cobrosTarjeta: number;
    totalGastos: number;
    efectivoEsperado: number;
    diferencia: number;
  };
  stockInicio?: { fecha: string; lineas: StockLineItem[] };
  stockFin?: { fecha: string; lineas: StockLineItem[] };
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
};

/** Formato de dinero solo ASCII con un símbolo dado (−$1,234.50). */
function formatoConSimbolo(sym: string): (n: number) => string {
  return (n: number) => {
    const [ent, dec] = Math.abs(n).toFixed(2).split('.');
    return `${n < 0 ? '-' : ''}${sym}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
  };
}

/** Documento de ticket de la liquidación (mismos renglones que el ticket de venta). */
export function construirDocumentoLiquidacion(data: LiquidacionTicketData): DocumentoTicket {
  const {
    vendedorNombre, fechaInicio, fechaFin, status,
    efectivoEntregado, ventas, cobros, gastos, devoluciones, cuadre,
  } = data;
  const empresa: TicketEmpresa = data.empresa ?? { nombre: data.empresaNombre };
  const opciones = resolverOpcionesTicket(empresa.ticket_campos);
  const fmt = data.currencySymbol ? formatoConSimbolo(data.currencySymbol) : crearFormatoTicket(empresa.moneda);

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCobros = cobros.reduce((s, c) => s + c.monto, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const periodo = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;

  const c: RenglonTicket[] = [];
  const sep = () => c.push({ tipo: 'separador' });
  const par = (izq: string, der: string, negrita?: boolean) => c.push({ tipo: 'par', izq, der, negrita });

  sep();
  c.push({ tipo: 'titulo', texto: 'LIQUIDACION DE RUTA' });
  c.push({ tipo: 'texto', texto: `Estado: ${STATUS_LABEL[status] ?? status}`, modo: 'recortar' });
  sep();
  c.push({ tipo: 'texto', texto: `Vendedor: ${vendedorNombre}`, modo: 'recortar' });
  c.push({ tipo: 'texto', texto: `Periodo: ${periodo}`, modo: 'envolver' });

  sep();
  c.push({ tipo: 'titulo', texto: 'RESUMEN DE COBROS' });
  par('+ Cobros en efectivo', fmt(cuadre.cobrosEfectivo));
  if (cuadre.cobrosTransferencia > 0) par('Cobros transferencia', fmt(cuadre.cobrosTransferencia));
  if (cuadre.cobrosTarjeta > 0) par('Cobros tarjeta', fmt(cuadre.cobrosTarjeta));
  par('- Gastos', `-${fmt(cuadre.totalGastos)}`);

  sep();
  c.push({ tipo: 'titulo', texto: 'CUADRE DE EFECTIVO' });
  par('Efectivo esperado', fmt(cuadre.efectivoEsperado), true);
  par('Efectivo entregado', fmt(efectivoEntregado), true);
  const dif = cuadre.diferencia;
  const difLabel = dif > 0 ? 'Sobra' : dif < 0 ? 'Falta' : 'Cuadra';
  par('Diferencia', `${dif > 0 ? '+' : ''}${fmt(dif)} (${difLabel})`, true);

  if (ventas.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: `VENTAS (${ventas.length})` });
    for (const v of ventas) par(`${v.folio} ${v.cliente}`, fmt(v.total));
    sep();
    par('Total ventas', fmt(totalVentas), true);
    par('  Contado', fmt(cuadre.totalContado));
    par('  Credito', fmt(cuadre.totalCredito));
  }

  if (cobros.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: `COBROS (${cobros.length})` });
    for (const co of cobros) par(`${co.cliente} (${co.metodo})`, fmt(co.monto));
    sep();
    par('Total cobros', fmt(totalCobros), true);
  }

  if (gastos.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: `GASTOS (${gastos.length})` });
    for (const g of gastos) par(g.concepto, `-${fmt(g.monto)}`);
    sep();
    par('Total gastos', `-${fmt(totalGastos)}`, true);
  }

  if (devoluciones.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: `DEVOLUCIONES (${devoluciones.length})` });
    for (const d of devoluciones) par(`${d.cantidad}x ${d.nombre}`, MOTIVO_DEVOLUCION_LABELS[d.motivo] ?? d.motivo);
  }

  const stock = (s: LiquidacionTicketData['stockInicio'], titulo: string) => {
    if (!s || s.lineas.length === 0) return;
    sep();
    c.push({ tipo: 'titulo', texto: titulo });
    c.push({ tipo: 'texto', texto: `(${s.fecha})`, modo: 'envolver' });
    for (const l of s.lineas) {
      c.push({ tipo: 'producto', texto: l.nombre, importe: String(l.restante), gratis: false });
      c.push({ tipo: 'detalle', partes: [{ texto: `C:${l.cargada} V:${l.vendida} D:${l.devuelta}` }] });
    }
  };
  stock(data.stockInicio, 'STOCK A BORDO - INICIO');
  stock(data.stockFin, 'STOCK A BORDO - FIN');

  sep();
  c.push({ tipo: 'blanco' });
  c.push({ tipo: 'blanco' });
  c.push({ tipo: 'firmas', izq: 'Vendedor', der: 'Supervisor' });
  c.push({ tipo: 'blanco' });

  return {
    encabezado: construirEncabezadoTicket(empresa, opciones),
    cuerpo: c,
    pie: [],
    marca: MARCA_RUTAPP,
  };
}

/** HTML del ticket de liquidación (mismo dibujo que el ticket de venta). */
export function buildLiquidacionTicketHTML(data: LiquidacionTicketData, opts?: { columnas?: number }): string {
  return documentoTicketHTML(construirDocumentoLiquidacion(data), { columnas: opts?.columnas });
}

/** PDF del ticket de liquidación (80 mm por omisión, alto dinámico), generado por código. */
export async function generarLiquidacionTicketPdf(data: LiquidacionTicketData, opts: OpcionesTicketPdf = {}): Promise<{ blob: Blob; fileName: string }> {
  const doc = await documentoTicketPdf(construirDocumentoLiquidacion(data), {
    titulo: `Liquidacion ${data.vendedorNombre} ${data.fechaInicio}`,
    ...opts,
  });
  return { blob: doc.output('blob'), fileName: nombreArchivoTicket(`${data.vendedorNombre}-${data.fechaInicio}`, 'Ticket-Liquidacion') };
}
