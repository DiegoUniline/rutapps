import { offlineDb, type SyncQueueItem } from './offlineDb';

const BACKUP_KEY = 'uniline_sync_backup';
const BACKUP_TS_KEY = 'uniline_backup_ts';
const AUTO_BACKUP_INTERVAL = 30_000; // 30 seconds

// ── Auto-backup syncQueue to localStorage as redundant safety net ──

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoBackup() {
  if (autoBackupTimer) return;
  // Immediate first backup
  backupSyncQueueToStorage().catch(console.warn);
  autoBackupTimer = setInterval(() => {
    backupSyncQueueToStorage().catch(console.warn);
  }, AUTO_BACKUP_INTERVAL);
}

export function stopAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

/** Backup pending syncQueue items to localStorage (redundant copy) */
export async function backupSyncQueueToStorage(): Promise<number> {
  try {
    const items = await offlineDb.syncQueue.toArray();
    if (items.length > 0) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(items));
      localStorage.setItem(BACKUP_TS_KEY, String(Date.now()));
    }
    return items.length;
  } catch (err) {
    console.warn('Backup to localStorage failed:', err);
    return 0;
  }
}

/** Restore syncQueue items from localStorage backup (if IndexedDB was cleared) */
export async function restoreFromStorageBackup(): Promise<number> {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return 0;
    const items: SyncQueueItem[] = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return 0;

    // Check if syncQueue is empty (meaning IndexedDB was cleared)
    const currentCount = await offlineDb.syncQueue.count();
    if (currentCount > 0) return 0; // Already has data, skip

    let restored = 0;
    for (const item of items) {
      const { id, ...rest } = item; // Remove old id
      await offlineDb.syncQueue.add(rest as any);
      restored++;
    }
    console.log(`Restored ${restored} sync items from localStorage backup`);
    return restored;
  } catch (err) {
    console.warn('Restore from localStorage failed:', err);
    return 0;
  }
}

/** Clear the localStorage backup (call after successful full sync) */
export function clearStorageBackup() {
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(BACKUP_TS_KEY);
}

export function getBackupTimestamp(): number | null {
  const ts = localStorage.getItem(BACKUP_TS_KEY);
  return ts ? Number(ts) : null;
}

export function getBackupItemCount(): number {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items.length : 0;
  } catch {
    return 0;
  }
}

// ── Full data export (JSON file download) ──

interface FullBackup {
  version: 2;
  createdAt: string;
  deviceId: string;
  tables: Record<string, any[]>;
  syncQueue: SyncQueueItem[];
}

function getDeviceId(): string {
  let id = localStorage.getItem('uniline_device_id');
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('uniline_device_id', id);
  }
  return id;
}

/** Export ALL offline data (all tables + syncQueue) as a downloadable JSON file */
export async function exportFullBackup(): Promise<{ blob: Blob; filename: string; recordCount: number }> {
  const tables: Record<string, any[]> = {};
  let recordCount = 0;

  const tableNames = [
    'clientes', 'productos', 'vendedores', 'cargas', 'carga_lineas',
    'ventas', 'venta_lineas', 'cobros', 'cobro_aplicaciones', 'gastos',
    'devoluciones', 'devolucion_lineas', 'profiles', 'empresas',
    'cliente_pedido_sugerido', 'unidades', 'tasas_iva',
    'descarga_ruta', 'descarga_ruta_lineas', 'promociones',
    'entregas', 'entrega_lineas',
  ];

  for (const name of tableNames) {
    try {
      const data = await (offlineDb as any)[name].toArray();
      tables[name] = data;
      recordCount += data.length;
    } catch {
      tables[name] = [];
    }
  }

  const syncQueue = await offlineDb.syncQueue.toArray();
  recordCount += syncQueue.length;

  const backup: FullBackup = {
    version: 2,
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    tables,
    syncQueue,
  };

  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `rutapp-backup-${date}.json`;

  return { blob, filename, recordCount };
}

/** Import a full backup from a JSON file, restoring all data */
export async function importFullBackup(file: File): Promise<{ tablesRestored: number; recordCount: number; syncQueueCount: number }> {
  const text = await file.text();
  const backup: FullBackup = JSON.parse(text);

  if (!backup.version || !backup.tables) {
    throw new Error('Archivo de respaldo inválido');
  }

  let tablesRestored = 0;
  let recordCount = 0;

  for (const [name, data] of Object.entries(backup.tables)) {
    if (!Array.isArray(data) || data.length === 0) continue;
    try {
      const table = (offlineDb as any)[name];
      if (table) {
        await table.bulkPut(data);
        tablesRestored++;
        recordCount += data.length;
      }
    } catch (err) {
      console.warn(`Failed to restore table ${name}:`, err);
    }
  }

  // Restore syncQueue
  let syncQueueCount = 0;
  if (Array.isArray(backup.syncQueue) && backup.syncQueue.length > 0) {
    for (const item of backup.syncQueue) {
      const { id, ...rest } = item;
      try {
        await offlineDb.syncQueue.add(rest as any);
        syncQueueCount++;
      } catch {
        // Might already exist
      }
    }
  }

  return { tablesRestored, recordCount, syncQueueCount };
}
