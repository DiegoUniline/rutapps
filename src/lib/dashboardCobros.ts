export interface DashboardCobroBase {
  id: string;
  monto: number | null;
  cliente_id: string | null;
  [key: string]: unknown;
}

export interface DashboardCobroAplicacion {
  cobro_id: string;
  monto_aplicado: number | null;
  ventas: {
    vendedor_id: string | null;
    status: string | null;
  } | null;
}

/**
 * Atribuye cobros al vendedor sin duplicar importes.
 *
 * - Si el cobro tiene aplicaciones, solo suma el monto aplicado a ventas del
 *   vendedor seleccionado y descarta aplicaciones de ventas canceladas.
 * - Si el cobro aún no tiene aplicaciones, usa el vendedor asignado al cliente
 *   como criterio de respaldo (misma regla usada por Reportes).
 * - Cuando no hay vendedor seleccionado, el caller debe conservar la lógica
 *   global existente.
 */
export function atribuirCobrosAVendedor<T extends DashboardCobroBase>(
  cobros: T[],
  vendedorId: string,
  aplicaciones: DashboardCobroAplicacion[],
  clienteVendedorMap: ReadonlyMap<string, string | null>,
): T[] {
  const appsByCobro = new Map<string, DashboardCobroAplicacion[]>();

  for (const app of aplicaciones) {
    const current = appsByCobro.get(app.cobro_id) ?? [];
    current.push(app);
    appsByCobro.set(app.cobro_id, current);
  }

  const resultado: T[] = [];

  for (const cobro of cobros) {
    const apps = appsByCobro.get(cobro.id) ?? [];

    if (apps.length === 0) {
      const vendedorCliente = cobro.cliente_id
        ? clienteVendedorMap.get(cobro.cliente_id)
        : null;

      if (vendedorCliente === vendedorId) {
        resultado.push(cobro);
      }
      continue;
    }

    const montoVendedor = apps.reduce((total, app) => {
      const venta = app.ventas;
      if (!venta) return total;
      if (venta.status === 'cancelado') return total;
      if (venta.vendedor_id !== vendedorId) return total;
      return total + Number(app.monto_aplicado ?? 0);
    }, 0);

    if (montoVendedor > 0) {
      resultado.push({
        ...cobro,
        monto: montoVendedor,
      });
    }
  }

  return resultado;
}
