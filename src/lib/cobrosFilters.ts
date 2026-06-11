// Helpers para tratar cobros cancelados de forma consistente en toda la app.
// Un cobro cancelado NO debe contar para totales (pagado, cobrado, esperado en caja).

export function isCobroActivo(c: { status?: string | null } | null | undefined): boolean {
  if (!c) return false;
  return (c.status ?? 'activo') !== 'cancelado';
}

// Suma aplicaciones excluyendo las cuyo cobro está cancelado.
// La aplicación debe haber sido seleccionada con join a cobros(status).
export function sumAplicacionesActivas(
  apps: Array<{ monto_aplicado?: number | null; cobros?: { status?: string | null } | null }> | null | undefined,
): number {
  if (!apps?.length) return 0;
  return apps.reduce((s, a) => s + (isCobroActivo(a.cobros) ? Number(a.monto_aplicado ?? 0) : 0), 0);
}
