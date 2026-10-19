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

export type FiltroFiscalComision = 'fiscal' | 'no_fiscal' | 'rfc_pendiente';

export interface FiltrosReporteComisiones {
  ruta?: string[];
  estadoCuenta?: string[];
  estadoComision?: string[];
  fiscal?: string[];
}

export type AgrupacionComision = 'vendedor' | 'ruta' | 'estadoCuenta' | 'estadoComision' | 'fiscal' | 'mes';

export const AGRUPACION_COMISION_LABEL: Record<AgrupacionComision, string> = {
  vendedor: 'Vendedor',
  ruta: 'Ruta/Zona',
  estadoCuenta: 'Estado de cuenta',
  estadoComision: 'Estado de comisión',
  fiscal: 'Tipo fiscal',
  mes: 'Mes',
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const cumpleFiscal = (row: ReporteComisionVenta, filtro: string) => {
  if (filtro === 'fiscal') return row.requiereFactura;
  if (filtro === 'no_fiscal') return !row.requiereFactura;
  if (filtro === 'rfc_pendiente') return row.requiereFactura && !row.rfc;
  return false;
};

/** Dentro de un filtro los valores se combinan con OR; entre filtros, AND. Lista vacía = sin filtro. */
export function filtrarReporteComisiones(
  rows: ReporteComisionVenta[],
  filtros: FiltrosReporteComisiones,
  search = '',
): ReporteComisionVenta[] {
  const term = search.trim().toLocaleLowerCase('es');
  const { ruta = [], estadoCuenta = [], estadoComision = [], fiscal = [] } = filtros;
  return rows.filter(row => {
    if (term && ![row.folio, row.cliente, row.vendedor, row.ruta, row.rfc].some(value => value.toLocaleLowerCase('es').includes(term))) return false;
    if (ruta.length && !ruta.includes(row.ruta)) return false;
    if (estadoCuenta.length && !estadoCuenta.includes(row.estadoCuenta)) return false;
    if (estadoComision.length && !estadoComision.includes(row.estadoComision)) return false;
    if (fiscal.length && !fiscal.some(filtro => cumpleFiscal(row, filtro))) return false;
    return true;
  });
}

export function etiquetaAgrupacionComision(row: ReporteComisionVenta, key: string): string {
  switch (key as AgrupacionComision) {
    case 'vendedor': return row.vendedor;
    case 'ruta': return row.ruta;
    case 'estadoCuenta': return ESTADO_CUENTA_LABEL[row.estadoCuenta];
    case 'estadoComision': return ESTADO_COMISION_LABEL[row.estadoComision];
    case 'fiscal': return !row.requiereFactura ? 'No fiscal' : row.rfc ? 'Fiscal' : 'Fiscal · RFC pendiente';
    case 'mes': {
      const [year, month] = row.fecha.slice(0, 7).split('-');
      const index = Number(month) - 1;
      return year && MESES[index] ? `${year} - ${MESES[index]}` : 'Sin fecha';
    }
    default: return '';
  }
}

/** Orden de grupos: mes cronológico; el resto alfabético por etiqueta. */
export function ordenAgrupacionComision(row: ReporteComisionVenta, key: string): string {
  if (key === 'mes') return row.fecha.slice(0, 7) || '￿';
  return etiquetaAgrupacionComision(row, key).toLocaleLowerCase('es');
}

export interface TotalesComisiones {
  ventas: number;
  vendido: number;
  comision: number;
  comisionPendiente: number;
  comisionPagada: number;
  saldo: number;
}

export function totalizarComisiones(rows: ReporteComisionVenta[]): TotalesComisiones {
  const acc = rows.reduce((sum, row) => {
    sum.ventas += 1;
    sum.vendido += row.total;
    sum.comision += row.comision;
    sum.comisionPendiente += row.comisionPendiente + row.comisionEnRecibo;
    sum.comisionPagada += row.comisionPagada;
    sum.saldo += row.saldo;
    return sum;
  }, { ventas: 0, vendido: 0, comision: 0, comisionPendiente: 0, comisionPagada: 0, saldo: 0 });
  return {
    ventas: acc.ventas,
    vendido: roundMoney(acc.vendido),
    comision: roundMoney(acc.comision),
    comisionPendiente: roundMoney(acc.comisionPendiente),
    comisionPagada: roundMoney(acc.comisionPagada),
    saldo: roundMoney(acc.saldo),
  };
}
