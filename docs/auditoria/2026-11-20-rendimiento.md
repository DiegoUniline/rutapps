# Auditoría de rendimiento — 2026-11-20

Revisión de 1 378 consultas `.from()` y 124 `.rpc()` del front contra los índices de `supabase/migrations`.

## Aplicado
- `20261120020000_rendimiento_indices.sql`: devoluciones/devolucion_lineas (no tenían índices), FKs de cliente/vendedor/repartidor en ventas, entregas y cobros, trigramas para búsqueda «contiene» (folio de ventas/entregas, nombre/código de clientes/productos).
- `20261120040000_rendimiento_indices_2.sql`: compras, compra_lineas, pago_compras, traspasos, traspaso_lineas, cfdis, cfdi_lineas, venta_comisiones, ventas por vendedor, venta_lineas por empresa, venta_historial, entregas validadas, cargas, visitas, descargas, auditorías, gastos y caja.
- Front: buscador de Ventas con retardo de 300 ms; números de pestañas con conteo sin traer renglones; vista Productos filtra `venta_lineas.empresa_id`; sincronización de ruta con orden estable (`order id`) al paginar.

## Aplicado (3ª pasada)
- Buscador ⌘K: una sola RPC `buscar_global` con trigramas (antes ~20 consultas por tecla).
- Filtro de promoción: `ventas.tiene_promocion` con trigger e índice (antes listas de 10 000 ids).
- Saldos por cliente/proveedor agregados en la BD (`resumen_saldos_clientes`, `clientes_con_saldo`, `resumen_saldos_proveedores`).
- Listas completas paginadas: gastos, CFDI, conteos, auditorías, pagos a proveedor, órdenes de compra.
- Cambio de stock ya no recarga el catálogo completo.
- Operaciones atómicas: cobro de venta + cuentas, `eliminar_ventas` (D-035), `surtir_entrega`, `aprobar_auditoria`, `aplicar_pago_proveedor`.
- Reportes personalizados con ids en trozos de 200; Devoluciones consulta destinos/lotes solo de sus ids.
- Demanda «Surtir disponible»: ahora `surtir_pedido_disponible` (una llamada por pedido, 12 pedidos ≈ 0.36 s en BD; antes ~150 llamadas en serie) con barra de avance. Saldos iniciales (RPC por cliente con reporte de errores) se dejan así a propósito: cada renglón ya es atómico y el resultado parcial es el comportamiento deseado.

## Aplicado (4ª pasada)
- Facturas (CFDI) y Cotizaciones: mes actual por omisión, filtrado en el servidor (índice `cotizaciones (empresa_id, fecha)`).
- Ventas: conteos de pestañas 3 → 2 consultas (Activas = Todas − Canceladas); por tiempo real se recuentan como máximo cada 30 s (las acciones propias los refrescan al momento); un cobro ya no recarga la lista (el saldo llega por el canal de ventas).
- Kardex por ubicación: 90 días por omisión con producto; saldo inicial calculado en la BD (`kardex_saldo_inicial`, probado: 369/369 existencias cuadran).
- Entregas de ruta (vista del supervisor): pendientes + entregadas de 7 días; renglones en trozos de 200 (antes la URL larga fallaba en silencio y se veían vacías); clientes con columnas mínimas.
- Código muerto quitado (`CONFIRMO quitar código muerto`): `EntregasPage.tsx`, `lib/safe_sweep*.ts`, `lib/temp_sweep_tampico.ts`, `useVentas`, `useEntregasList`, `useCargas`, `useDevoluciones`.
- Comisiones generadas y CxC de ruta ya tenían ventana / columnas mínimas: sin cambio.

## Hallazgo de seguridad (no corregido, requiere CONFIRMO)
- `cotizaciones` y `cotizacion_lineas` tienen políticas `SELECT … TO anon, authenticated USING (true)`: cualquiera con la llave pública lee las cotizaciones de TODAS las empresas. Arreglo propuesto: quitar esas políticas y servir la cotización pública por RPC con su token.

## Pendiente
- Ninguno de la lista original (filas 1–4 atendidas en las pasadas 3 y 4).
