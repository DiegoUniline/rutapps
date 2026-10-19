# Módulo: Caja chica
Conocimiento: 95% (✅ 42 / total 44) | Última actualización: 2026-11-20 | Fuente: diseño | Estado: APROBADO (D-024)

## 1. Propósito
Registrar cada salida de dinero de la caja chica con quién, en qué y comprobante, y saber en todo momento cuánto queda. ✅ P-005

## 2. Entidades y diccionario de datos

### Tabla `gastos`
| Campo | Tipo | Null | Default | Qué representa | Reglas / validación | Certeza | Origen |
|---|---|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | identificador | técnico | ✅ | convención |
| fecha | date | no | current_date | día del gasto | hoy o hasta 3 días atrás (trigger) | ✅ | P-014 |
| concepto | text | no | — | en qué se gastó | no vacío, máx 120 | ✅ | P-008 |
| categoria_id | uuid → categorias_gasto | no | — | tipo de gasto | solo categorías activas para nuevos | ✅ | P-008 |
| monto | numeric(12,2) | no | — | cuánto | > 0 y ≤ 1,000; no puede dejar saldo negativo | ✅ | P-013 |
| metodo | text | no | 'efectivo' | cómo se pagó | efectivo \| transferencia | ✅ | P-008 |
| recibio | text | sí | — | quién recibió el dinero | máx 80 | ✅ | P-008 (agregado por dueño) |
| comprobante_url | text | sí | — | foto del ticket/factura | obligatorio si monto ≥ 200 | ✅ | P-015 |
| estado | text | no | 'registrado' | situación | registrado \| cancelado | ✅ | D-011 |
| motivo_cancelacion | text | sí | — | por qué se canceló | obligatorio si cancelado | ✅ | D-011 |
| created_by | uuid → auth.users | no | auth.uid() | quién lo registró | automático, no editable | ✅ | P-005 |
| created_at | timestamptz | no | now() | cuándo se registró | técnico | ✅ | convención |
| updated_at / updated_by | timestamptz / uuid | sí | — | última edición | técnico | ✅ | convención |
| cancelado_por / cancelado_at | uuid / timestamptz | sí | — | quién y cuándo canceló | lo llena cancelar_gasto() | ✅ | D-011 |

### Tabla `categorias_gasto`
| Campo | Tipo | Null | Default | Qué representa | Reglas | Certeza | Origen |
|---|---|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | identificador | | ✅ | |
| nombre | text | no | — | nombre de la categoría | único, no vacío | ✅ | P-016 |
| icono | text | sí | — | ícono en la lista | 💡 propuesto | 💡 | |
| es_sistema | boolean | no | false | vino de inicio | no se puede borrar | ✅ | D-016 |
| activo | boolean | no | true | se puede usar | desactivar conserva historial | ✅ | D-017 |
| orden | int | no | 0 | orden en la lista | | ✅ | |

### Tabla `configuracion` (una sola fila)
| Campo | Tipo | Default | Qué representa | Reglas | Certeza | Origen |
|---|---|---|---|---|---|---|
| fondo | numeric(12,2) | 3000.00 | fondo de la caja | > 0; solo dueño cambia | ✅ | P-003 |
| alerta_saldo | numeric(12,2) | 500.00 | límite de saldo bajo | ≥ 0 y < fondo | ✅ | D-022 |
| alerta_enviada | boolean | false | ya se mandó WhatsApp | se reinicia cuando saldo ≥ alerta | ✅ | D-030 |

### Tabla `usuarios_roles`
| Campo | Tipo | Qué representa | Reglas | Certeza |
|---|---|---|---|---|
| usuario_id | uuid → auth.users | usuario | PK | ✅ |
| rol | text | dueno \| cajero | lista fija | ✅ P-002 |
| nombre | text | nombre visible | | ✅ |
| whatsapp | text | número para avisos | 10 dígitos | ✅ P-023 |
| activo | boolean | puede entrar | | ✅ |

## 3. Catálogos
| Catálogo | FIJO / CONFIGURABLE | Valores iniciales | ¿Se pueden borrar los iniciales? | Certeza |
|---|---|---|---|---|
| categorias_gasto | CONFIGURABLE (dueño) | Gas, Hielo, Mandados, Limpieza, Propinas reparto, Otros | No, solo desactivar | ✅ D-016/D-017 |
| metodo | FIJO | efectivo, transferencia | — | ✅ |
| estado | FIJO | registrado, cancelado | — | ✅ |
| rol | FIJO | dueno, cajero | — | ✅ |

## 4. Relaciones
| Campo | Apunta a | Cardinalidad | ON DELETE | Si se da de baja el padre | Certeza |
|---|---|---|---|---|---|
| gastos.categoria_id | categorias_gasto | N:1 | restrict | se desactiva, gastos la conservan | ✅ |
| gastos.created_by | auth.users | N:1 | restrict | usuario se desactiva, gastos conservan autor | ✅ |

## 5. Estados
| Estado | Significado | Pasa a | Quién | Condición | Certeza |
|---|---|---|---|---|---|
| registrado | gasto vigente, cuenta en el saldo | cancelado | dueño | motivo obligatorio | ✅ D-011 |
| cancelado | anulado, no cuenta en el saldo | — (final) | — | — | ✅ |

## 6. Procesos
### 6.1 Alta
Disparador: botón "+ Registrar gasto". Quién: dueño o cajero. Pasos: llenar formulario → validar (monto, fecha, foto ≥ $200, saldo) → guardar → recalcular saldo → si cruza $500 y no se ha avisado → banner + WhatsApp. Si falla a la mitad: no se guarda nada. ✅
### 6.2 Edición
Solo el mismo día (fecha de registro). Cajero: solo los suyos. Dueño: todos. No se puede editar un cancelado. Campos editables: concepto, categoría, monto, método, recibió, foto. Fecha no. ✅ D-010
### 6.3 Baja
No hay borrado. El dueño cancela con motivo (función `cancelar_gasto`). El monto regresa al saldo. ✅ D-011
### 6.4 Reactivación
No existe. Se registra un gasto nuevo. ✅
### 6.5 Cambio de fondo
Solo dueño. Recalcula saldo; los gastos no cambian. ✅ QPS-6

## 7. Qué pasa si…
| # | Escenario | Comportamiento esperado | Dónde se garantiza | Certeza |
|---|---|---|---|---|
| 1 | Gasto deja saldo negativo | Bloqueado: "Saldo insuficiente ($120 disponibles)" | BD (trigger) | ✅ |
| 2 | Doble clic en Guardar | Solo se crea uno | Front (botón) + BD (llave de operación) | ✅ |
| 3 | Se cae internet al guardar | Error claro; nada a medias; puede reintentar | BD (transacción) | ✅ |
| 4 | Cajero intenta cancelar | No ve el botón; la BD lo rechaza | Front + BD (función) | ✅ |
| 5 | Cancelar uno ya cancelado | Bloqueado | BD (función) | ✅ |
| 6 | Cambian el fondo | Saldo se recalcula; gastos intactos | BD (cálculo) | ✅ |
| 7 | Se desactiva una categoría | No sale para nuevos; los anteriores la conservan | BD + front | ✅ |
| 8 | Gasto ≥ $200 sin foto | Bloqueado: "Agrega el comprobante" | BD (CHECK) + front | ✅ |

## 8. Permisos
| Acción | Roles | Validado en UI | Validado en BD | Certeza |
|---|---|---|---|---|
| Ver gastos y saldo | dueño, cajero | sí | RLS select | ✅ P-009 |
| Registrar gasto | dueño, cajero | sí | RLS insert | ✅ |
| Editar gasto | dueño (todos), cajero (suyos) — solo mismo día | sí | RLS update + trigger | ✅ D-010 |
| Cancelar gasto | dueño | sí | función cancelar_gasto | ✅ D-011 |
| Cambiar fondo / alerta | dueño | sí | RLS update configuracion | ✅ |
| Administrar categorías | dueño | sí | RLS | ✅ |

## 8b. Consultas y escalabilidad
| Consulta / pantalla | Filtros y orden | Índice | Volumen 1 año | 3 años | Estrategia |
|---|---|---|---|---|---|
| Lista de gastos | fecha desc, categoría | (fecha desc), (categoria_id) | ~15,000 | ~45,000 | paginación de 50 |
| Saldo disponible | estado = registrado | parcial where estado='registrado' | — | — | función SQL |
| Total por categoría del mes | fecha en mes, group by | (fecha) | — | — | agregado en SQL |

## 9. Pantallas y flujos
**Pantalla única "Caja chica"** (celular): tarjeta de saldo (ámbar si < $500) y total de hoy · chips de filtro (Hoy / Mes / Categoría) · lista de tarjetas · botón flotante "+ Registrar gasto" · formulario en hoja inferior · detalle con foto, Editar (si aplica) y Cancelar (solo dueño).
Flujo: abrir → ver saldo → registrar → guardar → toast → lista actualizada.

## 10. Reportes, avisos e integraciones
| Tipo | Qué | Quién | Canal | Cuándo | Certeza |
|---|---|---|---|---|---|
| Reporte | Total por categoría del mes | dueño | en pantalla (filtro Mes) | siempre | ✅ P-019 |
| Aviso | Saldo bajo | todos ven banner; dueño recibe WhatsApp | app + WhatsApp | primera vez que cruza $500 | ✅ D-021/D-030 |
| Integración | WhatsApp | — | API | si falla, solo queda el banner | ✅ D-023 |
| 💡 | Texto del WhatsApp | | | | 💡 pendiente aceptado |

## 11. Criterios de aceptación
- Dado saldo $1,840, cuando el cajero registra $80 de Hielo, entonces el saldo muestra $1,760 y el gasto aparece con su nombre.
- Dado un gasto de $250 sin foto, cuando se intenta guardar, entonces se bloquea con "Agrega el comprobante (desde $200)".
- Dado saldo $520, cuando se registra un gasto de $40, entonces aparece el banner ámbar y llega UN WhatsApp al dueño.
- Dado un cajero, cuando abre un gasto, entonces no ve el botón Cancelar y la BD rechaza `cancelar_gasto`.
- Dado un gasto cancelado, entonces aparece tachado en rojo y no cuenta en el saldo.

## 12. Inconsistencias ⚠️
| # | Descripción | Dónde | Impacto | Severidad |
|---|---|---|---|---|
| — | Ninguna | | | |

## 13. Preguntas abiertas
Ninguna. (P-001 a P-023 respondidas)
