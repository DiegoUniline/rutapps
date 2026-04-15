

# Propagación completa de moneda configurada por empresa

## Problema
La empresa tiene configurado "Sol peruano" (PEN, símbolo `S/`) pero muchos componentes y documentos siguen mostrando `$` hardcodeado. La captura muestra que en el detalle de venta los precios unitarios, subtotales de línea y el cuadro de saldo muestran `$`, mientras que el cuadro de totales (que ya usa `useCurrency`) muestra correctamente `S/`.

## Alcance
28+ archivos con `$` hardcodeado en contextos de moneda. Se deben actualizar todos para usar `useCurrency()` (en componentes React) o `getCurrencyConfig(empresa.moneda).symbol` (en utilidades/PDFs).

## Archivos a modificar

### Grupo 1 — Formulario de Venta (lo que se ve en la captura)
- **`src/pages/VentaForm/VentaFormFields.tsx`** — Cuadro Total/Pagado/Saldo: reemplazar `${}` por `fmt()`
- **`src/pages/VentaForm/VentaLineaDesktop.tsx`** — Precio y subtotal por línea: reemplazar `${}` por símbolo dinámico
- **`src/pages/VentaForm/VentaLineaMobile.tsx`** — Precio y total por línea en móvil

### Grupo 2 — Componentes de productos y catálogos
- **`src/components/ProductoDropdown.tsx`** — Precio en dropdown de búsqueda
- **`src/components/producto/PreciosTab.tsx`** — Tab de precios en producto
- **`src/components/comisiones/ComisionesReglasTab.tsx`** — Reglas de comisiones
- **`src/pages/ProductoFormPage.tsx`** — Formulario de producto (tabla de tarifas)
- **`src/pages/ProductoForm/ProductoGeneralFields.tsx`** — Campos generales producto
- **`src/pages/ProductoForm/ProductoComisionesTab.tsx`** — Tab comisiones en producto
- **`src/pages/TarifaFormPage.tsx`** — Formulario de tarifas/listas de precios

### Grupo 3 — Páginas operativas
- **`src/pages/DescargasPage.tsx`** — Liquidaciones: tarjetas de contado/crédito/cobros/gastos
- **`src/pages/ClienteFormPage.tsx`** — Formulario de cliente (límite crédito, etc.)
- **`src/pages/PedidoPendienteDetailPage.tsx`** — Detalle de pedido pendiente
- **`src/pages/ruta/RutaDescarga.tsx`** — Descarga de ruta móvil
- **`src/pages/ruta/RutaSincronizarPage.tsx`** — Sincronización de ruta
- **`src/components/reportes/ReporteDiarioRuta.tsx`** — Reporte diario

### Grupo 4 — Facturación y CFDI
- **`src/components/facturacion/TimbrarDialog.tsx`** — Diálogo de timbrado

### Grupo 5 — WhatsApp y mensajes
- **`src/lib/whatsappReceipt.ts`** — Comprobante WhatsApp: `$${fmt2(...)}` → símbolo dinámico
- **`src/pages/CobranzaPage.tsx`** — Mensaje WhatsApp de cobro

### Grupo 6 — Admin (estos usan MXN fijo intencionalmente, se excluyen)
Los archivos de admin (`AdminEmpresaDetail`, `AdminStatsTab`, `MiSuscripcionPage`, `PagarPage`, `SubscriptionCard`, `AdminNotificationsTab`) manejan precios de suscripción que siempre son en MXN — se dejan con `$` hardcodeado.

## Estrategia de implementación

1. En cada componente React: importar `useCurrency` y usar `fmt()` o `symbol` en lugar de `$`
2. En `VentaLineaDesktop` y `VentaLineaMobile`: recibir `currencySymbol` como prop desde el padre (ya que son componentes de presentación sin acceso directo al contexto de auth)
3. En `whatsappReceipt.ts` y `CobranzaPage.tsx`: recibir/usar el símbolo dinámico desde el contexto de empresa
4. No se requieren cambios de base de datos

## Detalles técnicos

Patrón de reemplazo en componentes:
```tsx
// Antes:
<span>${value.toLocaleString('es-MX', ...)}</span>

// Después:
const { fmt, symbol } = useCurrency();
<span>{fmt(value)}</span>
// o para inline:
<span>{symbol}{value.toLocaleString(...)}</span>
```

Para los componentes de línea de venta que reciben props:
```tsx
// VentaLineasTab pasa currencySymbol a Desktop/Mobile
<VentaLineaDesktop ... currencySymbol={symbol} />
```

