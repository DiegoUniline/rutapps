

# Sistema de Cupones de Descuento

## Resumen

Crear un módulo completo de cupones de descuento que el Super Admin pueda gestionar desde el Panel Master, y que los clientes puedan aplicar al momento de pagar su suscripción.

## Modelo de datos

Nueva tabla `cupones`:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | uuid PK | |
| codigo | text UNIQUE | Codigo que escribe el cliente (ej: BIENVENIDO20) |
| descripcion | text | Nota interna |
| descuento_pct | numeric | Porcentaje de descuento (0-100) |
| planes_aplicables | text[] | ['mensual','semestral','anual'] o vacio = todos |
| uso_maximo | int | Cuantas veces se puede usar en total (null = ilimitado) |
| uso_por_empresa | int | Veces por empresa (1 = una sola vez) |
| usos_actuales | int default 0 | Contador global |
| meses_duracion | int | Cuantos meses aplica el descuento (null = mientras dure el plan) |
| acumulable | boolean default false | Si se suma al descuento especial de la empresa o lo reemplaza |
| activo | boolean default true | |
| vigencia_inicio | date | |
| vigencia_fin | date | |
| created_at | timestamptz | |

Nueva tabla `cupon_usos` (registro de quien lo uso):

| Campo | Tipo |
|-------|------|
| id | uuid PK |
| cupon_id | uuid FK |
| empresa_id | uuid |
| subscription_id | uuid |
| aplicado_at | timestamptz |
| meses_restantes | int | Cuantos meses le quedan de descuento |

RLS: `cupones` lectura publica para authenticated, escritura solo super_admin. `cupon_usos` tenant isolation + super_admin.

## Cambios en el Panel Master (Super Admin)

**Nuevo tab "Cupones"** en `SuperAdminPage.tsx` con componente `AdminCuponesTab.tsx`:
- Tabla con todos los cupones: codigo, descuento, usos/maximo, planes, acumulable, vigencia, activo
- Boton crear cupon con formulario completo
- Editar/desactivar cupones existentes
- Ver detalle de empresas que lo han usado

## Cambios en Mi Suscripcion (Cliente)

En `MiSuscripcionPage.tsx`:
- Campo "Tengo un cupon" con input + boton "Aplicar"
- Validacion en tiempo real: codigo existe, esta activo, en vigencia, no excede uso maximo, la empresa no lo ha usado mas de `uso_por_empresa` veces, el plan actual esta en `planes_aplicables`
- Si `acumulable = true`: el descuento del cupon se SUMA al `descuento_porcentaje` de la suscripcion
- Si `acumulable = false`: se usa el MAYOR entre el cupon y el descuento existente
- Mostrar desglose visual del descuento aplicado antes de confirmar pago

## Logica de cobro

En `billing-cycle/index.ts` y `create-checkout/index.ts`:
- Al generar factura, verificar si la empresa tiene un cupon activo en `cupon_usos` con `meses_restantes > 0`
- Aplicar el descuento segun la regla de acumulabilidad
- Decrementar `meses_restantes` cada ciclo
- Cuando `meses_restantes` llega a 0, el cupon deja de aplicar automaticamente

## Archivos a crear/modificar

1. **Migracion SQL** — Tablas `cupones` y `cupon_usos` con RLS
2. **`src/components/admin/AdminCuponesTab.tsx`** — CRUD completo de cupones
3. **`src/pages/SuperAdminPage.tsx`** — Agregar tab "Cupones"
4. **`src/pages/MiSuscripcionPage.tsx`** — Input de cupon + validacion + desglose
5. **`supabase/functions/billing-cycle/index.ts`** — Aplicar descuento de cupon al facturar
6. **`supabase/functions/create-checkout/index.ts`** — Considerar cupon en checkout Stripe

