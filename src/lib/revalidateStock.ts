/**
 * Revalidación de stock al reconectar.
 *
 * Antes de subir pedidos creados offline, consulta al servidor el disponible
 * real (stock_almacen - stock_apartado de OTROS pedidos) y detecta si alguna
 * línea ya no cabe. Devuelve un plan de ajustes; NO modifica nada por sí sola
 * (la UI muestra un diálogo para que el vendedor confirme/reduzca).
 */
import { offlineDb } from './offlineDb';
import { supabase } from '@/integrations/supabase/client';

export interface StockConflictLine {
  queueItemId: number;        // id del item en syncQueue (venta_lineas insert)
  ventaLineaId: string;
  productoId: string;
  productoNombre: string;
  almacenId: string;
  cantidadPedida: number;
  disponibleReal: number;
}

export interface StockConflictVenta {
  queueItemId: number;        // id del item en syncQueue (ventas insert)
  ventaId: string;
  folio: string | null;
  clienteNombre: string;
  createdAt: number;
  lines: StockConflictLine[];
}

export async function revalidatePendingVentas(): Promise<StockConflictVenta[]> {
  // 1) Recolectar ventas pedido pendientes en la cola
  const queue = await offlineDb.syncQueue.toArray();
  const pendingVentas = queue.filter(
    (q) =>
      q.table === 'ventas' &&
      q.operation === 'insert' &&
      q.data?.tipo === 'pedido' &&
      q.data?.almacen_id, // solo las que reservan stock
  );
  if (pendingVentas.length === 0) return [];

  const pendingVentaIds = pendingVentas.map((v) => String(v.data.id));

  // 2) Recolectar líneas de esas ventas (en cola)
  const pendingLineas = queue.filter(
    (q) =>
      q.table === 'venta_lineas' &&
      q.operation === 'insert' &&
      pendingVentaIds.includes(String(q.data?.venta_id)),
  );

  // Solo líneas con almacen_id (las que reservan) y cantidad > 0
  const linesToCheck = pendingLineas.filter(
    (l) => l.data?.almacen_id && Number(l.data?.cantidad) > 0,
  );
  if (linesToCheck.length === 0) return [];

  // 3) Agrupar (almacen_id, producto_id) para consultar en batch
  const combos = new Map<string, { almacen_id: string; producto_id: string }>();
  for (const l of linesToCheck) {
    const key = `${l.data.almacen_id}|${l.data.producto_id}`;
    if (!combos.has(key)) combos.set(key, { almacen_id: l.data.almacen_id, producto_id: l.data.producto_id });
  }
  const almacenIds = Array.from(new Set(Array.from(combos.values()).map((c) => c.almacen_id)));
  const productoIds = Array.from(new Set(Array.from(combos.values()).map((c) => c.producto_id)));

  // 4) Consultar stock_almacen actual
  const { data: stockRows, error: stockErr } = await supabase
    .from('stock_almacen')
    .select('almacen_id, producto_id, cantidad')
    .in('almacen_id', almacenIds)
    .in('producto_id', productoIds);
  if (stockErr) throw stockErr;

  const stockMap = new Map<string, number>();
  for (const r of stockRows ?? []) {
    stockMap.set(`${r.almacen_id}|${r.producto_id}`, Number(r.cantidad) || 0);
  }

  // 5) Consultar stock_apartado del servidor EXCLUYENDO nuestras ventas pendientes
  //    (porque las líneas locales pueden haberse guardado en el caché con apartado
  //    optimista; el trigger real todavía no las conoce, pero podrían existir de
  //    intentos previos parciales).
  const { data: apartRows, error: apartErr } = await supabase
    .from('stock_apartado')
    .select('almacen_id, producto_id, cantidad, venta_id')
    .in('almacen_id', almacenIds)
    .in('producto_id', productoIds);
  if (apartErr) throw apartErr;

  const apartMap = new Map<string, number>();
  for (const r of apartRows ?? []) {
    if (pendingVentaIds.includes(String(r.venta_id))) continue;
    const key = `${r.almacen_id}|${r.producto_id}`;
    apartMap.set(key, (apartMap.get(key) ?? 0) + (Number(r.cantidad) || 0));
  }

  // 6) Sumar demanda de LAS PROPIAS líneas por combo (una venta pedido puede
  //    tener varias líneas del mismo producto/almacén; y varias ventas
  //    offline pueden competir entre sí).
  const demandMap = new Map<string, number>();
  for (const l of linesToCheck) {
    const key = `${l.data.almacen_id}|${l.data.producto_id}`;
    demandMap.set(key, (demandMap.get(key) ?? 0) + (Number(l.data.cantidad) || 0));
  }

  // 7) Detectar conflictos por combo: si demanda > disponible, prorratear el
  //    faltante entre las líneas afectadas (respetando FIFO por createdAt).
  const conflicts: Array<{ queueItemId: number; disponibleReal: number }> = [];
  const linesByCombo = new Map<string, typeof linesToCheck>();
  for (const l of linesToCheck) {
    const key = `${l.data.almacen_id}|${l.data.producto_id}`;
    if (!linesByCombo.has(key)) linesByCombo.set(key, []);
    linesByCombo.get(key)!.push(l);
  }

  for (const [key, lines] of linesByCombo) {
    const stock = stockMap.get(key) ?? 0;
    const apart = apartMap.get(key) ?? 0;
    const disponibleTotal = Math.max(0, stock - apart);
    const demanda = demandMap.get(key) ?? 0;
    if (demanda <= disponibleTotal) continue;

    // Prorrateo FIFO: primero se sirve la venta más antigua.
    const sorted = [...lines].sort((a, b) => a.createdAt - b.createdAt);
    let restante = disponibleTotal;
    for (const l of sorted) {
      const pedido = Number(l.data.cantidad) || 0;
      const asignado = Math.max(0, Math.min(pedido, restante));
      restante -= asignado;
      if (asignado < pedido) {
        conflicts.push({ queueItemId: l.id!, disponibleReal: asignado });
      }
    }
  }

  if (conflicts.length === 0) return [];

  // 8) Ensamblar respuesta agrupada por venta
  const conflictLineIds = new Set(conflicts.map((c) => c.queueItemId));
  const dispByLineId = new Map(conflicts.map((c) => [c.queueItemId, c.disponibleReal]));

  // Traer nombres de productos y clientes desde caché local (offline-safe)
  const productoIdsSet = new Set<string>();
  for (const l of pendingLineas) if (conflictLineIds.has(l.id!)) productoIdsSet.add(l.data.producto_id);
  const productos = await offlineDb.productos
    .where('id')
    .anyOf(Array.from(productoIdsSet))
    .toArray();
  const productoNombreMap = new Map(productos.map((p: any) => [p.id, p.nombre as string]));

  const clienteIds = Array.from(new Set(pendingVentas.map((v) => v.data.cliente_id).filter(Boolean)));
  const clientes = clienteIds.length
    ? await offlineDb.clientes.where('id').anyOf(clienteIds).toArray()
    : [];
  const clienteNombreMap = new Map(clientes.map((c: any) => [c.id, c.nombre as string]));

  const result: StockConflictVenta[] = [];
  for (const v of pendingVentas) {
    const ventaId = String(v.data.id);
    const ventaLines: StockConflictLine[] = [];
    for (const l of pendingLineas) {
      if (String(l.data.venta_id) !== ventaId) continue;
      if (!conflictLineIds.has(l.id!)) continue;
      ventaLines.push({
        queueItemId: l.id!,
        ventaLineaId: String(l.data.id),
        productoId: l.data.producto_id,
        productoNombre: productoNombreMap.get(l.data.producto_id) ?? l.data.descripcion ?? 'Producto',
        almacenId: l.data.almacen_id,
        cantidadPedida: Number(l.data.cantidad) || 0,
        disponibleReal: dispByLineId.get(l.id!) ?? 0,
      });
    }
    if (ventaLines.length === 0) continue;
    result.push({
      queueItemId: v.id!,
      ventaId,
      folio: v.data.folio ?? null,
      clienteNombre: clienteNombreMap.get(v.data.cliente_id) ?? 'Cliente',
      createdAt: v.createdAt,
      lines: ventaLines,
    });
  }

  return result;
}

/**
 * Aplica los ajustes decididos por el vendedor a la cola y al caché local.
 * decisions: map queueItemId de venta_linea -> nueva cantidad (0 = eliminar línea).
 * Recalcula subtotales/totales de las ventas afectadas.
 */
export async function applyStockAdjustments(
  conflicts: StockConflictVenta[],
  decisions: Map<number, number>,
): Promise<void> {
  for (const venta of conflicts) {
    // 1) Ajustar cada línea
    for (const line of venta.lines) {
      const nueva = decisions.get(line.queueItemId);
      if (nueva === undefined) continue;
      const item = await offlineDb.syncQueue.get(line.queueItemId);
      if (!item) continue;

      if (nueva <= 0) {
        // Eliminar línea: quitar de la cola y del caché local
        await offlineDb.syncQueue.delete(line.queueItemId);
        try { await offlineDb.venta_lineas.delete(line.ventaLineaId); } catch { /* ignore */ }
        // También borrar el apartado local si existe
        try {
          const apart = await offlineDb.stock_apartado
            .where('venta_linea_id').equals(line.ventaLineaId).toArray();
          for (const a of apart) await offlineDb.stock_apartado.delete(a.id);
        } catch { /* ignore */ }
      } else if (nueva < line.cantidadPedida) {
        // Reducir cantidad y recalcular montos de la línea proporcionalmente
        const factor = nueva / line.cantidadPedida;
        const d = { ...item.data };
        d.cantidad = nueva;
        d.subtotal = round2((Number(d.subtotal) || 0) * factor);
        d.iva_monto = round2((Number(d.iva_monto) || 0) * factor);
        d.ieps_monto = round2((Number(d.ieps_monto) || 0) * factor);
        d.total = round2((Number(d.total) || 0) * factor);
        await offlineDb.syncQueue.update(line.queueItemId, { data: d, createdAt: Date.now(), retries: 0 });
        try { await offlineDb.venta_lineas.put(d); } catch { /* ignore */ }
        // Ajustar apartado local
        try {
          const apart = await offlineDb.stock_apartado
            .where('venta_linea_id').equals(line.ventaLineaId).toArray();
          for (const a of apart) await offlineDb.stock_apartado.put({ ...a, cantidad: nueva });
        } catch { /* ignore */ }
      }
    }

    // 2) Recalcular totales de la venta (leyendo TODAS las líneas actuales en la cola)
    const remainingLines = (await offlineDb.syncQueue.toArray()).filter(
      (q) => q.table === 'venta_lineas' && q.operation === 'insert' && String(q.data?.venta_id) === venta.ventaId,
    );

    if (remainingLines.length === 0) {
      // Venta sin líneas: cancelar completamente
      await offlineDb.syncQueue.delete(venta.queueItemId);
      try { await offlineDb.ventas.delete(venta.ventaId); } catch { /* ignore */ }
      continue;
    }

    const totals = remainingLines.reduce(
      (acc, l) => {
        acc.subtotal += Number(l.data.subtotal) || 0;
        acc.iva += Number(l.data.iva_monto) || 0;
        acc.ieps += Number(l.data.ieps_monto) || 0;
        acc.total += Number(l.data.total) || 0;
        return acc;
      },
      { subtotal: 0, iva: 0, ieps: 0, total: 0 },
    );

    const ventaItem = await offlineDb.syncQueue.get(venta.queueItemId);
    if (ventaItem) {
      const d = { ...ventaItem.data };
      d.subtotal = round2(totals.subtotal);
      d.iva_total = round2(totals.iva);
      d.ieps_total = round2(totals.ieps);
      d.total = round2(totals.total);
      d.saldo_pendiente = round2(totals.total);
      await offlineDb.syncQueue.update(venta.queueItemId, { data: d, createdAt: Date.now(), retries: 0 });
      try { await offlineDb.ventas.put(d); } catch { /* ignore */ }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
