# Tres correcciones: visitas, frecuencia quincenal y orden de compra

## 1. Visitas sin venta no se marcan en Supervisor (causa confirmada)

Las visitas sí se guardan bien en la base (revisé la Lic. 56726601: hoy hay 9 visitas "sin compra" del vendedor, con cliente activo y día correcto). El problema está en la consulta del Centro de control: el rango de fechas de visitas está invertido.

Hoy pide visitas con fecha `>= 2026-08-03T00:00:00-12:00` (= 12:00 UTC) y a la vez `<= 2026-08-03T23:59:59+12:00` (= 11:59 UTC). El límite inferior queda **después** del superior, así que cuando el filtro es de un solo día la consulta devuelve cero visitas. Por eso solo se marcan como visitados los clientes que tuvieron venta (esa consulta usa otro filtro que sí funciona).

Corrección: usar los límites del día en la zona horaria de la empresa (inicio del día `desde` y fin del día `hasta`), igual que el resto de las consultas del tablero. Con eso vuelven a contar:
- El check de "Visitado" en la lista y en el mapa de clientes.
- El KPI de Visitados / cobertura por vendedor.
- Las alertas de "en ruta sin visitas registradas".

## 2. Clientes quincenales aparecen cada 8 días

Hoy el campo **Frecuencia** (diaria / semanal / quincenal / mensual) solo se guarda y se muestra; nada del sistema lo usa. La lista de ruta se arma únicamente con los **días de visita**, por eso un cliente quincenal sale cada semana.

Comportamiento a implementar (semanas alternadas): un cliente quincenal aparece en su día una semana sí y una no, tomando como referencia su última visita registrada (visita o venta).

Regla:
- diaria / semanal: sin cambio.
- quincenal: aparece en su día solo si la última visita fue hace 8 días o más (es decir, no se visitó la semana pasada).
- mensual: aparece en su día solo si la última visita fue hace 24 días o más.
- Sin visitas previas: aparece siempre (se toma como cliente pendiente).

Dónde aplica:
- App móvil `/ruta` → lista de clientes del día (modo "Visitas"): los quincenales que no toquen esta semana se ocultan de la lista del día, y quedan visibles en "Todos".
- Supervisor Centro de control con "Solo hoy" activo: los quincenales fuera de turno no cuentan como pendientes ni castigan la cobertura.
- Se agrega una etiqueta discreta "Quincenal / Mensual" en la ficha del cliente en ruta para que el vendedor entienda por qué no aparece.

## 3. Descargar una sola orden de compra

Hoy no existe descarga individual: el único PDF/Excel de compras es el de la lista completa, por eso salen todas juntas en un documento.

Se agrega, por compra:
- **PDF Orden de compra** con el estándar B/N de la casa: encabezado con logo, datos de la empresa, folio, fecha, proveedor, número de factura y vencimiento; tabla de líneas con producto, lote (cuando aplique), cantidad, costo unitario, impuestos y total; totales al pie y numeración de páginas.
- **Excel de esa compra** con las mismas líneas y totales.

Ubicación de los botones:
- Fila expandible de Compras, junto a las demás acciones.
- Encabezado del detalle de compra.
- La exportación de la lista completa se queda igual.

## Detalles técnicos

- `src/pages/SupervisorDashboardPage.tsx`: corregir los límites de la consulta `supervisor-visitas-hoy` usando el inicio/fin de día en `empresa.zona_horaria`.
- Nuevo `src/lib/frecuenciaVisita.ts`: helper `tocaVisitaHoy(cliente, ultimaVisitaISO, hoy)` con la regla de 8 / 24 días; sin dependencias de UI, cubierto con pruebas unitarias en `src/test/`.
- `src/pages/ruta/RutaClientes.tsx`: aplicar el helper al modo "Visitas" usando la última visita/venta ya disponible offline.
- `src/pages/SupervisorDashboardPage.tsx`: aplicar el mismo helper en `sellerClientStats` y `clienteActivity` cuando `soloHoy` está activo.
- Nuevo `src/lib/ordenCompraPdf.ts` (jsPDF con carga diferida, reutilizando `pdfBase`), y export Excel vía `exportToExcel`.
- `src/pages/compras/CompraExpandedRow.tsx` y `src/pages/CompraForm/index.tsx`: botones PDF / Excel de la compra.
- Sin cambios de esquema en base de datos.
