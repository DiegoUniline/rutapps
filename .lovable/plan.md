# Plan: reducir consumo de datos en /ruta y garantizar promociones

Objetivo doble: bajar los megas que consume el móvil (hoy ~28 MB por vendedor en Distribuidora Tampico) y eliminar los casos en que una promoción "se aplica pero no rebaja".

**Alcance aprobado: SOLO Mi Empresa Demo (Licencia 12324489).** Todo queda detrás de dos banderas en `feature_flags` con `alcance = 'licencias'` y únicamente `12324489` en la lista. Ninguna otra empresa cambia de comportamiento hasta que tú lo autorices.

---

## Parte 1 — Promociones que sí rebajan

**1.1 Auto-agregar el producto de bonificación**
Cuando una promoción de tipo "producto gratis" se dispara y el artículo regalado no está en el carrito, la app lo agrega automáticamente como línea con precio 0 y marca de promoción. Así la línea existe en `venta_lineas`, el trigger de inventario la descuenta igual que cualquier otra y el reporte cuadra.

**1.2 Bloqueo al cobrar si hay promoción pendiente**
Si por cualquier motivo queda una promoción evaluada sin aplicar, el botón Cobrar muestra un aviso claro ("Hay una promoción sin aplicar") y no deja cerrar hasta resolverlo. Nada de ventas que salen mal y luego hay que reparar a mano.

**1.3 Frescura obligatoria del catálogo de promociones**
Si la copia local de promociones tiene más de X horas o viene vacía, /ruta bloquea la venta y pide sincronizar. Este es el origen real de casi todos los casos reportados (VTA-0600, VTA-2771, Botanas Don Nacho): caché móvil vieja.

**1.4 Respetar el precio manual**
Al cambiar de cliente o de lista, el recálculo deja intactas las líneas con precio editado a mano.

---

## Parte 2 — Consumo de datos

**2.1 Filtrado por vendedor (el ahorro grande)**
Hoy el móvil de cada vendedor descarga clientes, ventas, visitas y entregas de **toda la empresa**. Se acota a los del vendedor activo (más los clientes sin vendedor asignado, para no perder acceso). Ahorro estimado: 50–70 % en empresas con varios vendedores.

**2.2 Columnas explícitas en las tablas pesadas**
Ventas, líneas, cobros, visitas y entregas hoy bajan con todas las columnas. Se define la lista mínima que la app realmente usa. Ahorro estimado: 30–35 %.

**2.3 Candado global de sincronización**
Se detectaron sincronizaciones duplicadas corriendo en paralelo (~35 % de tráfico desperdiciado). Un solo candado global evita que se lance una segunda mientras hay una en curso.

**2.4 Ventana de histórico de 30 a 15 días**
Se mantiene la excepción actual: cualquier venta con saldo pendiente baja siempre, sin importar la antigüedad.

**2.5 Intervalos**
Refresco completo pasa de 5 a 15 minutos. Precios y promociones se quedan en su pista rápida, sin cambio.

---

## Cómo se garantiza que funciona

No se publica nada sin estas cuatro comprobaciones, en este orden:

1. **Medición antes/después** con la misma cuenta de Distribuidora Tampico: se registra MB y número de filas de una sincronización limpia, y se compara. Si no baja al menos 60 %, no se cierra el paso.
2. **Prueba de promociones en Licencia 12324489**: venta con promoción de producto gratis, venta con descuento porcentual y venta mixta. Se verifica que la línea exista, que el inventario se descuente y que el ticket, el PDF y el reporte muestren el mismo total.
3. **Prueba offline real**: modo avión, tres ventas, reconexión, y se confirma que las tres suben con sus promociones intactas.
4. **Regresión de datos**: se confirma que ningún vendedor perdió acceso a clientes que sí le tocan (comparación de conteos antes/después del filtrado).

Cada parte se activa por bandera de forma independiente, así que si algo sale mal se apaga sin tocar código ni afectar a otras licencias.

---

## Detalle técnico

- `src/hooks/usePromociones.ts`: auto-inserción de línea bonificada y validación de frescura del caché.
- `src/hooks/useRutaVenta.ts`: gate de "promoción pendiente" antes de cobrar; excluir `precio_manual` del recálculo al cambiar cliente.
- `src/lib/offlineSync.ts`: `COLUMN_SELECTS` para `ventas`, `venta_lineas`, `cobros`, `visitas`, `entregas`; filtro `vendedor_id` en el arranque de descarga; candado global de sync; ventana de 15 días.
- `src/hooks/useNetworkStatus.ts`: intervalo de refresco completo a 15 min.
- `feature_flags`: `ruta_sync_v2` y `ruta_promos_auto` como banderas por licencia.
- Sin cambios de esquema en la base de datos. Los triggers de inventario y `fn_netear_linea_promo` se quedan como están.

## Orden de entrega

1. Promociones (1.1–1.4) + pruebas en 12324489
2. Candado global + columnas explícitas + medición
3. Filtrado por vendedor + regresión de acceso
4. Ventana e intervalos
