export const CUSTOMER_SEGMENTS = [
  'en_riesgo',
  'bajando',
  'inactivo',
  'perdido',
  'recuperado',
  'creciendo',
  'nuevo',
  'estable',
  'sin_compras',
] as const;

export type CustomerSegment = typeof CUSTOMER_SEGMENTS[number];

export interface CustomerSegmentInfo {
  label: string;
  description: string;
  badgeClass: string;
  color: string;
}

export const CUSTOMER_SEGMENT_INFO: Record<CustomerSegment, CustomerSegmentInfo> = {
  en_riesgo: {
    label: 'En riesgo',
    description: 'Ya rebasó su fecha habitual de recompra.',
    badgeClass: 'bg-red-500/10 text-red-600 border-red-500/30',
    color: '#ef4444',
  },
  bajando: {
    label: 'Compra menos',
    description: 'Bajó más de 15% frente al periodo anterior.',
    badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    color: '#f97316',
  },
  inactivo: {
    label: 'Inactivo',
    description: 'Superó el límite configurado sin comprar.',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    color: '#f59e0b',
  },
  perdido: {
    label: 'Posible pérdida',
    description: 'Duplica el límite de inactividad sin comprar.',
    badgeClass: 'bg-rose-500/10 text-rose-700 border-rose-500/30',
    color: '#e11d48',
  },
  recuperado: {
    label: 'Recuperado',
    description: 'Volvió a comprar después de un periodo ausente.',
    badgeClass: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30',
    color: '#06b6d4',
  },
  creciendo: {
    label: 'Creciendo',
    description: 'Aumentó más de 15% frente al periodo anterior.',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    color: '#10b981',
  },
  nuevo: {
    label: 'Nuevo comprador',
    description: 'Realizó su primera compra en el periodo actual.',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
    color: '#3b82f6',
  },
  estable: {
    label: 'Estable',
    description: 'Mantiene un comportamiento sin variaciones relevantes.',
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
    color: '#64748b',
  },
  sin_compras: {
    label: 'Sin compras',
    description: 'Está registrado, pero aún no tiene ventas válidas.',
    badgeClass: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/30',
    color: '#a1a1aa',
  },
};

export function isCustomerSegment(value: unknown): value is CustomerSegment {
  return typeof value === 'string' && CUSTOMER_SEGMENTS.includes(value as CustomerSegment);
}

export function customerAction(segment: CustomerSegment, daysOverdue?: number | null): string {
  switch (segment) {
    case 'en_riesgo':
      return daysOverdue && daysOverdue > 0
        ? `Contactar: lleva ${daysOverdue} días fuera de su ciclo`
        : 'Contactar antes de que deje de comprar';
    case 'bajando': return 'Revisar qué productos o volumen disminuyeron';
    case 'inactivo': return 'Programar recuperación comercial';
    case 'perdido': return 'Validar si se perdió y documentar el motivo';
    case 'recuperado': return 'Dar seguimiento para consolidar su regreso';
    case 'creciendo': return 'Asegurar inventario y buscar venta cruzada';
    case 'nuevo': return 'Acompañar su segunda compra';
    case 'sin_compras': return 'Convertir su registro en primera compra';
    default: return 'Mantener frecuencia y nivel de servicio';
  }
}

export function numericChange(current: number, previous: number): number | null {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : null;
}

export type CustomerProductTrend = 'detenido' | 'bajando' | 'creciendo' | 'estable';
export type CustomerProductDimension = 'category' | 'brand';

export interface CustomerProductForAnalysis {
  id: string;
  category_name?: string | null;
  brand_name?: string | null;
  recent_qty: number;
  previous_qty: number;
  recent_total: number;
  previous_total: number;
  trend: CustomerProductTrend;
}

export interface CustomerDimensionSummary {
  name: string;
  products: number;
  stopped_products: number;
  declining_products: number;
  growing_products: number;
  recent_qty: number;
  previous_qty: number;
  recent_total: number;
  previous_total: number;
  change_pct: number | null;
  revenue_gap: number;
}

/** Agrupa movimientos ya calculados por PostgreSQL; no vuelve a interpretar ventas. */
export function summarizeCustomerProducts(
  products: CustomerProductForAnalysis[],
  dimension: CustomerProductDimension,
): CustomerDimensionSummary[] {
  const grouped = new Map<string, Omit<CustomerDimensionSummary, 'change_pct' | 'revenue_gap'>>();

  for (const product of products) {
    const rawName = dimension === 'category' ? product.category_name : product.brand_name;
    const name = rawName?.trim() || (dimension === 'category' ? 'Sin categoría' : 'Sin marca');
    const current = grouped.get(name) ?? {
      name,
      products: 0,
      stopped_products: 0,
      declining_products: 0,
      growing_products: 0,
      recent_qty: 0,
      previous_qty: 0,
      recent_total: 0,
      previous_total: 0,
    };

    current.products += 1;
    current.stopped_products += product.trend === 'detenido' ? 1 : 0;
    current.declining_products += product.trend === 'bajando' ? 1 : 0;
    current.growing_products += product.trend === 'creciendo' ? 1 : 0;
    current.recent_qty += Number(product.recent_qty) || 0;
    current.previous_qty += Number(product.previous_qty) || 0;
    current.recent_total += Number(product.recent_total) || 0;
    current.previous_total += Number(product.previous_total) || 0;
    grouped.set(name, current);
  }

  return [...grouped.values()]
    .map(row => ({
      ...row,
      change_pct: numericChange(row.recent_total, row.previous_total),
      revenue_gap: Math.max(0, row.previous_total - row.recent_total),
    }))
    .sort((a, b) => b.revenue_gap - a.revenue_gap || b.recent_total - a.recent_total || a.name.localeCompare(b.name));
}
