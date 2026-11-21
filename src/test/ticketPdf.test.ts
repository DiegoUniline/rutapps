/**
 * Ticket PDF por código (D-051): el PDF dibuja el mismo documento que el
 * HTML/ESC/POS (modelo único + maquetado), respeta el ancho y los campos del
 * diseñador y no depende de capturas de pantalla.
 */
import { describe, it, expect } from 'vitest';
import type { TicketData } from '@/lib/ticketHtml';
import type { TicketCampos } from '@/lib/ticketModelo';
import { construirModeloTicket } from '@/lib/ticketModelo';
import { maquetarTicket, centerText, textoLinea } from '@/lib/ticketLayout';
import {
  documentoTicketPdf, limpiarTextoPdf, columnasTicket, anchoTicketMm, nombreArchivoTicket,
} from '@/lib/ticketPdf';
import { construirDocumentoLiquidacion, type LiquidacionTicketData } from '@/lib/liquidacionTicketHtml';
import { ticketEjemplo, ticketRutaCredito, ticketPosContado } from './fixtures/ticketFixtures';

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const conCampos = (td: TicketData, campos: TicketCampos): TicketData => ({ ...td, empresa: { ...td.empresa, ticket_campos: campos } });

/** Textos dibujados en el PDF sin comprimir: cada «(…) Tj», en orden. */
function textosPdf(raw: string): string[] {
  const out: string[] = [];
  const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(m[1].replace(/\\([()\\])/g, '$1'));
  return out;
}

async function pdfDe(td: TicketData, ticketAncho?: string, logoDataUrl: string | null = null) {
  const doc = await documentoTicketPdf(construirModeloTicket(td), { ticketAncho, logoDataUrl, comprimir: false });
  const raw = doc.output();
  return { doc, raw, textos: textosPdf(raw) };
}

const sinEspaciosFinales = (s: string) => s.replace(/\s+$/, '');

describe('ticketPdf: ancho y columnas del diseñador', () => {
  it('80 mm = 48 columnas (por omisión) y 58 mm = 32 columnas, como el ESC/POS', () => {
    expect(columnasTicket(undefined)).toBe(48);
    expect(columnasTicket('80')).toBe(48);
    expect(columnasTicket('58')).toBe(32);
    expect(anchoTicketMm(null)).toBe(80);
    expect(anchoTicketMm('58')).toBe(58);
  });

  it('la hoja mide el ancho del papel y el alto crece con el ticket', async () => {
    const corto = await pdfDe(ticketPosContado);
    expect(corto.doc.internal.pageSize.getWidth()).toBeCloseTo(80, 1);
    const alto80 = corto.doc.internal.pageSize.getHeight();
    expect(alto80).toBeGreaterThan(80);

    const angosto = await pdfDe(ticketPosContado, '58');
    expect(angosto.doc.internal.pageSize.getWidth()).toBeCloseTo(58, 1);

    const largo = await pdfDe({ ...ticketPosContado, lineas: Array.from({ length: 40 }, (_, i) => ({ ...ticketPosContado.lineas[0], nombre: `Producto ${i}` })) });
    expect(largo.doc.internal.pageSize.getHeight()).toBeGreaterThan(alto80 + 40);
    expect(largo.doc.getNumberOfPages()).toBe(1);
  });

  it('un ticket enorme se parte en varias hojas del mismo ancho', async () => {
    const enorme = await pdfDe({ ...ticketPosContado, lineas: Array.from({ length: 900 }, (_, i) => ({ ...ticketPosContado.lineas[0], nombre: `Producto ${i}` })) });
    expect(enorme.doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(enorme.textos.filter(t => /Producto 899/.test(t))).toHaveLength(1);
  });
});

describe('ticketPdf: mismo contenido que el maquetado único', () => {
  for (const ancho of ['80', '58'] as const) {
    it(`cada renglón del ticket (${ancho} mm) aparece en el PDF tal cual`, async () => {
      const { textos } = await pdfDe(ticketEjemplo, ancho);
      const cols = columnasTicket(ancho);
      const m = maquetarTicket(construirModeloTicket(ticketEjemplo), cols, limpiarTextoPdf);
      const esperados = [...m.encabezado, ...m.cuerpo, ...m.pie, ...m.marca]
        .map(l => sinEspaciosFinales(l.centro ? centerText(textoLinea(l), cols) : textoLinea(l)))
        .filter(Boolean);
      // Los renglones con tachado se dibujan por partes; el resto, de una pieza.
      const unidos = textos.join('\n');
      for (const e of esperados) {
        if (/^\s*Antes /.test(e)) continue;
        expect(unidos).toContain(e);
      }
    });
  }

  it('trae folio, cliente, total y la marca', async () => {
    const { textos } = await pdfDe(ticketRutaCredito);
    const todo = textos.join('\n');
    expect(todo).toContain(`Folio: ${ticketRutaCredito.folio}`);
    expect(todo).toContain('Cliente: Tienda La Esperanza');
    expect(todo).toMatch(/Total\s+\$[\d,]+\.\d\d/);
    expect(todo).toContain('Rutapp.mx');
  });
});

describe('ticketPdf: campos del diseñador encendidos/apagados', () => {
  it('apagar folio, cliente, firmas y gracias los quita del PDF; los textos libres salen', async () => {
    const td = conCampos(ticketRutaCredito, {
      folio: false, cliente_nombre: false, firmas: false, mensaje_gracias: false,
      texto_encabezado: 'Sucursal Norte', texto_pie: 'Visitenos pronto',
    });
    const todo = (await pdfDe(td)).textos.join('\n');
    expect(todo).not.toContain('Folio:');
    expect(todo).not.toContain('Cliente:');
    expect(todo).not.toContain('Recibio');
    expect(todo).not.toContain('Gracias por su compra');
    expect(todo).toContain('Sucursal Norte');
    expect(todo).toContain('Visitenos pronto');
  });

  it('con los campos por omisión salen firmas, gracias y encabezado de empresa', async () => {
    const todo = (await pdfDe(ticketRutaCredito)).textos.join('\n');
    expect(todo).toContain('Recibio');
    expect(todo).toContain('Gracias por su compra');
    expect(todo).toContain('RFC: ASU010101AAA');
  });

  it('logo: se incrusta como imagen si está encendido; apagado no', async () => {
    const td = { ...ticketPosContado, empresa: { ...ticketPosContado.empresa, logo_url: PNG_1X1 } };
    const con = await documentoTicketPdf(construirModeloTicket(td), { comprimir: false });
    expect(con.output()).toContain('/Subtype /Image');
    const sin = await documentoTicketPdf(construirModeloTicket(conCampos(td, { logo: false })), { comprimir: false });
    expect(sin.output()).not.toContain('/Subtype /Image');
  });

  it('un logo ilegible no rompe el ticket (sale sin logo)', async () => {
    const doc = await documentoTicketPdf(construirModeloTicket(ticketPosContado), { logoDataUrl: 'data:image/png;base64,AAAA', comprimir: false });
    expect(doc.output()).not.toContain('/Subtype /Image');
    expect(textosPdf(doc.output()).join('\n')).toContain('Folio: POS-0042');
  });
});

describe('ticketPdf: texto y archivo', () => {
  it('limpiarTextoPdf conserva el largo (columnas) y deja solo Latin-1', () => {
    const s = 'Añejo “café” – ok ✓ 🍺';
    const r = limpiarTextoPdf(s);
    expect(r).toBe('Añejo "café" - ok v ?');
    expect([...r].every(c => (c.codePointAt(0) ?? 0) <= 0xff)).toBe(true);
  });

  it('nombre de archivo seguro', () => {
    expect(nombreArchivoTicket('V-0001')).toBe('Ticket-V-0001.pdf');
    expect(nombreArchivoTicket('Ñ/01 x', 'Liquidacion')).toBe('Liquidacion-N_01_x.pdf');
  });
});

describe('ticket de liquidación: mismo motor de ticket', () => {
  const liq: LiquidacionTicketData = {
    empresaNombre: 'Abarrotera del Sur',
    empresa: { ...ticketEjemplo.empresa, logo_url: null },
    vendedorNombre: 'Juan Perez',
    fechaInicio: '2026-11-20', fechaFin: '2026-11-20', status: 'pendiente',
    efectivoEntregado: 900,
    ventas: [{ folio: 'V-1', cliente: 'Tienda Uno', condicion: 'contado', total: 500 }, { folio: 'V-2', cliente: 'Tienda Dos', condicion: 'credito', total: 700 }],
    cobros: [{ cliente: 'Tienda Uno', metodo: 'efectivo', monto: 1000 }],
    gastos: [{ concepto: 'Gasolina', monto: 50 }],
    devoluciones: [{ nombre: 'Coca Cola 600ml', cantidad: 2, motivo: 'danado' }],
    cuadre: {
      totalContado: 500, totalCredito: 700, cobrosEfectivo: 1000, cobrosTransferencia: 0, cobrosTarjeta: 0,
      totalGastos: 50, efectivoEsperado: 950, diferencia: -50,
    },
    stockInicio: { fecha: 'Camion 1', lineas: [{ nombre: 'Coca Cola 600ml', codigo: 'CC6', cargada: 24, vendida: 0, devuelta: 0, restante: 24 }] },
  };

  it('usa el encabezado de empresa del diseñador y los renglones del ticket', async () => {
    const documento = construirDocumentoLiquidacion(liq);
    expect(documento.encabezado.nombre).toBe('Abarrotera del Sur');
    expect(documento.encabezado.lineas.map(l => l.texto)).toContain('RFC: ASU010101AAA');
    const doc = await documentoTicketPdf(documento, { comprimir: false });
    const todo = textosPdf(doc.output()).join('\n');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(80, 1);
    expect(todo).toContain('LIQUIDACION DE RUTA');
    expect(todo).toContain('Vendedor: Juan Perez');
    expect(todo).toMatch(/Efectivo esperado\s+\$950\.00/);
    expect(todo).toMatch(/Diferencia\s+-\$50\.00 \(Falta\)/);
    expect(todo).toMatch(/V-1 Tienda Uno\s+\$500\.00/);
    expect(todo).toContain('Gasolina');
    expect(todo).toContain('Supervisor');
    expect(todo).toContain('C:24 V:0 D:0');
  });

  it('respeta los campos del diseñador en el encabezado (RFC apagado)', () => {
    const documento = construirDocumentoLiquidacion({ ...liq, empresa: { ...liq.empresa!, ticket_campos: { rfc: false } } });
    expect(documento.encabezado.lineas.map(l => l.texto)).not.toContain('RFC: ASU010101AAA');
  });

  it('sin datos de empresa usa el nombre recibido', () => {
    const documento = construirDocumentoLiquidacion({ ...liq, empresa: undefined });
    expect(documento.encabezado.nombre).toBe('Abarrotera del Sur');
  });
});
