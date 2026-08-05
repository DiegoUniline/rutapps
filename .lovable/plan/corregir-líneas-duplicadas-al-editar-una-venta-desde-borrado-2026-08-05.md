# Corregir líneas duplicadas al editar una venta desde borrador

## Qué está pasando

Al regresar una venta a borrador y agregar un producto nuevo, la línea se guarda dos veces si se guarda y luego se confirma (o se guarda dos veces seguidas). Queda duplicada como en VTA-0218 (Catsup repetido).

Causa confirmada en el código:

- `useVentaForm.handleSave` inserta cada línea nueva con `saveLinea` (insert cuando la línea no trae `id`), pero **no escribe de vuelta el `id` devuelto en el estado local `lineas`**.
- Después de guardar se hace `loadedVentaIdRef.current = null` e `invalidateQueries(['venta', id])`, con la intención de recargar. Pero el efecto de carga depende de `[existingVenta?.id, isNew]`; como el id de la venta no cambia, el efecto **nunca se vuelve a ejecutar** y las líneas locales siguen sin `id`.
- Resultado: la siguiente llamada a `handleSave` (que es exactamente lo que hace "Confirmar" cuando el estado previo es borrador) vuelve a hacer INSERT de la misma línea.

## Cambios propuestos

1. En `src/pages/VentaForm/useVentaForm.ts` (`handleSave`): al recibir `savedLines`, actualizar el estado `lineas` asignando el `id` devuelto a cada línea que no lo tenía, respetando el mismo orden de `preparadas`. Así cualquier guardado posterior hace UPDATE, no INSERT.
2. Reforzar la recarga: hacer que el efecto de carga también reaccione cuando `loadedVentaIdRef` fue reiniciado tras un guardado (por ejemplo, incluyendo el `dataUpdatedAt`/versión del query de la venta en las dependencias), sin perder la protección de "cargar una sola vez por venta" que evita pisar ediciones del usuario.
3. Salvaguarda: hacer que `saveLinea` no pueda insertar dos veces la misma línea en un mismo ciclo (reutilizar el id ya asignado en el estado antes de decidir insert vs update).

## Verificación

- Venta confirmada → "A borrador" → agregar producto nuevo → Guardar → Confirmar: debe quedar una sola línea del producto y el total no debe duplicarse.
- Editar cantidad de una línea existente y confirmar: se actualiza, no se duplica.
- Eliminar una línea en borrador y confirmar: no reaparece.
- Crear una venta nueva con confirmación automática: sigue guardando una sola vez cada línea.

## Alcance

Solo lógica de guardado de líneas en el formulario de ventas de escritorio. No se tocan precios, promociones, impuestos ni saldos.
