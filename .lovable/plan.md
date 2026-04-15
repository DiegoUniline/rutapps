<final-text>Problema confirmado

- En móvil sí se calcula el excedente, pero al guardar se rompe por una mutación de estado en `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`.
- `cuentasToApply` reutiliza referencias de `cuentasPendientes` y luego `cuenta.montoAplicar -= apply` va dejando esos montos en 0.
- Eso provoca dos fallas:
  1. el ticket termina calculando `pagoAplicado`, `saldoNuevo` y `cambio` como si no se hubiera abonado nada a deudas viejas;
  2. en móvil/offline no se actualizan de inmediato los `saldo_pendiente` locales de esas cuentas.
- Además, en escritorio todavía no existe esta lógica completa: `VentaCheckoutModal` y `PuntoVentaPage` siguen topando el pago al total de la venta actual, por eso el sobrante se trata como cambio y no como liquidación de adeudos.

Plan

1. Corregir la lógica base de distribución
- Extraer una función pura compartida para distribuir pagos:
  - primero a la venta actual,
  - después a cuentas pendientes en FIFO,
  - y al final calcular cambio real.
- Esa función devolverá un snapshot inmutable de aplicaciones por cobro y por venta, sin mutar estado React.

2. Reparar la venta móvil de ruta
- Reemplazar la mutación `cuenta.montoAplicar -= apply` por estructuras clonadas/snapshots.
- Guardar el resumen final de cobro antes de persistir (`saldoAnterior`, `pagoAplicado`, `saldoNuevo`, `montoRecibido`, `cambio`).
- Hacer que el ticket use ese resumen congelado y no los valores derivados de un estado ya mutado.
- Actualizar inmediatamente los saldos locales de cuentas viejas con los montos realmente aplicados, para que funcione bien también offline.

3. Llevar la misma lógica a ventas en escritorio
- `src/components/venta/VentaCheckoutModal.tsx`:
  - mostrar cuentas pendientes del cliente,
  - autoaplicar el excedente a deudas viejas,
  - recalcular total a cobrar, falta y cambio igual que en móvil.
- `src/pages/VentaForm/index.tsx`:
  - cambiar `handleCheckoutConfirm` para registrar cobros/aplicaciones repartidos entre venta actual y cuentas viejas, en lugar de usar solo `handleAddPago`.
- `src/pages/PuntoVentaPage.tsx`:
  - dejar de limitar el cobro a `totals.total`,
  - aplicar excedentes a adeudos del cliente,
  - corregir ticket y resumen de estado de cuenta.

4. Unificar el resumen de ticket/estado de cuenta
- Hacer que móvil y escritorio calculen:
  - saldo anterior,
  - pago aplicado a cuentas viejas,
  - nuevo saldo,
  - cambio
  desde el mismo resultado de distribución.
- Así el ticket ya no mostrará “todo como cambio” cuando sí hubo liquidación de deudas.

5. Validación
- Probar en móvil ruta:
  - venta pequeña + pago grande + saldo inicial pendiente,
  - múltiples cuentas pendientes,
  - pago mixto,
  - sin cuentas pendientes.
- Probar en escritorio:
  - checkout de venta directa,
  - POS,
  - caso con pago exacto,
  - caso con sobrante que liquida parcialmente una deuda,
  - caso con sobrante que liquida toda la deuda y deja cambio real.

Detalles técnicos

- Archivos principales:
  - `src/pages/ruta/RutaNuevaVenta/useRutaVenta.ts`
  - `src/pages/ruta/RutaNuevaVenta/index.tsx`
  - `src/components/venta/VentaCheckoutModal.tsx`
  - `src/pages/VentaForm/index.tsx`
  - `src/pages/PuntoVentaPage.tsx`
  - posiblemente un helper nuevo compartido en `src/lib/` o `src/pages/...` para la distribución.
- No espero cambios de base de datos; el backend ya tiene el recálculo de saldos por aplicaciones. El problema principal está en frontend y en la falta de paridad entre móvil y escritorio.</final-text>