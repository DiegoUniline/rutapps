/** Evento de ventana tras escribir en la copia local (IndexedDB): `detail.tablas` = tablas tocadas. */
export const EVENTO_DATOS_LOCALES = 'uniline:datos-locales';

export type DetalleDatosLocales = { tablas?: string[] };
