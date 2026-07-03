import { useEffect, useReducer } from 'react';
import { thumbUrl, subscribeThumbState } from '@/lib/imageThumb';

/**
 * Hook para servir miniaturas optimizadas (Supabase Image Transformation).
 * Devuelve una función `thumb(url, width, quality?)`. Cuando la prueba de
 * capacidad se resuelve, fuerza un re-render para cambiar de la imagen original
 * a la miniatura reducida (o quedarse en original si no hay soporte).
 *
 *   const thumb = useThumb();
 *   <img src={thumb(p.imagen_url, 80)} />
 */
export function useThumb() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeThumbState(force), []);
  return thumbUrl;
}
