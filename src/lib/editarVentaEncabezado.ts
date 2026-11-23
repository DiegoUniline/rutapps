/**
 * D-063 · «Editar venta» (venta confirmada, RPC `editar_venta`): fecha de entrega y almacén editables.
 * La BD valida todo (almacén de la empresa y activo, sin entregas activas, lotes con existencia en el
 * nuevo almacén) y mueve el inventario; aquí solo están las reglas para mostrar los campos y el
 * encabezado que se envía.
 */

export const AVISO_CAMBIO_ALMACEN = 'Se regresará el stock al almacén anterior y saldrá del nuevo';
export const MOTIVO_ALMACEN_CON_ENTREGAS = 'El pedido ya tiene entregas: el almacén no se puede cambiar aquí (cada entrega sale de su propio almacén).';

/** Motivo por el que el almacén no se puede cambiar en «Editar venta», o null si se puede. */
export function motivoAlmacenBloqueado(opts: {
  editando: boolean;
  tipo?: string | null;
  entregasActivas: number;
}): string | null {
  if (!opts.editando) return null;
  if (opts.tipo === 'pedido' && opts.entregasActivas > 0) return MOTIVO_ALMACEN_CON_ENTREGAS;
  return null;
}

/** ¿El almacén elegido es distinto del guardado? (sin almacén guardado no hay stock que regresar). */
export function cambioAlmacen(original: string | null | undefined, actual: string | null | undefined): boolean {
  return !!original && !!actual && original !== actual;
}

/** La fecha de entrega solo aplica a pedidos sin entrega inmediata (misma regla que el formulario). */
export function requiereFechaEntrega(form: { tipo?: string | null; entrega_inmediata?: boolean | null }): boolean {
  return form.tipo !== 'venta_directa' && !form.entrega_inmediata;
}

/** Campos de D-063 para `p_header` de `editar_venta`. La BD ignora valores vacíos o sin cambio. */
export function encabezadoAlmacenEntrega(form: {
  tipo?: string | null;
  entrega_inmediata?: boolean | null;
  fecha_entrega?: string | null;
  almacen_id?: string | null;
}): { almacen_id: string | null; fecha_entrega?: string } {
  const out: { almacen_id: string | null; fecha_entrega?: string } = { almacen_id: form.almacen_id ?? null };
  if (requiereFechaEntrega(form) && form.fecha_entrega) out.fecha_entrega = form.fecha_entrega;
  return out;
}
