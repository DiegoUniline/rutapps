export const DAY_MS = 86_400_000;

export type InventoryHealth = 'agotado' | 'critico' | 'reorden' | 'saludable' | 'lento' | 'detenido';
export type ExpirationHealth = 'vencido' | 'critico' | 'proximo' | 'vigilancia' | 'vigente' | 'sin_fecha';

export type InventoryProductInput = {
  id: string;
  stock: number;
  cost: number;
  price: number;
  soldUnits: number;
  windowDays: number;
  targetCoverageDays: number;
  leadTimeDays: number;
  minimumStock?: number | null;
  createdAt: string;
  lastSaleAt?: string | null;
  lastInboundAt?: string | null;
  referenceDate?: string | Date;
};

export function differenceInCalendarDays(later: string | Date, earlier: string | Date): number {
  const end = new Date(later);
  const start = new Date(earlier);
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.max(0, Math.floor((endUtc - startUtc) / DAY_MS));
}

export function analyzeInventoryProduct(input: InventoryProductInput) {
  const stock = Math.max(0, Number(input.stock || 0));
  const cost = Math.max(0, Number(input.cost || 0));
  const price = Math.max(0, Number(input.price || 0));
  const soldUnits = Math.max(0, Number(input.soldUnits || 0));
  const windowDays = Math.max(1, input.windowDays);
  const avgDaily = soldUnits / windowDays;
  const coverageDays = avgDaily > 0 ? stock / avgDaily : null;
  const referenceDate = input.referenceDate || new Date();
  const inactivityOrigin = input.lastSaleAt || input.lastInboundAt || input.createdAt;
  const daysWithoutSale = input.lastSaleAt
    ? differenceInCalendarDays(referenceDate, input.lastSaleAt)
    : differenceInCalendarDays(referenceDate, input.createdAt);
  const idleDays = differenceInCalendarDays(referenceDate, inactivityOrigin);
  const target = Math.max(1, Number(input.targetCoverageDays || 14));
  const leadTime = Math.max(0, Number(input.leadTimeDays || 0));
  const reorderPoint = avgDaily * (target + leadTime);
  const suggestedPurchase = avgDaily > 0
    ? Math.max(0, Math.ceil(avgDaily * (target + leadTime) - stock))
    : 0;

  let health: InventoryHealth;
  if (stock <= 0 && soldUnits > 0) health = 'agotado';
  else if (stock > 0 && soldUnits <= 0 && idleDays >= 90) health = 'detenido';
  else if (stock > 0 && coverageDays !== null && coverageDays < 7) health = 'critico';
  else if (stock > 0 && (
    (coverageDays !== null && coverageDays <= target + leadTime)
    || (input.minimumStock != null && stock <= Number(input.minimumStock))
  )) health = 'reorden';
  else if (stock > 0 && (coverageDays === null || coverageDays > 90 || daysWithoutSale >= 45)) health = 'lento';
  else health = 'saludable';

  return {
    avgDaily,
    coverageDays,
    reorderPoint,
    suggestedPurchase,
    inventoryValue: stock * cost,
    potentialValue: stock * price,
    potentialMargin: stock * Math.max(price - cost, 0),
    daysWithoutSale,
    idleDays,
    inactivityOrigin,
    health,
  };
}

export function getExpirationHealth(expirationDate: string | null, referenceDate: string | Date = new Date()) {
  if (!expirationDate) return { days: null, health: 'sin_fecha' as ExpirationHealth };
  const expiry = new Date(`${expirationDate}T00:00:00Z`);
  const reference = new Date(referenceDate);
  const referenceUtc = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const days = Math.ceil((expiryUtc - referenceUtc) / DAY_MS);
  let health: ExpirationHealth = 'vigente';
  if (days < 0) health = 'vencido';
  else if (days <= 7) health = 'critico';
  else if (days <= 30) health = 'proximo';
  else if (days <= 90) health = 'vigilancia';
  return { days, health };
}

export function getAbcClasses<T extends { revenue: number }>(rows: T[]): Array<T & { abcClass: 'A' | 'B' | 'C'; cumulativePct: number }> {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
  let cumulative = 0;
  return sorted.map(row => {
    const before = total > 0 ? cumulative / total : 1;
    cumulative += Math.max(0, row.revenue);
    const abcClass: 'A' | 'B' | 'C' = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
    return { ...row, abcClass, cumulativePct: total > 0 ? cumulative / total : 0 };
  });
}

