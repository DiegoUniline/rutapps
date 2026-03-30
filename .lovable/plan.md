

## Problem

The `togglePermiso` function creates optimistic records with fake IDs (`opt-...`). When the user clicks quickly:
1. First click: creates `opt-ventas-ver` → upsert fires in background
2. Second click: finds `opt-ventas-ver`, sees `id.startsWith('opt-')` is true → goes to upsert branch again
3. The upsert response replaces the record with real DB data, but timing issues cause state to get out of sync
4. When "Todo" is clicked, `toggleAllGroup` fetches fresh data from DB which may not include records still in-flight

Additionally, `togglePermiso` doesn't check `savingPermisos`, so individual clicks during bulk operations cause conflicts.

## Fix

Replace `togglePermiso` with the approach from the technical advisor — use a deterministic synthetic ID (`roleId:modulo:accion`) for optimistic entries, do the upsert, then patch state with the real DB record. Also add the `savingPermisos` guard.

### Changes in `src/pages/UsuariosPage.tsx` (lines 175-198)

Replace `togglePermiso` with:

```typescript
const togglePermiso = async (roleId: string, modulo: string, accion: string) => {
  if (savingPermisos) return;
  const current = permisos.find(p => p.role_id === roleId && p.modulo === modulo && p.accion === accion)?.permitido ?? false;
  const permitido = !current;

  // Optimistic update with deterministic key (not random temp ID)
  setPermisos(prev => {
    const i = prev.findIndex(p => p.role_id === roleId && p.modulo === modulo && p.accion === accion);
    if (i >= 0) return prev.map((p, idx) => idx === i ? { ...p, permitido } : p);
    return [...prev, { id: `${roleId}:${modulo}:${accion}`, role_id: roleId, modulo, accion, permitido }];
  });

  // Upsert using the DB unique constraint, then patch state with real record
  const { data, error } = await supabase
    .from('role_permisos')
    .upsert({ role_id: roleId, modulo, accion, permitido }, { onConflict: 'role_id,modulo,accion' })
    .select('id, role_id, modulo, accion, permitido')
    .single();

  if (!error && data) {
    setPermisos(prev => prev.map(p =>
      (p.role_id === roleId && p.modulo === modulo && p.accion === accion) ? data : p
    ));
  }
  notifyPermisosChanged();
};
```

Key differences from current code:
- **Deterministic ID** (`roleId:modulo:accion`) instead of `opt-modulo-accion` — prevents duplicate optimistic entries
- **No branching** on `id.startsWith('opt-')` — always upserts, always works
- **Patches real ID back** from `.select().single()` so subsequent clicks use the real DB ID
- **`savingPermisos` guard** prevents conflicts with bulk operations

