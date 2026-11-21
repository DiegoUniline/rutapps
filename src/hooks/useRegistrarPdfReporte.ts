import { useEffect, useRef } from 'react';

/**
 * Pestañas de Reportes que cargan sus propios datos le entregan a la página su
 * generador de PDF por código (D-051), para que «Imprimir» y «PDF» de la barra
 * superior saquen el mismo contenido que la pestaña muestra.
 */
export interface ContextoPdfReporte {
  /** Filtros de la barra superior (vendedor, estado…) tal como se muestran. */
  filtros: { label: string; value: string }[];
}
export type GeneradorPdfReporte = (ctx: ContextoPdfReporte) => Promise<{ blob: Blob; fileName: string } | null>;
export type RegistrarPdfReporte = (generador: GeneradorPdfReporte | null) => void;

export function useRegistrarPdfReporte(registrar: RegistrarPdfReporte | undefined, generador: GeneradorPdfReporte) {
  const actual = useRef(generador);
  actual.current = generador;
  useEffect(() => {
    if (!registrar) return undefined;
    registrar(ctx => actual.current(ctx));
    return () => registrar(null);
  }, [registrar]);
}
