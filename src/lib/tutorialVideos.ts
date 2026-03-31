/**
 * Videos tutoriales del canal @RutAppMx de YouTube.
 * Cada entrada tiene un videoId de YouTube y el módulo al que pertenece.
 * Para agregar un video nuevo basta con añadir una entrada aquí.
 */

export interface TutorialVideo {
  /** YouTube video ID (la parte después de v=) */
  videoId: string;
  title: string;
  description?: string;
  /** Módulo del sistema al que se vincula (para mostrar botón contextual) */
  module?: string;
  /** Duración aproximada legible */
  duration?: string;
}

/** ID del canal de YouTube */
export const YOUTUBE_CHANNEL_ID = 'RutAppMx';
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@RutAppMx';

/**
 * Lista de videos. Agrega tus videos aquí con su videoId de YouTube.
 * El videoId es lo que aparece en la URL: youtube.com/watch?v=VIDEO_ID
 */
export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    videoId: 'rUAByOAG-2E',
    title: 'Introducción a RutApp',
    description: 'Conoce las funciones principales del sistema.',
    module: 'dashboard',
    duration: '5:00',
  },
  {
    videoId: 'PLzEs7dy9I4',
    title: 'Cómo gestionar Productos',
    description: 'Crear, editar e importar productos al catálogo.',
    module: 'productos',
    duration: '4:30',
  },
  // ──────────────────────────────────────────────
  // Agrega más videos aquí. Ejemplo:
  // {
  //   videoId: 'XXXXXXXXXXX',
  //   title: 'Cómo crear ventas',
  //   description: 'Flujo completo de venta.',
  //   module: 'ventas',
  //   duration: '6:00',
  // },
  // ──────────────────────────────────────────────
];

/** Devuelve los videos que coinciden con un módulo */
export function getVideosForModule(module: string): TutorialVideo[] {
  return TUTORIAL_VIDEOS.filter((v) => v.module === module);
}

/** Genera la URL de embed de YouTube */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}

/** Genera la URL de thumbnail de YouTube */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}
