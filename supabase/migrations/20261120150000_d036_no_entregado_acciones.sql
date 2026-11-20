-- D-036: una entrega NO ENTREGADA sigue con la mercancía en el camión: admite las mismas acciones
-- que una cargada (reasignar, quitar productos, cancelar) y la vista previa de reasignación
-- cuenta sus piezas como «a mover».
DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public._entrega_cargada_validar'::regproc) INTO v_def;
  IF position('''en_ruta'', ''no_entregado'')' in v_def) = 0 THEN
    v_new := replace(v_def, 'NOT IN (''asignado'', ''cargado'', ''en_ruta'')',
                            'NOT IN (''asignado'', ''cargado'', ''en_ruta'', ''no_entregado'')');
    IF v_new = v_def THEN RAISE EXCEPTION 'D-036: patrón no encontrado en _entrega_cargada_validar'; END IF;
    EXECUTE v_new;
  END IF;

  SELECT pg_get_functiondef('public.get_entregas_bulk_preview'::regproc) INTO v_def;
  IF position('''en_ruta'',''no_entregado'')' in v_def) = 0 THEN
    v_new := replace(v_def, 'IN (''cargado'',''en_ruta'')', 'IN (''cargado'',''en_ruta'',''no_entregado'')');
    v_new := replace(v_new, 'NOT IN (''cargado'',''en_ruta'',''no_entregado'',''hecho'',''cancelado'')',
                            'NOT IN (''cargado'',''en_ruta'',''no_entregado'',''hecho'',''cancelado'')');
    v_new := replace(v_new, 'NOT IN (''cargado'',''en_ruta'',''hecho'',''cancelado'')',
                            'NOT IN (''cargado'',''en_ruta'',''no_entregado'',''hecho'',''cancelado'')');
    IF v_new = v_def THEN RAISE EXCEPTION 'D-036: patrón no encontrado en get_entregas_bulk_preview'; END IF;
    EXECUTE v_new;
  END IF;
END
$do$;
