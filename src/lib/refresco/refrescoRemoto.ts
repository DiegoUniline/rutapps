/**
 * Refresco por cambios hechos en OTRO dispositivo (eventos Realtime de Supabase).
 *
 * Usa el mismo mapa tabla → consultas que la red de refresco tras escribir
 * (clavesAfectadas, de lectores.generated.ts), así una venta, cobro o entrega hecha en ruta
 * actualiza existencias, kardex, ventas, saldos y pedidos abiertos en la oficina.
 *
 * Cuida el consumo con muchos vendedores enviando eventos:
 *   - Agrupa: todos los eventos de una ventana producen UNA invalidación; como máximo una cada
 *     INTERVALO_MS por QueryClient, así cada consulta se recarga a lo más una vez por intervalo.
 *   - Solo se re-descargan las consultas visibles; las demás quedan marcadas y se recargan al abrirlas.
 *   - Los números de pestañas (consultas cuya clave termina en 'conteo') y los resúmenes pesados
 *     (RESUMENES_PESADOS: totales del periodo en Ventas) se recargan como máximo cada CONTEO_MS
 *     (recontar/re-sumar el mes en cada venta remota no escala: era ~13 % del CPU de la BD).
 *   - Se omiten las consultas que ya tienen datos posteriores al último evento.
 *   - `productos` no se expande con el mapa: sus eventos remotos son casi siempre el total de stock
 *     que mueve un trigger; recargar todas las pantallas que leen productos por cada venta no escala.
 *     Quien escucha `productos` pasa sus claves explícitas (catálogo), como hasta ahora.
 */
import { partialMatchKey, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { clavesAfectadas } from './refrescoTrasEscritura';

export const AGRUPAR_REMOTO_MS = 400;
export const INTERVALO_REMOTO_MS = 5000;
export const CONTEO_REMOTO_MS = 30000;

/** Tablas cuyos eventos remotos no se expanden con el mapa (solo claves explícitas). */
const SIN_MAPA_REMOTO = new Set(['productos']);

type Estado = {
  prefijos: Set<string>;
  explicitas: Map<string, QueryKey>;
  ultimoEvento: number;
  ultimoVaciado: number;
  timer: ReturnType<typeof setTimeout> | null;
  conteoPrefijos: Set<string>;
  conteoDesde: number;
  conteoTimer: ReturnType<typeof setTimeout> | null;
};

const estados = new WeakMap<QueryClient, Estado>();

function estadoDe(qc: QueryClient): Estado {
  let st = estados.get(qc);
  if (!st) {
    st = {
      prefijos: new Set(), explicitas: new Map(), ultimoEvento: 0, ultimoVaciado: 0, timer: null,
      conteoPrefijos: new Set(), conteoDesde: 0, conteoTimer: null,
    };
    estados.set(qc, st);
  }
  return st;
}

/** Consultas de totales del periodo: caras (agregan todo el mes) y no necesitan refrescarse cada 5 s. */
const RESUMENES_PESADOS = new Set(['ventas-resumen', 'venta-lineas-resumen']);
const esConteo = (k: QueryKey) => k[k.length - 1] === 'conteo' || (typeof k[0] === 'string' && RESUMENES_PESADOS.has(k[0]));

function coincide(q: Query, prefijos: Set<string>, explicitas: QueryKey[]): boolean {
  const k0 = q.queryKey[0];
  if (typeof k0 === 'string' && prefijos.has(k0)) return true;
  return explicitas.some(k => partialMatchKey(q.queryKey, k));
}

function vaciarConteos(qc: QueryClient, st: Estado) {
  st.conteoTimer = null;
  const prefijos = new Set(st.conteoPrefijos);
  const desde = st.conteoDesde;
  st.conteoPrefijos.clear();
  void qc.invalidateQueries(
    { predicate: (q: Query) => esConteo(q.queryKey) && coincide(q, prefijos, []) && q.state.dataUpdatedAt < desde },
    { cancelRefetch: false },
  ).catch((e: unknown) => console.warn('[refresco remoto] conteos', e));
}

function vaciar(qc: QueryClient, st: Estado) {
  st.timer = null;
  st.ultimoVaciado = Date.now();
  const prefijos = new Set(st.prefijos);
  const explicitas = [...st.explicitas.values()];
  const desde = st.ultimoEvento;
  st.prefijos.clear();
  st.explicitas.clear();

  void qc.invalidateQueries(
    { predicate: (q: Query) => !esConteo(q.queryKey) && coincide(q, prefijos, explicitas) && q.state.dataUpdatedAt < desde },
    { cancelRefetch: false },
  ).catch((e: unknown) => console.warn('[refresco remoto]', e));

  // Conteos de pestañas: a lo más cada CONTEO_REMOTO_MS.
  prefijos.forEach(p => st.conteoPrefijos.add(p));
  explicitas.forEach(k => { if (typeof k[0] === 'string') st.conteoPrefijos.add(k[0]); });
  st.conteoDesde = desde;
  if (st.conteoTimer == null && st.conteoPrefijos.size) {
    st.conteoTimer = setTimeout(() => vaciarConteos(qc, st), CONTEO_REMOTO_MS);
  }
}

/**
 * Registra un cambio remoto. `tablas`: tablas que cambiaron (se expanden con el mapa y los
 * triggers); `claves`: claves explícitas adicionales (prefijo). Se agrupa y limita por tiempo.
 */
export function programarRefrescoRemoto(
  qc: QueryClient,
  cambio: { tablas?: readonly string[]; claves?: readonly QueryKey[] },
): void {
  const st = estadoDe(qc);
  const tablas = (cambio.tablas ?? []).filter(t => !SIN_MAPA_REMOTO.has(t));
  clavesAfectadas(tablas).forEach(k => st.prefijos.add(k));
  for (const k of cambio.claves ?? []) st.explicitas.set(JSON.stringify(k), k);

  const ahora = Date.now();
  st.ultimoEvento = ahora;
  if (st.timer != null) return; // ya hay un vaciado programado: este evento entra en él
  const espera = Math.max(AGRUPAR_REMOTO_MS, st.ultimoVaciado + INTERVALO_REMOTO_MS - ahora);
  st.timer = setTimeout(() => vaciar(qc, st), espera);
}

/** Cancela lo pendiente (pruebas / cambio de sesión). */
export function reiniciarRefrescoRemoto(qc: QueryClient): void {
  const st = estados.get(qc);
  if (!st) return;
  if (st.timer != null) clearTimeout(st.timer);
  if (st.conteoTimer != null) clearTimeout(st.conteoTimer);
  estados.delete(qc);
}
