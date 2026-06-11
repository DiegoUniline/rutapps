## Problema

Al cancelar un cobro:
- La venta sigue mostrando "Pagado $3000 / Saldo $0" en el detalle.
- Reportes, cortes de caja y liquidaciones probablemente siguen contando ese cobro cancelado.

**Causa raíz (verificado en BD):**
1. **No existe ningún trigger** en `cobros` ni en `cobro_aplicaciones` (consulté `information_schema.triggers` — vacío). El supuesto `trg_recalc_venta_saldo` no está. Por eso `ventas.saldo_pendiente` nunca se recalcula al cancelar un cobro.
2. El frontend (`useVentaForm`, `VentaExpandedRow`, reportes, cortes, etc.) consulta `cobro_aplicaciones` sin filtrar por `cobros.status`, así que suma los cancelados.

(En la BD actual la venta tiene `saldo_pendiente=3000` por coincidencia — se quedó con el valor inicial; pero el UI muestra $0 porque calcula `total - sum(monto_aplicado)` sin filtrar.)

## Solución

### 1. Autoridad en la base de datos (migración)

Crear función + triggers que mantengan `ventas.saldo_pendiente` siempre correcto, ignorando cobros cancelados:

```text
fn_recalc_venta_saldo(p_venta_id uuid):
  UPDATE ventas SET saldo_pendiente = total - COALESCE((
    SELECT SUM(ca.monto_aplicado)
    FROM cobro_aplicaciones ca
    JOIN cobros c ON c.id = ca.cobro_id
    WHERE ca.venta_id = p_venta_id
      AND COALESCE(c.status,'activo') <> 'cancelado'
  ),0)
  WHERE id = p_venta_id;
```

Triggers:
- `cobro_aplicaciones` AFTER INSERT/UPDATE/DELETE → recalcula la(s) venta(s) afectada(s).
- `cobros` AFTER UPDATE OF status → recalcula todas las ventas ligadas vía `cobro_aplicaciones`.

Además, un backfill único: recalcular `saldo_pendiente` de todas las ventas existentes para corregir datos históricos.

### 2. Helper único en frontend

Crear `src/lib/cobrosFilters.ts` con:
- `isCobroActivo(c)` — `(c?.status ?? 'activo') !== 'cancelado'`.
- `sumAplicacionesActivas(apps)` — suma `monto_aplicado` ignorando cancelados (requiere que el select incluya `cobros(status)`).

### 3. Aplicar filtro en todos los puntos que totalizan pagos

Auditar y ajustar los selects para incluir `cobros(status)` y filtrar cancelados al sumar/listar:

- `src/pages/VentaForm/useVentaForm.ts` — `pagosData`, `totalPagado`, `saldoPendiente`. Marcar visualmente cobros cancelados en la pestaña Pagos (no sumarlos).
- `src/pages/VentaForm/VentaPdfHandler.ts` y `src/lib/ventaPdfFromId.ts` — excluir cancelados del PDF de venta.
- `src/pages/ventas/VentaExpandedRow.tsx` — totales y fila "Total pagado".
- `src/hooks/useVentas.ts` — agregados de pagado por venta.
- `src/pages/EstadoCuentaClientePage.tsx` — estado de cuenta del cliente.
- `src/pages/AplicarPagosPage.tsx` — saldos pendientes (ya debería usar `ventas.saldo_pendiente`, verificar).
- **Cortes / Caja:** `src/hooks/useCajaTurno.ts`, `src/components/pos/VentasTurnoModal.tsx`, `src/pages/PosAdminPage.tsx`.
- **Liquidación de ruta:** `src/pages/ruta/RutaCobrar.tsx`, `src/pages/ruta/RutaEntregaDetalle.tsx`, `src/pages/MonitorRutasPage.tsx`, `src/components/reportes/ReporteDiarioRuta.tsx`.
- **Reportes / dashboards:** `src/hooks/useReportesData.ts`, `src/lib/reportesPersonalizados.ts`, `src/hooks/useDashboardData.ts`, `src/hooks/dashboard/useDashboardEquipo.ts`, `src/pages/SupervisorDashboardPage.tsx`, `src/pages/DescargasPage.tsx`.
- `src/pages/CobranzaPage.tsx` — ya filtra cancelados de totales (hecho en cambio previo); verificar.
- Sync offline: `src/lib/offlineSync.ts`, `src/lib/offlineDb.ts`, `src/lib/offlineBackup.ts` — propagar status para que la lógica offline también lo respete.

### 4. UI del detalle de venta

En la pestaña Pagos del detalle, listar también los cobros cancelados con badge "Cancelado" y `line-through`, pero excluirlos de "Total pagado" y "Saldo pendiente".

### 5. Verificación

- Recalcular la venta `VTA-0001` (e3cdcb82…): debe quedar `saldo_pendiente = 3000`.
- Crear cobro → cancelarlo → confirmar que en BD, detalle, lista de ventas, cobranza, estado de cuenta, corte de caja, liquidación de ruta y reportes el saldo vuelve al original y los totales no incluyen el cancelado.

### Notas

- No tocar `auth/storage/realtime` schemas.
- No cambia lógica de negocio fuera del manejo de cancelados.
- El trigger es la única fuente de verdad para `saldo_pendiente`; el frontend solo lee.
