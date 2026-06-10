## Objetivo

Que la pantalla **Pedidos pendientes** (`/demanda`) muestre TODOS los pedidos (incluyendo los `borrador`), con un botón claro para confirmar uno a uno, confirmar varios en masivo, y que al crear la entrega el pedido se confirme automáticamente. Así desaparece el caso "no me dejó procesar 1 de 9".

## Cambios

### 1. Mostrar pedidos en `borrador`
En `src/pages/DemandaPage.tsx`, el hook `usePedidosPendientes` cambia el filtro:
- Antes: `.in('status', ['confirmado', 'entregado'])`
- Después: `.in('status', ['borrador', 'confirmado', 'entregado'])`

Los pedidos `borrador` aparecerán con un badge visual amarillo "Borrador" en la columna de estado.

### 2. Botón "Confirmar" a nivel de línea
Nueva columna **Estado / Acción** en la tabla:
- Si el pedido está en `borrador`: botón pequeño **"Confirmar"** (verde, con ícono ✓) que cambia el status a `confirmado`.
- Si ya está en `confirmado` o `entregado`: badge "Confirmado".
- El botón no navega al detalle (stopPropagation) — un solo clic confirma.

### 3. Confirmación masiva
Cuando hay pedidos seleccionados, junto al botón "Crear N entregas" aparece un segundo botón:
- **"Confirmar N pedidos"** — solo visible si alguno de los seleccionados está en `borrador`.
- Hace `UPDATE` en lote a `status = 'confirmado'` para los `borrador` seleccionados.

### 4. Auto-confirmar al crear entrega
Dentro de la mutación `crearEntregasMut`, antes de insertar la entrega de cada pedido:
- Si el pedido está en `borrador`, hacer `UPDATE ventas SET status = 'confirmado' WHERE id = pedido.id`.
- Así cualquier pedido al que se le cree entrega queda confirmado automáticamente, sin pasos extra.

### 5. Invalidación de cachés
Después de confirmar (individual, masivo, o vía creación de entrega) invalidar:
- `['demanda']`
- `['ventas']` (para que la lista de ventas refleje el cambio)

## Detalle técnico

Archivo único modificado: `src/pages/DemandaPage.tsx`.

- Nuevo `useMutation` `confirmarPedidoMut` que recibe `ids: string[]` y hace `update({ status: 'confirmado' }).in('id', ids).eq('status', 'borrador')`.
- El botón de fila llama `confirmarPedidoMut.mutate([pedido.id])`.
- El botón masivo llama `confirmarPedidoMut.mutate(selectedPedidos.filter(p => p.status==='borrador').map(p=>p.id))`.
- En `crearEntregasMut`, dentro del `for`, si `pedido.status === 'borrador'` ejecutar el update antes del insert de la entrega.

No se tocan triggers ni RLS — `ventas` ya permite update por la empresa. No se tocan otras pantallas: el flujo de Ventas/Confirmar sigue igual; esto es solo un atajo desde Demanda.

## Lo que NO cambia

- El pedido sigue saliendo de la lista solo cuando esté 100% entregado (`cantidad_entregada >= cantidad_pedida`), igual que hoy. Mientras tenga pendiente, sigue visible — para que puedas seguir creando entregas si hace falta.
- El estado de la entrega creada sigue siendo `borrador` (lo cambia el vendedor en la app móvil al marcar "hecho").
