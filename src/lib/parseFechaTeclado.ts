/**
 * Convierte una fecha escrita a mano a YYYY-MM-DD, o null si no es válida.
 * Acepta día/mes/año con "/", "-", "." o espacio ("5/3/2024", "05-03-24"),
 * los 8 dígitos seguidos ("05032024") y el formato ISO ("2024-03-05").
 * Año de 2 dígitos: 00–69 → 2000+, 70–99 → 1900+.
 */
export function parseFechaTeclado(texto: string): string | null {
  const t = (texto ?? '').trim();
  if (!t) return null;
  let d: number, m: number, y: number;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) {
    [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = t.match(/^(\d{2})(\d{2})(\d{4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = t.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (r[3].length === 2) y += y < 70 ? 2000 : 1900;
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2100) return null;
  const fecha = new Date(y, m - 1, d);
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
