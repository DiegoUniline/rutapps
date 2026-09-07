export const DIFASUR_LICENSE = '53021303';

export type EstadoCuentaComision = 'adeudo' | 'liquidada' | 'cancelada';
export type EstadoPagoComision = 'sin_comision' | 'pendiente' | 'en_recibo' | 'parcial' | 'pagada' | 'cancelada';

export interface ComisionVentaSource {
  id: string;
  folio: string | null;
  fecha: string;
  total: number | null;
  saldo_pendiente: number | null;
  status: string;
  requiere_factura: boolean | null;
  cliente_id: string | null;
  vendedor_id: string | null;
  clientes?: {
    nombre?: string | null;
    rfc?: string | null;
    zonas?: { nombre?: string | null } | { nombre?: string | null }[] | null;
  } | null;
  vendedores?: { nombre?: string | null } | null;
  venta_comisiones?: Array<{
    comision_monto?: number | null;
    pagada?: boolean | null;
    pago_comision_id?: string | null;
  }> | null;
}

export interface ReporteComisionVenta {
  id: string;
  folio: string;
  fecha: string;
  cliente: string;
  vendedor: string;
  vendedorId: string | null;
  ruta: string;
  estadoCuenta: EstadoCuentaComision;
  requiereFactura: boolean;
  rfc: string;
  total: number;
  saldo: number;
  comision: number;
  comisionPendiente: number;
  comisionEnRecibo: number;
  comisionPagada: number;
  estadoComision: EstadoPagoComision;
}

const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function relationName(value: { nombre?: string | null } | { nombre?: string | null }[] | null | undefined): string {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.nombre?.trim() || 'Sin ruta/zona';
}

export function estadoCuentaVenta(status: string, saldo: number): EstadoCuentaComision {
  if (status === 'cancelado') return 'cancelada';
  return saldo > 0.01 ? 'adeudo' : 'liquidada';
}

export function buildReporteComisionVenta(source: ComisionVentaSource): ReporteComisionVenta {
  const total = roundMoney(amount(source.total));
  const saldo = source.status === 'cancelado' ? 0 : roundMoney(Math.max(0, amount(source.saldo_pendiente)));
  const registros = source.status === 'cancelado' ? [] : (source.venta_comisiones ?? []);

  let pendiente = 0;
  let enRecibo = 0;
  let pagada = 0;
  for (const registro of registros) {
    const monto = amount(registro.comision_monto);
    if (registro.pagada) pagada += monto;
    else if (registro.pago_comision_id) enRecibo += monto;
    else pendiente += monto;
  }

  pendiente = roundMoney(pendiente);
  enRecibo = roundMoney(enRecibo);
  pagada = roundMoney(pagada);
  const comision = roundMoney(pendiente + enRecibo + pagada);

  let estadoComision: EstadoPagoComision;
  if (source.status === 'cancelado') estadoComision = 'cancelada';
  else if (comision <= 0.01) estadoComision = 'sin_comision';
  else if (pagada >= comision - 0.01) estadoComision = 'pagada';
  else if (pagada > 0) estadoComision = 'parcial';
  else if (enRecibo > 0) estadoComision = 'en_recibo';
  else estadoComision = 'pendiente';

  return {
    id: source.id,
    folio: source.folio?.trim() || 'Sin folio',
    fecha: source.fecha,
    cliente: source.clientes?.nombre?.trim() || 'Sin cliente',
    vendedor: source.vendedores?.nombre?.trim() || 'Sin vendedor',
    vendedorId: source.vendedor_id,
    ruta: relationName(source.clientes?.zonas),
    estadoCuenta: estadoCuentaVenta(source.status, saldo),
    requiereFactura: source.requiere_factura === true,
    rfc: source.clientes?.rfc?.trim().toUpperCase() || '',
    total: source.status === 'cancelado' ? 0 : total,
    saldo,
    comision,
    comisionPendiente: pendiente,
    comisionEnRecibo: enRecibo,
    comisionPagada: pagada,
    estadoComision,
  };
}

export const ESTADO_CUENTA_LABEL: Record<EstadoCuentaComision, string> = {
  adeudo: 'Adeudo',
  liquidada: 'Liquidada',
  cancelada: 'Cancelada',
};

export const ESTADO_COMISION_LABEL: Record<EstadoPagoComision, string> = {
  sin_comision: 'Sin comisión',
  pendiente: 'Pendiente',
  en_recibo: 'En recibo',
  parcial: 'Pago parcial',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
};
