

## Problem Analysis

When toggling "Todos" (select all) at group or module level, checkboxes deactivate instead of toggling correctly. The root cause is a **race condition between optimistic state updates and server reload**:

1. **Optimistic update** sets new state with temp IDs
2. `load(false)` immediately fetches from server, but the batch `Promise.all` writes may not all be committed yet
3. `setPermisos(p.data)` in `load()` **overwrites** the optimistic state with potentially stale server data
4. Additionally, `groupPerms`/`modulePerms` are captured from state **before** the optimistic update, so the batch persist logic may try to insert records that already exist as temp entries

## Fix Plan

### File: `src/pages/UsuariosPage.tsx`

**1. Remove `load(false)` from both `toggleAllGroup` and `toggleAllModule`**
- The optimistic update already handles the UI state correctly
- Instead, after `Promise.all(ops)`, just call `load(false)` but **without** setting permisos optimistically beforehand — OR — keep optimistic but skip reload

**2. Better approach: Remove optimistic updates, use loading state + full reload**
- Set a `saving` flag to disable checkboxes during save
- Run all batch operations via `Promise.all`
- Call `load(false)` only after ALL operations complete
- This eliminates the race condition entirely

**3. Concrete changes:**
- Add a `savingPermisos` state boolean
- In `toggleAllGroup` and `toggleAllModule`:
  - Set `savingPermisos = true`
  - Remove the optimistic `setPermisos` call
  - `await Promise.all(ops)`
  - `await load(false)` 
  - Set `savingPermisos = false`
  - Call `notifyPermisosChanged()`
- Disable all checkboxes when `savingPermisos` is true
- This is simpler and more reliable than trying to sync optimistic + server state

