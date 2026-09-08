export type PromotionCacheEvidence = {
  cacheReadFailed: boolean;
  cachedRowCount: number;
  lastSuccessfulSyncAt?: number | null;
};

/**
 * Una tabla sincronizada con cero filas significa "no hay promociones" y es
 * válida. Sólo se bloquea cuando no existe evidencia de una descarga exitosa.
 * Las filas legacy se aceptan aunque sean anteriores a los metadatos de sync.
 */
export function isPromotionCacheUsable(evidence: PromotionCacheEvidence): boolean {
  if (evidence.cacheReadFailed) return false;
  if (evidence.cachedRowCount > 0) return true;
  return Boolean(evidence.lastSuccessfulSyncAt);
}
