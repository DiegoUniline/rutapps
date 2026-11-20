/**
 * Opciones del diseñador de ticket (Configuración → Ticket). Se guardan en
 * `empresas.ticket_campos` (jsonb, sin migración): interruptores booleanos
 * (encendidos por omisión: `campoOn`) y dos textos libres.
 */
import type { TicketCampos } from '@/lib/ticketModelo';

export const TICKET_TEXTOS = ['texto_encabezado', 'texto_pie'] as const;
export const TICKET_TEXTO_MAX = 160;

export const DEFAULT_CAMPOS: TicketCampos = {
  // Encabezado empresa
  logo: true, nombre: true, razon_social: true, rfc: true,
  direccion: true, telefono: true, email: true,
  // Documento
  folio: true, fecha: true, condicion_pago: true,
  // Cliente
  cliente_nombre: true, cliente_rfc: true, cliente_telefono: true, cliente_direccion: true,
  // Vendedor
  vendedor_nombre: true, vendedor_telefono: true,
  // Renglones de producto
  linea_codigo: true, linea_precio_unitario: true, linea_descuento: true,
  linea_precio_sugerido: true, linea_promo: true,
  // Totales y estado
  impuestos: true, impuestos_desglose: true, descuentos: true, saldo_cuenta: true, recibido_cambio: true,
  // Bloques adicionales
  promociones: true, pagos_recibidos: true, devoluciones: true,
  // Pie
  notas_ticket: true, firmas: true, mensaje_gracias: true,
  // Textos libres
  texto_encabezado: '', texto_pie: '',
};

export const CAMPO_SECCIONES: { titulo: string; claves: string[] }[] = [
  { titulo: 'Encabezado de la empresa', claves: ['logo', 'nombre', 'razon_social', 'rfc', 'direccion', 'telefono', 'email'] },
  { titulo: 'Datos del documento', claves: ['folio', 'fecha', 'condicion_pago'] },
  { titulo: 'Datos del cliente', claves: ['cliente_nombre', 'cliente_rfc', 'cliente_telefono', 'cliente_direccion'] },
  { titulo: 'Datos del vendedor', claves: ['vendedor_nombre', 'vendedor_telefono'] },
  { titulo: 'Renglones de producto', claves: ['linea_codigo', 'linea_precio_unitario', 'linea_descuento', 'linea_precio_sugerido', 'linea_promo'] },
  { titulo: 'Totales y estado de cuenta', claves: ['impuestos', 'impuestos_desglose', 'descuentos', 'saldo_cuenta', 'recibido_cambio'] },
  { titulo: 'Bloques adicionales', claves: ['promociones', 'pagos_recibidos', 'devoluciones'] },
  { titulo: 'Pie del ticket', claves: ['notas_ticket', 'firmas', 'mensaje_gracias'] },
];

export const CAMPO_LABELS: Record<string, string> = {
  logo: 'Logo', nombre: 'Nombre comercial', razon_social: 'Razón social',
  rfc: 'RFC de la empresa', direccion: 'Dirección', telefono: 'Teléfono', email: 'Correo electrónico',
  folio: 'Folio', fecha: 'Fecha', condicion_pago: 'Condición y método de pago',
  cliente_nombre: 'Nombre del cliente', cliente_rfc: 'RFC del cliente',
  cliente_telefono: 'Teléfono del cliente', cliente_direccion: 'Dirección del cliente',
  vendedor_nombre: 'Nombre del vendedor', vendedor_telefono: 'Teléfono del vendedor',
  linea_codigo: 'Código del producto', linea_precio_unitario: 'Precio unitario',
  linea_descuento: 'Descuento del renglón', linea_precio_sugerido: 'Precio sugerido al público',
  linea_promo: 'Promoción «GRATIS» en el renglón',
  impuestos: 'Desglose de impuestos (subtotal, IVA/IEPS)', impuestos_desglose: 'IVA e IEPS por separado',
  descuentos: 'Descuentos totales',
  saldo_cuenta: 'Estado de cuenta (saldo anterior/nuevo)', recibido_cambio: 'Recibido y cambio',
  promociones: 'Promociones aplicadas', pagos_recibidos: 'Historial de pagos recibidos',
  devoluciones: 'Devoluciones',
  notas_ticket: 'Notas de ticket', firmas: 'Firmas (Entregó / Recibió)',
  mensaje_gracias: 'Mensaje "Gracias por su compra"',
};

/** Interruptores que dependen de otro (se deshabilitan si el padre está apagado). */
export const CAMPO_DEPENDE_DE: Record<string, string> = {
  impuestos_desglose: 'impuestos',
  linea_promo: 'promociones',
};
