/**
 * Data saver mode: reduces network usage for mobile vendors with limited data plans.
 */

const DATA_SAVER_KEY = 'uniline_data_saver';

export function isDataSaverEnabled(): boolean {
  return localStorage.getItem(DATA_SAVER_KEY) === 'true';
}

export function setDataSaverMode(enabled: boolean): void {
  localStorage.setItem(DATA_SAVER_KEY, String(enabled));
}

/**
 * Sync intervals based on data saver mode
 */
export function getSyncConfig() {
  const dataSaver = isDataSaverEnabled();
  return {
    // How often to check pending count
    pendingCheckInterval: dataSaver ? 10000 : 3000, // 10s vs 3s
    // Auto-sync interval for pending changes
    autoSyncInterval: dataSaver ? 120000 : 30000, // 2min vs 30s
    // Cache staleness threshold
    cacheStaleMinutes: dataSaver ? 60 : 15, // 1hr vs 15min
    // Whether to auto-fetch from server in useOfflineData
    autoFetchFromServer: !dataSaver,
    // Data saver enabled flag
    enabled: dataSaver,
  };
}
