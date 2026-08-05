/**
 * PREPARACIÓN OFFLINE DE /ruta — bloqueos reales, no informativos.
 *
 * Evalúa, contra la copia local (IndexedDB) y el snapshot de seguridad, si el
 * dispositivo tiene lo indispensable para CADA operación de la app móvil.
 * Fail-closed: si no se puede comprobar, se bloquea.
 *
 * Los requisitos se derivan de la configuración REAL de cada empresa
 * (promociones existentes, manejo de lotes, visibilidad de clientes), nunca
 * de suposiciones globales.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { offlineDb, getOfflineTable } from './offlineDb';
import { readSecuritySnapshot } from './offlineSecurity';
import { isUsable, ageStatus } from './offlineState';

export type RutaOperacion =
  | 'venta'
  | 'cobro'
  | 'devolucion'
  | 'gasto'
  | 'visita'
  | 'entrega'
  | 'inventario';

export interface RutaRequisito {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  rows: number;
  syncedAt: number | null;
}

export interface RutaReadiness {
  loading: boolean;
  requisitos: RutaRequisito[];
  /** Requisitos incumplidos por operación. Vacío = operación permitida. */
  faltantes: Record<RutaOperacion, string[]>;
  puede: (op: RutaOperacion) => boolean;
  motivos: (op: RutaOperacion) => string[];
  refrescar: () => void;
}

/** Qué requisitos necesita cada operación de /ruta. */
const REQUISITOS_POR_OPERACION: Record<RutaOperacion, string[]> = {
  venta: ['permisos', 'empresa', 'clientes', 'productos', 'precios', 'promociones'],
  cobro: ['permisos', 'empresa', 'clientes', 'cartera'],
  devolucion: ['permisos', 'empresa', 'clientes', 'productos'],
  gasto: ['permisos', 'empresa'],
  visita: ['permisos', 'empresa', 'clientes'],
  entrega: ['permisos', 'empresa', 'clientes', 'productos'],
  inventario: ['permisos', 'empresa', 'productos', 'almacenes'],
};

async function count(table: string, empresaId: string): Promise<number | null> {
  const t = getOfflineTable(table);
  if (!t) return null;
  try {
    if (table === 'empresas') return await t.where('id').equals(empresaId).count();
    return await t.where('empresa_id').equals(empresaId).count();
  } catch {
    return null;
  }
}

export function useRutaReadiness(): RutaReadiness {
  const { empresa, user } = useAuth();
  const [requisitos, setRequisitos] = useState<RutaRequisito[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const empresaId = empresa?.id;
  const userId = user?.id;

  const evaluar = useCallback(async () => {
    if (!empresaId || !userId) { setRequisitos([]); setLoading(false); return; }
    setLoading(true);
    try {
      const timestamps = await offlineDb.cacheTimestamps.toArray().catch(() => []);
      const ts = new Map(timestamps.map(t => [t.table, t] as const));
      const lastOk = (table: string) => ts.get(table)?.lastSuccessAt ?? ts.get(table)?.lastSync ?? null;

      const out: RutaRequisito[] = [];

      // Permisos y roles (snapshot de seguridad del usuario/empresa activos).
      const sec = await readSecuritySnapshot(empresaId, userId);
      out.push({
        key: 'permisos',
        label: 'Permisos y rol',
        ok: isUsable(sec),
        rows: isUsable(sec) ? sec.data.permisos.length : 0,
        syncedAt: isUsable(sec) ? sec.data.savedAt : null,
        detail: isUsable(sec)
          ? 'Comprobables sin conexión'
          : 'Sin permisos comprobables en este dispositivo: conéctate una vez',
      });

      // Configuración de la empresa (visibilidad, ticket, lotes, jornada).
      const emp = await count('empresas', empresaId);
      out.push({
        key: 'empresa',
        label: 'Configuración de la empresa',
        ok: !!emp && emp > 0,
        rows: emp ?? 0,
        syncedAt: lastOk('empresas'),
        detail: emp ? 'Disponible' : 'No sincronizada',
      });

      // Clientes asignados. Cero clientes con visibilidad "propios" es un
      // estado legítimo solo si la tabla ya se descargó al menos una vez.
      const cli = await count('clientes', empresaId);
      const cliTs = lastOk('clientes');
      out.push({
        key: 'clientes',
        label: 'Clientes',
        ok: cliTs !== null && cli !== null,
        rows: cli ?? 0,
        syncedAt: cliTs,
        detail: cliTs === null ? 'Nunca descargados' : `${cli ?? 0} disponibles`,
      });

      // Productos.
      const prod = await count('productos', empresaId);
      out.push({
        key: 'productos',
        label: 'Productos',
        ok: !!prod && prod > 0,
        rows: prod ?? 0,
        syncedAt: lastOk('productos'),
        detail: prod ? `${prod} disponibles` : 'Sin productos locales',
      });

      // Precios: al menos una lista o una tarifa con sus renglones.
      const listas = (await count('lista_precios', empresaId)) ?? 0;
      const tarifas = (await count('tarifas', empresaId)) ?? 0;
      const tarifaLineasTs = lastOk('tarifa_lineas');
      out.push({
        key: 'precios',
        label: 'Listas de precios',
        ok: (listas > 0 || tarifas > 0) && tarifaLineasTs !== null,
        rows: listas + tarifas,
        syncedAt: lastOk('tarifas') ?? lastOk('lista_precios'),
        detail: listas + tarifas === 0
          ? 'Sin listas de precios locales'
          : tarifaLineasTs === null ? 'Faltan las reglas de precio' : `${listas} listas · ${tarifas} tarifas`,
      });

      // Promociones: se exige la DESCARGA, no que existan promociones.
      // Empresa sin promociones = 0 registros y descarga correcta → válido.
      const promoTs = lastOk('promociones');
      const promos = (await count('promociones', empresaId)) ?? 0;
      out.push({
        key: 'promociones',
        label: 'Promociones',
        ok: promoTs !== null && ageStatus(promoTs, 'promociones') !== 'unknown',
        rows: promos,
        syncedAt: promoTs,
        detail: promoTs === null
          ? 'Nunca descargadas: una venta podría omitir descuentos'
          : promos === 0 ? 'La empresa no tiene promociones activas' : `${promos} activas`,
      });

      // Cartera para cobros: ventas con saldo + aplicaciones.
      const ventasTs = lastOk('ventas');
      const ventas = (await count('ventas', empresaId)) ?? 0;
      out.push({
        key: 'cartera',
        label: 'Cartera y saldos',
        ok: ventasTs !== null,
        rows: ventas,
        syncedAt: ventasTs,
        detail: ventasTs === null ? 'Nunca descargada: no se puede validar saldo ni crédito' : `${ventas} ventas locales`,
      });

      // Almacenes / existencias para operaciones de inventario.
      const alm = (await count('almacenes', empresaId)) ?? 0;
      out.push({
        key: 'almacenes',
        label: 'Almacenes y existencias',
        ok: alm > 0 && lastOk('stock_almacen') !== null,
        rows: alm,
        syncedAt: lastOk('almacenes'),
        detail: alm === 0 ? 'Sin almacenes locales' : `${alm} almacenes`,
      });

      setRequisitos(out);
    } finally {
      setLoading(false);
    }
  }, [empresaId, userId]);

  useEffect(() => { evaluar(); }, [evaluar, tick]);

  const faltantes = useMemo(() => {
    const byKey = new Map(requisitos.map(r => [r.key, r]));
    const res = {} as Record<RutaOperacion, string[]>;
    (Object.keys(REQUISITOS_POR_OPERACION) as RutaOperacion[]).forEach(op => {
      res[op] = REQUISITOS_POR_OPERACION[op]
        .map(k => byKey.get(k))
        .filter(r => r && !r.ok)
        .map(r => `${r!.label}: ${r!.detail}`);
    });
    return res;
  }, [requisitos]);

  const puede = useCallback((op: RutaOperacion) => !loading && faltantes[op]?.length === 0, [loading, faltantes]);
  const motivos = useCallback((op: RutaOperacion) => faltantes[op] ?? [], [faltantes]);

  return { loading, requisitos, faltantes, puede, motivos, refrescar: () => setTick(t => t + 1) };
}
