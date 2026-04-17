
El usuario propone una solución concreta: hacer la lista de emails 100% dependiente de un RPC en la base de datos (eliminando la dependencia de la Edge Function `admin-users` que está fallando silenciosamente). Voy a implementar exactamente eso.

## Plan

### 1. Migración SQL
- Recrear `get_empresa_user_emails(p_empresa_id)` de forma idempotente con JOIN explícito a `profiles` y permitir acceso al super admin.
- `GRANT EXECUTE ... TO authenticated`.
- (Omitiré `get_empresa_usuarios_full` por ahora — el frontend actual no la usa y agregarla sin consumirla es ruido. Si después quieres consolidar todo en una sola llamada lo hacemos en una segunda iteración.)

### 2. `src/hooks/useUsuarios.ts`
- Reemplazar `loadAuthUsers`: una sola llamada al RPC, log de error si falla, set directo (sin merge con edge function).
- Reemplazar `loadUsuarios`: hacer las 4 consultas en paralelo (`profiles`, `user_roles`, `almacenes`, RPC de emails) y setear `authUsers` directo del RPC.
- Quitar la llamada a la edge function `admin-users` para listar usuarios (queda solo para `create-user` y `set-password`).

### Archivos a tocar
- Nueva migración SQL (idempotente).
- `src/hooks/useUsuarios.ts`.

### Resultado esperado
Al recargar `/configuracion/usuarios`, los emails se obtienen directamente de la BD vía RPC seguro. Si algo falla, queda log claro en consola en vez de columna vacía silenciosa.
