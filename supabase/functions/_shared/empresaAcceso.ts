// Seguridad fase 1 (S-06, S-17): reglas puras para decidir sobre qué empresa opera un
// usuario y si puede administrar la suscripción. Sin dependencias de Deno para poder
// probarlas con vitest (src/test/seguridadFase1.test.ts).

export interface PerfilAcceso {
  /** profiles.empresa_id del usuario autenticado. */
  empresaId: string | null;
  /** profiles.super_admin_override_empresa_id (empresa forzada por un super admin). */
  overrideEmpresaId: string | null;
  /** El usuario está en super_admins. */
  esSuperAdmin: boolean;
}

export type ResultadoEmpresa =
  | { ok: true; empresaId: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Empresa efectiva del usuario, igual que get_my_empresa_id(): la forzada si es super admin
 * con override; si no, la de su perfil.
 */
export function empresaEfectiva(perfil: PerfilAcceso): string | null {
  if (perfil.esSuperAdmin && perfil.overrideEmpresaId) return perfil.overrideEmpresaId;
  return perfil.empresaId;
}

/**
 * La empresa sale del perfil del usuario autenticado. Si el cliente manda empresa_id, solo se
 * acepta cuando coincide con la del perfil o cuando el usuario es super admin.
 */
export function resolverEmpresaUsuario(perfil: PerfilAcceso, empresaIdBody?: string | null): ResultadoEmpresa {
  const propia = empresaEfectiva(perfil);
  const pedida = typeof empresaIdBody === "string" && empresaIdBody.trim() ? empresaIdBody.trim() : null;
  if (!pedida) {
    return propia ? { ok: true, empresaId: propia } : { ok: false, status: 400, error: "Usuario sin empresa" };
  }
  if (pedida === propia || perfil.esSuperAdmin) return { ok: true, empresaId: pedida };
  return { ok: false, status: 403, error: "Sin acceso a esa empresa" };
}

/** Acciones de manage-subscription que cambian cobros/plan: solo dueño, administrador o super admin. */
export const ACCIONES_SUSCRIPCION_ADMIN = new Set([
  "update_quantity",
  "change_plan",
  "cancel_subscription",
  "reactivate_subscription",
  "apply_retention_discount",
]);

/**
 * `sync_active_users` (recalcula usuarios activos desde la BD, sin datos del cliente) y
 * `preview_quantity` (sin efectos) siguen abiertas a cualquier usuario de la empresa: las
 * dispara la pantalla de Usuarios, que también usan roles con permiso de usuarios.
 */
export function accionRequiereAdmin(action: unknown): boolean {
  return typeof action === "string" && ACCIONES_SUSCRIPCION_ADMIN.has(action);
}

export function puedeAdministrarSuscripcion(opts: {
  userId: string;
  ownerUserId: string | null;
  esAdminEmpresa: boolean;
  esSuperAdmin: boolean;
}): boolean {
  return opts.esSuperAdmin || opts.esAdminEmpresa || (!!opts.ownerUserId && opts.ownerUserId === opts.userId);
}
