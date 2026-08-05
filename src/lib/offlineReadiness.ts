/**
 * ESTADO DE PREPARACIÓN OFFLINE (manifiesto local).
 *
 * Responde una sola pregunta con evidencia: ¿este dispositivo, con este
 * usuario y esta empresa, puede operar sin conexión respetando las mismas
 * reglas que estando en línea?
 *
 * Política: fail-closed. Si falta cualquier bloque CRÍTICO (permisos,
 * configuración de empresa, clientes/asignaciones, productos, precios,
 * promociones), el dispositivo NO se declara listo y las operaciones críticas
 * deben bloquearse.
 */
import { offlineDb, getOfflineTable, type CacheTimestamp } from './offlineDb';
import { TABLE_LABELS, getFailedTables } from './offlineSync';
import { readSecuritySnapshot } from './offlineSecurity';
import { isUsable, ageStatus } from './offlineState';

export type BlockSeverity = 'critical' | 'warning';

export interface ReadinessBlock {
  key: string;
  label: string;
  severity: BlockSeverity;
  ok: boolean;
  detail: string;
  rows?: number;
  syncedAt?: number | null;
}

export interface OfflineManifest {
  packageId: string;
  empresaId: string;
  userId: string;
  generatedAt: number;
  /** Conteo local por entidad + última sincronización exitosa. */
  entities: { table: string; label: string; rows: number; lastSuccessAt: number | null }[];
  blocks: ReadinessBlock[];
  status: 'ready' | 'incomplete' | 'stale';
  failedTables: string[];
  pendingDocuments: number;
}

/** Entidades cuya AUSENCIA impide operar correctamente sin conexión. */
const CRITICAL_TABLES: { table: string; entity: string; label: string }[] = [
  { table: 'empresas', entity: 'configuracion', label: 'Configuración de la empresa' },
  { table: 'clientes', entity: 'clientes', label: 'Clientes y asignaciones' },
  { table: 'productos', entity: 'precios', label: 'Productos' },
  { table: 'tarifas', entity: 'precios', label: 'Listas de precios (reglas)' },
  { table: 'lista_precios', entity: 'precios', label: 'Listas de precios' },
  { table: 'promociones', entity: 'promociones', label: 'Promociones' },
];

const WARNING_TABLES: { table: string; entity: string; label: string }[] = [
  { table: 'stock_almacen', entity: 'inventario', label: 'Existencias por almacén' },
  { table: 'ventas', entity: 'cartera', label: 'Ventas / cartera' },
  { table: 'cobros', entity: 'cartera', label: 'Cobros' },
  { table: 'almacenes', entity: 'configuracion', label: 'Almacenes' },
];

async function countRows(table: string, empresaId: string): Promise<number> {
  const t = getOfflineTable(table);
  if (!t) return 0;
  try {
    if (table === 'empresas') return await t.where('id').equals(empresaId).count();
    return await t.where('empresa_id').equals(empresaId).count();
  } catch {
    try { return await t.count(); } catch { return 0; }
  }
}

export async function buildOfflineManifest(empresaId: string, userId: string): Promise<OfflineManifest> {
  const timestamps: CacheTimestamp[] = await offlineDb.cacheTimestamps.toArray().catch(() => [] as CacheTimestamp[]);
  const tsByTable = new Map<string, CacheTimestamp>(timestamps.map(t => [t.table, t] as const));
  const failed = await getFailedTables().catch(() => []);
  const failedTables = failed.map(f => f.table);

  const blocks: ReadinessBlock[] = [];
  const entities: OfflineManifest['entities'] = [];

  // 1) Permisos y roles — el bloque más importante.
  const sec = await readSecuritySnapshot(empresaId, userId);
  blocks.push({
    key: 'permisos',
    label: 'Permisos y roles',
    severity: 'critical',
    ok: isUsable(sec),
    detail: isUsable(sec)
      ? (sec.status === 'stale' ? 'Disponibles, pero vencidos: sincroniza para revalidarlos' : 'Disponibles y vigentes')
      : sec.status === 'invalid'
        ? sec.reason
        : 'No hay permisos guardados para este usuario en esta empresa',
    syncedAt: isUsable(sec) ? sec.data.savedAt : null,
  });

  // 2) Entidades críticas y de advertencia.
  for (const group of [CRITICAL_TABLES, WARNING_TABLES]) {
    const severity: BlockSeverity = group === CRITICAL_TABLES ? 'critical' : 'warning';
    for (const { table, entity, label } of group) {
      const rows = await countRows(table, empresaId);
      const ts = tsByTable.get(table);
      const lastOk = ts?.lastSuccessAt ?? ts?.lastSync ?? null;
      entities.push({ table, label: TABLE_LABELS[table] || label, rows, lastSuccessAt: lastOk });
      const age = ageStatus(lastOk, entity);
      const neverSynced = !lastOk;
      const errored = failedTables.includes(table);
      const ok = !neverSynced && !errored && rows >= 0 && !(rows === 0 && table !== 'promociones' && table !== 'lista_precios');
      blocks.push({
        key: table,
        label,
        severity,
        ok: ok && age !== 'unknown',
        rows,
        syncedAt: lastOk,
        detail: neverSynced
          ? 'Nunca se ha descargado en este dispositivo'
          : errored
            ? 'La última descarga falló: información posiblemente incompleta'
            : rows === 0
              ? 'Sin registros locales'
              : age === 'stale'
                ? 'Información vencida: requiere sincronizar'
                : `${rows} registros`,
      });
    }
  }

  const pendingDocuments = await offlineDb.syncQueue.count().catch(() => 0);

  const anyCriticalMissing = blocks.some(b => b.severity === 'critical' && !b.ok);
  const anyStale = blocks.some(b => b.ok && b.syncedAt && ageStatus(b.syncedAt, 'configuracion') === 'stale');

  return {
    packageId: `${empresaId}:${userId}:${timestamps.reduce<number>((m, t) => Math.max(m, t.lastSuccessAt ?? 0), 0)}`,
    empresaId,
    userId,
    generatedAt: Date.now(),
    entities,
    blocks,
    status: anyCriticalMissing ? 'incomplete' : anyStale ? 'stale' : 'ready',
    failedTables,
    pendingDocuments,
  };
}

/** ¿Se puede iniciar una operación crítica (vender, cobrar) sin conexión? */
export function canOperateOffline(manifest: OfflineManifest | null): boolean {
  return !!manifest && manifest.status !== 'incomplete';
}

/** Motivos legibles del bloqueo, para mostrarlos al usuario y registrarlos. */
export function blockingReasons(manifest: OfflineManifest | null): string[] {
  if (!manifest) return ['Aún no se ha evaluado la copia local'];
  return manifest.blocks.filter(b => b.severity === 'critical' && !b.ok).map(b => `${b.label}: ${b.detail}`);
}
