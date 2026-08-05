# Lotes en Mermas

Hoy la merma descuenta stock solo a nivel almacén: `registrar_merma` mueve la cantidad del almacén origen al almacén de mermas, pero nunca toca `stock_lotes`, y `merma_lineas` no tiene columna de lote. Por eso, en empresas con lotes, el stock por lote se queda inflado.

La idea es replicar lo que ya funciona en traspasos: elegir de qué lote(s) sale cada línea y que el descuento afecte lote + almacén.

## Qué se va a construir

1. **Selección de lotes al registrar una merma**
   - En el modal "Registrar merma", cada línea de un producto que maneja lote muestra un botón "Lotes" con el resumen (lote / caducidad / cantidad asignada).
   - El diálogo lista los lotes con existencia en el almacén origen elegido, ordenados FEFO (caduca primero arriba), y permite repartir la cantidad entre uno o varios lotes.
   - Sugerencia automática FEFO: al abrir, se propone el lote que caduca primero con existencia suficiente; el usuario puede cambiarlo.
   - No se puede guardar la merma si un producto con lotes tiene cantidad sin asignar.
   - Si el almacén origen cambia, las asignaciones se limpian.
   - Todo esto solo aparece si la empresa tiene activado "Lotes y caducidades" y el producto maneja lote; el resto de empresas ve la pantalla exactamente igual que hoy.

2. **Descuento real por lote**
   - Al registrar, además de mover la cantidad entre almacenes, se descuenta del lote en el almacén origen y se suma ese mismo lote en el almacén de mermas.
   - Queda registro por lote en el kardex, así se puede ver "qué lote se mermó".

3. **Cancelación de merma**
   - Al cancelar, el stock regresa al almacén origen en los mismos lotes de los que salió (reverso exacto), no solo al total del almacén.

4. **Detalle de la merma**
   - La vista de detalle muestra la columna de lotes de cada línea (la pantalla ya tiene el componente listo, hoy sale vacío porque no se guarda nada).

## Detalles técnicos

- Nueva tabla `public.merma_linea_lotes` (`empresa_id`, `merma_id`, `merma_linea_id`, `producto_id`, `lote_id`, `cantidad`), con RLS por empresa, GRANTs para `authenticated`/`service_role` e índices en `merma_linea_id` y `lote_id`, siguiendo el mismo molde de `traspaso_linea_lotes`.
- `registrar_merma`: aceptar `lotes: [{lote_id, cantidad}]` dentro de cada elemento de `_lineas`. Por cada asignación:
  - validar que el lote pertenece a la empresa y tiene existencia suficiente en el almacén origen (con `FOR UPDATE` sobre `stock_lotes`),
  - insertar en `merma_linea_lotes`,
  - `_aplica_stock_lote(empresa, almacen_origen, producto, lote, -cantidad)` y `_aplica_stock_lote(empresa, almacen_mermas, producto, lote, +cantidad)`,
  - insertar movimientos `salida`/`entrada` con `lote_id` y `referencia_tipo = 'merma_lote'` (ese tipo ya lo consulta `useLotesPorReferencia` en la página).
  - Si el producto maneja lote y no se mandan asignaciones, la función aplica FEFO automático en vez de fallar, para no romper llamadas existentes (devoluciones que generan merma).
- `cancelar_merma`: recorrer `merma_linea_lotes` y hacer el reverso por lote (origen +, almacén mermas −) con movimientos `merma_cancelacion`.
- Frontend:
  - `src/hooks/useMermas.ts`: `MermaLinea` gana `lotes?: { lote_id: string; cantidad: number }[]`.
  - Nuevo `src/components/lotes/MermaLineaLotesDialog.tsx`: mismo diseño que `TraspasoLineaLotesDialog` pero con estado en memoria (la merma aún no existe al capturarla), alimentado por `getLotesDisponibles`/`pickFefo` de `src/lib/lotesFefo.ts`.
  - `src/pages/MermasPage.tsx`: columna "Lotes" en la tabla del modal, validación de cantidad asignada antes de enviar, y envío de `lotes` en cada línea. Se mantiene el resto del markup igual.
- Sin cambios de comportamiento para empresas sin manejo de lotes.
