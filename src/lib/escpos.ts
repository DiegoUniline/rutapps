/**
 * ESC/POS para impresoras térmicas de 58 y 80 mm. Dibuja el modelo único del
 * ticket (`ticketModelo`) con la misma maquetación en columnas que el HTML
 * (`ticketLayout`); aquí solo se traducen las líneas a bytes (alineación,
 * negritas, logo raster, corte).
 */
import type { TicketData } from './ticketHtml';
import { construirModeloTicket } from './ticketModelo';
import { maquetarTicket, textoLinea, type LineaTicket } from './ticketLayout';

const COLS_58 = 32;
const COLS_80 = 48;

const ESC = 0x1B;
const GS  = 0x1D;

const INIT         = [ESC, 0x40];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_LEFT   = [ESC, 0x61, 0x00];
const BOLD_ON      = [ESC, 0x45, 0x01];
const BOLD_OFF     = [ESC, 0x45, 0x00];
const CUT          = [GS, 0x56, 0x42, 0x00];
const LF           = [0x0A];

const enc = new TextEncoder();

/** Strip accents and non-ASCII so byte length = char count */
function clean(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

/**
 * Load an image URL and convert to ESC/POS GS v 0 raster bytes (monochrome).
 * Returns empty array if image fails to load.
 */
async function logoToRasterBytes(url: string, maxWidth: number): Promise<number[]> {
  try {
    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Try fetching as blob first to avoid CORS
    let objectUrl: string | null = null;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      } else {
        img.src = url;
      }
    } catch {
      img.src = url;
    }

    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('img load failed'));
    });

    // Scale to fit printer width (maxWidth pixels)
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    let w = Math.floor(img.naturalWidth * scale);
    let h = Math.floor(img.naturalHeight * scale);
    // Width must be multiple of 8 for raster
    w = Math.floor(w / 8) * 8;
    if (w < 8) w = 8;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    // Convert to monochrome bitmap
    const bytesPerRow = w / 8;
    const rasterData: number[] = [];

    for (let y = 0; y < h; y++) {
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIdx * 8 + bit;
          const idx = (y * w + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          // Dark pixel = ink (1), light pixel = no ink (0)
          if (gray < 128) {
            byte |= (0x80 >> bit);
          }
        }
        rasterData.push(byte);
      }
    }

    // GS v 0 — print raster bit image
    // Format: GS v 0 m xL xH yL yH data
    // m=0 (normal), xL/xH = bytes per row, yL/yH = height in dots
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = h & 0xFF;
    const yH = (h >> 8) & 0xFF;

    return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...rasterData];
  } catch (e) {
    console.warn('[ESC/POS] Logo raster failed:', e);
    return [];
  }
}

export async function buildEscPosBytes(data: TicketData, opts?: { ticketAncho?: string; showTax?: boolean; logoMaxWidth?: number; margenIzqCols?: number }): Promise<Uint8Array> {
  const is58 = (opts?.ticketAncho ?? '80') === '58';
  const margenCols = Math.max(0, Math.min(6, Math.floor(opts?.margenIzqCols ?? 0)));
  const margenDots = margenCols * 12; // Fuente A = 12 puntos por columna
  const W = (is58 ? COLS_58 : COLS_80) - margenCols;
  const maxPixelWidth = (is58 ? 384 : 576) - margenDots;

  const parts: number[] = [];
  const add = (bytes: number[]) => { for (const b of bytes) parts.push(b); };
  const ln = (s: string) => { const encoded = enc.encode(s + '\n'); for (const b of encoded) parts.push(b); };
  const linea = (l: LineaTicket) => {
    if (l.negrita) add(BOLD_ON);
    ln(textoLinea(l).replace(/\s+$/, ''));
    if (l.negrita) add(BOLD_OFF);
  };

  add(INIT);
  if (margenDots > 0) {
    // GS L: margen izquierdo · GS W: ancho del área de impresión
    add([GS, 0x4C, margenDots & 0xFF, (margenDots >> 8) & 0xFF]);
    add([GS, 0x57, maxPixelWidth & 0xFF, (maxPixelWidth >> 8) & 0xFF]);
  }

  const modelo = construirModeloTicket(data);
  // Solo ASCII: la térmica no tiene acentos y así cada carácter mide una columna.
  const m = maquetarTicket(modelo, W, clean);

  // ── LOGO (imagen raster) ──
  if (modelo.encabezado.logoUrl) {
    add(ALIGN_CENTER);
    const logoBytes = await logoToRasterBytes(modelo.encabezado.logoUrl, Math.min(maxPixelWidth, opts?.logoMaxWidth ?? maxPixelWidth));
    if (logoBytes.length > 0) {
      add(logoBytes);
      add(LF);
    }
  }

  // ── ENCABEZADO (centrado por comando) ──
  add(ALIGN_CENTER);
  m.encabezado.forEach(linea);
  add(LF);

  // ── CUERPO (izquierda; las líneas centradas usan alineación centrada) ──
  add(ALIGN_LEFT);
  for (const l of m.cuerpo) {
    if (l.centro) { add(ALIGN_CENTER); linea(l); add(ALIGN_LEFT); } else linea(l);
  }

  // ── PIE ──
  add(ALIGN_CENTER);
  m.pie.forEach(linea);
  ln('');
  m.marca.forEach(linea);
  add(LF); add(LF); add(LF);
  add(CUT);

  return new Uint8Array(parts);
}
