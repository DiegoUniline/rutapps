/**
 * Ticket único: el modelo decide los renglones; HTML y ESC/POS dibujan lo mismo
 * con cada opción del diseñador; con ticket_campos vacío los montos no cambian
 * respecto a los renderizadores anteriores (fixtures/ticketAntes.json, generado
 * con el código previo al ticket único), salvo la corrección de «Total pagado»
 * en contado sin pago.
 */
import { describe, it, expect } from 'vitest';
import { buildTicketHTML, type TicketData } from '@/lib/ticketHtml';
import { buildEscPosBytes } from '@/lib/escpos';
import {
  construirModeloTicket, getTicketTotalsSummary, campoOn, campoTexto, leerTicketCampos,
  resolverOpcionesTicket, type RenglonTicket, type TicketCampos,
} from '@/lib/ticketModelo';
import { ticketATexto } from '@/lib/ticketLayout';
import { ticketVentaADatos } from '@/lib/ticketVentaData';
import {
  TODOS_LOS_TICKETS, ticketEjemplo, ticketPedidoContadoSinPago, ticketContadoParcial,
  ticketContadoTotal, ticketRutaCredito, ticketCobro,
} from './fixtures/ticketFixtures';
import { escposATexto } from './fixtures/escposTexto';
import antes from './fixtures/ticketAntes.json';

type Salida = { html: string; escpos58: string[]; escpos80: string[] };
const ANTES = antes as Record<string, Salida>;

const conCampos = (td: TicketData, campos: TicketCampos): TicketData => ({ ...td, empresa: { ...td.empresa, ticket_campos: campos } });

const unescape = (s: string) => s.replace(/<\/?s>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
const norm = (s: string) => ascii(s).replace(/\s+/g, ' ').trim();

/** Renglones del bloque monoespaciado del HTML (cuerpo + pie + marca). */
const htmlCuerpo = (html: string) => unescape(html.match(/<pre[^>]*>([\s\S]*)<\/pre>/)![1]).split('\n');
/** Encabezado HTML (empresa) como texto. */
const htmlEncabezado = (html: string) => unescape(html.split('<pre')[0].replace(/<[^>]+>/g, '\n')).split('\n').map(norm).filter(Boolean);

/** Desde el primer separador hasta antes de la marca Rutapp, sin renglones vacíos. */
function cuerpoComparable(lineas: string[]): string[] {
  const ini = lineas.findIndex(l => /^-{10,}$/.test(l.trim()));
  const fin = lineas.findIndex(l => l.trim() === 'Rutapp.mx');
  return lineas.slice(ini, fin).map(norm).filter(Boolean);
}

async function salidas(td: TicketData) {
  const html = buildTicketHTML(td);
  const e58 = escposATexto(await buildEscPosBytes(td, { ticketAncho: '58' }));
  const e80 = escposATexto(await buildEscPosBytes(td, { ticketAncho: '80' }));
  return { html, e58, e80, texto58: cuerpoComparable(e58), textoHtml: cuerpoComparable(htmlCuerpo(html)), todoHtml: [...htmlEncabezado(html), ...htmlCuerpo(html).map(norm)].join('\n'), todo58: e58.map(norm).join('\n'), todo80: e80.map(norm).join('\n') };
}

const MONTO = /-?\$[\d,]+\.\d{2}|GRATIS/g;
const montos = (lineas: string[], excluir?: RegExp) =>
  lineas.filter(l => !(excluir && excluir.test(l.trim()))).flatMap(l => l.match(MONTO) ?? []);

const pares = (r: RenglonTicket[]) => r.flatMap(x => (x.tipo === 'par' ? [`${x.izq.trim()}=${x.der}`] : []));

describe('construirModeloTicket — renglones del ticket de ejemplo', () => {
  const m = construirModeloTicket(ticketEjemplo);
  const textos = m.cuerpo.flatMap(r => (r.tipo === 'producto' ? [`${r.texto}|${r.importe}`] : r.tipo === 'detalle' ? [r.partes.map(p => p.texto).join('')] : r.tipo === 'texto' || r.tipo === 'titulo' ? [r.texto] : []));

  it('productos: código, P.U., descuento, sugerido y gratis', () => {
    expect(textos).toEqual(expect.arrayContaining([
      '2x REF-2L Refresco 2L|$90.20', 'P.U. $45.10', 'Desc. 10% -$10.02', 'Sug $60.00',
      '3x GAL-01 Galletas surtidas|$52.20', 'P.U. $17.40',
      '1x AGU-1L Agua 1L|GRATIS', 'Antes $11.60 Agua gratis en tu compra',
      '1x DET-1K Detergente 1kg|$58.00',
    ]));
  });

  it('totales, pagos, estado de cuenta y devoluciones', () => {
    expect(pares(m.cuerpo)).toEqual([
      'Cant Producto=Importe',
      'Subtotal sin impuestos=$185.00', 'Descuentos/promos=-$18.00', 'Subtotal gravable=$167.00',
      'IEPS=$5.76', 'IVA=$27.64',
      'Total=$200.40', 'Total pagado=$150.00', 'Saldo=$350.40',
      'Agua gratis en tu compra=-$11.60',
      'Recibido=$200.00', 'Cambio=$50.00',
      'Saldo ant=$300.00', 'Pago=-$150.00', '+Venta=$200.40', 'Saldo=$350.40',
      '14/03/2026 efectivo=$150.00',
      'Caducado=Nota credito $17.40',
    ]);
    expect(textos).toEqual(expect.arrayContaining(['PROMOCIONES APLICADAS', 'EDO. CUENTA', 'PAGOS RECIBIDOS', 'DEVOLUCIONES', '1x Galletas surtidas']));
    expect(m.cuerpo.some(r => r.tipo === 'firmas')).toBe(true);
    expect(m.pie[0]).toBe('Gracias por su compra');
    expect(m.marca).toEqual(['Rutapp.mx', 'Sistema de Venta en ruta', 'Contrata al 317 104 5954']);
  });

  it('cuadra: sin impuestos − descuentos = gravable; gravable + IEPS + IVA = total', () => {
    const t = m.totales;
    expect(Math.round((t.sinImpuestos - t.descuento) * 100) / 100).toBe(t.gravable);
    expect(Math.round((t.gravable + t.ieps + t.iva) * 100) / 100).toBe(200.40);
    expect(Math.round((t.subtotalBruto - t.descuentoBruto) * 100) / 100).toBe(200.40);
  });
});

describe('opciones del diseñador (ticket_campos)', () => {
  it('campoOn / campoTexto / leerTicketCampos', () => {
    expect(campoOn(null, 'vendedor_nombre')).toBe(true);
    expect(campoOn({ vendedor_nombre: false }, 'vendedor_nombre')).toBe(false);
    expect(campoOn({ texto_pie: 'hola' }, 'texto_pie')).toBe(true);
    expect(campoTexto({ texto_pie: '  hola  ' }, 'texto_pie')).toBe('hola');
    expect(campoTexto({ texto_pie: true }, 'texto_pie')).toBe('');
    expect(leerTicketCampos({ a: true, b: 'x', c: 3, d: null })).toEqual({ a: true, b: 'x' });
    expect(leerTicketCampos([1])).toBeNull();
    // Vacío = todo encendido (comportamiento de siempre)
    const o = resolverOpcionesTicket({});
    expect(Object.entries(o).filter(([, v]) => v === false)).toEqual([]);
  });

  // [clave, texto que desaparece al apagarla]
  const CASOS: [string, string][] = [
    ['nombre', 'ABARROTERA DEL SUR'], ['razon_social', 'SA de CV'], ['rfc', 'RFC: ASU010101AAA'],
    ['direccion', 'Av. Juarez 100'], ['telefono', 'Tel: 999 123 4567'], ['email', 'ventas@abarrotera.mx'],
    ['folio', 'Folio: VTA-0001'], ['fecha', 'Fecha: 14/03/2026'], ['condicion_pago', 'Pago: Credito'],
    ['cliente_nombre', 'Cliente: Abarrotes'], ['cliente_rfc', 'RFC: XAXX010101000'], ['cliente_telefono', 'Tel: 555-123-4567'],
    ['cliente_direccion', 'Dir: Calle Reforma'], ['vendedor_nombre', 'Vendedor: Maria Lopez'], ['vendedor_telefono', 'Tel. vend:'],
    ['descuentos', 'Descuentos/promos'], ['saldo_cuenta', 'EDO. CUENTA'], ['recibido_cambio', 'Recibido $200.00'],
    ['promociones', 'PROMOCIONES APLICADAS'], ['pagos_recibidos', 'PAGOS RECIBIDOS'], ['devoluciones', 'DEVOLUCIONES'],
    ['notas_ticket', 'No se aceptan devoluciones'], ['firmas', 'Entrego'], ['mensaje_gracias', 'Gracias por su compra'],
    ['linea_precio_unitario', 'P.U. $45.10'], ['linea_precio_sugerido', 'Sug $60.00'], ['linea_codigo', 'REF-2L'],
    ['linea_descuento', 'Desc. 10%'], ['linea_promo', 'GRATIS'],
    ['impuestos', 'Subtotal gravable'], ['impuestos_desglose', 'IEPS $5.76'],
  ];

  it.each(CASOS)('%s: encendido se ve y apagado desaparece, igual en HTML y ESC/POS', async (clave, texto) => {
    const on = await salidas(conCampos(ticketEjemplo, {}));
    const off = await salidas(conCampos(ticketEjemplo, { [clave]: false }));
    const t = norm(texto);
    // El nombre comercial también es el inicio de la razón social: se compara el renglón completo.
    const esta = (todo: string) => (clave === 'nombre'
      ? todo.split('\n').some(l => l.toUpperCase() === t.toUpperCase())
      : todo.includes(t));
    expect(esta(on.todoHtml)).toBe(true);
    expect(esta(on.todo58)).toBe(true);
    expect(esta(off.todoHtml)).toBe(false);
    expect(esta(off.todo58)).toBe(false);
    expect(esta(off.todo80)).toBe(false);
  });

  it('impuestos apagado: subtotal y descuento en bruto; sin IVA/IEPS', async () => {
    const s = await salidas(conCampos(ticketEjemplo, { impuestos: false }));
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toEqual(expect.arrayContaining(['Sub total $222.02', 'Descuentos/promos -$21.62', 'Total $200.40']));
      expect(txt.some(l => /^(IVA|IEPS|Impuestos) /.test(l))).toBe(false);
    }
  });

  it('desglose apagado: un solo renglón «Impuestos» con IVA + IEPS', async () => {
    const s = await salidas(conCampos(ticketEjemplo, { impuestos_desglose: false }));
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toContain('Impuestos $33.40');
      expect(txt.some(l => /^(IVA|IEPS) /.test(l))).toBe(false);
    }
  });

  it('renglón de promo apagado: el gratis sale con su precio y el bloque de promociones sigue', async () => {
    const s = await salidas(conCampos(ticketEjemplo, { linea_promo: false }));
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toContain('1x AGU-1L Agua 1L $11.60');
      expect(txt).toContain('PROMOCIONES APLICADAS');
    }
  });

  it('textos libres de encabezado y pie', async () => {
    const td = conCampos(ticketEjemplo, { texto_encabezado: 'Sucursal Norte', texto_pie: 'Siguenos en redes' });
    const s = await salidas(td);
    expect(s.todoHtml).toContain('Sucursal Norte');
    expect(s.todoHtml).toContain('Siguenos en redes');
    expect(s.todo58).toContain('Sucursal Norte');
    expect(s.todo58).toContain('Siguenos en redes');
  });

  it('escapa HTML en textos del usuario', () => {
    const td = conCampos({ ...ticketEjemplo, clienteNombre: '<img src=x onerror=alert(1)>' }, { texto_pie: '<b>x</b>' });
    const html = buildTicketHTML(td);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;img');
  });
});

describe('HTML y ESC/POS dibujan los mismos renglones', () => {
  const combinaciones: TicketCampos[] = [
    {}, { impuestos: false }, { impuestos_desglose: false }, { promociones: false }, { linea_promo: false },
    { linea_precio_unitario: false, linea_codigo: false, linea_descuento: false, linea_precio_sugerido: false },
    { vendedor_nombre: false, saldo_cuenta: false, firmas: false, mensaje_gracias: false },
  ];
  for (const [nombre, td] of Object.entries(TODOS_LOS_TICKETS)) {
    it.each(combinaciones.map(c => [JSON.stringify(c), c] as const))(`${nombre} con %s`, async (_k, campos) => {
      const s = await salidas(conCampos(td, campos));
      expect(s.texto58).toEqual(s.textoHtml);
      // 80 mm acomoda distinto (48 columnas) pero lleva los mismos montos.
      expect(montos(cuerpoComparable(s.e80))).toEqual(montos(s.textoHtml));
    });
  }
});

describe('con ticket_campos vacío los montos no cambian (antes vs después)', () => {
  // Para comparar igual con igual se apagan los dos renglones nuevos (código y
  // descuento por producto), que antes no existían.
  const sinNuevos = { linea_codigo: false, linea_descuento: false };
  const iguales = Object.keys(TODOS_LOS_TICKETS).filter(k => !['pedidoContadoSinPago', 'contadoParcial'].includes(k));

  it.each(iguales)('%s: HTML mismos renglones y montos', async k => {
    const s = await salidas(conCampos(TODOS_LOS_TICKETS[k], sinNuevos));
    const viejo = htmlCuerpo(ANTES[k].html);
    expect(montos(s.textoHtml)).toEqual(montos(cuerpoComparable(viejo)));
    // Mismo texto salvo las notas (antes se cortaban a 32 caracteres; ahora se envuelven).
    const notas = norm(TODOS_LOS_TICKETS[k].empresa.notas_ticket ?? '');
    const sinNotas = (ls: string[]) => ls.filter(l => !notas.includes(l));
    expect(sinNotas(s.textoHtml)).toEqual(sinNotas(cuerpoComparable(viejo)));
    expect(htmlEncabezado(s.html)).toEqual(htmlEncabezado(ANTES[k].html));
  });

  it.each(iguales)('%s: ESC/POS 58 y 80 mismos montos (el sugerido ahora también se imprime)', async k => {
    const s = await salidas(conCampos(TODOS_LOS_TICKETS[k], sinNuevos));
    expect(montos(s.texto58, /^Sug /)).toEqual(montos(cuerpoComparable(ANTES[k].escpos58), /^Sug /));
    expect(montos(cuerpoComparable(s.e80), /^Sug /)).toEqual(montos(cuerpoComparable(ANTES[k].escpos80), /^Sug /));
  });
});

describe('Total pagado = solo pagos registrados (nunca se supone por «contado»)', () => {
  it('contado sin pago: «Total pagado» $0.00 y saldo = total', async () => {
    expect(getTicketTotalsSummary(ticketPedidoContadoSinPago)).toMatchObject({ totalPagado: 0, hayPago: false, saldo: 150 });
    const s = await salidas(ticketPedidoContadoSinPago);
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toContain('Total pagado $0.00');
      expect(txt).toEqual(expect.arrayContaining(['Total $150.00', 'Saldo $150.00', '+Por pagar $150.00']));
      expect(txt.filter(l => l === 'Saldo $150.00')).toHaveLength(2); // totales y estado de cuenta
    }
    // Antes salía como pagado
    expect(cuerpoComparable(htmlCuerpo(ANTES.pedidoContadoSinPago.html))).toContain('Total pagado $150.00');
  });

  it('contado con pago parcial: recibido, pagado y saldo correctos', async () => {
    const s = await salidas(ticketContadoParcial);
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toEqual(expect.arrayContaining(['Total pagado $100.00', 'Saldo $50.00', 'Recibido $100.00', '+Por pagar $50.00']));
    }
  });

  it('contado pagado completo con cambio', async () => {
    expect(getTicketTotalsSummary(ticketContadoTotal)).toMatchObject({ totalPagado: 150, hayPago: true, saldo: 0 });
    const s = await salidas(ticketContadoTotal);
    for (const txt of [s.textoHtml, s.texto58]) {
      expect(txt).toEqual(expect.arrayContaining(['Total pagado $150.00', 'Saldo $0.00', 'Recibido $200.00', 'Cambio $50.00']));
      expect(txt.some(l => l.startsWith('+Por pagar'))).toBe(false);
    }
  });

  it('crédito sin cambios', async () => {
    const s = await salidas(ticketRutaCredito);
    const notas = norm(ticketRutaCredito.empresa.notas_ticket ?? '');
    const sinNotas = (ls: string[]) => ls.filter(l => !notas.includes(l));
    const igual = await salidas(conCampos(ticketRutaCredito, { linea_codigo: false, linea_descuento: false }));
    expect(sinNotas(igual.textoHtml)).toEqual(sinNotas(cuerpoComparable(htmlCuerpo(ANTES.rutaCredito.html))));
    expect(s.textoHtml).toEqual(expect.arrayContaining(['Total pagado $0.00', 'Total $390.00', 'Saldo $890.00', '+Venta $390.00']));
  });

  it('recibo de cobro: lo cobrado cuenta como pagado', async () => {
    const s = await salidas(ticketCobro);
    expect(s.textoHtml).toEqual(expect.arrayContaining(['Total pagado $250.00', 'Saldo $640.00', 'Pago -$250.00']));
  });
});

describe('comprobante en pantalla (TicketVenta) usa el mismo ticket', () => {
  it('ticketVentaADatos resuelve nombre de ticket y código desde el catálogo', () => {
    const td = ticketVentaADatos({
      empresa: ticketEjemplo.empresa, folio: 'X', fecha: 'hoy', clienteNombre: 'C',
      lineas: [{ nombre: 'Interno', cantidad: 1, precio: 10, total: 10, producto_id: 'p1' }],
      subtotal: 10, iva: 0, total: 10, condicionPago: 'contado',
      promociones: [{ descripcion: 'p', descuento: 2 }], descuentoDevolucion: 1,
      productosList: [{ id: 'p1', nombre: 'Interno', nombre_ticket: 'Para ticket', codigo: 'C-1' }],
    });
    expect(td.lineas[0]).toMatchObject({ nombre: 'Para ticket', codigo: 'C-1' });
    expect(td.descuento).toBe(3);
    expect(td.pagos).toEqual([]);
  });

  it('el texto para compartir lleva los mismos renglones', () => {
    const texto = ticketATexto(construirModeloTicket(ticketEjemplo));
    for (const t of ['Total                    $200.40', 'Total pagado             $150.00', '1x AGU-1L Agua 1L         GRATIS', 'Rutapp.mx']) {
      expect(texto).toContain(t);
    }
  });
});
