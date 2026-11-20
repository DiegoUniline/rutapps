/**
 * Formularios de edición que copian el registro de una consulta a su estado local.
 *
 * Cuando la consulta se refresca (se guardó algo relacionado aquí o en otra pantalla), el
 * formulario debe mostrar la versión nueva… salvo que el usuario tenga cambios sin guardar:
 * en ese caso se respetan sus cambios (se pierden si se pisan con lo del servidor).
 */
type ConId = { id?: string | null };

/** true si el formulario puede tomar `existente`: es otro registro o no hay cambios sin guardar. */
export function puedeReemplazarFormulario<T extends ConId>(
  form: T,
  original: T | null | undefined,
  existente: ConId,
): boolean {
  if (!original?.id || original.id !== existente.id) return true;
  return JSON.stringify(form) === JSON.stringify(original);
}
