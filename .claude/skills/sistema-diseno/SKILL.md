---
name: sistema-diseno
description: Define y aplica el sistema de diseño de un software (colores, tipografía, espaciado, formularios, tablas, botones, mensajes, estados) para que todas las pantallas sean homogéneas. Úsala una vez por sistema antes de diseñar pantallas, y siempre que se construya o revise una pantalla.
---

# Sistema de diseño — todo homologado

Se define UNA vez por sistema, antes del primer diseño de pantallas, y se guarda en /docs/sistema-diseno.md. Después es ley: ninguna pantalla inventa colores, tamaños ni comportamientos propios.

## Cómo se define (una pregunta por mensaje, con opciones para clic)
1. **Marca:** ¿hay logo y colores de marca? (pide el archivo o los códigos). Si no hay, propón 3 paletas.
2. **Estilo:** A) Sobrio/profesional B) Moderno/limpio C) Colorido/amigable — recomienda según el giro y el usuario final.
3. **Paleta propuesta** (muestra una vista previa visual si hay herramienta de visualización o artifact; si no, tabla con códigos):
   | token | uso | color |
   |---|---|---|
   | primario | botones principales, enlaces, selección | #… |
   | primario-suave | fondos de selección, chips | #… |
   | secundario | acentos | #… |
   | neutros (50–900) | fondos, bordes, textos | #… |
   | éxito | guardado, aceptado, pagado | verde |
   | aviso | por vencer, pendiente | ámbar |
   | error | errores, cancelado, eliminar | rojo |
   | info | mensajes informativos | azul |
   Verifica contraste accesible (texto normal ≥ 4.5:1). Incluye versión modo oscuro si se usará.
   Pregunta: "¿Cuáles cambias?" (sin marcar = se aprueban todos).
4. **Tipografía y tamaños:** una familia (ej. Plus Jakarta Sans, Manrope, IBM Plex Sans), escala (12/14/16/20/24/32), pesos.
5. **Componentes y reglas de comportamiento** — propón y pide marcar lo que cambia:

### Formularios
- Etiqueta arriba del campo; obligatorios con *; texto de ayuda gris debajo cuando haga falta.
- Validación al salir del campo y al guardar; error en rojo debajo del campo con mensaje humano ("El RFC debe tener 12 o 13 caracteres").
- Botón primario a la derecha ("Guardar"), secundario a la izquierda ("Cancelar"). Botón deshabilitado y con "Guardando…" mientras se envía (evita doble clic).
- Formularios largos en secciones con título; en celular, una columna.
- Al salir con cambios sin guardar: confirmar.

### Tablas / listados
- Búsqueda arriba a la izquierda, filtros junto a ella, botón "Nuevo" arriba a la derecha.
- Paginación o carga progresiva; cantidad de registros visible.
- Acciones por fila en menú (⋯); acción principal al dar clic en la fila.
- Estados con etiquetas de color del sistema (Borrador gris, Enviada azul, Aceptada verde, Vencida ámbar, Rechazada/Cancelada rojo).
- En celular: tarjetas en lugar de tabla.

### Botones
- Primario (relleno, color primario): una sola acción principal por pantalla.
- Secundario (contorno), terciario (texto).
- Destructivo (rojo): siempre con confirmación que diga qué se pierde.

### Mensajes y estados
- Éxito: aviso breve (toast) "Cotización guardada".
- Error: mensaje claro de qué pasó y qué hacer; nunca códigos técnicos al usuario.
- Cargando: esqueletos (skeleton) en listas, spinner solo en botones.
- Vacío: ilustración/ícono + texto + botón de acción ("Aún no tienes clientes · Agregar cliente").
- Confirmaciones destructivas: modal con título, consecuencia y botón rojo.

### Otros
- Iconos: una sola librería (ej. Lucide).
- Espaciado en múltiplos de 4 px; bordes redondeados consistentes (ej. 8 px).
- Fechas, moneda y números en formato local (es-MX: 15/10/2026, $1,234.50).
- Navegación: menú lateral en computadora, barra inferior o menú en celular.

## Salida: /docs/sistema-diseno.md
Tokens (colores, tipografía, espaciado, radios), reglas de cada componente y una página de muestra (HTML/artifact) si es posible. Registra D-XXX de cada decisión.

## Cómo se aplica (desarrollador)
- Los colores y tamaños se usan SOLO como tokens (variables CSS / tema de Tailwind / tema de la librería de componentes). Prohibido escribir colores sueltos (#hex) o tamaños inventados en pantallas.
- Cada pantalla nueva sigue las reglas de formularios, tablas, botones y mensajes. Si una pantalla necesita algo que el sistema no cubre: propón agregarlo al sistema de diseño (D-XXX), no lo improvises.
- En AppSheet: aplicar la paleta en el tema de la app, formatos condicionales con los colores de estado, y las mismas reglas de etiquetas y mensajes.

## Cómo se revisa (auditor / QA)
- Buscar colores y tamaños sueltos fuera de los tokens (`grep -rnE "#[0-9a-fA-F]{3,6}\b" src` excluyendo el archivo de tema).
- Revisar que cada formulario tenga etiquetas, obligatorios, validación con mensaje y botón deshabilitado al guardar.
- Revisar estados vacío/cargando/error en listados.
