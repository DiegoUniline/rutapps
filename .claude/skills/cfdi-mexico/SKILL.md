---
name: cfdi-mexico
description: Reglas de datos para sistemas que facturan en México (CFDI 4.0, catálogos SAT, PAC como Facturama): campos del receptor, impuestos, cancelación, notas de crédito, complemento de pago. Úsala cuando un módulo emita, guarde o dependa de facturas.
---

# CFDI 4.0 — reglas de datos

Antes de aplicar cualquier regla fiscal específica confirma con el dueño su caso; verifica contra la documentación vigente del SAT/PAC si hay duda. No inventes claves de catálogo.

## Receptor (cliente) — obligatorios para facturar
- `rfc` (12 moral / 13 física), upper, formato SAT. Genérico nacional `XAXX010101000`, extranjero `XEXX010101000`: no pueden ser llave única.
- `razon_social` exactamente como en la Constancia de Situación Fiscal (sin régimen societario "SA de CV" en 4.0).
- `regimen_fiscal` (catálogo c_RegimenFiscal) compatible con persona física/moral.
- `cp_fiscal` (domicilio fiscal, 5 dígitos).
- `uso_cfdi` (c_UsoCFDI) compatible con el régimen.
Validación: CHECK de formato en BD + validación con PAC al timbrar.

## Emisor (empresa)
RFC, razón social, régimen, CP de expedición (lugar de expedición), certificados CSD gestionados por el PAC (nunca guardar contraseña de CSD en texto plano).

## Conceptos
- `clave_prod_serv` (c_ClaveProdServ) y `clave_unidad` (c_ClaveUnidad) por producto/servicio.
- `objeto_imp` (01 no objeto, 02 sí objeto, …).
- Impuestos por línea: tasa/cuota, tipo factor, base. IVA 16%, 8% frontera, 0%, exento son distintos.
- Guardar en la línea los valores al facturar (copia), no referencia viva al catálogo.

## Factura en BD
Tabla `facturas`: empresa_id, documento origen (venta/pedido), serie, folio, uuid_sat, fecha_timbrado, estado (`borrador|timbrada|cancelada|error`), total, xml_url, pdf_url, receptor congelado (rfc, razón social, régimen, cp, uso), método de pago (PUE/PPD), forma de pago (c_FormaPago), moneda, tipo de cambio.
- Factura timbrada no se edita. Se cancela (motivo 01–04; 01 requiere UUID sustituto) y se emite otra.
- Cambiar RFC del cliente no altera facturas emitidas (receptor congelado).
- PPD → complemento de pago por cada abono; saldo insoluto controlado.
- Devoluciones/descuentos posteriores → CFDI de egreso (nota de crédito) relacionado.
- Factura global al público en general: periodicidad, meses, año.

## Qué pasa si (fiscales)
- Facturan una venta ya cancelada → bloquear.
- Venta facturada se cancela → ¿se cancela factura o nota de crédito? (preguntar).
- Facturar fuera del mes de la venta → ¿se permite? (preguntar).
- Falla el PAC → estado `error`, reintento idempotente (no timbrar dos veces).
