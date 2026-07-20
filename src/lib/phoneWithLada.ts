/**
 * Devuelve el número completo listo para WhatsApp: `${lada}${telefono}` (solo dígitos).
 * - Si el teléfono ya empieza con la lada, no la duplica.
 * - Si no hay lada, cae al fallback ('52' = México).
 * - Filtra caracteres no numéricos.
 */
export function phoneWithLada(telefono?: string | null, lada?: string | null, fallback = '52'): string {
  const tel = (telefono ?? '').replace(/\D/g, '');
  if (!tel) return '';
  const ld = (lada ?? '').replace(/\D/g, '') || fallback;
  if (tel.startsWith(ld)) return tel;
  return ld + tel;
}
