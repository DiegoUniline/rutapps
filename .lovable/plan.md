

## Diagnóstico: Por qué no cuadran los números de liquidación

### Problema raíz: Confusión de IDs entre `profiles.id` y `vendedores.id`

Hay **dos IDs distintos** en juego:
- `profiles.id` — el ID del perfil del usuario
- `vendedores.id` — el ID en la tabla espejo `vendedores` (sincronizada por trigger)
- `profiles.vendedor_id` — apunta a `vendedores.id`

**En `NuevaDescargaForm` (crear liquidación):**
- El selector de usuario usa `profiles.id` como valor (`vendedorId`)
- Las consultas de **ventas** y **gastos** filtran por `.eq('vendedor_id', vendedorId)` — pero `ventas.vendedor_id` referencia `vendedores.id`, NO `profiles.id`
- Resultado: al crear la liquidación, puede traer ventas de otro vendedor o ventas de más, calculando un `efectivo_esperado` incorrecto ($30,175) que se guarda en la BD

**En `DescargaDetalle` (ver liquidación):**
- Recalcula en vivo con los mismos queries, pero el `descarga.vendedor_id` guardado es `profiles.id` (incorrecto)
- Los cobros sí se buscan correctamente vía `profiles.vendedor_id → user_id`
- Stock del almacén busca con `.eq('id', descarga.vendedor_id)` en profiles — usa `profiles.id`, que sería correcto solo si el vendedor_id guardado fuera profiles.id

Esto explica las discrepancias:
- **Tabla**: Esperado $30,175 (valor guardado con query incorrecto)
- **Modal**: Esperado $17,035 (recalculado, posiblemente también incorrecto pero con datos diferentes)

### Plan de corrección

**Archivo: `src/pages/DescargasPage.tsx`**

**1. Corregir `NuevaDescargaForm` — consultar `vendedor_id` del profile**

Cambiar la consulta de profiles para incluir `vendedor_id`:
```typescript
.select('id, user_id, nombre, vendedor_id')
```

Crear variable para el ID correcto de vendedores:
```typescript
const vendedorRealId = selectedProfile?.vendedor_id ?? vendedorId;
```

Usar `vendedorRealId` en:
- Query de ventas (`.eq('vendedor_id', vendedorRealId)`)
- Query de gastos (`.eq('vendedor_id', vendedorRealId)`)
- Query de overlap check (`.eq('vendedor_id', vendedorRealId)`)
- Insert de descarga_ruta (`vendedor_id: vendedorRealId`)

Mantener `selectedUserId` (profiles.user_id) para cobros — ya está correcto.

**2. Corregir `DescargaDetalle` — consistencia en stock lookup**

Línea 168: el query de stock busca almacén con `.eq('id', descarga.vendedor_id)` en profiles. Pero si ahora guardamos `vendedores.id`, necesita buscar por `.eq('vendedor_id', descarga.vendedor_id)` en profiles (igual que la query de cobros en línea 123).

**3. Sin cambios en la tabla principal**

La tabla (línea 1306) lee `d.efectivo_esperado` de la BD — una vez que se guarde correctamente, los números cuadrarán entre tabla y detalle.

### Resultado esperado

- Los números de "Efectivo esperado" coincidirán entre la tabla, el modal de detalle, el ticket y el PDF
- Las ventas/cobros/gastos se consultarán con los IDs correctos
- Las liquidaciones futuras se guardarán con valores correctos

