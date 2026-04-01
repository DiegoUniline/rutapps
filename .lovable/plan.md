

## Reestructura de la página "Mi Suscripción"

### Problemas actuales
1. El botón de "Pagar" factura pendiente está enterrado en la tabla de historial al fondo — difícil de ver
2. La sección "Elige tu plan" muestra planes como si fueran productos separados, cuando en realidad solo cambia la frecuencia de cobro (mensual/semestral/anual)
3. No queda claro que el plan completo debe ser uno solo (no puede mezclar mensual con semestral)

### Cambios propuestos

**1. Banner de factura pendiente arriba (justo después del status)**
- Si hay facturas con estado `pendiente`, mostrar un banner prominente con el monto y botón "Pagar ahora" inmediatamente después del status banner (antes de cualquier otra sección)
- Estilo llamativo con borde amber/rojo y botón grande

**2. Reestructurar "Elige tu plan" → "Tu plan y usuarios"**
- Mostrar primero el número de usuarios actuales con controles +/- para ajustar
- Debajo, selector de frecuencia de cobro (Mensual / Semestral / Anual) como tabs o radio buttons — esto aplica a TODO el plan, no se mezcla
- Mostrar el cálculo en tiempo real: `X usuarios × $Y/mes = $Z total/mes`
- El botón "Agregar al pedido" refleja la configuración completa

**3. Lógica unificada de plan**
- Al elegir frecuencia, se aplica a todos los usuarios por igual
- No se permite tener usuarios en diferentes frecuencias

### Archivos a modificar
- `src/pages/MiSuscripcionPage.tsx` — reestructurar layout completo

### Estructura visual resultante
```text
┌──────────────────────────────────────┐
│ Mi Suscripción                       │
├──────────────────────────────────────┤
│ [Status Banner: Pago pendiente]      │
│  3 USUARIOS  |  0 TIMBRES           │
├──────────────────────────────────────┤
│ ⚠️ Factura pendiente: $900 MXN       │
│          [  Pagar ahora  ]           │
├──────────────────────────────────────┤
│ Tu plan                              │
│ Usuarios: [-] 3 [+]                  │
│                                      │
│ Frecuencia:                          │
│ [Mensual $300] [Semestral $270]      │
│ [Anual $255]                         │
│                                      │
│ Total: 3 × $300 = $900/mes           │
│          [ Agregar al pedido ]       │
├──────────────────────────────────────┤
│ Timbres CFDI (sin cambios)           │
├──────────────────────────────────────┤
│ Historial de facturas                │
└──────────────────────────────────────┘
```

