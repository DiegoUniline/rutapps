/**
 * Column allowlists for every public table that has INSERT/UPDATE mutations.
 * Used by pickColumns() to strip relational/virtual fields before sending to Supabase.
 */

export const CLIENTE_COLUMNS = [
  'id','empresa_id','codigo','nombre','telefono','email','contacto','direccion','colonia','cp',
  'notas','rfc','regimen_fiscal','uso_cfdi','requiere_factura','foto_url','foto_fachada_url',
  'dia_visita','frecuencia','fecha_alta','status','orden','credito','limite_credito','dias_credito',
  'gps_lat','gps_lng','vendedor_id','cobrador_id','zona_id','tarifa_id','lista_id','lista_precio_id',
  'facturama_id','facturama_rfc','facturama_razon_social','facturama_regimen_fiscal',
  'facturama_uso_cfdi','facturama_cp','facturama_correo_facturacion','created_at',
] as const;

export const PRODUCTO_COLUMNS = [
  'id','empresa_id','codigo','nombre','clave_alterna','descripcion','notas','costo','precio_principal',
  'cantidad','imagen_url','se_puede_comprar','se_puede_vender','vender_sin_stock','se_puede_inventariar',
  'es_combo','min','max','manejar_lotes','factor_conversion','permitir_descuento','monto_maximo',
  'tiene_comision','tipo_comision','pct_comision','status','almacenes','tiene_iva','tiene_ieps',
  'calculo_costo','codigo_sat','contador','contador_tarifas','iva_pct','ieps_pct','ieps_tipo',
  'costo_incluye_impuestos','usa_listas_precio','marca_id','clasificacion_id','lista_id',
  'unidad_venta_id','unidad_compra_id','unidad_sat_id','created_at',
] as const;

export const VENTA_COLUMNS = [
  'id','empresa_id','folio','fecha','subtotal','iva_total','ieps_total','total','saldo_pendiente',
  'descuento_porcentaje','descuento_monto','status','tipo','condicion_pago','dias_credito','notas',
  'notas_internas','cliente_id','vendedor_id','tarifa_id','almacen_id','entrega_inmediata',
  'user_id','gps_lat','gps_lng','created_at',
] as const;

export const VENTA_LINEA_COLUMNS = [
  'id','venta_id','producto_id','cantidad','precio_unitario','descuento_porcentaje','descuento_monto',
  'subtotal','iva_monto','ieps_monto','total','notas','facturado','unidad_id','created_at',
] as const;

export const COMPRA_COLUMNS = [
  'id','empresa_id','folio','fecha','subtotal','iva_total','total','saldo_pendiente','status',
  'condicion_pago','dias_credito','notas','notas_pago','proveedor_id','almacen_id','created_at',
] as const;

export const COMPRA_LINEA_COLUMNS = [
  'id','compra_id','producto_id','cantidad','precio_unitario','subtotal','total','created_at',
] as const;

export const CARGA_COLUMNS = [
  'id','empresa_id','fecha','status','vendedor_id','almacen_id','almacen_destino_id',
  'repartidor_id','notas','created_at',
] as const;

export const CARGA_LINEA_COLUMNS = [
  'id','carga_id','producto_id','cantidad_cargada','cantidad_vendida','cantidad_devuelta','created_at',
] as const;

export const ENTREGA_COLUMNS = [
  'id','empresa_id','folio','fecha','status','notas','pedido_id','vendedor_id','cliente_id',
  'almacen_id','vendedor_ruta_id','fecha_asignacion','fecha_carga','orden_entrega',
  'validado_por','validado_at','created_at',
] as const;

export const ENTREGA_LINEA_COLUMNS = [
  'id','entrega_id','producto_id','cantidad_pedida','cantidad_entregada','hecho',
  'unidad_id','almacen_origen_id','created_at',
] as const;

export const COBRO_COLUMNS = [
  'id','empresa_id','cliente_id','user_id','fecha','monto','metodo_pago','referencia','notas','created_at',
] as const;

export const COBRO_APLICACION_COLUMNS = [
  'id','cobro_id','venta_id','monto_aplicado','created_at',
] as const;

export const DEVOLUCION_COLUMNS = [
  'id','empresa_id','fecha','tipo','vendedor_id','cliente_id','carga_id','user_id','notas','created_at',
] as const;

export const DEVOLUCION_LINEA_COLUMNS = [
  'id','devolucion_id','producto_id','cantidad','motivo','notas','created_at',
] as const;

export const DESCARGA_RUTA_COLUMNS = [
  'id','empresa_id','fecha','status','vendedor_id','carga_id','user_id',
  'efectivo_esperado','efectivo_entregado','diferencia_efectivo','notas','notas_supervisor',
  'aprobado_por','fecha_aprobacion','fecha_inicio','fecha_fin','created_at',
] as const;

export const DESCARGA_RUTA_LINEA_COLUMNS = [
  'id','descarga_id','producto_id','cantidad_esperada','cantidad_real','diferencia','motivo','notas','created_at',
] as const;

export const TARIFA_COLUMNS = [
  'id','empresa_id','nombre','descripcion','tipo','moneda','vigencia_inicio','vigencia_fin','activa','created_at',
] as const;

export const TARIFA_LINEA_COLUMNS = [
  'id','tarifa_id','aplica_a','producto_ids','clasificacion_ids','tipo_calculo','precio',
  'precio_minimo','margen_pct','descuento_pct','redondeo','base_precio','lista_precio_id','created_at',
] as const;

export const LISTA_PRECIO_COLUMNS = [
  'id','tarifa_id','empresa_id','nombre','es_principal','activa','share_token','share_activo','created_at',
] as const;

export const CFDI_COLUMNS = [
  'id','empresa_id','venta_id','user_id','cfdi_type','folio','serie','folio_fiscal','facturama_id',
  'status','currency','subtotal','iva_total','ieps_total','retenciones_total','total',
  'payment_form','payment_method','expedition_place','receiver_rfc','receiver_name',
  'receiver_tax_zip_code','receiver_fiscal_regime','receiver_cfdi_use','fecha_timbrado',
  'no_certificado_emisor','no_certificado_sat','sello_sat','sello_cfdi','cadena_original',
  'pdf_url','xml_url','error_detalle','cancel_status','cancel_date','created_at','updated_at',
] as const;

export const PRODUCTO_PROVEEDOR_COLUMNS = [
  'id','producto_id','proveedor_id','es_principal','precio_compra','tiempo_entrega_dias','notas','created_at',
] as const;

/**
 * Pick only allowed columns from an object, stripping relational/virtual fields.
 */
export function pickColumns<T extends Record<string, any>>(obj: T, columns: readonly string[]): Partial<T> {
  const set = new Set(columns);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => set.has(key))
  ) as Partial<T>;
}
