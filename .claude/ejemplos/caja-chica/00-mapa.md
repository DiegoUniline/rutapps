# Mapa del sistema
| Módulo | Tablas | Depende de | % conocimiento | Estado |
|---|---|---|---|---|
| caja-chica | usuarios_roles, configuracion, categorias_gasto, gastos | — | 95% | APROBADO · en construcción |

## Tablas
| Tabla | Para qué | Certeza |
|---|---|---|
| usuarios_roles | Quién es dueño y quién cajero | ✅ D-005 |
| configuracion | Fondo y nivel de alerta (una sola fila) | ✅ D-006 |
| categorias_gasto | Gas, Hielo, Mandados… configurable | ✅ D-016 |
| gastos | Cada salida de dinero | ✅ D-007 |

## Funciones y procesos en BD
| Nombre | Qué hace | Tablas |
|---|---|---|
| saldo_disponible() | fondo − suma de gastos registrados | configuracion, gastos |
| cancelar_gasto(id, motivo) | cancela con motivo (solo dueño), transaccional | gastos |
| trg_gastos_fecha | valida hasta 3 días atrás | gastos |
| trg_gastos_saldo | bloquea si deja saldo negativo | gastos |
