-- Surtir disponible para VARIOS pedidos en una sola llamada (la pantalla manda grupos de hasta 25).
-- Cada pedido corre en su propio bloque: si uno falla (p. ej. cancelado), se reporta su error y los
-- demás se guardan. Mismo cálculo que surtir_pedido_disponible, en el orden recibido.
CREATE OR REPLACE FUNCTION public.surtir_pedidos_disponible(
  p_pedido_ids uuid[],
  p_almacen_id uuid,
  p_vendedor_ruta_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id  uuid;
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_pedido_ids IS NULL OR array_length(p_pedido_ids, 1) IS NULL THEN
    RETURN v_out;
  END IF;
  IF array_length(p_pedido_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Máximo 100 pedidos por llamada' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY p_pedido_ids LOOP
    BEGIN
      v_res := public.surtir_pedido_disponible(v_id, p_almacen_id, p_vendedor_ruta_id);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object('resultado', 'error', 'error', SQLERRM, 'faltantes', '[]'::jsonb);
    END;
    v_out := v_out || jsonb_build_array(jsonb_build_object('pedido_id', v_id) || v_res);
  END LOOP;
  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.surtir_pedidos_disponible(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_pedidos_disponible(uuid[], uuid, uuid) TO authenticated;
