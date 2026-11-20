import type { KardexRefInfo } from '@/hooks/useKardexReferencias';

interface FilaMovimiento {
  tipo?: string | null;
  referencia_tipo?: string | null;
  referencia_id?: string | null;
  almacen_origen_id?: string | null;
  almacen_destino_id?: string | null;
}

/**
 * Origen y destino legibles de un movimiento de inventario (Kardex e Inventario › Movimientos).
 * Cada fila del kardex solo trae el almacén de su lado; el otro lado se deduce del documento:
 * venta/entrega → cliente, compra → proveedor, traspaso → el otro almacén, carga → camión, ajuste → «Ajuste».
 * `nombreAlmacen` resuelve un id a nombre; `almacenActual` es el almacén filtrado (si lo hay).
 */
export function origenDestinoMovimiento(
  row: FilaMovimiento,
  ref: KardexRefInfo | undefined,
  nombreAlmacen: (id: string) => string | undefined,
  almacenActual?: string,
): { origen: string; destino: string } {
  const refTipo = row.referencia_tipo ?? '';
  const refId = row.referencia_id ?? '';
  const alm = (id?: string | null) => (id ? (ref?.almacenes?.[id] ?? nombreAlmacen(id) ?? 'Almacén') : '');
  const almOrigen = alm(row.almacen_origen_id) || almacenActual || '—';
  const almDestino = alm(row.almacen_destino_id) || almacenActual || '—';
  const cliVenta = refId ? ref?.ventaCliente?.[refId] : undefined;
  const cliEntrega = refId ? ref?.entregaCliente?.[refId] : undefined;

  switch (refTipo) {
    case 'venta':
    case 'venta_ruta':
      return { origen: almOrigen, destino: cliVenta ? `Cliente: ${cliVenta.nombre}` : 'Cliente' };
    case 'cancelacion_venta':
    case 'reverso_borrador':
      return { origen: cliVenta ? `Cliente: ${cliVenta.nombre}` : 'Cliente', destino: almDestino };
    case 'devolucion':
    case 'devolucion_aplicada':
      return { origen: 'Cliente', destino: almDestino };
    case 'compra': {
      const prov = refId ? ref?.compraProveedor?.[refId] : undefined;
      return { origen: prov ? `Prov: ${prov.nombre}` : 'Proveedor', destino: almDestino };
    }
    case 'entrega':
    case 'entrega_cargado':
      // Con almacén destino es el paso almacén → camión del repartidor; sin él, la entrega al cliente.
      return {
        origen: almOrigen,
        destino: row.almacen_destino_id ? alm(row.almacen_destino_id) : (cliEntrega ? `Cliente: ${cliEntrega.nombre}` : 'Cliente'),
      };
    case 'traspaso': {
      const t = refId ? ref?.traspasoAlmacenes?.[refId] : undefined;
      return {
        origen: alm(row.almacen_origen_id || t?.origen_id) || '—',
        destino: alm(row.almacen_destino_id || t?.destino_id) || '—',
      };
    }
    case 'carga':
      return { origen: almOrigen, destino: alm(row.almacen_destino_id) || 'Camión' };
    case 'descarga':
      return { origen: alm(row.almacen_origen_id) || 'Camión', destino: almDestino };
    case 'ajuste':
    case 'conteo':
    case 'auditoria':
    case 'manual':
    case 'carga_inicial': {
      const etiqueta = refTipo === 'conteo' ? 'Conteo físico' : refTipo === 'auditoria' ? 'Auditoría' : refTipo === 'carga_inicial' ? 'Carga inicial' : 'Ajuste';
      return row.tipo === 'salida'
        ? { origen: almOrigen, destino: alm(row.almacen_destino_id) || `${etiqueta} (baja)` }
        : { origen: alm(row.almacen_origen_id) || etiqueta, destino: almDestino };
    }
    default:
      return {
        origen: row.almacen_origen_id ? alm(row.almacen_origen_id) : (row.tipo === 'entrada' ? 'Externo' : almOrigen),
        destino: row.almacen_destino_id ? alm(row.almacen_destino_id) : (row.tipo === 'salida' ? 'Externo' : almDestino),
      };
  }
}
