export type CompraInventoryStatus = 'borrador' | 'confirmada' | 'recibida' | 'pagada' | 'cancelada';

export interface CompraInventoryLine {
  id?: string | null;
  productoId: string;
  piezasTotales: number;
  piezasRecibidas: number;
  requiereLote: boolean;
}
export interface CompraInventoryImpact {
  entradas: number;
  salidas: number;
  pendientes: number;
  bloqueos: string[];
}

const qty = (value: number) => Math.max(0, Number(value) || 0);
const roundQty = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Contrato de conciliación usado por la pantalla para anticipar el resultado
 * del RPC transaccional. La base de datos vuelve a calcular todo con los datos
 * bloqueados del servidor; este cálculo nunca sustituye esa validación.
 */
export function calcularImpactoEdicionCompra(
  anteriores: CompraInventoryLine[],
  siguientes: CompraInventoryLine[],
  status: CompraInventoryStatus,
): CompraInventoryImpact {
  const anterioresPorId = new Map(
    anteriores.filter(linea => linea.id).map(linea => [linea.id as string, linea]),
  );
  const idsSiguientes = new Set(siguientes.flatMap(linea => linea.id ? [linea.id] : []));
  let entradas = 0;
  let salidas = 0;
  let pendientes = 0;
  const bloqueos: string[] = [];

  for (const anterior of anteriores) {
    if (anterior.id && !idsSiguientes.has(anterior.id)) {
      salidas += qty(anterior.piezasRecibidas);
    }
  }

  for (const siguiente of siguientes) {
    const totalNuevo = qty(siguiente.piezasTotales);
    const anterior = siguiente.id ? anterioresPorId.get(siguiente.id) : undefined;
    let recibidoDeseado = 0;

    if (!anterior) {
      recibidoDeseado = status === 'recibida' || status === 'pagada'
        ? (siguiente.requiereLote ? 0 : totalNuevo)
        : 0;
      entradas += recibidoDeseado;
      pendientes += Math.max(0, totalNuevo - recibidoDeseado);
      continue;
    }

    const recibidoAnterior = qty(anterior.piezasRecibidas);
    const totalAnterior = qty(anterior.piezasTotales);
    if (anterior.productoId !== siguiente.productoId && recibidoAnterior > 0) {
      bloqueos.push('Un producto con mercancía recibida debe eliminarse y volver a agregarse.');
      pendientes += Math.max(0, totalNuevo - recibidoAnterior);
      continue;
    }

    const estabaCompleta = recibidoAnterior >= totalAnterior - 0.0001;
    recibidoDeseado = (status === 'recibida' || status === 'pagada')
      && estabaCompleta
      && !siguiente.requiereLote
      ? totalNuevo
      : Math.min(recibidoAnterior, totalNuevo);

    const delta = recibidoDeseado - recibidoAnterior;
    if (delta > 0) entradas += delta;
    if (delta < 0) salidas += Math.abs(delta);
    pendientes += Math.max(0, totalNuevo - recibidoDeseado);
  }

  return {
    entradas: roundQty(entradas),
    salidas: roundQty(salidas),
    pendientes: roundQty(pendientes),
    bloqueos: [...new Set(bloqueos)],
  };
}
