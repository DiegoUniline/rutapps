/**
 * Aviso de mantenimiento (corte D-018). Mientras `activo` sea true, nadie usa la app
 * salvo los correos de `permitidos`. Para liberar: poner `activo: false` y subir a main.
 */
export const MANTENIMIENTO = {
  activo: true,
  permitidos: ['diego.leon@uniline.mx'],
  mensaje: 'Estamos actualizando RutApp. El sistema se libera en aproximadamente 2 horas.',
};

export function bloqueadoPorMantenimiento(email: string | null | undefined): boolean {
  if (!MANTENIMIENTO.activo) return false;
  const e = (email ?? '').trim().toLowerCase();
  return !MANTENIMIENTO.permitidos.includes(e);
}
