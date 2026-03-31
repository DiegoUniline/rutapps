/**
 * ═══════════════════════════════════════════════════════════════
 *  VIDEOS TUTORIALES — Solo agrega tus videos aquí abajo
 * ═══════════════════════════════════════════════════════════════
 *
 *  Copia una entrada y llénala con tu URL de YouTube:
 *
 *  { url: 'https://www.youtube.com/watch?v=XXXXXXXXX', title: 'Mi video', module: 'ventas' },
 *
 *  Módulos válidos:
 *    dashboard, productos, clientes, ventas, cargas, inventario,
 *    ajustesInventario, traspasos, auditorias, cobranza, cuentasCobrar,
 *    cuentasPagar, gastos, comisiones, reportes, compras, tarifas,
 *    configuracion, usuarios, lotes, entregas, descargas, facturacion,
 *    catalogos, whatsapp, promociones, mapa, pos, logistica, conteos
 *
 * ═══════════════════════════════════════════════════════════════
 */

export interface TutorialVideo {
  /** URL completa de YouTube (se extrae el ID automáticamente) */
  url: string;
  title: string;
  description?: string;
  /** Módulo del sistema (ver lista arriba) */
  module?: string;
}

// ─────────────────────────────────────────────────
//  👇  AGREGA TUS VIDEOS AQUÍ  👇
// ─────────────────────────────────────────────────
export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  // Ejemplo:
  // { url: 'https://www.youtube.com/watch?v=rUAByOAG-2E', title: 'Introducción a RutApp', module: 'dashboard' },
  // { url: 'https://youtu.be/PLzEs7dy9I4', title: 'Cómo gestionar Productos', module: 'productos' },
];
// ─────────────────────────────────────────────────

/** ID del canal de YouTube */
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@RutAppMx';

/** Extrae el videoId de una URL de YouTube */
export function extractVideoId(url: string): string {
  // youtube.com/watch?v=ID
  const match1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match1) return match1[1];
  // youtu.be/ID
  const match2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (match2) return match2[1];
  // youtube.com/embed/ID
  const match3 = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (match3) return match3[1];
  return url; // fallback: asumir que ya es un ID
}

/** Devuelve los videos que coinciden con un módulo */
export function getVideosForModule(module: string): TutorialVideo[] {
  return TUTORIAL_VIDEOS.filter((v) => v.module === module);
}

/** Genera la URL de embed de YouTube */
export function youtubeEmbedUrl(url: string): string {
  return `https://www.youtube.com/embed/${extractVideoId(url)}?rel=0`;
}

/** Genera la URL de thumbnail de YouTube */
export function youtubeThumbnailUrl(url: string): string {
  return `https://img.youtube.com/vi/${extractVideoId(url)}/mqdefault.jpg`;
}
