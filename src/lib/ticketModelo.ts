/**
 * Modelo ÚNICO del ticket de venta.
 *
 * `construirModeloTicket(data, campos)` decide QUÉ lleva el ticket (secciones,
 * renglones, textos y montos ya formateados) a partir de la venta (`TicketData`)
 * y de la configuración de la empresa (`empresas.ticket_campos`). Toda la lógica
 * de visibilidad, montos y textos vive aquí una sola vez; los renderizadores
 * (`buildTicketHTML`, `buildEscPosBytes`, el ticket en pantalla y el texto para
 * compartir) solo dibujan este modelo. La nota de venta carta (PDF) usa
 * `resolverOpcionesTicket` para obedecer las mismas opciones.
 *
 * Función pura: sin DOM, sin red, sin fecha actual.
 */
import type { TicketData, TicketLinea } from './ticketHtml';
import { getCurrencyConfig } from './currency';
import { computeResumenFromLineas } from './ventaResumen';

/* ─── Configuración (empresas.ticket_campos) ─── */

/** `empresas.ticket_campos`: interruptores (boolean) y textos libres (string). Sin migración: es jsonb. */
export type TicketCampos = Record<string, boolean | string>;

/** Un interruptor está encendido salvo que se haya guardado explícitamente `false`. */
export function campoOn(campos: TicketCampos | null | undefined, key: string): boolean {
  return !campos || campos[key] !== false;
}

/** Texto libre guardado en ticket_campos (vacío si no es string). */
export function campoTexto(campos: TicketCampos | null | undefined, key: string): string {
  const v = campos?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Lee `empresas.ticket_campos` (jsonb) conservando solo booleanos y textos. */
export function leerTicketCampos(valor: unknown): TicketCampos | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const out: TicketCampos = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === 'boolean' || typeof v === 'string') out[k] = v;
  }
  return out;
}

export interface OpcionesTicket {
  logo: boolean; nombre: boolean; razonSocial: boolean; rfc: boolean;
  direccion: boolean; telefono: boolean; email: boolean;
  folio: boolean; fecha: boolean; condicionPago: boolean;
  clienteNombre: boolean; clienteRfc: boolean; clienteTelefono: boolean; clienteDireccion: boolean;
  vendedorNombre: boolean; vendedorTelefono: boolean;
  impuestos: boolean; impuestosDesglose: boolean; descuentos: boolean;
  saldoCuenta: boolean; recibidoCambio: boolean;
  promociones: boolean; pagosRecibidos: boolean; devoluciones: boolean;
  notas: boolean; firmas: boolean; gracias: boolean;
  lineaPrecioUnitario: boolean; lineaPrecioSugerido: boolean; lineaCodigo: boolean;
  lineaDescuento: boolean; lineaPromo: boolean;
  textoEncabezado: string; textoPie: string;
}

export function resolverOpcionesTicket(campos: TicketCampos | null | undefined): OpcionesTicket {
  const on = (k: string) => campoOn(campos, k);
  return {
    logo: on('logo'), nombre: on('nombre'), razonSocial: on('razon_social'), rfc: on('rfc'),
    direccion: on('direccion'), telefono: on('telefono'), email: on('email'),
    folio: on('folio'), fecha: on('fecha'), condicionPago: on('condicion_pago'),
    clienteNombre: on('cliente_nombre'), clienteRfc: on('cliente_rfc'),
    clienteTelefono: on('cliente_telefono'), clienteDireccion: on('cliente_direccion'),
    vendedorNombre: on('vendedor_nombre'), vendedorTelefono: on('vendedor_telefono'),
    impuestos: on('impuestos'), impuestosDesglose: on('impuestos_desglose'), descuentos: on('descuentos'),
    saldoCuenta: on('saldo_cuenta'), recibidoCambio: on('recibido_cambio'),
    promociones: on('promociones'), pagosRecibidos: on('pagos_recibidos'), devoluciones: on('devoluciones'),
    notas: on('notas_ticket'), firmas: on('firmas'), gracias: on('mensaje_gracias'),
    lineaPrecioUnitario: on('linea_precio_unitario'), lineaPrecioSugerido: on('linea_precio_sugerido'),
    lineaCodigo: on('linea_codigo'), lineaDescuento: on('linea_descuento'), lineaPromo: on('linea_promo'),
    textoEncabezado: campoTexto(campos, 'texto_encabezado'),
    textoPie: campoTexto(campos, 'texto_pie'),
  };
}

/* ─── Etiquetas ─── */

export const MOTIVO_DEVOLUCION_LABELS: Record<string, string> = {
  no_vendido: 'No vendido', vencido: 'Vencido', caducado: 'Caducado',
  danado: 'Danado', cambio: 'Cambio', error_pedido: 'Error pedido', otro: 'Otro',
};
export const ACCION_DEVOLUCION_LABELS: Record<string, string> = {
  reposicion: 'Reposicion', nota_credito: 'Nota credito',
  devolucion_dinero: 'Dev. dinero', descuento_venta: 'Desc. venta',
};

/* ─── Montos ─── */

export interface TicketTotalsSummary {
  descuentoTotal: number;
  impuestosTotal: number;
  /** Solo pagos REALMENTE registrados (pagos, pago aplicado o recibido − cambio). Nunca se infiere por la condición. */
  totalPagado: number;
  /** true si hubo algún pago registrado (sin pagos, «Total pagado» = $0.00). */
  hayPago: boolean;
  saldo: number;
}

export function getTicketTotalsSummary(data: TicketData): TicketTotalsSummary {
  const totalPromo = (data.promociones ?? []).reduce((s, p) => s + (Number(p.descuento) || 0), 0);
  const descuentoTotal = Math.max(Number(data.descuento ?? 0), totalPromo, 0);
  const impuestosTotal = Math.max((Number(data.iva) || 0) + (Number(data.ieps ?? 0) || 0), 0);
  const pagosTotal = (data.pagos ?? []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const recibidoNeto = data.montoRecibido != null
    ? Math.max((Number(data.montoRecibido) || 0) - (Number(data.cambio ?? 0) || 0), 0)
    : 0;
  const pagoAplicado = Math.max(Number(data.pagoAplicado ?? 0) || 0, 0);
  const totalVenta = Math.max(Number(data.total) || 0, 0);
  // Antes, sin pagos y con condición «contado» se suponía pagado el total:
  // un pedido de contado (pago contra entrega) sin cobro salía como pagado.
  // Si el llamador sabe cuánto se pagó de ESTA venta (ruta), eso manda: lo abonado
  // a cuentas anteriores no es pago de esta venta (H10).
  const totalPagado = data.pagadoEstaVenta != null
    ? Math.max(Number(data.pagadoEstaVenta) || 0, 0)
    : pagosTotal > 0
    ? pagosTotal
    : pagoAplicado > 0
      ? pagoAplicado
      : recibidoNeto > 0
        ? recibidoNeto
        : 0;
  const saldo = data.cancelado
    ? 0
    : data.saldoNuevo != null
      ? Math.max(Number(data.saldoNuevo) || 0, 0)
      : Math.max(totalVenta - Math.min(totalPagado, totalVenta), 0);

  return { descuentoTotal, impuestosTotal, totalPagado, hayPago: totalPagado > 0.005, saldo };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TotalesTicket {
  /** Subtotal sin impuestos, descuentos y gravable (modo con desglose). */
  sinImpuestos: number;
  descuento: number;
  gravable: number;
  iva: number;
  ieps: number;
  /** Modo sin desglose: todo en bruto (impuestos incluidos) para que Subtotal − Descuentos = Total. */
  subtotalBruto: number;
  descuentoBruto: number;
  total: number;
}

/**
 * Desglose fiscal del ticket: impuestos desde los TOTALES del encabezado
 * (data.iva/data.ieps, fiables en todos los flujos) y el gravable derivado del
 * total real para que SIEMPRE cuadre. Si hay columnas de desglose guardadas
 * (precio de lista, descuento manual/promo) se usan; si no, el descuento se
 * reconstruye desde las líneas (capta el «gratis»).
 */
export function calcularTotalesTicket(data: TicketData): TotalesTicket {
  const { lineas } = data;
  const summary = getTicketTotalsSummary(data);
  const resumen = computeResumenFromLineas(lineas.map(l => ({
    subtotal: undefined,
    descuento_pct: l.descuento_pct,
    precio_unitario: l.precio,
    cantidad: l.cantidad,
    iva_monto: l.iva_monto,
    ieps_monto: l.ieps_monto,
    total: l.total,
  })));
  const total = Number(data.total) || 0;
  const iva = Number(data.iva) || 0;
  const ieps = Number(data.ieps) || 0;
  const subtotalNetoGuardado = r2(lineas.reduce((s, l) => {
    const lista = Number(l.precio_lista_unitario);
    return s + (Number.isFinite(lista) ? r2(lista * (Number(l.cantidad) || 0)) : 0);
  }, 0));
  const descuentoNetoGuardado = r2(lineas.reduce((s, l) => {
    const bruto = (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0);
    if (bruto <= 0) return s;
    const divisor = (1 + (Number(l.ieps_pct) || 0) / 100) * (1 + (Number(l.iva_pct) || 0) / 100);
    return s + r2(divisor > 0 ? bruto / divisor : bruto);
  }, 0));
  const descuento = subtotalNetoGuardado > 0
    ? (descuentoNetoGuardado > 0 ? descuentoNetoGuardado : r2(subtotalNetoGuardado - (total - iva - ieps)))
    : Math.max(resumen.descuento, summary.descuentoTotal, 0);
  const sinImpuestos = subtotalNetoGuardado > 0
    ? subtotalNetoGuardado
    : Math.max(0, total - iva - ieps) + descuento;
  const gravable = subtotalNetoGuardado > 0
    ? Math.max(0, r2(sinImpuestos - descuento))
    : Math.max(0, total - iva - ieps);
  const descuentoBrutoGuardado = r2(lineas.reduce((s, l) =>
    s + (Number(l.descuento_promocion_monto) || 0) + (Number(l.descuento_manual_monto) || 0), 0));
  const descuentoBruto = descuentoBrutoGuardado > 0.005 ? descuentoBrutoGuardado : r2(descuento);
  const subtotalBruto = descuentoBruto > 0.005 ? r2(total + descuentoBruto) : r2(sinImpuestos + iva + ieps);
  return { sinImpuestos, descuento, gravable, iva, ieps, subtotalBruto, descuentoBruto, total };
}

/** Formato de dinero solo ASCII (sin separadores de locale multibyte): -$1,234.50 */
export function crearFormatoTicket(moneda: string | null | undefined): (n: number) => string {
  const sym = getCurrencyConfig(moneda).symbol;
  return (n: number) => {
    const [intPart, decPart] = Math.abs(n).toFixed(2).split('.');
    return `${n < 0 ? '-' : ''}${sym}${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decPart}`;
  };
}

/* ─── Modelo ─── */

export type RenglonTicket =
  | { tipo: 'separador' }
  | { tipo: 'blanco' }
  /** Texto a la izquierda. recortar = cortar al ancho; envolver = varias líneas; libre = tal cual. */
  | { tipo: 'texto'; texto: string; modo: 'recortar' | 'envolver' | 'libre' }
  | { tipo: 'titulo'; texto: string }
  /** Etiqueta a la izquierda y monto a la derecha. recorteIzq: la etiqueta se corta a (ancho − n). */
  | { tipo: 'par'; izq: string; der: string; negrita?: boolean; recorteIzq?: number }
  /** Renglón de producto: el nombre se envuelve y el importe va en la primera línea. */
  | { tipo: 'producto'; texto: string; importe: string; gratis: boolean }
  /** Detalle sangrado bajo el producto (P.U., sugerido, descuento, «Antes» tachado). */
  | { tipo: 'detalle'; partes: { texto: string; tachado?: boolean }[] }
  | { tipo: 'firmas' };

export interface EncabezadoTicket {
  logoUrl: string | null;
  nombre: string | null;
  /** Razón social, RFC, dirección, teléfono y correo, en orden. `chico` = dirección/teléfono/correo. */
  lineas: { texto: string; chico: boolean }[];
  textoLibre: string | null;
}

export interface ModeloTicket {
  opciones: OpcionesTicket;
  encabezado: EncabezadoTicket;
  cuerpo: RenglonTicket[];
  /** Pie centrado: gracias, notas de ticket, texto libre del pie. */
  pie: string[];
  /** Marca Rutapp: siempre visible, no configurable. */
  marca: string[];
  totales: TotalesTicket;
  resumen: TicketTotalsSummary;
}

export const MARCA_RUTAPP = ['Rutapp.mx', 'Sistema de Venta en ruta', 'Contrata al 317 104 5954'];

interface PromoIndex {
  promosConDesc: NonNullable<TicketData['promociones']>;
  descPorProducto: Map<string, number>;
  gratisQtyPorProducto: Map<string, number>;
}

function indexarPromos(data: TicketData): PromoIndex {
  const promosConDesc = (data.promociones ?? []).filter(p => (Number(p.descuento) || 0) > 0);
  const descPorProducto = new Map<string, number>();
  const gratisQtyPorProducto = new Map<string, number>();
  for (const p of promosConDesc) {
    if (!p.producto_id) continue;
    descPorProducto.set(p.producto_id, (descPorProducto.get(p.producto_id) ?? 0) + (Number(p.descuento) || 0));
    if (p.tipo === 'producto_gratis' || (Number(p.cantidad_gratis) || 0) > 0) {
      gratisQtyPorProducto.set(p.producto_id, (gratisQtyPorProducto.get(p.producto_id) ?? 0) + (Number(p.cantidad_gratis) || 0));
    }
  }
  return { promosConDesc, descPorProducto, gratisQtyPorProducto };
}

/** ¿La promo regala la línea completa? Prefiere la cantidad gratis (señal exacta); si no viene, el monto. */
function esLineaGratis(l: TicketLinea, idx: PromoIndex, mostrar: boolean): boolean {
  if (!mostrar || !l.producto_id || l.esCambio) return false;
  const total = Number(l.total) || 0;
  if (total <= 0) return false;
  const gratisQty = idx.gratisQtyPorProducto.get(l.producto_id) ?? 0;
  const descLinea = idx.descPorProducto.get(l.producto_id) ?? 0;
  return gratisQty > 0
    ? gratisQty >= (Number(l.cantidad) || 0) - 0.001
    : descLinea > 0 && descLinea >= total - 0.01;
}

function renglonesProducto(l: TicketLinea, o: OpcionesTicket, idx: PromoIndex, fmt: (n: number) => string, gratisSet: Set<string>): RenglonTicket[] {
  const out: RenglonTicket[] = [];
  // El importe SIEMPRE es el total con impuestos incluidos (bruto), igual que la
  // columna Subtotal del sistema; el toggle de impuestos solo controla el desglose.
  const lineAmt = Number(l.total) || 0;
  const gratis = esLineaGratis(l, idx, o.promociones && o.lineaPromo);
  const codigo = o.lineaCodigo && l.codigo ? `${l.codigo} ` : '';
  const cambio = l.esCambio ? ' (cambio)' : '';
  out.push({ tipo: 'producto', texto: `${l.cantidad}x ${codigo}${l.nombre}${cambio}`, importe: gratis ? 'GRATIS' : fmt(lineAmt), gratis });
  if (gratis) {
    // Precio original tachado + promo, para que el cliente vea el ahorro.
    if (l.producto_id) gratisSet.add(l.producto_id);
    const promo = idx.promosConDesc.find(p => p.producto_id === l.producto_id);
    out.push({ tipo: 'detalle', partes: [
      { texto: `Antes ${fmt(lineAmt)}`, tachado: true },
      ...(promo?.descripcion ? [{ texto: ` ${promo.descripcion}` }] : []),
    ] });
    return out;
  }
  if (l.esCambio) return out;
  if (o.lineaPrecioUnitario) {
    // Precio unitario real: si el guardado no cuadra con el importe bruto se
    // deriva del importe para que SIEMPRE Cantidad × P.U. = Importe.
    const cant = Number(l.cantidad) || 0;
    const pGuardado = Number(l.precio) || 0;
    const pu = cant > 0 && Math.abs(pGuardado * cant - lineAmt) > 0.01 ? lineAmt / cant : pGuardado;
    if (pu > 0) out.push({ tipo: 'detalle', partes: [{ texto: `P.U. ${fmt(pu)}` }] });
  }
  if (o.lineaDescuento) {
    const pct = Number(l.descuento_pct) || 0;
    const monto = Number(l.descuento_manual_monto) || 0;
    if (pct > 0 || monto > 0.005) {
      const partes = [pct > 0 ? `${r2(pct)}%` : '', monto > 0.005 ? `-${fmt(monto)}` : ''].filter(Boolean).join(' ');
      out.push({ tipo: 'detalle', partes: [{ texto: `Desc. ${partes}` }] });
    }
  }
  if (o.lineaPrecioSugerido && (Number(l.precio_sugerido_publico) || 0) > 0) {
    out.push({ tipo: 'detalle', partes: [{ texto: `Sug ${fmt(Number(l.precio_sugerido_publico))}` }] });
  }
  return out;
}

export function construirModeloTicket(data: TicketData, campos?: TicketCampos | null): ModeloTicket {
  const o = resolverOpcionesTicket(campos === undefined ? data.empresa.ticket_campos : campos);
  const { empresa } = data;
  const fmt = crearFormatoTicket(empresa.moneda);

  /* Encabezado */
  const lineasEnc: EncabezadoTicket['lineas'] = [];
  if (o.razonSocial && empresa.razon_social) lineasEnc.push({ texto: empresa.razon_social, chico: false });
  if (o.rfc && empresa.rfc) lineasEnc.push({ texto: `RFC: ${empresa.rfc}`, chico: false });
  const dir1 = [empresa.direccion, empresa.colonia].filter(Boolean).join(', ');
  const dir2 = [empresa.ciudad, empresa.estado, empresa.cp ? `CP ${empresa.cp}` : ''].filter(Boolean).join(', ');
  if (o.direccion && dir1) lineasEnc.push({ texto: dir1, chico: true });
  if (o.direccion && dir2) lineasEnc.push({ texto: dir2, chico: true });
  if (o.telefono && empresa.telefono) lineasEnc.push({ texto: `Tel: ${empresa.telefono}`, chico: true });
  if (o.email && empresa.email) lineasEnc.push({ texto: empresa.email, chico: true });
  const encabezado: EncabezadoTicket = {
    logoUrl: o.logo && empresa.logo_url ? empresa.logo_url : null,
    nombre: o.nombre ? empresa.nombre : null,
    lineas: lineasEnc,
    textoLibre: o.textoEncabezado || null,
  };

  /* Documento, cliente y vendedor */
  const c: RenglonTicket[] = [];
  const sep = () => c.push({ tipo: 'separador' });
  sep();
  if (o.folio) c.push({ tipo: 'texto', texto: `Folio: ${data.folio}`, modo: 'libre' });
  if (o.fecha) c.push({ tipo: 'texto', texto: `Fecha: ${data.fecha}`, modo: 'libre' });
  if (o.clienteNombre) c.push({ tipo: 'texto', texto: `Cliente: ${data.clienteNombre}`, modo: 'recortar' });
  if (o.clienteRfc && data.clienteRfc) c.push({ tipo: 'texto', texto: `RFC: ${data.clienteRfc}`, modo: 'recortar' });
  if (o.clienteTelefono && data.clienteTelefono) c.push({ tipo: 'texto', texto: `Tel: ${data.clienteTelefono}`, modo: 'recortar' });
  if (o.clienteDireccion && data.clienteDireccion) c.push({ tipo: 'texto', texto: `Dir: ${data.clienteDireccion}`, modo: 'envolver' });
  if (o.vendedorNombre && data.vendedorNombre) c.push({ tipo: 'texto', texto: `Vendedor: ${data.vendedorNombre}`, modo: 'recortar' });
  if (o.vendedorTelefono && data.vendedorTelefono) c.push({ tipo: 'texto', texto: `Tel. vend: ${data.vendedorTelefono}`, modo: 'recortar' });
  if (o.condicionPago) {
    const pagoLabel = data.condicionPago === 'credito' ? 'Credito' : data.condicionPago === 'contado' ? 'Contado' : 'P/definir';
    c.push({ tipo: 'texto', texto: `Pago: ${pagoLabel}${data.metodoPago ? ` (${data.metodoPago})` : ''}`, modo: 'libre' });
  }
  sep();

  /* Productos */
  c.push({ tipo: 'par', izq: 'Cant Producto', der: 'Importe' });
  sep();
  const idx = indexarPromos(data);
  const gratisSet = new Set<string>();
  for (const l of data.lineas) c.push(...renglonesProducto(l, o, idx, fmt, gratisSet));
  sep();

  /* Totales */
  const totales = calcularTotalesTicket(data);
  const resumen = getTicketTotalsSummary(data);
  c.push({ tipo: 'blanco' });
  if (o.impuestos) {
    c.push({ tipo: 'par', izq: 'Subtotal sin impuestos', der: fmt(totales.sinImpuestos) });
    if (o.descuentos && totales.descuento > 0.005) c.push({ tipo: 'par', izq: 'Descuentos/promos', der: `-${fmt(totales.descuento)}` });
    c.push({ tipo: 'par', izq: 'Subtotal gravable', der: fmt(totales.gravable) });
    if (o.impuestosDesglose) {
      if (totales.ieps > 0.005) c.push({ tipo: 'par', izq: 'IEPS', der: fmt(totales.ieps) });
      if (totales.iva > 0.005) c.push({ tipo: 'par', izq: 'IVA', der: fmt(totales.iva) });
      if (totales.iva <= 0.005 && totales.ieps <= 0.005) c.push({ tipo: 'par', izq: 'Impuestos', der: fmt(0) });
    } else {
      c.push({ tipo: 'par', izq: 'Impuestos', der: fmt(r2(totales.iva + totales.ieps)) });
    }
  } else {
    c.push({ tipo: 'par', izq: 'Sub total', der: fmt(totales.subtotalBruto) });
    if (o.descuentos && totales.descuentoBruto > 0.005) c.push({ tipo: 'par', izq: 'Descuentos/promos', der: `-${fmt(totales.descuentoBruto)}` });
  }
  sep();
  c.push({ tipo: 'par', izq: 'Total', der: fmt(data.total), negrita: true });
  // Solo lo realmente pagado. Sin pagos se muestra $0.00 (como siempre en
  // crédito): así contado y crédito se leen igual y el saldo queda claro.
  c.push({ tipo: 'par', izq: 'Total pagado', der: fmt(resumen.totalPagado), negrita: true });
  c.push({ tipo: 'par', izq: 'Saldo', der: fmt(resumen.saldo) });

  /* Promociones aplicadas (excluye del criterio de «hay algo» lo ya mostrado GRATIS en su línea) */
  const promosAplicadas = idx.promosConDesc.filter(p => !(p.producto_id && gratisSet.has(p.producto_id)));
  if (o.promociones && (promosAplicadas.length > 0 || gratisSet.size > 0)) {
    sep();
    c.push({ tipo: 'titulo', texto: 'PROMOCIONES APLICADAS' });
    for (const p of idx.promosConDesc) c.push({ tipo: 'par', izq: `  ${p.descripcion}`, der: `-${fmt(p.descuento)}` });
  }
  if (o.promociones && gratisSet.size > 0) {
    c.push({ tipo: 'texto', texto: '(i) Los productos gratis se registran como descuento para mantener trazabilidad.', modo: 'envolver' });
  }

  if (o.recibidoCambio && data.montoRecibido != null && data.montoRecibido > 0) {
    c.push({ tipo: 'par', izq: 'Recibido', der: fmt(data.montoRecibido) });
    if ((data.cambio ?? 0) > 0) c.push({ tipo: 'par', izq: 'Cambio', der: fmt(data.cambio!) });
  }

  if (o.saldoCuenta) {
    sep();
    c.push({ tipo: 'titulo', texto: 'EDO. CUENTA' });
    c.push({ tipo: 'par', izq: 'Saldo ant', der: fmt(data.saldoAnterior ?? 0) });
    if (data.pagoAplicado != null && data.pagoAplicado > 0) c.push({ tipo: 'par', izq: 'Pago', der: `-${fmt(data.pagoAplicado)}` });
    // Lo que esta venta suma a la cuenta: crédito = el total; contado sin pago
    // completo (p. ej. pedido con pago contra entrega) = lo que quedó por pagar.
    const totalVenta = Math.max(Number(data.total) || 0, 0);
    const porPagar = data.cancelado ? 0 : Math.max(totalVenta - Math.min(resumen.totalPagado, totalVenta), 0);
    const sumaVenta = data.cancelado ? 0 : data.condicionPago === 'credito' ? totalVenta : porPagar;
    if (data.condicionPago === 'credito') c.push({ tipo: 'par', izq: '+Venta', der: fmt(data.total) });
    else if (porPagar > 0.005) c.push({ tipo: 'par', izq: '+Por pagar', der: fmt(porPagar) });
    sep();
    const saldoCuenta = data.saldoNuevo ?? Math.max((Number(data.saldoAnterior) || 0) - (Number(data.pagoAplicado) || 0) + sumaVenta, 0);
    c.push({ tipo: 'par', izq: 'Saldo', der: fmt(saldoCuenta), negrita: true });
  }

  if (o.pagosRecibidos && data.pagos && data.pagos.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: 'PAGOS RECIBIDOS' });
    for (const p of data.pagos) {
      const label = (p.fecha ? `${p.fecha} ` : '') + p.metodo + (p.referencia ? ` (${p.referencia})` : '');
      c.push({ tipo: 'par', izq: label, der: fmt(p.monto), recorteIzq: 12 });
    }
  }

  if (o.devoluciones && data.devoluciones && data.devoluciones.length > 0) {
    sep();
    c.push({ tipo: 'titulo', texto: 'DEVOLUCIONES' });
    for (const d of data.devoluciones) {
      const accion = ACCION_DEVOLUCION_LABELS[d.accion] || d.accion;
      const motivo = MOTIVO_DEVOLUCION_LABELS[d.motivo] || d.motivo;
      c.push({ tipo: 'texto', texto: `${d.cantidad}x ${d.nombre}`, modo: 'recortar' });
      c.push({ tipo: 'par', izq: `  ${motivo}`, der: (d.monto ?? 0) > 0 ? `${accion} ${fmt(d.monto!)}` : accion });
    }
  }

  if (o.firmas) {
    c.push({ tipo: 'blanco' });
    c.push({ tipo: 'firmas' });
  }
  c.push({ tipo: 'blanco' });

  /* Pie */
  const pie: string[] = [];
  if (o.gracias) pie.push('Gracias por su compra');
  if (o.notas && empresa.notas_ticket) pie.push(empresa.notas_ticket);
  if (o.textoPie) pie.push(o.textoPie);

  return { opciones: o, encabezado, cuerpo: c, pie, marca: MARCA_RUTAPP, totales, resumen };
}
