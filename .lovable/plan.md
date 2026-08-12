# Cambios de esquema: histórico vs. de aquí en adelante

## Situación actual

Los esquemas no guardan resultados: la comisión se calcula al vuelo cada vez que eliges un rango de fechas en **Por volumen** / **Avance**. Consecuencias hoy:

- Si alguien edita un esquema (cambia el %, escalones o el tipo), **todo el histórico no pagado se recalcula solo**, sin aviso.
- Lo ya pagado sí queda congelado: esas ventas quedan marcadas con su recibo y se excluyen del cálculo. Eso no se toca.

## Propuesta

Que cada esquema tenga una **fecha de vigencia** y que al guardar cambios el sistema pregunte qué hacer.

### 1. Vigencia en el esquema

- Nuevo campo `vigente_desde` (fecha) en el esquema.
- El cálculo solo considera ventas con fecha **mayor o igual** a esa vigencia. Ventas anteriores a la vigencia no generan comisión con las condiciones nuevas.

### 2. Diálogo al guardar un esquema existente

Al pulsar Guardar sobre un esquema que ya existe, aparece una ventana con dos opciones:

- **Solo de aquí en adelante** (recomendada, opción por defecto): se crea una nueva versión del esquema con vigencia desde hoy y se reasigna a los vendedores que lo tenían. El esquema anterior se conserva inactivo, así lo ya calculado del periodo pasado queda con las condiciones viejas.
- **Actualizar también el histórico**: se edita el esquema en sitio, con lo que todos los periodos no pagados se recalculan con las condiciones nuevas. Se pide confirmación extra indicando que los montos pendientes de pago cambiarán.

En ambos casos, los recibos ya generados no se tocan nunca.

### 3. Aviso visible

- En la tabla de esquemas se muestra la columna **Vigente desde**.
- En **Por volumen** y **Avance**, si el rango de fechas elegido incluye días anteriores a la vigencia del esquema, se muestra una nota: "El esquema aplica desde DD/MM/AAAA; las ventas previas no se consideran".

## Detalles técnicos

- Migración: `ALTER TABLE comision_esquemas ADD COLUMN vigente_desde date`; `calcular_comision_volumen` filtra `v.fecha >= COALESCE(vigente_desde, p_desde)` y devuelve el dato en el JSON.
- Al elegir "solo de aquí en adelante": insert de un esquema nuevo (mismo nombre + sufijo de fecha), `update profiles set comision_esquema_id` para los vendedores que lo tenían, y `activo = false` en el anterior.
- UI: nuevo diálogo `EsquemaVigenciaDialog` dentro de `src/components/comisiones/`, más columna y nota en `ComisionesEsquemasTab.tsx`, `ComisionesVolumenTab.tsx` y `ComisionesAvanceTab.tsx`.
- No se modifica el flujo de pagos ni de recibos.
