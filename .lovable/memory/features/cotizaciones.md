---
name: Cotizaciones module
description: Pre-sale quotations with public token PDF, WhatsApp send, and convert-to-sale with stock validation
type: feature
---
- Tablas `cotizaciones` y `cotizacion_lineas` (multi-tenant `empresa_id`).
- Folio autogenerado por empresa: `COT-00001` vía trigger `trg_cotizacion_before_insert`.
- Vigencia: `vence_at = fecha + vigencia_dias` calculado por trigger.
- Estados: borrador → enviada → aprobada → convertida (también vencida/cancelada).
- Token público `token_publico` (uuid) sirve a `/cotizacion/:token` con RLS anon SELECT.
- PDF generado con `buildCotizacionPdf` reusando `src/lib/pdfBase.ts` (Odoo B/N).
- WhatsApp: `wa.me/<tel>?text=...` con link al PDF público (`window.location.origin/cotizacion/<token>`).
- Conversión a venta: RPC `validar_stock_cotizacion(p_cotizacion_id, p_almacen_id)` revisa `stock_almacen.cantidad` por línea; respeta `productos.vender_sin_stock`. Si todo OK convierte; si faltante, permite forzar bajo confirmación.
- Convertir crea `ventas` (tipo=pedido, status=borrador) + `venta_lineas` copiando datos; marca cotización `convertida` y guarda `venta_id`.
- Rutas: `/cotizaciones`, `/cotizaciones/:id`, público `/cotizacion/:token`.
- Permiso: módulo `ventas.cotizaciones` (acciones estándar).
