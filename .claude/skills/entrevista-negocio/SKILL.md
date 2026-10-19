---
name: entrevista-negocio
description: Método para entrevistar al dueño y entender cualquier giro de negocio (sin plantillas precargadas) antes de diseñar base de datos, reglas y flujos. Úsala al iniciar un sistema o módulo nuevo, o cuando falte entender cómo opera el negocio.
---

# Entrevista de negocio — cualquier giro

## Principio
No hay giros guardados. Tu conocimiento general del giro sirve para saber QUÉ preguntar, nunca para decidir la respuesta. Cada negocio opera distinto aunque sea del mismo giro.

## Forma
- UNA pregunta por mensaje. Esperas, anotas, decides la siguiente según la respuesta.
- Opciones A/B/C cuando aplique + tu recomendación en una línea.
- Lenguaje del negocio, no técnico: "¿un cliente puede tener varias direcciones?" y no "¿relación 1:N?".
- Pide ejemplos reales: "dame un caso de la semana pasada". Un ejemplo vale más que una definición.
- Si el dueño usa una palabra del negocio que no está en /docs/glosario.md, pregunta qué significa exactamente y regístrala.
- Cada 5–8 respuestas: mini resumen de 3–5 líneas y "¿así es?".

## "Cuéntame cómo trabajas" → historias (Vuelta 1)
Antes de tablas o campos, pide que te cuente cada proceso con sus palabras, uno a la vez ("¿Qué pasa desde que te llega un cliente hasta que te paga?").
De cada relato saca:
- Historias: `Como <rol> quiero <acción> para <beneficio>`, agrupadas por proceso, en /docs/historias.md.
- Lo que se guarda, documentos, estados y excepciones (anótalos, no preguntes el detalle todavía).
- Lo que tú sabes del giro y él no dijo ("¿también manejas anticipos?").
El detalle (campos, reglas) se pregunta después, solo de la rebanada en curso.

## Método de descubrimiento (para entender un giro que no conoces)
Recorre estos 8 lentes. Saltas los que no aplican; profundizas en los que sí.

1. **Día típico** — "Cuéntame cómo es un día normal desde que abren hasta que cierran." De aquí salen procesos, roles y momentos críticos.
2. **Documentos** — "¿Qué papeles, formatos, tickets, Excel o WhatsApps usan hoy?" Cada documento suele ser una tabla o un proceso. Pide foto o ejemplo si es posible.
3. **Dinero** — ¿Qué se cobra, cuándo, cómo, quién? ¿Anticipos, crédito, abonos, propinas, comisiones, devoluciones, facturas?
4. **Tiempo** — ¿Hay citas, reservas, turnos, horarios, vencimientos, recordatorios, SLA?
5. **Cosas** — ¿Hay inventario, activos, unidades, espacios (mesas, habitaciones, vehículos, camas)? ¿Se consumen, se rentan, se asignan?
6. **Personas** — ¿Quién participa (internos y externos) y qué puede hacer cada uno?
7. **Lugares** — ¿Sucursales, almacenes, rutas, zonas? ¿Los datos se comparten entre ellas?
8. **Excepciones** — "¿Qué es lo que más problemas les da hoy?" "¿Qué sale mal seguido?" Aquí están los casos borde que más importan.

## Diseño de datos: PROPONER → CONFIRMAR → DETALLAR
Cuando ya entiendes el negocio, no preguntes "¿qué campos quieres?". Propón tú, como experto:
1. Mapa de tablas (tabla | para qué) → "¿agrego, quito o cambio alguna?"
1b. Diagrama entidad-relación (Mermaid erDiagram) en /docs/diagrama-er.md y en el chat.
1c. Preguntas de relaciones y reglas como consultor, una por mensaje, con ejemplos del negocio real: ¿uno o varios? ¿a quién le llega, por separado o con copia? ¿se edita después de aceptado? ¿quién? ¿regla fija o permiso configurable? ¿versión nueva o sobrescribir?
2. Por tabla: campos (campo | qué guarda | tipo en lenguaje simple | obligatorio) → "¿agrego, quito o cambio alguno?"
3. Por campo con decisión real: una pregunta (¿se repite?, ¿se puede cambiar?, ¿lista fija o configurable?, ¿valor por defecto?).
4. Por tabla: procesos (alta, edición, baja, reactivación, permisos, qué pasa si), una pregunta a la vez.
5. Mini resumen de la tabla → siguiente tabla.

## Checklist por entidad (guía interna, nunca se muestra como lista)
**Identidad**: datos, obligatorios, qué lo hace único por empresa, folio/código (automático, manual, por sucursal).
**Catálogos**: cada lista de opciones → ¿FIJA o CONFIGURABLE? ¿seed inicial? ¿el cliente puede borrar el seed? ¿la opción tiene atributos propios? (si sí, es tabla).
**Estructura**: variantes, categorías/jerarquías, dependencia de sucursal.
**Ciclo de vida**: estados, transiciones, quién las hace, qué se puede editar en cada estado, baja lógica o física, reactivación.
**Dinero/cantidades**: impuestos incluidos o no, cambio de precio vs documentos abiertos/cerrados, descuentos y autorización, en qué momento exacto mueve inventario/saldo.
**Relaciones**: con qué se conecta, cardinalidad, qué pasa con los hijos si se da de baja el padre.
**Permisos**: por acción (ver, crear, editar, campos sensibles, baja, cancelar, autorizar).
**Historial**: quién cambió qué y cuándo; qué campos lo requieren.
**Qué pasa si**: mínimo 8 escenarios por módulo (skill `que-pasa-si`).

## Detecta y pregunta
- Palabras vagas: "normalmente", "a veces", "depende" → "¿de qué depende?" y "¿qué pasa cuando no?".
- Respuestas que contradicen algo ya decidido → repregunta antes de seguir.
- "Como lo hace X sistema" → pregunta qué específicamente les gusta o necesitan de eso.
- "Tú decide" → aplica tu recomendación como 💡 PROPUESTO y sigue.

## Registro
- Cada respuesta → /docs/preguntas.md (P-XXX, RESPONDIDA).
- Cada decisión → /docs/decisiones.md (D-XXX).
- Términos → /docs/glosario.md.
