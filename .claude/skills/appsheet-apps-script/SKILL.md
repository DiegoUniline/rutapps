---
name: appsheet-apps-script
description: Reglas para diseñar, modificar y auditar sistemas en AppSheet, Google Sheets y Google Apps Script (web apps, API de AppSheet, triggers, PDFs). Úsala cuando el proyecto tenga archivos .gs, appsscript.json, hojas de cálculo como base de datos o integración con AppSheet.
---

# AppSheet + Google Sheets + Apps Script

## Modelado en AppSheet
- Cada tabla = una hoja. Primera fila = encabezados. No celdas combinadas, no filas vacías intermedias, no fórmulas mezcladas con datos capturados.
- Llave: columna `ID` con `UNIQUEID()` como initial value; nunca `_RowNumber` como llave.
- Referencias: tipo `Ref` a la llave de la otra tabla. Listas fijas: `Enum` con valores definidos. Listas configurables: tabla catálogo + `Ref`.
- Multiempresa en AppSheet: columna `Empresa` + security filter `[Empresa] = LOOKUP(USEREMAIL(), "Usuarios", "Email", "Empresa")`. Los security filters sí protegen datos; los slices NO.
- Permisos por rol: tabla Usuarios con Rol; `Editable_If`, `Show_If`, acciones con condición por rol.
- Dinero: tipo `Price`/`Decimal` con decimales definidos. Documentos cerrados: `Editable_If` por estado.
- Columnas virtuales para cálculos de pantalla; para totales que deben quedar fijos, guardar valor real al confirmar (acción o bot).
- Cambiar estructura de hoja → Regenerate structure y revisar fórmulas, slices, acciones, bots.

## Apps Script
- Leer/escribir en bloque: `getValues()` / `setValues()`, nunca celda por celda en ciclos.
- No depender de índice de columna fijo: mapear por encabezado.
```javascript
function leerTabla_(hoja) {
  const datos = hoja.getDataRange().getValues();
  const enc = datos.shift();
  return datos.map(f => Object.fromEntries(enc.map((h, i) => [h, f[i]])));
}
```
- Escrituras concurrentes: `LockService.getScriptLock().waitLock(30000)` y `releaseLock()` en finally.
- Borrar filas: de abajo hacia arriba.
- Secretos (API keys AppSheet, tokens): `PropertiesService.getScriptProperties()`, nunca en el código.
- Límite 6 min por ejecución: procesar en lotes y guardar avance en Properties si es largo.
- Errores: try/catch con log (hoja Log o console) y mensaje claro al usuario; nunca catch vacío.
- Triggers: verificar que no estén duplicados antes de crear.
- Web apps: `doGet(e)` validando `e.parameter`; escapar todo lo que se inyecta en HTML; `HtmlService.createTemplateFromFile`.
- Desplegar (`clasp push`/nueva versión) es acción de producción: requiere aprobación.

## API de AppSheet desde Apps Script
```javascript
function appsheet_(tabla, accion, filas, selector) {
  const p = PropertiesService.getScriptProperties();
  const url = `https://api.appsheet.com/api/v2/apps/${p.getProperty('APPSHEET_APP_ID')}/tables/${encodeURIComponent(tabla)}/Action`;
  const body = { Action: accion, Properties: { Locale: 'es-MX', Timezone: 'Central Standard Time (Mexico)' }, Rows: filas || [] };
  if (selector) body.Properties.Selector = selector;
  const r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { ApplicationAccessKey: p.getProperty('APPSHEET_KEY') },
    payload: JSON.stringify(body)
  });
  if (r.getResponseCode() !== 200) throw new Error(`AppSheet ${r.getResponseCode()}: ${r.getContentText()}`);
  return JSON.parse(r.getContentText() || '[]');
}
// appsheet_('Clientes', 'Find', [], 'Filter(Clientes, [Empresa] = "X")')
```
- `Delete` vía API es destructivo: requiere aprobación.
- Las acciones vía API disparan bots de AppSheet: considerar efectos.

## Documentar en /docs
Por tabla: hoja, columnas (tipo AppSheet, Initial value, App formula, Valid_If, Editable_If, Show_If, Required), security filter, acciones, bots, scripts que la leen/escriben (archivo:función).
