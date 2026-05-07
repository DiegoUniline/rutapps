// Email del único usuario con acceso al módulo de facturación / suscripción / timbres.
export const SUPER_ADMIN_EMAIL = 'diego.leon@uniline.mx';

export function isSuperAdminEmail(email?: string | null) {
  return (email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
}
