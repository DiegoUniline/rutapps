
# Módulo de Partners (Revendedores)

Sistema completo para que terceros promocionen Rutapp, generen cupones y reciban un % recurrente de cada empresa que refieran.

## Cómo funciona (resumen)

1. Tú (Super Admin) creas un **Partner** y le asignas su % base (ej. 25%).
2. El partner entra a su **panel** (`/partner`) y crea sus cupones (ej. `JUAN10` = 10% off).
3. El partner comparte: link `rutapp.mx/?ref=JUAN` o el código de cupón.
4. Una empresa se registra usando ese link/cupón → se atribuye al partner **de por vida**.
5. Cada vez que la empresa paga su suscripción → se calcula comisión:
   - **Comisión partner = (Partner % − Cupón %) × Monto cobrado**
   - Ej: Partner 25%, cupón 10%, factura $1000 cobrada $900 → comisión = 15% × $900 = $135
   - Si cupón ≥ partner % → comisión = 0 (no negativa)
6. Tú ves un panel admin con saldo a pagar por partner y marcas pagos manuales.

## Estructura

### Backend (4 tablas nuevas)

- **`partners`** — datos del partner: usuario asociado, nombre, email, teléfono, % comisión base, slug del link de referido (`?ref=slug`), estado (activo/inactivo), notas internas.
- **`partner_cupones`** — código, % descuento, vigencia, máximo de usos, usos actuales, activo. Pertenecen a 1 partner.
- **`partner_atribuciones`** — vincula `empresa_id` ↔ `partner_id` (1:1, fijada al registrarse). Guarda cupón usado y método (link/cupón/manual).
- **`partner_comisiones`** — un registro por cada cobro de suscripción atribuido: monto base, % partner, % cupón, monto comisión, status (pendiente/pagada), fecha pago, referencia.
- **`partner_pagos`** — registro de pagos manuales que tú haces al partner: monto, método, referencia, comisiones que cubre.

### Cambios en flujos existentes

- **Signup público** (`SignupPage` + edge `auto_create_trial_subscription`): leer `?ref=` de URL o cupón aplicado → crear `partner_atribuciones`. Aplicar descuento del cupón a la `subscription` (campo `descuento_porcentaje` ya existe).
- **Billing cycle** (edge `billing-cycle` / `daily-billing`): cuando se confirma un cobro exitoso de suscripción, si la empresa tiene atribución activa → insertar fila en `partner_comisiones` con el cálculo.
- **Landing/Login**: capturar `?ref=slug` en localStorage para que sobreviva hasta el signup.

### Frontend

**Para el Partner (`/partner/*`):**
- Login normal (su `user_id` está vinculado en `partners`)
- Dashboard: KPIs (empresas referidas activas, comisión del mes, total acumulado, total pagado, saldo pendiente)
- Mis empresas referidas: lista con estado de suscripción de cada una (sin datos sensibles, solo nombre/fecha alta/status)
- Mis cupones: CRUD (crear, activar/desactivar, ver usos)
- Mi link de referido: copiar URL + QR
- Comisiones: tabla por mes con detalle, filtro pagada/pendiente
- Pagos recibidos: historial de lo que le has pagado

**Para Super Admin (`/superadmin/partners`):**
- Lista de partners (CRUD): crear, editar %, dar de baja
- Vincular un usuario existente o crear cuenta nueva al crear partner
- Ver detalle de cada partner: empresas referidas, cupones, comisiones generadas, saldo a pagar
- Registrar pago: marca comisiones como pagadas y crea `partner_pagos`
- Ajustes manuales (agregar/quitar comisión)

### Permisos / Roles

- Nuevo flag `es_partner` o detección por existencia en tabla `partners` → al login redirige a `/partner` si NO tiene `empresa_id` (partners puros) o muestra un toggle si también tiene empresa.
- RLS estricta: partner solo ve sus propios datos. Super admin ve todo.

## Detalles técnicos

### Atribución (link + cupón)

```
LandingPage / SignupPage:
  useEffect: if (searchParams.ref) localStorage.setItem('rutapp_ref', ref)
  signup form: input opcional "Código de cupón"

Al crear empresa (trigger o edge):
  ref = localStorage.rutapp_ref
  cupon = form.cupon_code
  resolver partner_id desde ref O desde cupon
  insert partner_atribuciones(empresa_id, partner_id, cupon_id, metodo)
  if cupon: update subscriptions.descuento_porcentaje
```

### Cálculo de comisión (al cobrar)

```sql
-- En billing-cycle / stripe-webhook al confirmar pago:
INSERT INTO partner_comisiones (
  partner_id, empresa_id, periodo,
  monto_cobrado, partner_pct, cupon_pct,
  monto_comision, status
)
SELECT
  pa.partner_id, pa.empresa_id, '2026-05',
  monto_pagado,
  p.comision_pct,
  COALESCE(pc.descuento_pct, 0),
  monto_pagado * GREATEST(p.comision_pct - COALESCE(pc.descuento_pct, 0), 0) / 100,
  'pendiente'
FROM partner_atribuciones pa
JOIN partners p ON p.id = pa.partner_id
LEFT JOIN partner_cupones pc ON pc.id = pa.cupon_id
WHERE pa.empresa_id = $1 AND p.estado = 'activo';
```

### Rutas a crear

- `/partner` — dashboard
- `/partner/empresas` — empresas referidas
- `/partner/cupones` — gestión cupones
- `/partner/comisiones` — comisiones y pagos
- `/partner/perfil` — datos + link
- `/superadmin/partners` — admin de partners
- `/superadmin/partners/:id` — detalle + pagar

### RLS clave

- `partners`: SELECT/UPDATE para `auth.uid() = user_id` ó super admin
- `partner_cupones`: SELECT/INSERT/UPDATE si `partner_id` pertenece al usuario
- `partner_atribuciones`: SELECT solo de las propias o super admin
- `partner_comisiones`: SELECT propias o super admin (insert solo desde edge functions con service role)
- `partner_pagos`: SELECT propias, INSERT solo super admin

## Fuera de alcance (pueden venir después)

- Pagos automáticos (Stripe Connect) — por ahora todo manual
- Multi-tier (sub-partners, sub-comisiones)
- Caducidad de comisión a X meses (hoy es recurrente "para siempre")
- Reportes fiscales / generación CFDI al partner

## Orden de implementación sugerido

1. Migración: 5 tablas + RLS + trigger de atribución
2. Edge function update: agregar inserción de comisión en `billing-cycle`
3. Captura `?ref=` en Landing + campo cupón en Signup
4. Páginas Partner (dashboard + cupones + comisiones)
5. Páginas Super Admin (gestión partners + pagar)
6. QA end-to-end con un partner de prueba
