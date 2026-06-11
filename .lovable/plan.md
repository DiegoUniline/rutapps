## Objetivo

Unificar todos los PDFs del sistema (ventas, pedidos, entregas, traspasos, ajustes, compras, liquidaciones, estado de cuenta, recibos de cobro, reporte diario, auditoría) con el mismo lenguaje visual del PDF de Reportes Personalizados: estrictamente blanco y negro, 100% vectorial, Helvetica, jerarquía limpia.

## Alcance confirmado

Incluye todos los documentos operativos. **Excluye CFDI** (se queda igual por sensibilidad fiscal). Los tickets térmicos sí adoptan la tipografía y jerarquía B/N. Los chips de estado (PAGADO / CANCELADO) pasan a texto plano en negro, sin recuadros ni colores.

## Estándar visual único

Encabezado
- Izquierda: logo opcional (máx 12 mm ≈ 40 px de alto), nombre comercial en MAYÚSCULAS bold 12 pt, debajo `RFC: ...  ·  email` en 9 pt gris #6E6E6E
- Derecha: título del documento bold 11 pt, folio/referencia 9 pt, fecha de emisión y "Generado: DD/MM/AAAA HH:mm" 9 pt gris
- Línea divisoria negra 2 px (0.7 mm) bajo el encabezado

Tablas (vía `autoTable` theme `plain`)
- Encabezados bold 10 pt sobre fondo blanco, borde inferior negro 1 px
- Filas 9 pt, borde inferior gris claro 0.5 px, sin zebra, sin fills
- Números a la derecha con `$#,##0.00`; cantidades sin decimales
- Fila de totales con borde superior negro 1 px y peso bold

Estados y elementos
- "Estado: CANCELADO" / "PAGADO" como texto bold en negro, sin chip ni color
- Sin verdes, rojos, ni fondos coloreados en ninguna parte
- Notas: caja simple con borde gris claro 0.3 mm, sin fill

Pie de página (en cada página)
- Izquierda: `Rutapp · [nombre empresa]` 9 pt gris
- Derecha: `Página X de Y` 9 pt gris (usando `putTotalPages`)
- Línea superior gris claro 0.2 mm

Tipografía global: Helvetica 9–11 pt cuerpo, todo `doc.text()` (texto seleccionable), `doc.line()` y `autoTable`. Solo el logo es imagen.

## Estrategia de implementación

Refactor centralizado: los dos módulos compartidos `src/lib/pdfBase.ts` y `src/lib/pdfStyleOdoo.ts` son los que dibujan header, tablas, totales, notas, firmas, footer y status para todos los generadores. Cambiando estos dos archivos, los 10 generadores heredan el nuevo estilo sin tocar su lógica de datos.

### Archivos a modificar

Módulos compartidos (cambios profundos)
- `src/lib/pdfStyleOdoo.ts` — paleta a B/N, `drawDocHeader` con divisoria negra 2 px, `drawCleanTable` sin fills/zebra con borde inferior negro en head y gris claro en body, `drawTotalsBlock` con borde superior negro 1 px y sin rojo, `drawNotes` plano sin fondo, `drawFooter` con formato `Rutapp · [empresa]` y `Página X de Y`, status chips → texto plano bold
- `src/lib/pdfBase.ts` — mismas reglas para los documentos que lo usan (`ventaPdfFromId`, `cobroReciboPdf`, `VentaPdfHandler`)

Generadores (ajustes mínimos — solo donde haya colores/chips inline)
- `src/lib/ventaPdf.ts` — quitar parámetros `statusColor: 'green' | 'red'`, pasar todo como neutral
- `src/lib/pedidoPdf.ts`
- `src/lib/entregaPdf.ts`
- `src/lib/traspasoPdf.ts`
- `src/lib/ajusteInventarioPdf.ts`
- `src/lib/liquidacionPdf.ts`
- `src/lib/estadoCuentaPdf.ts`
- `src/lib/auditoriaPdf.ts`
- `src/lib/reporteDiarioPdf.ts`
- `src/lib/cobroReciboPdf.ts` (ticket térmico — solo aplicar tipografía/jerarquía dentro del ancho 80 mm)

Sin tocar
- `src/lib/cfdiPdf.ts` (fiscal, fuera de alcance)
- `src/lib/exportUtils.ts` (ya está con el estilo nuevo, sirve de referencia)

## Memoria a actualizar

Actualizar `mem://design/odoo-pdf-standard` para reflejar el nuevo estándar B/N corporativo único (header con empresa+RFC+email izquierda / título+periodo derecha, divisoria negra 2 px, tablas sin zebra, estados como texto plano, footer `Rutapp · empresa` + `Página X de Y`). Marcar CFDI como excepción.

## Validación

1. Generar y revisar visualmente: una venta, un pedido, una entrega, un traspaso, un recibo de cobro, un estado de cuenta y una liquidación
2. Confirmar: divisoria negra 2 px, sin zebra, totales con borde superior negro, footer con paginación correcta, sin restos de verde/rojo
3. Confirmar peso < 100 KB en PDFs típicos (texto vectorial, solo logo como imagen)
4. Probar empresa con y sin logo, con y sin RFC/email

## Riesgos

- Documentos con muchos estilos inline (chips de color) requieren tocar el generador, no solo el módulo compartido. Mitigación: ya identificados arriba.
- El recibo de cobro térmico tiene ancho reducido (80 mm); algunas reglas de tipografía bajan a 8 pt para caber.
- CFDI queda fuera para no arriesgar el cumplimiento fiscal — se puede abordar en una iteración posterior si lo deseas.
