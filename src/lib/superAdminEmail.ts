// Emails con acceso de super admin (facturación, timbres, tutoriales, override de empresa, etc.)
export const SUPER_ADMIN_EMAILS = ['diego.leon@uniline.mx', 'ventas@uniline.mx'] as const;

// Compat: primer email como "principal" (usado en algunos strings legacy).
export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

export function isSuperAdminEmail(email?: string | null) {
  const e = (email || '').toLowerCase();
  return (SUPER_ADMIN_EMAILS as readonly string[]).includes(e);
}
