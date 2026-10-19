---
name: que-pasa-si
description: Genera casos borde ("¿qué pasa si…?") para cualquier módulo o giro a partir de patrones universales de falla. Úsala al diseñar un módulo, al auditarlo o al escribir pruebas.
---

# Qué pasa si… — patrones universales

Aplica cada patrón al módulo concreto y conviértelo en una pregunta real del negocio, con nombres reales ("¿qué pasa si dos meseros cobran la misma cuenta al mismo tiempo?"). Mínimo 8 por módulo, priorizando los que tocan dinero, inventario/disponibilidad y datos de clientes.

## Patrones

| # | Patrón | Pregunta tipo |
|---|---|---|
| 1 | Concurrencia | ¿Qué pasa si dos usuarios hacen lo mismo con el mismo registro al mismo tiempo? (doble cobro, doble reserva, doble asignación, último inventario) |
| 2 | Doble envío | ¿Qué pasa si se da doble clic, se reintenta por mala señal o llega el mismo webhook dos veces? |
| 3 | Falla a la mitad | ¿Qué pasa si se cae el internet/servidor/impresora/pago a mitad del proceso? ¿Qué queda hecho y qué no? |
| 4 | Cancelación | ¿Se puede cancelar? ¿hasta qué estado? ¿quién? ¿qué se revierte (inventario, saldo, disponibilidad, comisiones)? |
| 5 | Edición después de confirmar | ¿Se puede cambiar algo ya enviado/confirmado/cobrado? ¿qué campos? ¿queda rastro? |
| 6 | Cambio de catálogo | ¿Qué pasa con documentos abiertos y cerrados si cambia el precio, nombre, impuesto o se desactiva el producto/servicio? |
| 7 | Baja con dependencias | ¿Qué pasa si se da de baja algo que tiene pendientes, saldos, historial o hijos activos? |
| 8 | Devolución / reverso | ¿Devolución parcial o total? ¿reembolso en qué forma? ¿afecta factura (nota de crédito)? |
| 9 | División y fusión | ¿Se puede dividir (cuenta, pedido, pago, envío) o juntar dos en uno? |
| 10 | Pagos | ¿Pago parcial, mixto (efectivo + tarjeta), rechazado, en otra moneda, anticipo que excede el total? |
| 11 | Límites | ¿Qué pasa al llegar a cero inventario, capacidad llena, crédito excedido, fecha vencida, cupo máximo? |
| 12 | Cierres | ¿Qué pasa si se cierra el día/turno/mes con pendientes abiertos? ¿se puede reabrir? |
| 13 | Tiempo | ¿Zonas horarias, operaciones después de medianoche que cuentan para el día anterior, fechas futuras o pasadas? |
| 14 | Datos sucios | ¿Duplicados (mismo cliente con otro teléfono), datos incompletos, importaciones con errores? |
| 15 | Permisos | ¿Qué pasa si un rol sin permiso intenta la acción? ¿Y si un usuario cambia de rol o se da de baja con cosas abiertas? |
| 16 | Multiempresa | ¿Algo de una empresa podría verse o afectar a otra? (folios, catálogos compartidos, reportes) |
| 17 | Fuera de línea | ¿Debe funcionar sin internet? ¿cómo se sincroniza y qué pasa con conflictos? |
| 18 | Canales externos | ¿Pedidos/mensajes de WhatsApp, apps de terceros o API que llegan duplicados, fuera de orden o con datos inválidos? |
| 19 | Fiscal | ¿Qué pasa si se factura y luego se cancela, cambia el RFC, o se factura después del mes? |
| 20 | Auditoría | ¿Hay que saber quién hizo esto y cuándo? ¿Puede alguien borrar su rastro? |

## En contexto de rebanadas
Además de los patrones, en cada rebanada pregunta los cruces:
- ¿Qué afecta de lo ya construido (datos reales, reglas, pantallas)?
- ¿Qué beneficia o prepara para rebanadas futuras? ¿Conviene dejar un campo/relación/estado listo ya?
- ¿Qué pasa si algo de esta rebanada se cancela, cambia o se borra y una rebanada futura lo usa?
- ¿Qué pasa con los datos existentes cuando se agrega la regla nueva?

## Registro
En el módulo, sección "Qué pasa si…":
| # | Escenario | Comportamiento esperado | Dónde se garantiza (BD/función/front) | Certeza |

"Dónde se garantiza" importa: concurrencia y duplicados se resuelven en BD (UNIQUE, locks, funciones transaccionales), no en el front.
