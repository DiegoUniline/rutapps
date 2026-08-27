export type PosTicketPaymentSplit = {
  metodo: string;
  monto: number;
  referencia?: string | null;
};

type BuildPosTicketPaymentsParams = {
  condicion: 'contado' | 'credito';
  splits: PosTicketPaymentSplit[];
  total: number;
  fecha: string;
};

/**
 * Construye exclusivamente los pagos que se muestran en el comprobante
 * inmediato del POS. Una venta a credito no recibe dinero al registrarse, por
 * lo que nunca debe inventarse un pago de respaldo.
 */
export function buildPosTicketPayments({ condicion, splits, total, fecha }: BuildPosTicketPaymentsParams) {
  if (condicion === 'credito') {
    return {
      metodoPago: undefined,
      montoRecibido: undefined,
      pagos: [] as Array<PosTicketPaymentSplit & { fecha: string }>,
    };
  }

  const pagosBase = splits.length > 0
    ? splits
    : [{ metodo: 'efectivo', monto: total, referencia: '' }];
  const montoRecibido = pagosBase.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);

  return {
    metodoPago: pagosBase.map(pago => pago.metodo).join(' + ') || 'efectivo',
    montoRecibido: montoRecibido > 0 ? montoRecibido : undefined,
    pagos: pagosBase.map(pago => ({ ...pago, fecha })),
  };
}
