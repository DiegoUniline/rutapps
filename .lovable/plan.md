## Diagnóstico

Hoy el tab **Suscripción** te pide datos sueltos (plan, status, fechas) pero **el descuento y los meses del plan solo se ven dentro del modal "Crear factura"** en el tab Facturación. Además:

- Solo hay planes **Mensual** activos (Individual/Equipo/Empresa). Los planes **Semestral (-10%)** y **Anual (-15%)** existen en BD pero están `activo=false`, por eso no aparecen en el dropdown.
- No hay forma de registrar que ya **te pagaron por transferencia** y marcar la factura como pagada (con o sin reflejarlo en Stripe).
- Si la empresa **agrega un usuario a mitad del período**, no se genera prorrateo automático: hoy solo subes `max_usuarios` y no se cobra el excedente.
- **Fin trial** siempre se muestra aunque la empresa ya no esté en trial.

## Plan

### 1. Activar planes Semestral y Anual
- Migración de datos: poner `activo = true` en los planes `Semestral` y `Anual` de `subscription_plans`.
- Resultado: el dropdown "Plan" en el tab Suscripción muestra Mensual / Semestral (-10%) / Anual (-15%) con sus meses.

### 2. Rediseñar el tab Suscripción (más claro y guiado)
Reorganizar el formulario de edición para que en una sola pantalla decidas todo:

```text
┌─ Plan y duración ─────────────────────────────┐
│  Plan: [Anual — $300/usr × 12 meses (-15%)▾] │
│  Máx. usuarios: [4]                           │
│  Descuento adicional %: [0]   (sobre el plan) │
└───────────────────────────────────────────────┘

┌─ Estado ──────────────────────────────────────┐
│  Status: [Activa ▾]                           │
│  🔒 Acceso bloqueado: [○]                     │
└───────────────────────────────────────────────┘

┌─ Vigencia ────────────────────────────────────┐
│  Inicio período: [27/05/2026]                 │
│  Fin período:    [27/05/2027]  ← base estado  │
│  (Fin trial solo si status = trial)           │
└───────────────────────────────────────────────┘

┌─ 💰 Resumen de cobro (siempre visible) ───────┐
│  $300/usr − 15% = $255/usr × 4 = $1,020/mes  │
│  Total período (12 meses): $12,240 MXN        │
│  [📄 Generar factura de este período]         │
└───────────────────────────────────────────────┘
```

Detalles:
- **Fin trial**: oculto si `status ≠ 'trial'`. Si está en trial y la fecha ya pasó, queda deshabilitado en gris.
- **Inicio/Fin período**: visibles solo cuando hay plan asignado (no en trial).
- **Resumen de cobro**: panel grande siempre visible con el cálculo: precio base × usuarios × meses, descuento del plan, descuento extra, total mensual y total del período.
- Botón **"📄 Generar factura de este período"** justo debajo del resumen; abre el modal existente prellenado con plan, usuarios, meses, descuento y fechas.

### 3. Registrar pago manual (transferencia / efectivo) en cada factura
En cada fila de **Facturas internas** que esté pendiente, agregar acción **"Marcar como pagada"** que abre un mini-modal:

- **Método de pago**: Transferencia / Efectivo / Depósito / Otro
- **Fecha de pago**: hoy por default
- **Referencia**: texto libre (folio de transferencia, último 4 de tarjeta, etc.)
- **Reflejar también en Stripe**: checkbox (marcado por default si la factura tiene `stripe_invoice_id`)

Al confirmar:
- Si la factura tiene `stripe_invoice_id` y marcaste el checkbox → llamar nueva acción edge `mark_invoice_paid_out_of_band` que ejecuta `stripe.invoices.pay(id, { paid_out_of_band: true })`.
- Actualizar fila en `facturas`: `estado='pagada'`, `fecha_pago`, `metodo_pago`, `referencia_pago`.
- **Extender la suscripción**: si la factura cubre N meses, mover `current_period_end` hacia adelante N meses y dejar `acceso_bloqueado=false`.
- Toast: "Pago registrado. Suscripción activa hasta DD/MM/YYYY."

Migración: agregar columnas `metodo_pago text` y `referencia_pago text` a `public.facturas`.

### 4. Prorrateo automático por usuarios extra mid-período
Cuando, en el formulario de Suscripción, **subes** `max_usuarios` por encima del valor actual y la suscripción está activa:

- Calcular días restantes del período: `(current_period_end − hoy)`.
- Calcular prorrateo: `usuarios_extra × precio_por_usuario_mes × (días_restantes / 30)`.
- Mostrar banner amarillo:
  > "Estás agregando **2 usuarios**. Quedan **18 días** del período actual → se generará una factura de prorrateo por **$360 MXN**."
- Botón **"Generar factura de prorrateo y guardar"**: crea factura interna con `es_prorrateo=true`, llama a `create_pro_invoice` en Stripe (acción que ya existe), y guarda el nuevo `max_usuarios`.
- Botón secundario **"Solo actualizar (sin cobrar)"** por si el super admin quiere regalar el extra.

### 5. Mejora visual del tab Facturación
- Mostrar columna **Método** (Stripe / Transferencia / Efectivo).
- Filas pagadas en verde claro, pendientes en amarillo, vencidas en rojo.
- Quitar la acción "Marcar pagada" si ya está pagada.

---

## Detalles técnicos

**Migración SQL (data + schema):**
```sql
UPDATE subscription_plans SET activo = true WHERE nombre IN ('Semestral', 'Anual');
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia_pago text;
```

**Archivos a tocar:**
- `src/components/admin/AdminEmpresaDetail.tsx` — rediseño tab Suscripción, banner de prorrateo, modal "Marcar como pagada", columna Método en facturación.
- `supabase/functions/admin-billing/index.ts` — nueva acción `mark_invoice_paid_out_of_band` (Stripe `paid_out_of_band: true` + update factura local + extender `current_period_end`), reutilizar `create_pro_invoice` para prorrateo.
- `src/integrations/supabase/types.ts` — regenerado tras migración.

**Lógica de extensión de período:**
- Si `facturas.es_prorrateo = false` y se marca pagada → `current_period_end += meses` (tomados de la metadata o de `(periodo_fin - periodo_inicio)`).
- Si `es_prorrateo = true` → no se mueve el período, solo se actualiza `max_usuarios`.

**Cálculo del prorrateo (cliente):**
```ts
const diasRest = Math.max(0, daysBetween(today, current_period_end));
const totalDias = daysBetween(current_period_start, current_period_end);
const proporcion = diasRest / totalDias;
const prorrateo = usuariosExtra * precioMensual * mesesDelPeriodo * proporcion;
```

---

## Lo que NO se toca (para mantenerlo acotado)
- Lógica de cobro automático recurrente vía Stripe (suscripciones nativas). Seguimos con facturas manuales por período.
- Renovación automática al vencer el período (eso requiere webhook, lo dejamos fuera).
- Multi-moneda y multi-tenant (no aplica aquí).

¿Procedo con todo, o quieres que primero haga solo el rediseño del tab + activación de planes y dejamos el pago manual y prorrateo para un segundo paso?
