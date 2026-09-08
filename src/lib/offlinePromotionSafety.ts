export type PromotionCacheEvidence = {
  cacheReadFailed: boolean;
  cachedRowCount: number;
  lastSuccessfulSyncAt?: number | null;
};

export type PromotionReadiness = 'loading' | 'error' | 'ready';

export type PromotionReadinessCopy = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  description: string;
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

export function getPromotionReadinessCopy(input: {
  status: PromotionReadiness;
  promotionCount: number;
  isOnline: boolean;
}): PromotionReadinessCopy {
  if (input.status === 'loading') {
    return {
      tone: 'info',
      title: 'Comprobando promociones…',
      description: 'Espera un momento antes de cobrar; estamos verificando las reglas aplicables.',
    };
  }

  if (input.status === 'error') {
    return {
      tone: 'warning',
      title: 'Promociones sin preparar',
      description: input.isOnline
        ? 'Pulsa “Comprobar de nuevo”. Si continúa, vuelve a Ruta y ejecuta Sincronizar.'
        : 'Conéctate a internet, vuelve a Ruta, pulsa Sincronizar y después regresa a esta venta.',
    };
  }

  if (input.promotionCount === 0) {
    return {
      tone: 'success',
      title: 'Promociones verificadas',
      description: 'No hay promociones vigentes para hoy. Puedes continuar y cobrar normalmente.',
    };
  }

  return {
    tone: 'success',
    title: `${input.promotionCount} promoción${input.promotionCount === 1 ? '' : 'es'} lista${input.promotionCount === 1 ? '' : 's'}`,
    description: input.isOnline
      ? 'Se aplicarán automáticamente cuando el producto y el cliente cumplan las condiciones.'
      : 'Están guardadas en este dispositivo y se aplicarán automáticamente aunque no tengas conexión.',
  };
}
