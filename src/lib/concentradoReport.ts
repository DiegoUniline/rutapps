/** Hoja de surtido: cantidades base, con la misma regla de surtido del concentrado V2. */
export type ReportGrouping = 'general' | 'ruta' | 'vendedor';
export const UNASSIGNED = '__sin_asignar__';
export const SURTIDO_STATUSES = new Set(['surtido', 'cargado', 'hecho']);

export interface ReportOrder {
  id: string;
  folio: string | null;
  vendedor_id: string | null;
  vendedor: { nombre: string } | null;
}
export interface ReportDelivery {
  id: string;
  pedido_id: string;
  status: string;
  vendedor_ruta_id: string | null;
  ruta: { nombre: string } | null;
}
export interface ReportSaleLine {
  id: string;
  venta_id: string;
  producto_id: string | null;
  descripcion: string | null;
  cantidad: number;
  productos: { codigo: string | null; nombre: string } | null;
}
export interface ReportDeliveryLine {
  entrega_id: string;
  producto_id: string | null;
  cantidad_entregada: number;
}
export interface ReportSource {
  orders: ReportOrder[];
  deliveries: ReportDelivery[];
  saleLines: ReportSaleLine[];
  deliveryLines: ReportDeliveryLine[];
}
export interface ReportProduct {
  id: string;
  codigo: string;
  nombre: string;
  requerido: number;
  surtido: number;
  pendiente: number;
}
export interface ReportGroup {
  id: string;
  label: string;
  folios: string[];
  orderCount: number;
  products: ReportProduct[];
}
export interface ReportSelection {
  grouping: ReportGrouping;
  routeIds: string[];
  sellerIds: string[];
}

const compare = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });
const round = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
function quantity(value: number): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) throw new Error('Hay una cantidad inválida en los pedidos. No se generó el reporte.');
  return n;
}

export function getOrderRoutes(deliveries: ReportDelivery[]) {
  const routes = new Map<string, Map<string, string>>();
  for (const delivery of deliveries) {
    if (delivery.status === 'cancelado' || !delivery.vendedor_ruta_id) continue;
    const values = routes.get(delivery.pedido_id) ?? new Map<string, string>();
    values.set(delivery.vendedor_ruta_id, delivery.ruta?.nombre || 'Ruta sin nombre');
    routes.set(delivery.pedido_id, values);
  }
  return routes;
}

export function buildConcentradoReport(source: ReportSource, selection: ReportSelection): ReportGroup[] {
  const routesByOrder = getOrderRoutes(source.deliveries);
  const selectedRoutes = new Set(selection.routeIds);
  const selectedSellers = new Set(selection.sellerIds);
  const deliveries = new Map(source.deliveries.map(d => [d.id, d]));
  const delivered = new Map<string, number>();
  for (const line of source.deliveryLines) {
    const delivery = deliveries.get(line.entrega_id);
    if (!delivery || !SURTIDO_STATUSES.has(delivery.status) || !line.producto_id) continue;
    const key = JSON.stringify([delivery.pedido_id, line.producto_id]);
    delivered.set(key, (delivered.get(key) ?? 0) + quantity(line.cantidad_entregada));
  }

  // Primero concentrar por pedido/producto: una entrega no se resta varias veces
  // cuando el producto ocupa varias líneas (promociones, lotes, etc.).
  const productsByOrder = new Map<string, Map<string, ReportProduct>>();
  for (const line of source.saleLines) {
    const products = productsByOrder.get(line.venta_id) ?? new Map<string, ReportProduct>();
    const id = line.producto_id ?? `linea:${line.id}`;
    const product = products.get(id) ?? {
      id, codigo: line.productos?.codigo ?? '',
      nombre: line.productos?.nombre || line.descripcion || 'Producto sin nombre',
      requerido: 0, surtido: 0, pendiente: 0,
    };
    product.requerido += quantity(line.cantidad);
    product.surtido = delivered.get(JSON.stringify([line.venta_id, line.producto_id])) ?? 0;
    product.pendiente = Math.max(0, product.requerido - product.surtido);
    products.set(id, product);
    productsByOrder.set(line.venta_id, products);
  }

  const groups = new Map<string, { label: string; folios: Set<string>; orders: Set<string>; products: Map<string, ReportProduct> }>();
  for (const order of source.orders) {
    const routes = routesByOrder.get(order.id) ?? new Map<string, string>();
    const routeIds = [...routes.keys()].sort();
    if (selectedSellers.size && !selectedSellers.has(order.vendedor_id ?? UNASSIGNED)) continue;
    if (selectedRoutes.size && !(routeIds.length
      ? routeIds.some(id => selectedRoutes.has(id)) : selectedRoutes.has(UNASSIGNED))) continue;

    let id = 'general';
    let label = 'Concentrado general';
    if (selection.grouping === 'vendedor') {
      id = order.vendedor_id ?? UNASSIGNED;
      label = `Vendedor: ${order.vendedor?.nombre || 'Sin vendedor'}`;
    } else if (selection.grouping === 'ruta') {
      id = JSON.stringify(routeIds);
      // Una orden repartida entre distintas rutas no contiene una asignación
      // inequívoca de TODO lo pedido a cada ruta. Mantener un bloque compartido
      // evita inventar una distribución o multiplicar la demanda del pedido.
      label = routeIds.length > 1
        ? `Rutas compartidas: ${[...routes.values()].sort(compare).join(' / ')}`
        : `Ruta: ${routes.values().next().value || 'Sin ruta asignada'}`;
    }
    const group = groups.get(id) ?? { label, folios: new Set<string>(), orders: new Set<string>(), products: new Map<string, ReportProduct>() };
    group.orders.add(order.id);
    group.folios.add(order.folio || `Sin folio (${order.id.slice(0, 8)})`);
    for (const product of productsByOrder.get(order.id)?.values() ?? []) {
      const current = group.products.get(product.id) ?? { ...product, requerido: 0, surtido: 0, pendiente: 0 };
      current.requerido += product.requerido;
      current.surtido += product.surtido;
      // El excedente de otro pedido NO cubre el pendiente de este pedido.
      current.pendiente += product.pendiente;
      group.products.set(product.id, current);
    }
    groups.set(id, group);
  }
  return [...groups].map(([id, group]) => ({
    id, label: group.label, orderCount: group.orders.size,
    folios: [...group.folios].sort(compare),
    products: [...group.products.values()].map(p => ({
      ...p, requerido: round(p.requerido), surtido: round(p.surtido), pendiente: round(p.pendiente),
    })).sort((a, b) => compare(a.nombre, b.nombre) || compare(a.codigo, b.codigo)),
  })).sort((a, b) => compare(a.label, b.label));
}
