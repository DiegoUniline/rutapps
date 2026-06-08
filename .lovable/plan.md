# Fix: "Cuenta suspendida" falso en datos móviles

## Problema

Distribuidora e Inversiones Salgado tiene en BD: `status='active'`, `acceso_bloqueado=false`, sin facturas pendientes. Sin embargo aparece "Cuenta suspendida" al usar datos móviles, mientras que en Wi-Fi funciona.

## Causa raíz

En `src/hooks/useSubscription.ts` (líneas 60-71), cuando `supabase.from('subscriptions').select(...)` devuelve un error de red (común en conexiones móviles inestables), Supabase retorna `{ data: null, error: PostgrestError }` **sin lanzar excepción**. El código actual hace:

```ts
if (error || !sub) {
  const state = { ..., isBlocked: !sub, ... }; // → true
  writeCache(userId, empresaId, state);        // ← persiste el bloqueo falso
  return state;
}
```

Esto provoca dos efectos:
1. Marca la cuenta como bloqueada en respuesta a un fallo de red.
2. Guarda ese estado erróneo en `localStorage`, así que persiste incluso al reconectar.

El `catch` externo solo cubre excepciones lanzadas (ej. `TypeError: failed to fetch`), no errores devueltos por Supabase.

El mismo patrón existe en `useFacturaPendiente.ts`: si la query falla, podría llegar a evaluar como factura pendiente vencida según el contexto.

## Cambios propuestos

### 1. `src/hooks/useSubscription.ts`

- Distinguir entre "no hay suscripción" (sub legítimamente null sin error) y "no se pudo consultar" (error de red).
- Si hay `error`, tratarlo como fallo de red: NO bloquear, NO sobrescribir cache. Usar cache previo si existe; de lo contrario devolver estado offline neutro (`isBlocked: false`).
- Solo marcar `isBlocked: true` cuando la consulta fue exitosa y realmente no existe fila de subscription para la empresa (caso real de empresa sin suscripción).
- Asegurar que cualquier branch que devuelva por error de red NO llame a `writeCache` para no contaminar el cache con un estado de bloqueo falso.

### 2. `src/hooks/useFacturaPendiente.ts`

- Capturar errores de las dos consultas paralelas. Si alguna falla, retornar `EMPTY` (no bloquear). Esto evita que un fallo intermitente de red dispare `shouldBlock=true`.

### 3. Limpieza preventiva del cache contaminado

En `src/App.tsx` (ya existe un effect en líneas 233-245 que limpia el cache cuando `subscription.status === 'active'`), confirmar que también se ejecute después del fix para borrar estados `isBlocked: true` cacheados durante el bug.

## Resultado esperado

- Salgado y cualquier empresa activa siguen entrando normalmente sin importar Wi-Fi o datos móviles.
- Ante una red inestable, la app muestra carga / usa último estado conocido en lugar de bloquear.
- Empresas realmente suspendidas (`acceso_bloqueado=true` o `status` cancelado) siguen siendo bloqueadas correctamente porque ese branch requiere respuesta exitosa del servidor.

## Fuera de alcance

- Lógica de daily-billing, periodo de gracia, generación de facturas.
- Cambios en RLS o backend (el problema es 100% cliente).
