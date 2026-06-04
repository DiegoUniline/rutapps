
# Rediseño: Detalle de Empresa (Super Admin)

Reestructuro `src/components/admin/AdminEmpresaDetail.tsx` y agrego las piezas de datos que faltan para soportar el modelo de facturación por asientos + pagos manuales/Stripe.

## 1. Layout (full width)

```
┌────────────────────────────────────────────────────────────────┐
│ ← Empresas   🏢 Nombre Empresa           [Activa]  [Eliminar] │
│              Registrada 12/03/2026                             │
├────────────────────────────────────────────────────────────────┤
│ [Total a cobrar] [Total cobrado] [Saldo pend.] [Próximo cobro]│
├──────────────────────────────────┬─────────────────────────────┤
│  Datos de empresa (60%) [Editar]│  Suscripción actual (40%)   │
│  Email · Tel · RFC · Razón ...  │  Plan · Status · Asientos   │
│  (oculta vacíos)                │  [Editar plan]              │
├──────────────────────────────────┴─────────────────────────────┤
│ Tabs:  Usuarios | Facturas | Pagos | Histórico                 │
└────────────────────────────────────────────────────────────────┘
```

- Header full-width, KPIs en `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Saldo pendiente: rojo si >0, verde si 0.
- Datos vacíos se ocultan; si todo vacío → aviso único "Datos fiscales incompletos · Completar".
- Edición de datos en modal (`Dialog`), no inline.

## 2. Cambios de datos (Supabase)

Esquema actual ya tiene: `empresas`, `subscriptions`, `subscription_plans`, `facturas` (con campos de línea embebidos), `profiles`, `cobros` (pero ese `cobros` es de ventas de clientes, NO de pagos de suscripción).

**Migración nueva (`supabase/migrations/...`):**

1. `billing_pagos` — pagos hacia la plataforma:
   - `empresa_id`, `factura_id` (nullable), `monto`, `metodo` (`stripe|transferencia|efectivo|otro`), `referencia`, `fecha`, `aplicado_por` (uuid profile), `origen` (`automatico|manual`), `notas`.
2. `factura_items` — líneas por factura (concepto, cantidad, precio_unitario, subtotal). Se siembran desde los campos actuales de `facturas` en migración.
3. `billing_historial` — cambios de plan/suscripción/pagos: `empresa_id`, `entidad`, `entidad_id`, `accion`, `campo`, `valor_anterior`, `valor_nuevo`, `usuario_id`, `fecha`.
4. Añadir a `facturas.estado` los valores `parcial` y `fallida` (ya existe `pendiente|pagada|cancelada`).
5. RLS + GRANTs para super_admin (leer/escribir) y empresa (solo lectura propia). service_role para edge functions.

## 3. Suscripción + edición de plan

Tarjeta compacta:
- Plan, Status, Máx. usuarios, Base prepagada, Precio por usuario, Periodo inicio/fin, toggle "Acceso bloqueado" (con tooltip explicativo).

Botón "Editar plan" → `Dialog`:
- Select de plan (lee `subscription_plans`) que autocompleta `precio_usuario` y `ciclo`.
- Inputs: máx. usuarios, base prepagada, precio/usuario, fechas de periodo.
- Toggle acceso bloqueado.
- Al guardar: `UPDATE subscriptions` + un INSERT por cada campo cambiado en `billing_historial`.

## 4. Lógica de asientos extra

Implementada en edge function `admin-billing` (ya existe, la extiendo):

- **Base prepagada**: `base_usuarios` cubiertos al inicio del periodo, no generan cargos durante el periodo.
- **Asientos extra**: cada usuario activo por encima de `base_usuarios` → factura mensual recurrente con un `factura_items` que describe `"1 usuario adicional · periodo X–Y · $monto"`.
- **Alta** de usuario por encima de la base → programar/crear factura mensual del asiento (job mensual + creación inicial prorrateada al día de alta hasta fin de mes).
- **Baja** → marcar fin del asiento; no genera más cargos desde el ciclo siguiente. La base nunca se afecta.
- **Switch a prorrateo único**: punto único de cálculo en la función `calcularItemAsiento(meses_restantes)` con flag `prorrateo_unico`.

KPIs:
- Total a cobrar = `SUM(facturas.total)` no canceladas.
- Total cobrado = `SUM(billing_pagos.monto)`.
- Saldo = diferencia. Próximo cobro = próxima `factura` con `fecha_vencimiento` futura + nº usuarios activos actuales.

## 5. Cobros (Stripe + manual)

- **Stripe automático**: ya hay `stripe_invoice_id`. Webhook (o polling de `admin-billing`) marca factura `pagada` y crea `billing_pagos` con `metodo=stripe, origen=automatico`.
- **Fallo Stripe** → `estado=fallida`, badge rojo, botón "Aplicar pago".
- **Pago manual**: modal "Aplicar pago" → método, monto, referencia, fecha. Inserta `billing_pagos(origen=manual)`. Si `Σ pagos >= total` → `pagada`; si menor → `parcial`. Log en `billing_historial`.

## 6. Tabs

- **Usuarios**: tabla (`profiles` join `user_roles`): Nombre, Email, Teléfono, Rol (chip), Último acceso, Registro, toggle Activo, "Resetear contraseña". Botones superiores: "Forzar cambio de contraseña a todos", "Agregar usuario". Aviso de impacto en asientos al togglear.
- **Facturas**: tabla con folio, periodo, monto, método, estado (chip color), fecha. Filas expandibles → `factura_items`. Acciones: Ver / Aplicar pago / Cancelar.
- **Pagos**: tabla estado de cuenta: Fecha, Factura, Monto, Método, Origen, Aplicado por. Columna "saldo corriente" calculada en cliente.
- **Histórico**: lista cronológica de `billing_historial` ("Plan: Mensual → Anual", "Precio: 350 → 400", "Aplicado pago $1,200 · transferencia").

## 7. Estilo

- Mantener paleta y chips actuales.
- Fondo `bg-muted/30` entre secciones para jerarquía.
- Tablas con `hover:bg-muted/50`, filas cómodas (py-3).
- Responsive: KPIs 2x2 móvil, columnas se apilan, tabs scrollables horizontal.
- Ocultar campos vacíos en lugar de "—".

## Archivos a tocar

1. **Nuevo**: `supabase/migrations/<ts>_billing_pagos_items_historial.sql` (tablas + GRANT + RLS + seed desde facturas existentes).
2. **Reescribir**: `src/components/admin/AdminEmpresaDetail.tsx` — layout completo.
3. **Nuevos componentes** (en `src/components/admin/empresa-detail/`):
   - `HeaderEmpresa.tsx`
   - `KpiRow.tsx`
   - `DatosEmpresaCard.tsx` + `EditDatosDialog.tsx`
   - `SuscripcionCard.tsx` + `EditPlanDialog.tsx`
   - `UsuariosTab.tsx`, `FacturasTab.tsx` (con fila expandible), `PagosTab.tsx`, `HistorialTab.tsx`
   - `AplicarPagoDialog.tsx`
4. **Extender**: `supabase/functions/admin-billing/index.ts` — endpoints `aplicar_pago_manual`, `editar_plan`, `recalcular_asientos`, logging a `billing_historial`.
5. Hooks: `useEmpresaDetalle(empresaId)` que devuelva `{ empresa, suscripcion, facturas, pagos, usuarios, historial, kpis }` con React Query (queryKeys incluyen `empresa_id`).

## Aclaraciones antes de implementar

1. **Asientos extra**: ¿cobro mensual recurrente (default del plan) o prorrateo único hasta `periodo_fin`? Lo dejo configurable con flag, default = mensual recurrente según tu spec.
2. **Datos en `cobros` actual** son de ventas de clientes — no los toco; el módulo nuevo usa `billing_pagos` aparte.
3. ¿La tabla `factura_items` la siembro desde los campos `num_usuarios/precio_unitario/subtotal` actuales (1 ítem por factura existente)? Asumo que sí.
