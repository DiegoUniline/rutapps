/**
 * Auto-aplicación de promociones de PRODUCTO GRATIS en /ruta (opt-in por licencia).
 *
 * Problema real: el motor de promociones solo descuenta el regalo si el producto
 * regalado YA está en el carrito. Si el vendedor no lo agrega, la promoción se
 * evalúa pero no rebaja nada y la venta sale mal.
 *
 * Con la bandera `ruta_promos_auto`:
 *  1. El producto de bonificación se agrega solo al carrito con la cantidad que
 *     falta (queda a precio de lista y el motor lo neteo a $0 con su descuento).
 *  2. Si no se pudo agregar (sin stock a bordo, producto inexistente), la venta
 *     se bloquea al cobrar con un aviso claro en vez de guardarse mal.
 *
 * Fail-safe: si las banderas aún no cargaron, devuelve `false` → comportamiento
 * idéntico al actual.
 */
import { getFeatureFlagsCache, isFeatureEnabled } from '@/lib/featureFlags';

export const PROMO_AUTO_FLAG = 'ruta_promos_auto';

export function promosAutoHabilitado(licencia?: string | null): boolean {
  const flags = getFeatureFlagsCache();
  if (!flags.some((f) => f.clave === PROMO_AUTO_FLAG)) return false;
  const lic = String(licencia ?? '').trim();
  if (!lic) return false;
  return isFeatureEnabled(PROMO_AUTO_FLAG, lic);
}
