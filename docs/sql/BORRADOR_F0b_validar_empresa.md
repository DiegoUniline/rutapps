# BORRADOR F0b — validar empresa en funciones (NO aplicado)

Estado: 💡 PROPUESTO, pausado 2026-11-19 por prioridad del dueño (casos de edición pedido/entrega).

## Helper
- `fn_puede_empresa(p_empresa_id) returns boolean` y `fn_exigir_empresa(p_empresa_id)`:
  - pasa si `session_user <> 'authenticator'` (conexión directa/cron) o `auth.role() = 'service_role'`;
  - pasa si `auth.uid()` está en `super_admins`;
  - pasa si `p_empresa_id = get_my_empresa_id()`; si no, `42501`.

## Solo service_role (revocar authenticated)
wa_clientes_saldos, reconciliar_saldos_cliente, reconciliar_saldos_empresa, reserve_timbre, release_timbre,
confirm_timbre_reserve, deduct_timbre, generate_folio, recibir_linea_compra (sin uso desde el front; llamadas
internas desde funciones SECURITY DEFINER siguen funcionando).

## Guardas a inyectar al inicio (después del primer BEGIN)
| Función | Guarda |
|---|---|
| aplicar_cobro (v2, 11 args) | empresa = p_empresa_id; cliente y todas las `venta_id` de p_aplicaciones de esa empresa |
| registrar_saldo_inicial | empresa + cliente de la empresa |
| saldo_clientes_a_la_fecha (sql) | `AND fn_puede_empresa(p_empresa_id)` en el WHERE final |
| cerrar_pedido_parcial | empresa de la venta; `p_user_id := auth.uid()` si hay sesión |
| reabrir_pedido_parcial | empresa de la venta |
| surtir_linea_entrega / _parcial / _lotes, revertir_surtido_linea | empresa; entrega y línea pertenecen; almacén de la empresa |
| recibir_compra_linea_parcial | empresa; compra y línea pertenecen; almacén de la empresa |
| cancelar_traspaso | empresa del traspaso |
| asignar_lote_masivo | empresa + almacén de la empresa |
| next_folio | empresa |
| delete_empresa_cascade | solo super admin o service_role |
Ya validan: add_timbres, acreditar_timbres_pago, admin_reparar_promociones, delete_empresas_bulk, get_empresa_user_emails.
