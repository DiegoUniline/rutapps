

## Unificar "Actualizar plan" — Un solo flujo para frecuencia y usuarios

### Concepto
Eliminar las secciones separadas de "Cambiar frecuencia" y "Agregar usuarios". Reemplazar con una sola sección **"Actualizar plan"** donde el usuario ve:
1. Su plan actual (frecuencia + usuarios + total)
2. Puede ajustar frecuencia Y usuarios en el mismo lugar
3. Un solo botón **"Actualizar plan"** que calcula la diferencia

### Lógica de cobro
- **Subir usuarios**: Cobra la diferencia prorrateada del periodo actual
- **Bajar usuarios**: Sin reembolso, el cambio aplica al siguiente periodo
- **Cambiar a frecuencia mayor** (mensual→semestral): Cobra los meses restantes. Ej: si ya pagó 1 mes mensual y cambia a semestral, cobra 5 meses faltantes al precio semestral
- **Cambiar a frecuencia menor** (anual→mensual): Aplica al siguiente periodo, sin reembolso

### Estructura visual simplificada
```text
┌──────────────────────────────────────┐
│ Tu plan actual                       │
│ MENSUAL | 3 usuarios | $900/mes      │
├──────────────────────────────────────┤
│ ⚠️ Factura pendiente: $900           │
│          [  Pagar ahora  ]           │
├──────────────────────────────────────┤
│ Actualizar plan                      │
│                                      │
│ Frecuencia:                          │
│ [Mensual ✓] [Semestral] [Anual]     │
│                                      │
│ Usuarios: [-] 3 [+]                  │
│                                      │
│ Resumen:                             │
│ 3 usuarios × $270/mes = $810/mes     │
│ Cobro por cambio: $1,350 (5 meses)   │
│                                      │
│      [ Actualizar plan ]             │
├──────────────────────────────────────┤
│ Timbres CFDI                         │
├──────────────────────────────────────┤
│ Historial de facturas                │
└──────────────────────────────────────┘
```

### Cambios en `src/pages/MiSuscripcionPage.tsx`
1. **Eliminar** secciones separadas de "Cambiar frecuencia" y "Agregar usuarios" (lines ~589-731)
2. **Crear** una sola sección "Actualizar plan" con:
   - Selector de frecuencia (3 cards)
   - Control +/- de usuarios (mínimo 3)
   - Resumen con cálculo de diferencia/prorrateo
3. **Simplificar cart**: Quitar tipos `plan` y `usuarios` separados → un solo tipo `actualizacion` que incluye ambos
4. **Cálculo de cobro por cambio**:
   - Si hay `current_period_end`, calcular meses restantes del periodo actual
   - Diferencia = (nuevo_total_mensual × meses_restantes) - lo ya pagado del periodo
   - Si diferencia > 0 → cobrar; si ≤ 0 → "Se aplica al siguiente periodo"
5. **Botones finales**: Solo "Pagar pendiente" (si hay factura) y "Actualizar plan" (si hay cambios)

### Archivo a modificar
- `src/pages/MiSuscripcionPage.tsx`

