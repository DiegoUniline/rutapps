/**
 * Maquetación en columnas fijas del modelo único del ticket (`ticketModelo`).
 * La usan el HTML (bloque monoespaciado), el ESC/POS (impresora térmica) y el
 * texto para compartir, para que los tres acomoden los renglones igual.
 */
import type { ModeloTicket, RenglonTicket } from './ticketModelo';

export interface ParteLinea { texto: string; tachado?: boolean }
export interface LineaTicket {
  partes: ParteLinea[];
  /** Centrada: el HTML la rellena con espacios; el ESC/POS usa alineación centrada. */
  centro?: boolean;
  negrita?: boolean;
}

export interface TicketMaquetado {
  /** Nombre (negrita) + datos de la empresa + texto libre del encabezado, centrados. */
  encabezado: LineaTicket[];
  cuerpo: LineaTicket[];
  pie: LineaTicket[];
  marca: LineaTicket[];
}

export const textoLinea = (l: LineaTicket) => l.partes.map(p => p.texto).join('');

export function pad(left: string, right: string, cols: number): string {
  const l = left.substring(0, Math.max(0, cols - right.length - 1));
  return l + ' '.repeat(Math.max(1, cols - l.length - right.length)) + right;
}

export function centerText(s: string, cols: number): string {
  s = s.substring(0, cols);
  return ' '.repeat(Math.floor((cols - s.length) / 2)) + s;
}

function centrarEn(s: string, w: number): string {
  s = s.substring(0, w);
  const izq = Math.floor((w - s.length) / 2);
  return ' '.repeat(izq) + s + ' '.repeat(w - s.length - izq);
}

export function wrapText(s: string, cols: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if ((cur + ' ' + w).trim().length <= cols) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w.substring(0, cols);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const simple = (texto: string, extra?: Partial<LineaTicket>): LineaTicket => ({ partes: [{ texto }], ...extra });

/** Recorta las partes de una línea al ancho, conservando el tachado. */
function recortarPartes(partes: ParteLinea[], cols: number): ParteLinea[] {
  const out: ParteLinea[] = [];
  let usado = 0;
  for (const p of partes) {
    const libre = cols - usado;
    if (libre <= 0) break;
    const t = p.texto.substring(0, libre);
    if (t) out.push({ ...p, texto: t });
    usado += t.length;
  }
  return out;
}

function maquetarRenglon(r: RenglonTicket, cols: number, L: (s: string) => string): LineaTicket[] {
  switch (r.tipo) {
    case 'separador': return [simple('-'.repeat(cols))];
    case 'blanco': return [simple('')];
    case 'titulo': return [simple(L(r.texto).substring(0, cols), { negrita: true })];
    case 'texto': {
      const t = L(r.texto);
      if (r.modo === 'envolver') return wrapText(t, cols).map(x => simple(x));
      return [simple(r.modo === 'recortar' ? t.substring(0, cols) : t)];
    }
    case 'par': {
      const izq = r.recorteIzq ? L(r.izq).substring(0, cols - r.recorteIzq) : L(r.izq);
      return [simple(pad(izq, L(r.der), cols), { negrita: r.negrita })];
    }
    case 'producto': {
      const nombre = L(r.texto);
      const imp = L(r.importe);
      const maxFirst = cols - imp.length - 1;
      if (nombre.length <= maxFirst) return [simple(pad(nombre, imp, cols))];
      // Nombre largo: se envuelve; el importe va solo en la primera línea.
      const wrapped = wrapText(nombre, maxFirst);
      return [simple(pad(wrapped[0] ?? '', imp, cols)), ...wrapped.slice(1).map(x => simple(x))];
    }
    case 'detalle':
      return [{ partes: recortarPartes([{ texto: '  ' }, ...r.partes.map(p => ({ ...p, texto: L(p.texto) }))], cols) }];
    case 'firmas': {
      const w = Math.floor((cols - 2) / 2);
      return [
        simple(pad('_'.repeat(w), '_'.repeat(w), cols)),
        simple(pad(centrarEn('Entrego', w), centrarEn('Recibio', w), cols)),
      ];
    }
  }
}

/**
 * Acomoda el modelo a `cols` columnas. `limpiar` se aplica a cada texto antes de
 * medirlo (el ESC/POS lo usa para dejar solo ASCII y no descuadrar columnas).
 */
export function maquetarTicket(modelo: ModeloTicket, cols: number, limpiar: (s: string) => string = s => s): TicketMaquetado {
  const L = limpiar;
  const envolverCentrado = (s: string, extra?: Partial<LineaTicket>) =>
    s.split('\n').flatMap(par => wrapText(L(par), cols)).map(x => simple(x, { centro: true, ...extra }));

  const encabezado: LineaTicket[] = [];
  if (modelo.encabezado.nombre) encabezado.push(...envolverCentrado(modelo.encabezado.nombre, { negrita: true }));
  for (const l of modelo.encabezado.lineas) encabezado.push(...envolverCentrado(l.texto));
  if (modelo.encabezado.textoLibre) encabezado.push(...envolverCentrado(modelo.encabezado.textoLibre));

  return {
    encabezado,
    cuerpo: modelo.cuerpo.flatMap(r => maquetarRenglon(r, cols, L)),
    pie: modelo.pie.flatMap(t => envolverCentrado(t)),
    marca: modelo.marca.map(t => simple(L(t), { centro: true })),
  };
}

/** Texto plano del ticket (para compartir): encabezado, cuerpo, pie y marca. */
export function ticketATexto(modelo: ModeloTicket, cols = 32): string {
  const m = maquetarTicket(modelo, cols);
  const centro = (l: LineaTicket) => (l.centro ? centerText(textoLinea(l), cols) : textoLinea(l)).replace(/\s+$/, '');
  return [...m.encabezado, ...m.cuerpo, ...m.pie, ...m.marca].map(centro).join('\n');
}
