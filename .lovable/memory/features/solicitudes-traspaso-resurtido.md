---
name: Solicitudes de traspaso (resurtido) y mínimos/máximos por almacén
description: Documento de pre-autorización que NO mueve inventario; el stock solo se mueve al generar y confirmar el traspaso real
type: feature
---

# Resurtido por mínimos y solicitudes de traspaso

- `producto_almacen_config` — mínimo/máximo por producto + almacén. Se edita en Producto > Inventario.
- `solicitudes_traspaso` + `solicitud_traspaso_lineas` + `solicitud_traspaso_surtidos` + `solicitud_traspaso_historial`.
- Estados: `borrador → solicitada → aprobada → parcialmente_surtida → surtida`, más `rechazada` y `cancelada`.
- RPCs: `fn_sugerencias_resurtido`, `enviar_solicitud_traspaso`, `aprobar_solicitud_traspaso`,
  `rechazar_solicitud_traspaso`, `cancelar_solicitud_traspaso`, `surtir_solicitud_traspaso`.

## Regla clave
La solicitud **nunca** toca inventario. `surtir_solicitud_traspaso` crea un `traspaso` real que se confirma con
`confirmar_traspaso` (única fuente de movimientos y lotes). Permite surtido parcial acumulando `cantidad_surtida`.

## UI
- Escritorio: `/almacen/solicitudes-traspaso` (lista) y `/almacen/solicitudes-traspaso/:id` (detalle/aprobación/surtido).
- Móvil: `/ruta/solicitud-traspaso` — funciona offline (cola de sincronización), botón "Cargar productos bajo mínimo".

## Offline
`offlineDb` v15 agrega las tres tablas. En `offlineSync.ts` las solicitudes se filtran por `solicitante_user_id`
y quedan FUERA del refresco completo para no borrar borradores creados sin señal.
