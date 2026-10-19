---
name: estado
description: Estado del proyecto — % de conocimiento por módulo, fase, preguntas abiertas y riesgos
---
# CONVENCIONES COMPARTIDAS (arquitecto + auditor)

## Niveles de certeza
Todo campo, regla, proceso y permiso lleva uno:
- ✅ CONFIRMADO — el dueño lo dijo, o (en auditoría) se vio en BD y en código.
- ✅ CRITERIO — decidido por una regla del manual `criterio-uniline` (CR-XX); cuenta como confirmado.
- 💡 PROPUESTO — decisión técnica tuya por buena práctica; requiere aprobación.
- 🟡 INFERIDO — deducido por nombre o uso parcial, sin confirmación.
- ❓ PENDIENTE / DESCONOCIDO — falta respuesta o evidencia.
- ⚠️ INCONSISTENTE — dueño, BD, front o backend se contradicen.

Conocimiento del módulo = ✅ / total × 100.

## Convenciones de base de datos (Postgres / Supabase)
- Tablas y columnas en snake_case, español, plural en tablas (`habitaciones`, `tipos_habitacion`).
- `id uuid primary key default gen_random_uuid()`.
- Multiempresa: toda tabla de negocio lleva `empresa_id uuid not null references empresas(id)`; si hay sucursales, `sucursal_id`.
- Auditoría: `created_at timestamptz default now()`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid`.
- Baja lógica por defecto: `activo boolean default true` (deshabilitar) y/o `deleted_at timestamptz` (eliminar). DELETE físico solo en registros sin historial.
- Dinero: `numeric(14,2)`. Cantidades: `numeric(14,4)`. Nunca float/real.
- Fechas con hora: `timestamptz`. Solo fecha: `date`.
- Listas FIJAS (las define el sistema): `text` + `CHECK (campo in (...))`.
- Listas CONFIGURABLES (el cliente agrega): tabla catálogo con `empresa_id`, `nombre`, `activo`, `orden`, `es_sistema boolean` (los seed con `es_sistema=true` no se borran).
- Unicidad siempre por empresa: `unique (empresa_id, codigo)`.
- Estados con máquina de estados documentada: qué transiciones son válidas y quién las ejecuta.
- Documentos que congelan valores (ventas, reservas, pedidos): copian precio, impuesto y nombre al momento; nunca dependen del valor vivo del catálogo.
- RLS activado en todas las tablas; políticas por `empresa_id` del usuario.
- Operaciones de varios pasos (cobrar, cerrar, cancelar) en función SQL (RPC) transaccional, no en pasos sueltos desde el front.

## Plantilla de módulo — /docs/modulos/<modulo>.md

```
# Módulo: <nombre>
Conocimiento: XX% (✅ n / total n) | Última actualización: <fecha> | Fuente: diseño | auditoría

## 1. Propósito
Qué problema de negocio resuelve. [certeza]

## 2. Entidades y diccionario de datos
### Tabla `<tabla>`
| Campo | Tipo | Null | Default | Qué representa | Reglas / validación | Certeza | Evidencia / origen |
|---|---|---|---|---|---|---|---|

## 3. Catálogos
| Catálogo | FIJO / CONFIGURABLE | Valores iniciales (seed) | ¿El cliente puede borrar seed? | Certeza |

## 4. Relaciones
| Campo | Apunta a | Cardinalidad | ON DELETE | Qué pasa si se da de baja el padre | Certeza |

## 5. Estados
| Estado | Significado | Pasa a | Quién lo cambia | Condición | Certeza |

## 6. Procesos
Por cada proceso: disparador, quién puede, pasos, tablas afectadas, efectos en otros módulos,
qué pasa si falla a la mitad, certeza.
### 6.1 Alta
### 6.2 Edición (¿afecta históricos? ¿documentos abiertos?)
### 6.3 Baja (lógica o física, qué pasa con lo relacionado)
### 6.4 Reactivación
### 6.5 Procesos propios del módulo

## 7. Qué pasa si… (casos borde)
| # | Escenario | Comportamiento esperado | Certeza |

## 8. Permisos
| Acción | Roles | Validado en UI | Validado en BD (RLS/función) | Certeza |

## 8b. Consultas y escalabilidad
| Consulta / pantalla | Filtros y orden | Índice que la soporta | Volumen 1 año | Volumen 3 años | Estrategia |

## 9. Criterios de aceptación
Ejemplos concretos verificables: "Dado… cuando… entonces…".

## 10. Inconsistencias ⚠️
| # | Descripción | Dónde | Impacto | Severidad |

## 11. Preguntas abiertas
Referencias a P-XXX.
```

## Formato de preguntas — /docs/preguntas.md
```
### P-001 · <módulo> · ALTA|MEDIA|BAJA · ABIERTA|RESPONDIDA
**Contexto:** qué sabes y por qué importa.
**Pregunta:** concreta, de negocio, respondible en una línea.
**Opciones:** A) …  B) …  C) otra
**Recomendación:** X — por qué en una línea.
**Impacto en datos:** qué tablas/campos cambian según la respuesta.
**Respuesta:** (vacío hasta que conteste)
```

## Formato de decisiones — /docs/decisiones.md
```
### D-001 · <módulo> · <fecha>
**Decisión:** …
**Origen:** P-XXX | propuesta aprobada | auditoría
**Consecuencias:** qué implica en datos y procesos.
```

## Skills de terceros incluidas
Copias fijas y revisadas (cada carpeta trae LICENSE y ORIGEN.md con repo, versión y cambios). No se actualizan solas. Si una skill de terceros contradice la constitución, el método o /docs/sistema-diseno.md, mandan los de Uniline.
| Skill | De | Para qué | Quién la usa |
|---|---|---|---|
| supabase, supabase-postgres-best-practices | Supabase (oficial) | Docs actuales, checklist RLS, flujo de esquema | arquitecto, desarrollador, auditor |
| owasp-security | agamm | OWASP Top 10:2025, ASVS 5.0 | arquitecto, desarrollador, QA, auditor |
| systematic-debugging, test-driven-development, verification-before-completion | Superpowers (obra) | Causa antes que arreglo, prueba primero, evidencia antes de "listo" | desarrollador, QA |
| react-best-practices, composition-patterns | Vercel | Rendimiento y patrones React/Next.js | desarrollador, auditor |
| web-design-guidelines | Vercel | 100+ reglas de interfaz (copia local) | auditor |
| frontend-design, webapp-testing | Anthropic | Pantallas de calidad; probar la app como usuario | arquitecto, desarrollador, QA |
| impeccable | Paul Bakaus | Diseñar, pulir y auditar UI | arquitecto, auditor |
| ui-ux-pro-max | Next Level Builder | Catálogo de estilos, paletas y tipografías | arquitecto (2.3) |
| playwright-skill | TestDino | Pruebas de pantallas y CI | QA |
| web-quality-audit, accessibility, performance, core-web-vitals, web-best-practices | Addy Osmani | Auditoría tipo Lighthouse, WCAG 2.2 | QA, auditor |

## Ejemplo lleno de referencia
En proyectos con agentes instalados: `.claude/ejemplos/caja-chica/` tiene TODOS los archivos de /docs llenos para una app sencilla, y `.claude/ejemplos/caja-chica-recorrido.md` muestra el recorrido completo con preguntas y respuestas (Caja Chica es un sistema de una sola rebanada). Cuando dudes del formato de un archivo, cópialo de ahí (estructura, nivel de detalle, certezas y orígenes), nunca el contenido.

## Estructura de /docs
```
/docs/00-estado.md        DOCUMENTO VIVO: fase, módulo en curso, última pregunta, siguiente paso, pendientes
/docs/bitacora.md         una línea por evento, solo se agrega
/docs/investigacion-giro.md  investigación del giro con fuentes (🟡 hasta que el dueño confirme)
/docs/00-vision.md        visión, usuarios, alcance v1 / fuera de alcance
/docs/historias.md        historias "Como <rol> quiero… para…" por proceso (de "cuéntame cómo trabajas")
/docs/funciones.md        catálogo de funciones: ✅ / ⏭️ / ❌
/docs/rebanadas.md        mapa de rebanadas (R1 = mínimo que sirve de punta a punta), impacto por rebanada, estado y aprendizajes de cada demo
/docs/sistema-diseno.md   colores, tipografía, tokens y reglas de formularios, tablas, botones y mensajes
/docs/00-mapa.md          módulos, tablas, relaciones entre módulos, % conocimiento por módulo
/docs/modulos/*.md        un archivo por módulo (plantilla de arriba)
/docs/preguntas.md        todas las preguntas P-XXX
/docs/decisiones.md       todas las decisiones D-XXX
/docs/riesgos.md          riesgos por severidad (auditoría)
/docs/glosario.md         términos del negocio y su significado exacto
/docs/diagrama-er.md      diagrama entidad-relación (Mermaid)
/docs/ordenes/OT-XXX.md   órdenes de trabajo: el pedido del dueño convertido en prompt preciso
```

Si no tienes acceso a archivos (chat web), entrega cada archivo como bloque de código con su ruta como título para que el usuario lo guarde.

## Tarea
Lee /docs y responde SOLO:
| módulo | fuente (diseño/auditoría) | fase | % | ❓ abiertas | ⚠️ riesgos ALTA |
Luego: top 3 riesgos y la siguiente acción recomendada (un comando).
Si /docs no existe, di que corra /iniciar.
