# Sistema de diseño — Caja Chica
**Decisiones:** D-020 (estilo moderno, colores del restaurante)

## Colores (tokens)
| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| --color-primario | botones principales, enlaces | #5B6B2F | #8FA05A |
| --color-primario-suave | chips, selección | #E8ECD9 | #2E3518 |
| --color-fondo | pantalla | #FAF6EC | #141612 |
| --color-superficie | tarjetas | #FFFFFF | #1F2421 |
| --color-texto | texto principal | #1F2421 | #F2EFE6 |
| --color-texto-suave | ayudas, fechas | #6B6F66 | #A5A99F |
| --color-borde | bordes | #E2DDCF | #33372F |
| --color-exito | guardado, registrado | #2E7D32 | #66BB6A |
| --color-aviso | saldo bajo | #B7791F | #E0A84A |
| --color-error | errores, cancelado | #C62828 | #EF5350 |
| --color-info | mensajes | #1565C0 | #64B5F6 |
Contraste texto/fondo verificado ≥ 4.5:1.

## Tipografía y medidas
- Letra: Plus Jakarta Sans. Tamaños 12 / 14 / 16 (base) / 20 / 24 / 32. Pesos 400, 600.
- Espaciado múltiplos de 4 px. Bordes redondeados 8 px (tarjetas 12 px).
- Iconos: Lucide.
- Formato: fecha 20/11/2026 · dinero $1,234.50 · zona horaria America/Mexico_City.

## Componentes
### Formularios
Etiqueta arriba · obligatorio con * · ayuda gris debajo · error rojo debajo del campo con mensaje humano · validación al salir del campo y al guardar · "Guardar" (primario) a la derecha, "Cancelar" (texto) a la izquierda · botón bloqueado y "Guardando…" mientras envía · confirmar si sale con cambios sin guardar.

### Listados
En celular, tarjetas: ícono de categoría · concepto · quién · monto a la derecha · 📎 si tiene foto · cancelados tachados en rojo. Filtros arriba como chips. Botón flotante "+ Registrar gasto".

### Botones
Uno primario por pantalla · secundario contorno · destructivo rojo con confirmación ("Cancelar gasto de $80.00 — Hielo. Esta acción no se puede deshacer. Motivo: ___").

### Mensajes y estados
Éxito: toast 3 s ("Gasto guardado") · Error: mensaje claro + qué hacer · Cargando: skeleton en lista · Vacío: ícono + "Aún no hay gastos hoy" + botón.

## Etiquetas de estado
| Estado | Color |
|---|---|
| Registrado | sin etiqueta |
| Cancelado | rojo, tachado |
| Saldo bajo (banner) | ámbar |
