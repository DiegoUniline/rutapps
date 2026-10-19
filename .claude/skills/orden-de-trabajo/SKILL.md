---
name: orden-de-trabajo
description: Convierte cualquier pedido del dueño en lenguaje normal ("quiero que…", "agrega…", "arregla…") en una orden de trabajo precisa (el prompt correcto) usando /docs, se la muestra para OK y luego la ejecuta. Úsala SIEMPRE en fase de desarrollo antes de programar cualquier cambio, función o corrección.
---

# Orden de trabajo — el dueño habla normal, tú redactas un contrato de resultado

**Antes de esta skill:** activa `autoprompter` para verificar el contexto, detectar dependencias y objetar omisiones. No confundas propuestas con requisitos aprobados. Esta orden complementa el protocolo universal.

El dueño no tiene que saber escribir prompts. Tú conviertes lo que dice en una instrucción técnica completa, se la enseñas en corto, y la ejecutas tal cual.

## Paso 0 — ¿Estamos en desarrollo?
Revisa /docs/00-estado.md y el módulo que toca el pedido.
- Si la rebanada que toca el pedido NO tiene `APROBADO R<n>` (sigue en diseño o es nueva): NO crees orden de trabajo y no "simules". Di en una línea "Esto lo agrego como historia en <rebanada>", regístralo en historias.md/rebanadas.md como requisito/decisión en el módulo (con las preguntas necesarias, una por mensaje) y regresa al paso de diseño donde iban.
- Solo si la rebanada está aprobada (y existe su plan de construcción) o es un cambio a algo ya construido, continúa. En un cambio a lo construido, revisa también su impacto en rebanadas futuras (rebanadas.md).

## Paso 1 — Entender con contexto
1. Lee /docs/00-estado.md, /docs/00-mapa.md, /docs/diagrama-er.md y los módulos que toca el pedido.
2. Identifica: qué módulo(s), qué tablas/campos, qué reglas y decisiones (D-XXX) aplican, qué pantallas y procesos se ven afectados.
3. Si el pedido es nuevo de negocio (una regla, campo o flujo que no está en /docs) → no es desarrollo todavía: es diseño. Haz las preguntas necesarias (una por mensaje, con clic si hay AskUserQuestion) y regístralas como D-XXX antes de armar la orden.
4. Si falta un dato para que la orden quede sin ambigüedad → UNA pregunta y espera.

## Paso 1b — Platicarlo como programador antes de empezar
Primero dile en corto qué piensas hacer, como lo haría un programador:
```
Ok, para esto haría:
1. …
2. …
3. …
Antes de empezar te hago unas preguntas para dejarlo como lo quieres.
```
Luego pregunta, UNA por mensaje (con clic si hay AskUserQuestion, tu recomendación primero), todos los detalles de implementación que cambian el resultado y que /docs no responde. Piensa como programador con experiencia; ejemplos del tipo de preguntas:
- Avisos: "¿Cómo quieres que llegue el aviso? A) Notificación en la app B) Correo C) WhatsApp D) Varias" · "¿A quién: al vendedor, al gerente, a ambos?" · "¿Cuándo: X días antes, el mismo día, a qué hora?"
- Configurable vs fijo: "¿Lo dejo fijo o que cada empresa lo configure?"
- Pantalla: "¿Dónde lo ves: en la lista, en el detalle, en el tablero, en todos?" · "¿Botón, menú o automático?"
- Datos: "¿Valor por defecto?" · "¿Aplica a lo que ya existe o solo a lo nuevo?"
- Errores: "Si falla el envío, ¿reintento, aviso, o nada?"
- Permisos: "¿Quién puede hacerlo o cambiarlo?"
- Textos: "¿Te propongo el texto del mensaje o tú lo escribes?"
No preguntes detalles técnicos que el dueño no tiene por qué decidir (librerías, nombres de funciones); esos los decides tú.
Cada respuesta va a /docs como D-XXX. Cuando ya no haya decisiones abiertas, pasa al Paso 2.

## Paso 2 — Redactar la orden (archivo /docs/ordenes/OT-XXX.md)
```
# OT-XXX · <título corto> · <fecha>
Pedido original del dueño: "<texto tal cual>"

## Objetivo
<qué debe lograrse, en 1–2 líneas, en términos de negocio>

## Contexto
- Módulo(s): …
- Tablas/campos: …
- Decisiones que aplican: D-XXX, D-YYY
- Estado actual relevante: <lo que existe hoy, con archivo:línea si ya hay código>

## Alcance
Incluye:
- …
No incluye (explícito):
- …

## Cambios
- BD: <sin cambios | migración: qué agrega/cambia — aditiva y reversible>
- Backend / funciones: …
- Pantallas: …
- Permisos: <qué rol puede qué; regla fija o permiso configurable>

## Reglas que NO se pueden romper
- Multiempresa, historial, dinero en numeric, RLS, transacciones, errores visibles (constitución)
- <reglas específicas del módulo>

## Criterios de aceptación
- Dado … cuando … entonces …
- Dado … cuando … entonces …
- Qué pasa si … → …

## Verificación
- <cómo se va a probar cada criterio>

## Riesgo
BAJO | MEDIO | ALTO — <por qué>
```

## Paso 3 — Mostrarla al dueño en corto
No le pegues el archivo completo. Muéstrale:
```
📋 OT-XXX · <título>
Entendí: <1 línea>
Hará: <3–5 viñetas>
No hará: <1–3 viñetas>
Listo cuando: <2–3 criterios clave>
Riesgo: <nivel>
```
Y pregunta (con clic si hay AskUserQuestion): **A) OK, ejecútala (Recomendado)  B) Cambiar algo  C) Ver la orden completa**.

## Paso 4 — Ejecutar exactamente la orden
- Con OK: ejecuta siguiendo la orden como tu prompt, sin agregar nada fuera del alcance.
- Si a mitad del trabajo descubres que la orden está mal o incompleta: detente, explica en 2 líneas, propone el ajuste y espera OK. Actualiza la OT (sección "Cambios a la orden").
- Al terminar: verifica cada criterio de aceptación con evidencia, marca la OT como `✅ TERMINADA` con el resumen y la evidencia, actualiza /docs del módulo, 00-estado.md y bitacora.md, y haz commit.

## Reglas
- Una OT por pedido. Si el dueño pide varias cosas en un mensaje, sepáralas en varias OT y pregunta por cuál empezar.
- Pedidos grandes: divide en OT pequeñas que se puedan verificar una por una.
- Cambios materiales o de riesgo medio/alto: conserva las aprobaciones requeridas. Riesgo BAJO, reversible y claramente autorizado: puede proceder sin entrevista adicional si la política del proyecto lo permite. Un OK general no autoriza operaciones sensibles ajenas al alcance.
- La OT es también el prompt que usarías para delegar a un subagente: debe poder entenderla alguien que no vio la conversación.
