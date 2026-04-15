/**
 * Pure utility for distributing payments across a current sale and pending accounts (FIFO).
 * Used by mobile route, POS, and desktop checkout to ensure consistent behavior.
 */

export interface PendingAccountInput {
  id: string;
  saldo_pendiente: number;
  montoAplicar: number; // pre-assigned amount (from auto-distribution or manual input)
}

export interface AccountApplicationResult {
  accountId: string;
  applied: number;
  originalSaldo: number;
  newSaldo: number;
}

export interface DistributionResult {
  appliedToSale: number;
  saleNewSaldo: number;
  accountApplications: AccountApplicationResult[];
  totalAppliedToAccounts: number;
  cambio: number;
  totalReceived: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Auto-distribute surplus across pending accounts FIFO.
 * Returns new montoAplicar values without mutating the input.
 */
export function autoDistributeSurplus(
  saleTotal: number,
  totalPaid: number,
  pendingAccounts: PendingAccountInput[],
): PendingAccountInput[] {
  const surplus = totalPaid - saleTotal;
  if (surplus <= 0.01) {
    return pendingAccounts.map(a => ({ ...a, montoAplicar: 0 }));
  }
  let remaining = surplus;
  return pendingAccounts.map(a => {
    if (remaining <= 0.01) return { ...a, montoAplicar: 0 };
    const apply = r2(Math.min(remaining, a.saldo_pendiente));
    remaining = r2(remaining - apply);
    return { ...a, montoAplicar: apply };
  });
}

/**
 * Distribute payment amounts across current sale and pending accounts.
 * Returns an immutable snapshot of all applications — never mutates inputs.
 */
export function distributePaymentsFIFO(
  saleTotal: number,
  isContado: boolean,
  payments: { monto: number; metodo?: string }[],
  pendingAccounts: PendingAccountInput[],
): DistributionResult {
  const totalReceived = payments.reduce((s, p) => s + p.monto, 0);
  const saleCharge = isContado ? saleTotal : 0;
  const hasEfectivo = payments.some(p => (p.metodo ?? 'efectivo') === 'efectivo');

  let pool = totalReceived;

  // 1. Apply to current sale
  const appliedToSale = r2(Math.min(pool, saleCharge));
  pool = r2(pool - appliedToSale);
  const saleNewSaldo = r2(Math.max(0, saleTotal - appliedToSale));

  // 2. Apply to pending accounts FIFO using their montoAplicar
  const accountApplications: AccountApplicationResult[] = [];
  let totalAppliedToAccounts = 0;

  for (const acct of pendingAccounts) {
    if (pool <= 0.01 || acct.montoAplicar <= 0) continue;
    const apply = r2(Math.min(pool, acct.montoAplicar));
    accountApplications.push({
      accountId: acct.id,
      applied: apply,
      originalSaldo: acct.saldo_pendiente,
      newSaldo: r2(Math.max(0, acct.saldo_pendiente - apply)),
    });
    totalAppliedToAccounts = r2(totalAppliedToAccounts + apply);
    pool = r2(pool - apply);
  }

  // 3. Change (only efectivo generates change)
  const cambio = hasEfectivo ? r2(Math.max(0, pool)) : 0;

  return {
    appliedToSale,
    saleNewSaldo,
    accountApplications,
    totalAppliedToAccounts,
    cambio,
    totalReceived,
  };
}
