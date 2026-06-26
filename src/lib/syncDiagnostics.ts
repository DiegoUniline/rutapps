/**
 * Diagnóstico de la capa offline. Sirve para auditar al usuario que TODO está
 * a salvo: IndexedDB, respaldo en localStorage, Service Worker y storage del
 * dispositivo. Solo lectura — no muta nada.
 */
import { offlineDb } from './offlineDb';
import { getBackupItemCount, getBackupTimestamp } from './offlineBackup';

export interface SyncDiagnostics {
  /** Pendientes en IndexedDB (fuente principal) */
  idbQueueCount: number;
  /** Items en respaldo redundante de localStorage */
  localStorageBackupCount: number;
  /** Última vez que se respaldó a localStorage */
  lastBackupAt: number | null;
  /** Service worker registrado y activo */
  serviceWorkerActive: boolean;
  /** App corriendo como PWA instalada */
  isStandalone: boolean;
  /** Espacio usado por el origen, en bytes */
  storageUsedBytes: number | null;
  /** Espacio total disponible, en bytes */
  storageQuotaBytes: number | null;
  /** Almacenamiento marcado como "persistente" (no lo borra el navegador) */
  storagePersisted: boolean;
  /** IndexedDB y respaldo coinciden (o IDB ≥ respaldo) */
  integrityOk: boolean;
}

export async function getSyncDiagnostics(): Promise<SyncDiagnostics> {
  const idbQueueCount = await offlineDb.syncQueue.count();
  const localStorageBackupCount = getBackupItemCount();
  const lastBackupAt = getBackupTimestamp();

  let serviceWorkerActive = false;
  try {
    if ('serviceWorker' in navigator) {
      // controller = SW que ya controla esta pestaña → garantía de offline
      if (navigator.serviceWorker.controller) {
        serviceWorkerActive = true;
      } else {
        const regs = await navigator.serviceWorker.getRegistrations();
        // Cuenta también installing/waiting: el SW ya está instalado en
        // el dispositivo aunque aún no controle ESTA pestaña (común en la
        // primera carga después de publicar). En la siguiente recarga
        // tomará control automáticamente.
        serviceWorkerActive = regs.some(r => !!(r.active || r.waiting || r.installing));
        // Si hay registro pero no está activo, esperar brevemente al "ready"
        // (con timeout) por si está terminando de instalar en este instante.
        if (!serviceWorkerActive && regs.length > 0) {
          const ready = await Promise.race([
            navigator.serviceWorker.ready.then(() => true),
            new Promise<boolean>(res => setTimeout(() => res(false), 1500)),
          ]);
          serviceWorkerActive = ready;
        }
      }
    }
  } catch {
    // ignore
  }

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;

  let storageUsedBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  let storagePersisted = false;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storageUsedBytes = est.usage ?? null;
      storageQuotaBytes = est.quota ?? null;
    }
    if (navigator.storage?.persisted) {
      storagePersisted = await navigator.storage.persisted();
    }
  } catch {
    // ignore
  }

  const integrityOk = idbQueueCount >= localStorageBackupCount;

  return {
    idbQueueCount,
    localStorageBackupCount,
    lastBackupAt,
    serviceWorkerActive,
    isStandalone,
    storageUsedBytes,
    storageQuotaBytes,
    storagePersisted,
    integrityOk,
  };
}

/**
 * Pide al navegador que marque el storage como persistente.
 * Esto evita que el navegador borre IndexedDB/localStorage cuando hay poca
 * memoria. En la mayoría de navegadores, una PWA instalada lo otorga
 * automáticamente; aquí solo pedimos por si acaso.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
