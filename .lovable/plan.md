

## Reestructurar "Tu plan y usuarios" — Separar cambio de plan vs agregar usuarios

### Problema
La sección actual mezcla "cambiar frecuencia" con "agregar usuarios" como si fueran lo mismo. El usuario necesita ver claramente:
1. Su frecuencia de cobro actual (mensual/semestral/anual)
2. Poder cambiarla (esto afecta a TODOS los usuarios)
3. Poder agregar más usuarios (heredan la frecuencia actual)

### Cambios en `src/pages/MiSuscripcionPage.tsx`

**1. Cargar `subscription_plans` en vez de `planes`**
- Cambiar la query de `planes` a `subscription_plans` (que tiene `periodo`, `precio_por_usuario`, `meses`, `descuento_pct`)
- Cargar el `plan_id` actual de la suscripción para saber qué frecuencia tiene

**2. Mostrar plan actual arriba**
- Banner claro: "Tu plan actual: **Mensual** — 3 usuarios — $300/usuario/mes — Total: $900/mes"
- Si no tiene plan asignado (trial), mostrar "Sin plan — elige uno"

**3. Sección "Cambiar frecuencia de cobro"**
- 3 botones/cards: Mensual / Semestral / Anual con precio por usuario y descuento
- Al seleccionar uno diferente al actual → botón "Cambiar a [frecuencia]"
- Esto actualiza el plan de TODOS los usuarios existentes
- Muestra el nuevo total: `X usuarios × $Y = $Z/mes`

**4. Sección "Agregar usuarios"**
- Control +/- para ajustar cantidad (mínimo: usuarios actuales)
- Muestra automáticamente la frecuencia heredada del plan actual
- Total del cambio: `(nuevos - actuales) × precio = diferencia`
- Botón "Agregar X usuarios"

**5. Lógica de cart simplificada**
- Si cambia frecuencia → item en cart "Cambiar a plan [Anual]" con el total
- Si agrega usuarios → item "Agregar X usuarios" con el precio
- Ambos pueden combinarse

### Estructura visual

```text
┌──────────────────────────────────────┐
│ Tu plan actual                       │
│ Cobro: MENSUAL | 3 usuarios         │
│ $300/usuario/mes → Total: $900/mes   │
├──────────────────────────────────────┤
│ Cambiar frecuencia de cobro          │
│ [Mensual ✓] [Semestral] [Anual]     │
│ Nuevo total: 3 × $270 = $810/mes    │
│           [Cambiar plan]             │
├──────────────────────────────────────┤
│ Agregar usuarios                     │
│ Usuarios adicionales: [-] 0 [+]     │
│ Se cobrarán a tu plan Mensual       │
│           [Agregar al pedido]        │
└──────────────────────────────────────┘
```

### Archivos a modificar
- `src/pages/MiSuscripcionPage.tsx` — reestructurar la sección de plan completa, usar `subscription_plans` en vez de `planes`, mostrar plan actual, separar cambio de frecuencia de agregar usuarios

