# Auditoría · Presentaciones y granel (kilos) en todos los flujos de inventario

Fecha: 2026-11-20 · Rol: desarrollador (auditoría + corrección) · Pedido del dueño: «audita la parte de presentaciones: que en app móvil, punto de venta, venta normal, pedido y entregas todo vaya bien y descuente conforme aplica según sea, y que los kilos igual descuenten bien».

## 1. Regla verificada (cómo funciona hoy)

- **El inventario siempre se mueve en unidad base.** `venta_lineas.cantidad` guarda piezas/kilos base; `presentacion_factor`, `presentacion_nombre` y `paquetes` son solo el detalle de cómo se capturó (ej. 2 cajas de 12 → `cantidad = 24`, `paquetes = 2`). ✅ evidencia: `src/lib/ventaPresentacion.ts` (`buildPresentationPatch`: `cantidad = paquetes × factor`), `useVentaForm.ts:809-813` (editar paquetes → cantidad), `useRutaVenta.ts` `addGranelLine` (`cantidadBase`), `PuntoVentaPage.tsx` `addGranelLine`, `PresentacionSelectorModal.tsx:68-79`.
- **La BD nunca lee `presentacion_factor` ni `paquetes` para el inventario**: ninguna función ni trigger los usa (solo la tabla base `20261119000001_base_public.sql`); todo descuenta con `cantidad` / `cantidad_entregada` / `devolucion_lineas.cantidad`. ✅
- **Las cantidades no se truncan en la BD**: `venta_lineas.cantidad`, `entrega_lineas.cantidad_*`, `stock_almacen.cantidad`, `movimientos_inventario.cantidad`, `devolucion_lineas.cantidad`, `carga_lineas.*` son `numeric` sin escala; `stock_lotes.cantidad` es `numeric(16,3)` y `paquetes`/`presentacion_factor` `numeric(12,3)`. Las funciones de inventario solo redondean a 6 decimales (`fn_sync_venta_inventario`, `ajustar_entrega`); los únicos `floor` son de promociones (regla de negocio). ✅
- **Compras**: se recibe `cantidad × factor_conversion` en piezas (`recibir_compra_linea_parcial`). ✅

## 2. Casos probados en la BD de pruebas (`amybkerwkybffllaxpnz`, empresa demo)

Bloques `DO … RAISE EXCEPTION 'RESULTADO …'` (todo se revierte). Stock = `stock_almacen`; kardex = neto de `movimientos_inventario` de la referencia.

| # | Flujo | Caso | Esperado | Obtenido | Resultado | Arreglo |
|---|---|---|---|---|---|---|
| C1 | Venta directa escritorio / POS | 2 cajas × 12 (entrega inmediata) | bodega −24, kardex 24 | 100→76, kardex 24 | ✅ | — |
| C3 | Venta directa | 1.75 kg a granel | −1.75 sin redondeo | 10→8.25, kardex 1.75 | ✅ | — |
| C3b | Edición de venta | 1.75 → 0.333 kg | neto −0.333 | 10→9.667, kardex 0.333 | ✅ | — |
| C4 | Devolución | 1 caja (12) sobre la venta C1 | +12 | 76→88, kardex 12 | ✅ | — |
| C5 | Cancelar venta | venta de 24 con 12 ya devueltas | regresa solo lo no devuelto (+12); kardex neto de la venta 12 (las otras 12 entraron por la devolución) | 88→100 (total devuelto 24), kardex neto venta 12 | ✅ | — |
| C6 | App móvil ruta (insert como la cola offline) | 2 cajas × 12 desde el camión | camión −24 | 50→26, kardex 24 | ✅ | — |
| C2 | Pedido → surtir → asignar → validar (hecho) | 3 paquetes × 6 + 2.5 kg | bodega −18 / −2.5; camión +18/+2.5 al cargar y 0 al validar; pedido «entregado» | bodega 82 y 7.5, camión 0 y 0, kardex `entrega_hecho` 18, pedido `entregado` | ✅ | — |
| C2b | Pedido con el **mismo producto en dos renglones** (2 cajas × 12 + 6 pz) y granel parcial 2.5→2.25 kg | camión 0, kardex 30; camión kg 0.25 | **camión 6, kardex 24** (el 2.º renglón no se descontaba); kg ✅ 0.25 | ❌ → ✅ | Migración `20261120200000_entrega_hecho_producto_repetido.sql` |
| C2b’ | Mismo caso con la corrección | camión 0, kardex 30; re‑disparo sin movimientos nuevos; reabrir regresa 30 y 2.5 | camión 0, kardex 30, movimientos 9→9, reabrir 30 / 2.50 | ✅ | — |
| C7 | Compra con unidad de compra | 2 cajas × 12 + 3.5 kg, recibir todo | +24 y +3.5 | 100→124, 10→13.5, kardex 24 / 3.5, compra `recibida` | ✅ | — |
| C8 | Cancelar compra recibida | | regresa 24 y 3.5 | 100 y 10 (`piezas_revertidas` 27.5) | ✅ | — |

## 3. Revisión de pantallas (lógica de cantidades)

| Flujo | Hallazgo | Resultado | Arreglo |
|---|---|---|---|
| Venta escritorio (`useVentaForm.ts`, `VentaLineaDesktop/Mobile`) | Paquetes ↔ cantidad base correcto; granel `step=0.001`; al editar piezas de un renglón con caja se recalculan paquetes; a granel se conserva el peso real. | ✅ | — |
| POS (`PuntoVentaPage.tsx`) | Al cambiar la cantidad con +/− o tecleando en un renglón con presentación, `paquetes` quedaba viejo (ej. «2 × Caja = 23 pz»). El stock era correcto (usa `cantidad`), pero el renglón guardado no cuadraba. | ❌ → ✅ | `updateQty` recalcula `paquetes` por pieza (`paquetesParaCantidad`). |
| App móvil venta (`useRutaVenta.ts`, `StepProductos.tsx`) | Mismo problema de `paquetes` viejo con +/− y teclado; la etiqueta decía «kg» en productos por pieza. | ❌ → ✅ | `updateQty`/`setItemQty` recalculan `paquetes`; etiqueta usa la unidad del renglón. |
| App móvil entrega «Quitar producto» (`RutaEntregaDetalle.tsx`) | `Math.floor` en la cantidad: si el cliente recibía 7.25 de 7.5 kg se guardaba 7 → se descontaban 0.25 kg de menos del camión al validar. | ❌ → ✅ | Acepta 3 decimales a granel (`leerCantidad`), `es_granel` en la consulta (`offlineEntrega.ts`). |
| App móvil descarga (conteo físico, `RutaDescarga.tsx`) | `parseInt`: 0.25 kg contados se registraban 0 (diferencia falsa). | ❌ → ✅ | Decimales a granel; diferencia redondeada a 3 decimales. |
| App móvil devoluciones en venta (`StepDevoluciones.tsx`) y devolución de carga (`RutaDevolucion.tsx`) | `parseInt` (y mínimo 1 en carga): no se podía devolver 1.5 kg ni menos de 1 kg. | ❌ → ✅ | Decimales a granel; mínimo 0.001 kg en carga. |
| Entregas escritorio (`useEntregas.ts`, `VentaForm/index.tsx`, `EntregaListPage.tsx`, `surtir_pedido_disponible`) | `cantidad_pedida` = `venta_lineas.cantidad` (unidad base). | ✅ | — |
| Sincronización offline (`offlineSync.ts`, `queueInsertMany`) | Sube el renglón tal cual (con `cantidad` base y `paquetes`). | ✅ | — |

## 4. Pruebas automáticas

- `src/test/cantidadPresentacionGranel.test.ts` (nuevo): 2 cajas × 12 = 24, 3 × 6 = 18, 1.75 kg sin redondeo, lectura de kilos con decimales/coma, piezas en enteros, recálculo de paquetes por pieza y conservación a granel.
- `npm run typecheck:strict`, `npm test` (67 archivos / 407 pruebas) y `npm run build` en verde.
- D-043: `pasoCantidad` (paso de una caja, factor guardado como texto, pieza/granel = 1) en el mismo archivo de pruebas; `typecheck:strict`, `tsc -p tsconfig.app.json` (0 errores), `npm test` y `build` en verde.

## 5. Decisiones del dueño

1. ~~**Botón «−» en un renglón con caja**~~ → **Resuelto con D-043** (el dueño eligió B): en el Punto de venta y en la app de ruta «−/+» restan o suman una caja completa (factor de piezas) y recalculan paquetes; por pieza o a granel siguen con paso 1. «−» quita el renglón si ya no queda una caja completa.
2. ~~**Teclear menos de 1 kg en devoluciones**~~ → **Resuelto con D-043**: en devoluciones de la venta en ruta (`StepDevoluciones.tsx`) y en la devolución de carga (`RutaDevolucion.tsx`) los productos a granel se capturan con el teclado numérico con decimales de la venta móvil (`NumericKeypadModal`, tope = lo que hay en mano).
3. **Entregas ya validadas con producto repetido** (si existieran en producción): la corrección no las recalcula sola. Si alguien vuelve a tocar su estado estando en «hecho», el trigger completará lo que faltó descontar. En la BD de pruebas no hay ninguna; en producción falta revisarlo (lectura que requiere autorización).
