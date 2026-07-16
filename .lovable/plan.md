# Plan: Campos numéricos universales (fix "0" fantasma → "10")

## Problema
Muchos inputs numéricos se inicializan con `useState(0)` o `value={x || 0}`. El "0" es un valor real, así que si el usuario escribe "1" sin borrar, queda "10". Además `Number("")` devuelve `0`, contaminando payloads.

## Solución

### 1. Componente universal `NumericInput`
Nuevo archivo `src/components/NumericInput.tsx`:

- Props: `value: number | null`, `onChange: (v: number | null) => void`, `placeholder="0"`, `allowDecimals`, `allowNegative`, `min`, `max`, `step`, `decimals`, `zeroBehavior: "placeholder" | "select-on-focus" | "keep"`, más passthrough de `className`, `disabled`, `onBlur`, `autoFocus`, `id`, `name`, `inputMode`.
- Estado interno: string `draft` sincronizado con `value`.
- `value === null | undefined` → input vacío, muestra `placeholder="0"`.
- `value === 0` + `zeroBehavior="placeholder"` → renderiza vacío también (el 0 vive como placeholder hasta que se escriba).
- `zeroBehavior="select-on-focus"` (default para precios/costos existentes): mantiene "0" y hace `select()` en focus.
- `onFocus`: si `zeroBehavior="placeholder"` y value===0 → limpia; en otros modos selecciona todo.
- `onChange`: si raw==="" → `onChange(null)`; valida regex según `allowDecimals`/`allowNegative`; respeta `min`/`max` en blur; nunca emite `NaN`.
- Manejo correcto de separador decimal (`.` y `,`), pegado, teclas ↑↓ nativas (`type="number"` con `inputMode`), móvil.

### 2. Helper de payload
`src/lib/numericInput.ts`:
- `toPayloadNumber(value, { defaultZero = false })` → convierte `null | ""` → `null` (o `0` si negocio lo pide).
- `numericValidator(schema)` para zod.

### 3. Migración
No podemos tocar cada uno de los ~600 inputs numéricos en una sola pasada sin riesgo. Estrategia por fases:

**Fase A (esta entrega):**
- Crear componente + helper + tests.
- Migrar los formularios de mayor tráfico y donde el bug es más visible:
  - POS: cantidades, descuentos (`src/components/pos/*`, `MovimientoCajaModal`, `CerrarTurnoModal`).
  - Ventas / cotizaciones: cantidad, descuento, precio (líneas editables).
  - Compras y traspasos: cantidad, costo.
  - Ajustes de inventario y conteos físicos: cantidad física.
  - Productos: precio principal, costo, stock min/max, factor conversión (`ProductoGeneralFields`).
  - Pagos y cobros: monto.
- Ajustar `InlineEditCell` para usar la misma lógica cuando `type="number"`.

**Fase B (segunda entrega, tras validar Fase A):**
- Barrido con `rg` de patrones `useState(0)`, `value={.*\|\| 0}`, `Number(e.target.value)`, `parseFloat(...) \|\| 0`, `type="number"` restantes.
- Sustitución mecánica y revisión visual por módulo (reportes, WhatsApp, comisiones, promociones, gastos, mermas, etc.).

### 4. Reglas de convivencia
- No cambio schemas ni negocios: donde el backend exige `0` (ej. stock mínimo default), el helper de payload aplica `defaultZero`.
- No toco cálculos de dinero ni RPCs.
- Mantengo `es_granel` con `step="0.001"` y `fmtMoney` sin cambios.

## Detalles técnicos
- `NumericInput` usa `type="text"` con `inputMode="decimal"` o `"numeric"` para tener control total del string (evita autocast del navegador).
- `zeroBehavior` default:
  - Cantidades, descuentos, %: `"placeholder"`.
  - Precios/costos/stock min/max ya persistidos: `"select-on-focus"`.
- Tests unitarios: escribir "1" en un input inicializado sin valor produce `1`; escribir "1" con foco sobre value=0 y `zeroBehavior="placeholder"` produce `1`; blur vacío → `null`; blur con `defaultZero` en payload → `0`.

## Fuera de alcance
- Formateo con miles (`fmtMoney`) en tiempo real dentro del input (se mantiene formateo solo en modo lectura).
- Migración de textareas o inputs de texto.

## Entregable Fase A
1. `src/components/NumericInput.tsx`
2. `src/lib/numericInput.ts`
3. `src/test/numericInput.test.ts`
4. Migración de los formularios listados arriba.
5. `InlineEditCell` actualizado.

Confírmame para arrancar la Fase A tal cual, o dime si prefieres que priorice un módulo distinto primero.
