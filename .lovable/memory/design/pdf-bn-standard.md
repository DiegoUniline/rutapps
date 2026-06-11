---
name: PDF B/N corporate standard
description: Estándar único B/N corporativo para todos los PDFs (excepto CFDI). Header con empresa+RFC+email, divisoria negra 2px, tablas sin zebra, footer Rutapp · empresa.
type: design
---

Estándar visual único para TODOS los PDFs operativos del sistema (ventas, pedidos, entregas, traspasos, ajustes, liquidaciones, estado de cuenta, recibos de cobro, reporte diario, auditoría). Excepción: CFDI conserva su layout fiscal.

## Reglas no negociables

- Estrictamente blanco y negro. Sin verdes, rojos ni chips de color. Estados como texto bold negro: "Estado: CANCELADO".
- 100% vectorial (`doc.text`, `doc.line`, `autoTable`). Única imagen permitida: el logo de la empresa, máx 12mm (~40px) de alto.
- Helvetica 9–11pt. Cuerpo 9pt, encabezados 10pt, título principal 12pt.

## Header

- Izquierda: logo opcional + nombre comercial MAYÚSCULAS bold 12pt, debajo `RFC: ...  ·  email` en 9pt gris #6E6E6E
- Derecha: título del documento bold 11pt, folio/referencia 9pt, "Generado: DD/MM/AAAA HH:mm" 9pt gris
- Divisoria negra 2px (0.7mm) bajo el encabezado

## Tablas

- `autoTable` con `theme: 'plain'`, sin zebra (`alternateRowStyles` blanco), sin fills
- Encabezados bold 10pt sobre blanco, borde inferior negro 0.4mm (≈1px)
- Filas 9pt, borde inferior gris claro #DCDCDC 0.15mm (≈0.5px)
- Números a la derecha con `$#,##0.00`; cantidades sin decimales (`Intl.NumberFormat('es-MX')`)
- Fila de totales con borde superior negro 0.4mm y peso bold

## Footer (en cada página)

- Izquierda: `Rutapp · [nombre empresa]` 9pt gris
- Derecha: `Página X de Y` 9pt gris (usar `putTotalPages('{totalPages}')` o `getNumberOfPages()`)
- Línea superior gris claro 0.2mm

## Implementación

El estándar vive en dos módulos compartidos:
- `src/lib/pdfStyleOdoo.ts` — `drawDocHeader`, `drawCleanTable`, `drawTotalsBlock`, `drawNotes`, `drawFooter`, `drawSignatures`, `drawInfoGrid`
- `src/lib/pdfBase.ts` — `drawHeader`, `drawTotals`, `drawFooter`, `TABLE_HEAD_STYLE`, `TABLE_BODY_STYLE`

Las paletas `C` (pdfStyleOdoo) y `PDF` (pdfBase) conservan TODAS sus claves históricas (`green`, `red`, `success`, `danger`, `headBg`, etc.) pero todas colapsan a B/N. Los generadores no requieren cambios.

`statusColor` en `drawDocHeader` se ignora — solo se imprime el texto del estado.

## Referencia

`src/lib/exportUtils.ts` → `exportToPDF` implementa el estándar de referencia (reportes personalizados).
