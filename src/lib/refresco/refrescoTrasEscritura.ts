/**
 * Red de seguridad de refresco: cuando la app ESCRIBE en la BD (insert/update/upsert/delete
 * o una RPC que modifica datos), se invalidan las consultas de React Query que LEEN lo que
 * cambió, en la pantalla actual y en cualquier otra. Así un dato editado se ve al instante en
 * todos lados sin depender de que cada pantalla recuerde invalidar cada lista relacionada.
 *
 * Cómo decide qué refrescar (sin invalidar todo — cuida el consumo de datos):
 *   1. La escritura se detecta en la petición de Supabase (`/rest/v1/<tabla>` con
 *      POST/PATCH/PUT/DELETE, `/rest/v1/rpc/<fn>` de una RPC que escribe, o una edge function
 *      de ESCRITURAS_EDGE como facturama al timbrar).
 *   2. Se expande a las tablas que cambian por triggers / por la RPC (lectores.generated.ts,
 *      generado desde supabase/migrations).
 *   3. Se invalidan SOLO las claves que leen esas tablas (lectores.generated.ts, generado del
 *      código) + ajustes manuales de abajo.
 *   4. Solo se re-descargan las consultas VISIBLES (refetchType 'active' por defecto); las demás
 *      quedan marcadas y se recargan al volver a abrir su pantalla.
 *   5. Las escrituras se agrupan (ventana corta) y se omiten las consultas que ya se recargaron
 *      después de la escritura (p. ej. porque la pantalla ya invalidó a mano): sin doble descarga.
 *
 * Regenerar el mapa tras agregar consultas, RPC o triggers: `bunx tsx scripts/gen-mapa-refresco.ts`.
 */
import type { Query, QueryClient } from '@tanstack/react-query';
import { EFECTOS_TRIGGER_GENERADOS, ESCRITURAS_RPC_GENERADAS, LECTORES_GENERADOS } from './lectores.generated';
import { EVENTO_DATOS_LOCALES, type DetalleDatosLocales } from './eventos';

/** Consultas que el análisis estático no detecta (nombre de tabla dinámico, edge functions…). */
const LECTORES_MANUALES: Readonly<Record<string, readonly string[]>> = {
  clasificaciones: ['producto-catalogos-inactivos'],
  marcas: ['producto-catalogos-inactivos'],
  unidades: ['producto-catalogos-inactivos'],
};

/**
 * Efectos de triggers que NO se propagan desde aquí, porque ya los refresca el canal Realtime
 * global (useProductosRealtime, montado en AppLayout) agrupando ráfagas: repetirlo descargaría
 * el catálogo completo dos veces por cada venta. Una edición directa de `productos` sí refresca.
 */
const EFECTOS_OMITIDOS: Readonly<Record<string, readonly string[]>> = {
  stock_almacen: ['productos'],
  stock_camion: ['productos'],
  // trg_asignar_publico_general_a_venta solo crea el cliente "Público general" una vez.
  ventas: ['clientes'],
};

/** Tablas de telemetría de alta frecuencia: escribirlas nunca dispara recargas. */
const IGNORADAS = new Set([
  'vendedor_ubicaciones', 'vendedor_ubicaciones_historial', 'consumo_datos',
  'publicidad_vistas', 'notification_views', 'broadcast_reads',
]);

/**
 * Edge functions que escriben en tablas de la app (lo demás —correo, pagos externos, IA— no refresca).
 * `acciones`: solo esas acciones (body.action) escriben; `soloLectura`: esas acciones no escriben.
 */
const ESCRITURAS_EDGE: Readonly<Record<string, { acciones?: readonly string[]; soloLectura?: readonly string[]; tablas: readonly string[] }>> = {
  facturama: {
    acciones: ['upload_csd', 'set_ambiente', 'timbrar', 'reconciliar', 'set_serie', 'cancelar', 'timbrar_rep',
      'timbrar_global', 'crear_borrador_venta', 'crear_sustituto'],
    tablas: ['cfdis', 'cfdi_lineas', 'cfdi_pagos', 'venta_lineas', 'empresas', 'clientes', 'timbres_saldo', 'timbres_movimientos'],
  },
  'admin-users': { soloLectura: ['list-users', 'list-empresa-users'], tablas: ['profiles', 'user_roles'] },
  'user-lifecycle': { tablas: ['profiles', 'user_roles', 'subscriptions'] },
};

/** Prefijo de recurso para RPC: `rpc:<nombre>`. */
export const recursoRpc = (fn: string) => `rpc:${fn}`;

function accionDe(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === 'object' && 'action' in v && typeof v.action === 'string' ? v.action : null;
  } catch {
    return null; // cuerpo que no es JSON: sin acción
  }
}

/**
 * Qué recurso escribe una petición HTTP, o null si no es una escritura relevante.
 * Las RPC solo cuentan si escriben (ESCRITURAS_RPC_GENERADAS); las de lectura se ignoran.
 */
export function recursoDeEscritura(url: string, method: string | undefined, body?: unknown): string | null {
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  const f = url.indexOf('/functions/v1/');
  if (f >= 0) {
    const nombre = url.slice(f + '/functions/v1/'.length).split(/[/?#]/)[0];
    const def = ESCRITURAS_EDGE[nombre];
    if (!def) return null;
    const accion = accionDe(body);
    if (def.acciones && !(accion && def.acciones.includes(accion))) return null;
    if (def.soloLectura && accion && def.soloLectura.includes(accion)) return null;
    return `fn:${nombre}`;
  }
  const i = url.indexOf('/rest/v1/');
  if (i < 0) return null;
  const ruta = url.slice(i + '/rest/v1/'.length).split(/[?#]/)[0];
  if (ruta.startsWith('rpc/')) {
    const fn = decodeURIComponent(ruta.slice(4));
    return m === 'POST' && ESCRITURAS_RPC_GENERADAS[fn] ? recursoRpc(fn) : null;
  }
  const tabla = decodeURIComponent(ruta.split('/')[0]);
  if (!tabla || IGNORADAS.has(tabla)) return null;
  return tabla;
}

/** Tablas que cambian al escribir un recurso (la tabla, lo que escribe la RPC y sus triggers, transitivo). */
export function tablasAfectadas(recurso: string): Set<string> {
  const out = new Set<string>();
  const pendientes = recurso.startsWith('rpc:') ? [...(ESCRITURAS_RPC_GENERADAS[recurso.slice(4)] ?? [])]
    : recurso.startsWith('fn:') ? [...(ESCRITURAS_EDGE[recurso.slice(3)]?.tablas ?? [])]
    : [recurso];
  while (pendientes.length) {
    const t = pendientes.pop()!;
    if (out.has(t) || IGNORADAS.has(t)) continue;
    out.add(t);
    const omitidos = EFECTOS_OMITIDOS[t] ?? [];
    for (const e of EFECTOS_TRIGGER_GENERADOS[t] ?? []) if (!omitidos.includes(e)) pendientes.push(e);
  }
  return out;
}

/** Primer elemento de queryKey de las consultas que muestran datos de esos recursos. */
export function clavesAfectadas(recursos: Iterable<string>): Set<string> {
  const claves = new Set<string>();
  for (const r of recursos) {
    for (const t of tablasAfectadas(r)) {
      claves.add(t); // muchas pantallas usan el nombre de la tabla como clave (catálogos)
      claves.add(`${t}-status-counts`); // StatusCountCards
      for (const k of LECTORES_GENERADOS[t] ?? []) claves.add(k);
      for (const k of LECTORES_MANUALES[t] ?? []) claves.add(k);
    }
  }
  return claves;
}

/**
 * Invalida las consultas que leen lo que cambió. Omite las que ya tienen datos posteriores a
 * `desde` (se recargaron después de la escritura) para no descargar dos veces.
 * Se puede llamar a mano: `invalidarTrasEscritura(qc, ['clientes'])` o `[recursoRpc('aplicar_cobro')]`.
 */
export function invalidarTrasEscritura(
  qc: QueryClient,
  recursos: Iterable<string>,
  desde = Date.now(),
): Promise<void> {
  const claves = clavesAfectadas(recursos);
  if (!claves.size) return Promise.resolve();
  return qc.invalidateQueries(
    {
      predicate: (q: Query) => {
        const k0 = q.queryKey[0];
        return typeof k0 === 'string' && claves.has(k0) && q.state.dataUpdatedAt < desde;
      },
    },
    // Si ya se está descargando, no se cancela ni se repite: se reutiliza esa descarga
    // (evita además bucles si una consulta escribe dentro de su propio queryFn).
    { cancelRefetch: false },
  );
}

/** Ventana de agrupamiento: una operación de varios pasos (encabezado + líneas + RPC) refresca una vez. */
const AGRUPAR_MS = 400;
const MAX_ESPERA_MS = 2000;

let desinstalar: (() => void) | null = null;

/**
 * Observa las escrituras que salen por `fetch` (el cliente de Supabase usa el fetch global) y
 * refresca lo relacionado. Idempotente: llamar de nuevo reemplaza el QueryClient observado.
 */
export function instalarRefrescoTrasEscritura(qc: QueryClient): () => void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return () => {};
  desinstalar?.();

  const original = window.fetch;
  const pendientes = new Set<string>();
  let ultimaEscritura = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let primera = 0;
  let activo = true;

  const vaciar = () => {
    timer = null;
    const recursos = [...pendientes];
    pendientes.clear();
    void invalidarTrasEscritura(qc, recursos, ultimaEscritura).catch((e: unknown) => {
      console.warn('[refresco] no se pudo refrescar tras escribir', e);
    });
  };

  const registrar = (recurso: string) => {
    const ahora = Date.now();
    pendientes.add(recurso);
    ultimaEscritura = ahora;
    if (timer == null) primera = ahora;
    else clearTimeout(timer);
    const espera = Math.max(0, Math.min(AGRUPAR_MS, primera + MAX_ESPERA_MS - ahora));
    timer = setTimeout(vaciar, espera);
  };

  const envuelto: typeof window.fetch = async (input, init) => {
    const res = await original(input, init);
    if (!activo) return res;
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : undefined);
      const recurso = res.ok ? recursoDeEscritura(url, method, init?.body) : null;
      if (recurso) registrar(recurso);
    } catch (e) {
      // Observar nunca debe romper una petición.
      console.warn('[refresco] no se pudo observar la petición', e);
    }
    return res;
  };

  // Sin conexión, lo guardado en el teléfono no llega al servidor todavía: se refrescan las
  // consultas que leen la copia local (networkMode 'always' + respaldo IndexedDB). Con conexión
  // no hace falta: la subida inmediata pasa por fetch y dispara el refresco de arriba.
  const alEscribirLocal = (e: Event) => {
    if (!activo || navigator.onLine) return;
    (e as CustomEvent<DetalleDatosLocales>).detail?.tablas?.forEach(registrar);
  };
  window.addEventListener(EVENTO_DATOS_LOCALES, alEscribirLocal);

  window.fetch = envuelto;
  desinstalar = () => {
    activo = false; // si otro envoltorio quedó encima (medidor de datos), este pasa a ser transparente
    window.removeEventListener(EVENTO_DATOS_LOCALES, alEscribirLocal);
    if (timer != null) clearTimeout(timer);
    if (window.fetch === envuelto) window.fetch = original;
    desinstalar = null;
  };
  return desinstalar;
}
