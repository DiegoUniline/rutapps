# Migración a nueva estructura de planes RutApp

Pasamos del modelo actual ($300/usuario × N usuarios con descuento por meses) a un modelo de **planes empaquetados con base + usuarios extra**, alineado al pitch comercial. Existing customers conservan su plan actual con mínimo 3 usuarios; nuevos contratos usan el modelo nuevo desde 1 usuario.

---

## 1. Modelo de precios (decidido)

Cada plan = **precio base fijo (incluye N usuarios) + $300 MXN/mes por usuario adicional**.

| Plan | Base/mes | Usuarios incluidos | Extra/usuario |
|---|---|---|---|
| Individual | $450 | 1 | $300 |
| Equipo ⭐ | $900 | 3 | $300 |
| Empresa | $1,500 | 5 | $300 |

En Stripe esto se modela con **2 line items por suscripción**:
- `price_base_<plan>` — qty 1 (precio fijo del plan)
- `price_extra_user` — qty = `max(0, total_usuarios − incluidos)` ($300/mes, compartido entre todos los planes)

Mensual por defecto. Semestral/Anual los deprecamos en el flujo de compra (los planes viejos quedan inactivos pero existentes siguen vivos).

---

## 2. Cambios en la BD

Migración:
- Agregar a `subscription_plans`:
  - `precio_base` numeric — precio fijo mensual del plan
  - `usuarios_incluidos` int — usuarios cubiertos por el precio base
  - `precio_extra_usuario` numeric — precio por usuario adicional
  - `stripe_price_id_extra` text — price id de Stripe para el add-on
  - `slug` text — `individual` | `equipo` | `empresa`
  - `orden` int — orden de despliegue
  - `popular` boolean — marca "Más popular"
- Insertar 3 planes nuevos (Individual, Equipo, Empresa) con `activo=true`.
- Marcar los planes legacy (Mensual/Semestral/Anual $300) con `activo=false` para que no aparezcan en la landing/checkout, pero quedan referenciados por subscripciones existentes.
- Mantener todas las suscripciones actuales intactas. Agregar columna `subscriptions.legacy_pricing boolean default false` y marcar `true` para todas las existentes — el billing engine las trata con el modelo viejo ($precio_por_usuario × max_usuarios, mínimo 3).

Los `price_base_*` y `stripe_price_id_extra` los llenamos después de crear los productos en Stripe (paso 4) con un `UPDATE`.

## 3. Productos en Stripe

Crear 4 prices mensuales recurrentes en MXN:
- `Plan Individual — base` → $450/mes
- `Plan Equipo — base` → $900/mes
- `Plan Empresa — base` → $1,500/mes
- `Usuario adicional` → $300/mes (compartido)

Los IDs resultantes se guardan en `subscription_plans.stripe_price_id` (base) y `stripe_price_id_extra` (add-on).

## 4. Edge functions

### `select-plan` (refactor)
- Acepta `plan_id` + `num_usuarios` (mínimo 1).
- Lee `usuarios_incluidos` y arma el checkout con 2 line items.
- El cálculo de `total` y de la factura local cambia a:
  `total = precio_base + max(0, num_usuarios − usuarios_incluidos) × precio_extra_usuario`
- Sigue generando factura local + WhatsApp + email igual que hoy.
- Borra el `Math.max(3, ...)` actual (eso era del modelo viejo).

### `create-trial-checkout`
- Mismo cambio: 2 line items, default a plan **Equipo** durante el trial-to-paid (más popular), pero permitiendo elegir.

### `stripe-webhook`
- Al recibir `customer.subscription.updated/created`: extraer cantidad del item add-on y sumar `usuarios_incluidos` del plan base para reconstruir `max_usuarios` en `subscriptions`.
- Soportar ambos modelos: si la suscripción tiene un único line item con `price = stripe_price_id` legacy → modelo viejo; si tiene 2 items → modelo nuevo.

### `billing-cycle` / `daily-billing` / `create-invoice-reminder`
- Helper compartido `calcSubscriptionTotal(sub, plan)` que decide:
  - `legacy_pricing=true` → `precio_por_usuario × max(3, max_usuarios)`
  - `legacy_pricing=false` → `precio_base + max(0, max_usuarios − usuarios_incluidos) × precio_extra_usuario`
- Toda generación de factura usa el helper.

### `admin-billing` y modales de admin
- Mismo helper para previsualización y aprobaciones manuales.

## 5. Frontend

### `src/pages/LandingPage.tsx`
Reemplazar sección `#pricing`:
- 3 cards (Individual, Equipo⭐, Empresa) con precio, "Ideal para", 6–8 bullets clave y CTA "Empezar ahora".
- Acordeón "Ver todo lo incluido" por card con la lista completa (incluye / capacitación / no incluye).
- Bloque "Capacitación incluida" — 3 columnas con sesiones.
- Bloque "Servicios adicionales" — Usuario extra ($300), Capacitación extra ($550/60 min), Desarrollos a cotizar.
- Tabla comparativa responsive (acordeón en móvil).
- Microcopy: "Cancela cuando quieras · Sin permanencia · 7 días de prueba".
- Mantener paleta actual.

### `src/pages/MiSuscripcionPage.tsx` + `CostoSimuladorCard` + `PlanSimuladorCard`
- Mostrar 3 cards de planes nuevos (los legacy solo se ven si el cliente ya está en uno).
- Selector de "Total de usuarios" (slider/stepper) que muestra desglose:
  `Base $X + Y usuarios extra × $300 = Total $Z/mes`
- Botón "Cambiar plan" usa `select-plan` con el nuevo `plan_id` + `num_usuarios`.
- Para clientes en plan legacy: banner "Estás en un plan anterior. Ver nuevos planes" con CTA para migrar (no forzado).

### `src/pages/CompletarRegistroPage.tsx` / signup
- Default trial sugiere plan **Equipo** con 3 usuarios.
- Permite elegir Individual desde 1 usuario.

### `src/components/PendingInvoiceModal.tsx` / `TrialCountdownBanner.tsx`
- Solo actualizar texto/ desglose si muestran precios calculados — la API ya devuelve el total correcto.

### Admin (`AdminSubscriptionsTab`, `AdminEmpresaDetail`, `AdminInvoicesTab`)
- Mostrar plan + usuarios incluidos + extras + total calculado.
- Permitir cambiar plan y `max_usuarios` para empresas en plan nuevo.

## 6. Compatibilidad y migración de datos

- **Empresas existentes:** `legacy_pricing=true`, conservan `plan_id` actual y `max_usuarios` con piso 3. Sin cambios en su facturación recurrente.
- **Nuevos signups (desde el deploy):** `legacy_pricing=false`, eligen entre los 3 planes nuevos, mínimo 1 usuario.
- **Cuando un cliente legacy elige uno de los nuevos planes** desde "Mi Suscripción": al confirmar, se cambia su subscripción Stripe a los nuevos prices, se setea `legacy_pricing=false`, `usuarios_incluidos` correspondiente y `max_usuarios` desde el formulario.

## 7. Orden de ejecución

1. **Migración BD** (nuevas columnas + planes nuevos + marcar legacy + flag `legacy_pricing`).
2. **Crear 4 prices en Stripe** y `UPDATE` en `subscription_plans` con los IDs.
3. **Refactor de edge functions** (`select-plan`, `create-trial-checkout`, `stripe-webhook`, `billing-cycle`, `daily-billing`, `create-invoice-reminder`, `admin-billing`) + helper `calcSubscriptionTotal`.
4. **Rediseño landing** (`LandingPage.tsx`).
5. **Rediseño Mi Suscripción** + simuladores.
6. **Ajustes signup / trial / banners / admin**.
7. **QA** con una empresa de prueba: signup → trial → checkout con Equipo (3 usuarios) → agregar 2 extras → verificar factura y webhook.

## 8. Preguntas antes de arrancar

1. ¿Confirmas que **Equipo** es el plan destacado como "Más popular"?
2. ¿Quieres que en el checkout de Empresa se ofrezca un CTA secundario **"Hablar con ventas"** (WhatsApp directo) en lugar de pago directo, o pago directo igual que los otros?
3. ¿Empresas legacy quedan **opt-in** (banner "migra al nuevo plan") o las migramos **automáticamente** al equivalente más cercano (≥3 usuarios → Equipo)? Recomiendo opt-in para no romper expectativas.
4. ¿Los 7 días de trial siguen igual y sin tarjeta, o quieres pedir tarjeta upfront ahora que el modelo es más simple?
