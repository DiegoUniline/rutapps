Voy a ajustar solo el panel administrativo de liquidaciones para que el flujo quede consistente:

1. Hacer que al presionar `Reabrir` el modal trabaje inmediatamente con el estado actualizado como `pendiente`, sin depender de cerrar y volver a abrir.
2. Permitir editar `Efectivo entregado` cuando la liquidación esté abierta para edición.
3. Ocultar `Aprobar liquidación` y `Rechazar con nota` cuando la liquidación siga aprobada o rechazada; solo deben aparecer si realmente está pendiente/reabierta.
4. Mantener el botón `Reabrir` visible para liquidaciones aprobadas o rechazadas, y no mostrarlo cuando ya esté pendiente.
5. Al guardar el efectivo, actualizar el monto reportado y recalcular la diferencia, refrescando la lista y el detalle.