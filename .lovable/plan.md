
Problema identificado con claridad:

- El sistema sí detecta correctamente que la empresa override está suspendida.
- La evidencia está en la request de suscripción para esa empresa, que regresa `status: "suspended"`.
- El banner rojo también confirma que el estado suspendido ya llegó al frontend.
- El fallo real está en el flujo de render de `src/App.tsx`.

Causa raíz:

- En `AppRoutes()` existe este orden:
  1. `if (subscription.isSuperAdmin) { ...render completo... }`
  2. `if (subscription.isBlocked) { ...shell bloqueado... }`
- Como el super admin sigue teniendo `isSuperAdmin = true` incluso durante override, entra primero al bloque de super admin y nunca alcanza el bloque de `isBlocked`.
- O sea: el cálculo de bloqueo ya funciona, pero la prioridad de condiciones lo anula visualmente.

Qué corregir:

1. Ajustar la condición de acceso en `src/App.tsx`
- Cambiar la prioridad para que el shell bloqueado se muestre cuando:
  - `subscription.isBlocked === true`
  - incluso si `subscription.isSuperAdmin === true`
  - siempre que exista `overrideEmpresaId`
- En práctica, el branch de bloqueo debe evaluarse antes del branch “super admin always has access”, o bien el branch de super admin debe excluir explícitamente el caso `override + blocked`.

2. Mantener comportamiento especial para super admin sin override
- Si el super admin está en su Panel Master normal, debe conservar acceso total.
- Solo debe ver el bloqueo real cuando está “viendo como empresa” mediante override.

3. Endurecer consistencia en guards secundarios
- Revisar `PermissionGuard.tsx` para que no dé bypass general por `isSuperAdmin` cuando exista override a empresa suspendida.
- Probablemente no es el origen principal, pero conviene alinearlo para evitar accesos residuales por navegación interna o rutas montadas después.

4. Validar navegación bloqueada
- El estado esperado en override suspendido debe permitir solo:
  - `/mi-suscripcion`
  - `/facturacion`
  - salir del override / volver al panel master
- Cualquier otra ruta debe redirigir al shell bloqueado o a `/mi-suscripcion`.

5. Verificación manual posterior
- Probar con “Huevos el Buen Precio”:
  - cambiar desde selector superior
  - confirmar que ya no se vea `/clientes`, botones “Nuevo”, tablas ni layout completo
  - confirmar que solo aparezca la vista restringida
  - confirmar que el botón “Volver a Panel Master” siga funcionando

Archivos a tocar:
- `src/App.tsx` — corrección principal del orden/prioridad de render
- `src/components/PermissionGuard.tsx` — alineación defensiva del bypass de super admin
- Opcionalmente revisar `src/components/AppLayout.tsx` si hubiera algún render residual dependiente de `isSuperAdmin`

Resultado esperado:
- Si una empresa está suspendida, el super admin en override verá exactamente la misma restricción que un usuario normal.
- El banner ya no coexistirá con todo el sistema habilitado.
- Se elimina la falsa sensación de bloqueo parcial.

Detalle técnico breve:
```text
Estado actual:
isSuperAdmin = true
isBlocked = true
overrideEmpresaId = empresa suspendida

Bug:
App.tsx evalúa primero isSuperAdmin -> render completo
nunca llega a isBlocked

Corrección:
priorizar isBlocked cuando hay override activo
o excluir override+blocked del branch super admin
```
