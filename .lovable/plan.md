## Objetivo

En **Reportes Personalizados** agregar la opción de **exportar agrupado por un campo** (además del modo plano actual), y rediseñar el PDF para que se vea limpio, profesional y con marca Rutapp.mx.

---

## 1) Agrupar al exportar

### UI (ReportesPersonalizadosPage.tsx)
En la barra de filtros agregar un selector "Agrupar por" justo antes de los botones de exportar:

```
[ Agrupar por: ▼ Sin agrupar ]
   • Sin agrupar (como hoy)
   • Cliente
   • Vendedor
   • Almacén / Sucursal
   • Producto
   • Categoría
   • Fecha (día)
   • Fecha (mes)
   • Método de pago
   • Estado
   …(opciones disponibles según `fuente` del reporte)
```

Las opciones se derivan de los campos seleccionados en `config.campos` que sean categóricos / fecha (filtrado dinámico por fuente).

### Comportamiento
- **Sin agrupar** → exporta tal cual hoy (Excel/CSV/PDF planos).
- **Agrupado por X** → reorganiza las filas antes de exportar:
  - Ordena por el campo X.
  - Inserta una **fila de encabezado de grupo** por cada valor distinto: nombre del grupo + conteo.
  - Inserta una **fila de subtotal por grupo** sumando columnas numéricas (`currency`, `number`, `percent`).
  - Al final mantiene el **total general** que ya existe.

### Vista previa en pantalla
`DataPreview` también muestra los grupos colapsables (header con flechita, subtotal al cierre) para que el usuario vea exactamente lo que va a exportar.

### Implementación técnica
- Nuevo helper en `src/lib/reportesPersonalizados.ts`:
  ```ts
  groupRows(rows, columns, groupByKey) → { groups: [{ key, label, rows, subtotals }], totalsGenerales }
  ```
- `exportToExcel`, `exportToCSV` y `exportToPDF` reciben un nuevo campo opcional `groups` (cuando viene, ignoran `data` plano y usan los grupos para pintar headers + subtotals + total).
- En Excel: filas de grupo con `fill` gris claro y subtotal en negrita; auto-filtro desactivado para no romper grupos.
- En CSV: filas de grupo prefijadas `# Grupo: X` y subtotal con `Subtotal X`.

---

## 2) Rediseño del PDF (limpio, no pixeleado, branded)

### Cambios en `src/lib/exportUtils.ts → exportToPDF`

**Tipografía y nitidez**
- Cargar y registrar fuente **Inter** (TTF Regular + Bold vía base64 una sola vez con cache) en lugar de la Helvetica core que se ve pixelada. Esto es lo que más impacto visual tiene.
- Subir un nivel todos los `fontSize` (tabla 9, headers 9.5, títulos 18 / 11).
- Tamaño base en `pt` real, no en escala forzada.

**Cabecera (header)**
```
┌────────────────────────────────────────────────────────┐
│  Rutapp.mx ●                          Reporte XYZ      │  ← banda primaria (azul)
│  {empresa}                            Periodo: dd/mm – dd/mm │
└────────────────────────────────────────────────────────┘
```
- Banda superior llena con color primario del proyecto (`hsl(var(--primary))` resuelto a RGB al generar).
- Logo/texto "Rutapp.mx" izquierda en blanco con tipografía bold.
- Título del reporte derecha alineado.
- Debajo de la banda: empresa + periodo en formato **dd/mm/yyyy** (no ISO), con un sutil divisor.

**Tabla**
- Header con fondo primario suave (no gris piedra), texto blanco, padding `3 mm`.
- Filas alternas muy claras (`#FAFAFB`).
- Bordes finos `#E5E7EB`, no rejilla negra.
- Fechas en `dd/mm/yyyy`, montos siempre con símbolo de moneda y separadores `es-MX`.
- Si hay grupos: header de grupo a ancho completo con barra primaria al 8% + nombre y conteo; subtotal con fondo `#F0F2F7` en negrita.

**Pie de página**
```
Rutapp.mx · Generado el dd/mm/yyyy hh:mm                Página X de Y
```
- Línea fina arriba del pie, texto en gris medio, sin "Generado:" colgante.
- Página numerada a la derecha.

**Misc**
- Márgenes uniformes 14 mm.
- Detección automática landscape se conserva.
- Resumen General (cuando aplica) usa el mismo estilo nuevo (mismo color de header, misma fuente).

---

## Detalles técnicos

**Archivos a tocar:**
- `src/lib/reportesPersonalizados.ts` — añadir `groupRows()` y tipos.
- `src/lib/exportUtils.ts` — soporte `groups`, registro de fuente Inter, rediseño de header/tabla/footer del PDF, formato `dd/mm/yyyy`.
- `src/pages/ReportesPersonalizadosPage.tsx` — selector "Agrupar por", pasar `groupBy` al runner de exportación, agrupar también en `DataPreview`.
- Nuevo asset: `src/assets/fonts/Inter-Regular.ttf` y `Inter-Bold.ttf` (base64-loadable por jsPDF).

**Sin cambios** en queries de Supabase ni en la estructura de `reportes_personalizados`. El "agrupar" es 100% en cliente sobre las filas ya devueltas por `runReporte`.

---

## Fuera de alcance
- No se cambian los demás PDFs del sistema (facturas, tickets, etc.) — solo el de **Reportes Personalizados**, para no afectar el estándar Odoo de los documentos fiscales.
- No se guarda el `groupBy` en la config del reporte (es una elección por ejecución). Si después lo quieres persistir, se hace en otro PR.
