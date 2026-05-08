# Fix: saldo_pendiente desactualizado (CLI-0153 muestra 3,180 cuando debería ser 2,000)

## Diagnóstico (confirmado en BD)

Cliente CLI-0153 (ARELY COREA) tiene 4 ventas activas:

| Folio | Total | Aplicado real | Saldo BD | Saldo correcto |
|---|---|---|---|---|
| SAL-0007 | 610 | 610 | 0 | 0 |
| VTA-0060 | 1,180 | 1,780 (mal aplicado) | 580 | 0 |
| VTA-0370 | 600 | 0 | 600 | 0 |
| VTA-0533 | 2,000 | 0 | 2,000 | 2,000 |
| Total | | | **3,180** | **2,000** |

**Causa raíz**: dos mecanismos pelean por escribir `saldo_pendiente`:

1. **Trigger `trg_recalc_venta_saldo`** (correcto): recalcula `total - SUM(aplicaciones activas)` después de cada INSERT/UPDATE/DELETE en `cobro_aplicaciones`.
2. **UPDATE manual del cliente** (frágil) en `RutaCobrar.tsx`, `useVentaDetalle.ts`, `AplicarPagosPage.tsx`, `useVentaForm.ts`, etc.: usa `saldo_pendiente_local - montoAplicado` con datos a veces stale del cache.

Si el cliente actualiza una venta a la que en realidad no se aplicó el cobro (por desincronización), ese saldo queda incorrecto y el trigger no lo corrige porque nunca se insertó la aplicación correspondiente. Además se aplicó por error 600 extra a VTA-0060.

## Fix (3 pasos)

### 1. Migración: trigger como única fuente de verdad + función de reconciliación

- Asegurar que `trg_recalc_venta_saldo` corra también si `cobros.status` cambia (cancelación/reactivación).
- Agregar trigger en `cobros` que recalcule todas las ventas afectadas cuando cambia `status`.
- Crear función `public.reconciliar_saldos_cliente(p_cliente_id uuid)` SECURITY DEFINER que recalcule todas las ventas del cliente desde `cobro_aplicaciones`.
- Crear función `public.reconciliar_saldos_empresa(p_empresa_id uuid)` para corrida masiva.
- **Ejecutar reconciliación inmediata** para CLI-0153 y todas las empresas en la migración.

### 2. RPC: aplicar cobros atómicamente

Crear `public.aplicar_cobro(p_empresa_id, p_cliente_id, p_monto, p_metodo, p_referencia, p_fecha, p_aplicaciones jsonb)` que:
- Valide totales (suma de aplicaciones ≤ monto del cobro).
- Cree `cobros` + N `cobro_aplicaciones` en una sola transacción.
- Devuelva `{ cobro_id, ventas_actualizadas }` con saldos finales recalculados por trigger.
- Reemplaza la lógica dispersa que cada pantalla replica (y donde se introducen los bugs).

### 3. Parche TypeScript: dejar de escribir `saldo_pendiente` desde el cliente

Quitar todos los `update({ saldo_pendiente: ... })` del lado cliente que vienen de aplicar pagos. El trigger recalcula automáticamente. Archivos a tocar:

- `src/pages/ruta/RutaCobrar.tsx` (línea 171)
- `src/pages/ruta/RutaVentaDetalle/useVentaDetalle.ts` (líneas 181, 196, 198)
- `src/pages/AplicarPagosPage.tsx` (línea 204)
- `src/pages/VentaForm/useVentaForm.ts` (línea 565)
- `src/pages/PuntoVentaPage.tsx` (flujo de cobro a ventas existentes)
- `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts` (donde aplique)

Donde cree sentido, reemplazar el flujo manual por `supabase.rpc('aplicar_cobro', ...)`.

**Excepciones que SÍ deben seguir escribiendo `saldo_pendiente` desde cliente**:
- Crear venta nueva (init = total).
- Editar líneas de venta (recalcula `total` y reinicia `saldo_pendiente = total - SUM(aplicaciones)`).
- Cancelar venta (saldo = 0).

Para offline (queueOperation): mantener el UPDATE optimista pero al volver online ejecutar reconciliación del cliente.

## Detalles técnicos

```sql
-- Trigger en cobros para cancelación
CREATE OR REPLACE FUNCTION public.recalc_ventas_cobro_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.ventas v
    SET saldo_pendiente = GREATEST(0, COALESCE(v.total,0) - COALESCE((
      SELECT SUM(ca.monto_aplicado) FROM cobro_aplicaciones ca
      JOIN cobros c ON c.id=ca.cobro_id
      WHERE ca.venta_id=v.id AND c.status<>'cancelado'),0))
    WHERE v.id IN (SELECT venta_id FROM cobro_aplicaciones WHERE cobro_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cobros_status_recalc
AFTER UPDATE OF status ON cobros
FOR EACH ROW EXECUTE FUNCTION recalc_ventas_cobro_status();
```

```sql
-- Reconciliación masiva
CREATE OR REPLACE FUNCTION public.reconciliar_saldos_empresa(p_empresa_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH agg AS (
    SELECT v.id, v.total - COALESCE(SUM(ca.monto_aplicado) FILTER (WHERE c.status<>'cancelado'),0) AS nuevo
    FROM ventas v
    LEFT JOIN cobro_aplicaciones ca ON ca.venta_id=v.id
    LEFT JOIN cobros c ON c.id=ca.cobro_id
    WHERE v.empresa_id=p_empresa_id AND v.status<>'cancelado'
    GROUP BY v.id
  )
  UPDATE ventas v SET saldo_pendiente=GREATEST(0,a.nuevo)
  FROM agg a WHERE a.id=v.id AND v.saldo_pendiente IS DISTINCT FROM GREATEST(0,a.nuevo);
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
```

Llamada inmediata en migración:
```sql
SELECT public.reconciliar_saldos_empresa(id) FROM empresas;
```

## Riesgos y mitigaciones

- **Offline**: el UPDATE optimista local sigue mostrando lo correcto al usuario; al sincronizar, las aplicaciones se insertan y el trigger reconcilia.
- **Cobros eliminados (DELETE en cobros)**: agregar trigger BEFORE DELETE que primero borre aplicaciones (cascada ya existe vía FK) — el trigger en cobro_aplicaciones recalcula. Verificar FK.
- **Performance**: la reconciliación masiva es una sola pasada agregada por empresa, O(ventas).

## Resultado esperado

- CLI-0153 saldo total = 2,000 L (solo VTA-0533).
- Cualquier nuevo cobro mantiene la consistencia automáticamente.
- Cero "ventas con saldo fantasma".
