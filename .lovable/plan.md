
Problema confirmado

- El PDF subido `VTA-0011_2.pdf` sigue saliendo en MXN: muestra `Moneda: MXN - Peso mexicano`, importes con `$` y `VEINTE PESOS 88/100 MXN`.
- La causa principal en la ruta actual `/ventas/:id` está en `src/pages/VentaForm/VentaPdfHandler.ts`: al construir `empresa` para `generarPedidoPdf`, no envía `moneda`, así el documento cae al fallback MXN.
- Además hay endurecimientos globales en PDFs:
  1. `src/lib/pdfStyleOdoo.ts` sigue formateando montos con lógica fija y `numberToWords()` devuelve siempre `PESOS ... MXN`.
  2. `src/lib/cfdiPdf.ts` todavía trae fijo `Peso Mexicano` y el importe con letra en MXN.

Plan

1. Corregir la fuente del PDF de ventas
- En `src/pages/VentaForm/VentaPdfHandler.ts`, pasar `empresa.moneda` al payload del PDF.
- Revisar los demás puntos de entrada de PDFs para confirmar que todos transmiten la moneda de la empresa y no dependen del fallback.

2. Unificar el formateo monetario de PDFs
- Hacer que la capa compartida de PDF use `getCurrencyConfig()` para símbolo, código y formato.
- Aplicar esa misma fuente de verdad a ventas, pedidos, estado de cuenta, liquidaciones, entregas, traspasos y ajustes.

3. Corregir el “importe con letra”
- Volver `numberToWords()` sensible a la moneda configurada.
- Para PEN, debe dejar de decir `PESOS ... MXN` y usar la moneda/código correctos.
- Aplicar la misma corrección en `src/lib/cfdiPdf.ts`.

4. Corregir etiquetas internas del documento
- Cambiar en CFDI y PDFs cualquier texto fijo como `MXN - Peso Mexicano` por el nombre real de la moneda configurada.
- Verificar subtotales, totales, pagos, saldos y captions para que usen la misma moneda.

5. Validación
- Regenerar el PDF de la venta actual y confirmar visualmente:
  - `Moneda: PEN - Sol peruano`
  - importes con `S/`
  - importe con letra sin `MXN/PESOS`
  - pagos, subtotal, total y saldo consistentes
- Hacer una revisión rápida adicional en otros PDFs clave: estado de cuenta, liquidación y CFDI.

Detalles técnicos

- Archivos principales:
  - `src/pages/VentaForm/VentaPdfHandler.ts`
  - `src/lib/pdfStyleOdoo.ts`
  - `src/lib/pedidoPdf.ts`
  - `src/lib/ventaPdf.ts`
  - `src/lib/cfdiPdf.ts`
- Archivos a auditar para cierre completo:
  - `src/lib/estadoCuentaPdf.ts`
  - `src/lib/liquidacionPdf.ts`
  - `src/lib/entregaPdf.ts`
  - `src/lib/traspasoPdf.ts`
  - `src/lib/ajusteInventarioPdf.ts`
- No se requieren cambios de base de datos.
- El objetivo será corregir no solo el símbolo, sino también nombre de moneda, código y texto en letra para eliminar cualquier fallback a MXN.
