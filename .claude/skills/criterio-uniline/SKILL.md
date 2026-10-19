---
name: criterio-uniline
description: El criterio de diseño de Diego (Uniline) — base fija que toda app trae y reglas de decisión "depende de" (enum vs tabla, permisos, bajas, folios, estados, multiempresa). Úsala SIEMPRE al proponer tablas, campos, catálogos, estados o permisos, para decidir como lo haría él y solo preguntar lo que de verdad depende del negocio.
---

# Criterio Uniline — decidir como Diego

Diego no pregunta lo que ya sabe: aplica su criterio y avisa. Solo pregunta lo que depende del negocio del cliente. Tú igual.

## Cómo se usa
1. Antes de decidir, revisa las **condiciones** ya respondidas en /docs/00-vision.md (sección "Condiciones"). Si falta una condición que cambia la decisión, pregúntala primero.
2. Aplica la regla que corresponda y **avisa en una línea**: `🧭 Criterio: <qué decidí> — porque <condición/regla>`. El dueño puede corregir; si corrige, regístralo como D-XXX y, si es una regla nueva o distinta, propón actualizar este manual.
3. Si ninguna regla aplica o dos chocan, pregunta (una pregunta, con tu recomendación).
4. Todo lo aplicado por criterio queda en /docs como ✅ CRITERIO (cuenta como confirmado, porque es una regla aprobada por el dueño), con la regla de origen (ej. `CR-04`).

## Condiciones que deciden todo (se preguntan en la Vuelta 0)
| Código | Pregunta | Afecta a |
|---|---|---|
| C1 | ¿La va a rentar a muchas empresas o es para un solo negocio? | multiempresa, catálogos, permisos, seed |
| C2 | ¿Cuántas personas la usarán (aprox.) y con cuántos roles distintos? | permisos fijos vs configurables |
| C3 | ¿Tiene sucursales / almacenes / sedes? ¿Un usuario trabaja en varias? | sucursal_id, filtros, folios |
| C4 | ¿Maneja dinero? ¿Factura CFDI? | numeric, impuestos, congelar precios, cfdi-mexico |
| C5 | ¿Desde dónde se usa (celular, computadora, sin internet)? | pantallas, offline |
| C6 | Tecnología (Supabase + web, AppSheet/Apps Script) | todo lo técnico |

## Base fija (toda app nace con esto; solo se pregunta "¿quitas algo?")
| Tabla | Cuándo | Para qué |
|---|---|---|
| empresas | si C1 = rentar | cada negocio cliente; logo, colores, datos fiscales, configuración |
| sucursales | si C3 = sí | sedes; filtro de datos y folios |
| usuarios (perfil) | siempre | nombre, foto, teléfono, activo; ligado a auth |
| roles | siempre | dueño, admin, operativos del giro |
| usuarios_empresa / usuarios_roles | siempre | qué usuario, en qué empresa/sucursal, con qué rol |
| permisos (por vista y por acción) | si C2 > ~5 usuarios o varios roles, o C1 = rentar | qué rol ve qué pantalla y puede qué acción (ver, crear, editar, cancelar, autorizar) |
| configuracion | siempre | parámetros del negocio (vigencias, límites, textos) |
| folios | si hay documentos con número | consecutivo por empresa/sucursal/serie |
| bitacora (auditoría) | siempre | quién hizo qué y cuándo en acciones importantes |
| archivos | si hay fotos/documentos | referencia a Storage, nunca base64 en BD |
| notificaciones | si hay avisos | avisos en app y su estado de lectura |

## Reglas de decisión
| ID | Situación | Decisión | Depende de |
|---|---|---|---|
| CR-01 | Valores universales que nadie cambia (sexo, sí/no, tipo de persona física/moral) | **Enum / CHECK** | — |
| CR-02 | Estados que el sistema usa para su lógica (abierta/cerrada, activa/cancelada) y el cliente no necesita renombrar | **Enum / CHECK** | — |
| CR-03 | Lista del negocio que el cliente querrá a su manera (estados de cotización, tipos de cliente, categorías, motivos) — app para **rentar** | **Tabla por empresa** con valores iniciales (seed), `nombre`, `color` (para chips), `orden`, `activo`, `es_sistema` | C1 |
| CR-04 | Misma lista pero app **para un solo negocio** con pocos usuarios y sin intención de cambiarla | **Enum**, salvo que el dueño diga que la quiere editar | C1, C2 |
| CR-05 | Estados configurables que además mueven lógica (ej. "Ganada" debe cerrar la cotización) | **Tabla con color + columna `tipo` fija** (enum: abierto, en_proceso, ganado, perdido, cancelado). El cliente pone nombre y color; el sistema decide por `tipo` | C1 |
| CR-06 | Opción con atributos propios (precio, capacidad, días, color, ícono) | **Tabla**, nunca texto | — |
| CR-07 | Permisos con 1–2 roles fijos y pocos usuarios | **Reglas fijas por rol** en BD (RLS/función) | C2 |
| CR-08 | Permisos con varios roles, muchos usuarios o app para rentar | **Permisos configurables** por rol (vista + acción) con valores iniciales | C1, C2 |
| CR-09 | Dar de baja algo con historial (clientes, productos, usuarios) | **Baja lógica** (`activo = false`); DELETE solo si no tiene movimientos y por función | — |
| CR-10 | Documentos (cotización, venta, pedido, pago) | **No se editan cerrados**: se cancelan con motivo o se hace versión nueva; copian precio, impuesto y nombre al momento | C4 |
| CR-11 | Números de documento | **Folio consecutivo** por empresa (y sucursal/serie si C3), con tabla de folios, nunca max()+1 | C1, C3 |
| CR-12 | Dinero | `numeric(14,2)`, impuestos explícitos, totales calculados en BD | C4 |
| CR-13 | Datos repetibles de contacto (teléfonos, correos, direcciones, contactos de un cliente) | **Tabla hija** si puede haber más de uno; campo simple si siempre es uno | — |
| CR-14 | Unicidad (RFC, teléfono, código) | Única **por empresa**; RFC genérico nunca único | C1 |
| CR-15 | Fechas | `timestamptz` para eventos, `date` para días; reglas con "hoy" en trigger, no en CHECK | — |
| CR-16 | Cualquier tabla de negocio | `id uuid`, `created_at/by`, `updated_at/by`; `empresa_id` si C1 = rentar; `sucursal_id` si aplica | C1, C3 |
| CR-17 | Algo que se puede editar después de enviado/aceptado | Preguntar: ¿se edita, versión nueva o se cancela? ¿quién? ¿regla fija o permiso (CR-07/08)? | contexto |

> Este manual es de Diego. Las reglas marcadas aquí son su criterio aprobado. Si en una sesión el dueño corrige una regla de forma general ("siempre que…"), propón el cambio a este archivo en el repo de agentes; no lo cambies solo.
