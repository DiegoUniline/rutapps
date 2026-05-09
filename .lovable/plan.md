## Análisis encontrado

RubiPets está activa ahora:
- `status = active`
- `acceso_bloqueado = false`
- `fecha_vencimiento = 2026-05-31`
- `current_period_end = 2026-05-31`
- Factura FAC-00003 de mayo está `pagada` y cubre hasta `2026-05-31`.

El problema se repite porque hay varios flujos distintos que pueden cambiar una suscripción pagada a `past_due` o `suspended` sin validar primero si ya existe una factura pagada que cubre el periodo actual. Además, el bloqueo visual del frontend no consulta `acceso_bloqueado` ni `fecha_vencimiento`, y puede bloquear por facturas antiguas vencidas si no quedan correctamente excluidas por periodo.

## Plan de corrección

1. Crear una función central de backend para calcular vigencia real
   - Determinar si una empresa tiene cobertura activa por cualquiera de estos datos:
     - `subscriptions.fecha_vencimiento >= hoy`
     - `subscriptions.current_period_end >= hoy`
     - factura `pagada` con `periodo_fin >= hoy`
     - suscripción manual activa
   - Usar zona horaria `America/Mexico_City`.

2. Blindar los jobs de cobro para no bloquear empresas pagadas
   - `daily-billing`: antes de marcar `past_due` o `acceso_bloqueado=true`, excluir cualquier empresa con cobertura real activa.
   - `billing-cycle`: antes de suspender `past_due`/`gracia`, revalidar cobertura pagada y, si está cubierta, restaurar a `active`.
   - `billing-notify`: antes de suspender, hacer la misma validación.
   - `subscription-cleanup`: evitar que marque `past_due` o `suspended` cuando la empresa tiene cobertura pagada vigente.

3. Corregir sincronización de factura pagada
   - Cuando una factura queda pagada, asegurar que `subscriptions` se actualice con:
     - `status = active`
     - `acceso_bloqueado = false`
     - `fecha_vencimiento = periodo_fin`
     - `current_period_end = periodo_fin`
   - Esto evita que el siguiente cron vuelva a bloquear por fechas nulas o atrasadas.

4. Corregir bloqueo en frontend
   - `useSubscription` debe leer `acceso_bloqueado` y `fecha_vencimiento` además de `status/current_period_end`.
   - El bloqueo debe depender de la vigencia real, no solo de `status`.
   - `useFacturaPendiente` debe ignorar facturas pendientes si la suscripción/factura pagada cubre ese periodo.

5. Reparar RubiPets y datos inconsistentes similares
   - Ejecutar actualización de datos para normalizar empresas con factura pagada vigente pero suscripción bloqueada o sin fecha de vencimiento.
   - RubiPets quedará explícitamente activa hasta el 31/05/2026.

6. Validación
   - Consultar RubiPets después de los cambios para confirmar que queda activa.
   - Revisar que los jobs ya no seleccionen a RubiPets como bloqueable mientras esté pagada.
   - Probar que el frontend ya no muestre pantalla de suspendida cuando hay cobertura vigente.