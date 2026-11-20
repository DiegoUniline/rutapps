-- Surtir una entrega completa en UNA transacción: todos sus renglones + el cambio de estado.
-- Antes el front llamaba surtir_linea_entrega renglón por renglón y luego cambiaba el estado; si
-- fallaba a la mitad (stock insuficiente en el 3er producto) la entrega quedaba medio surtida.
-- p_lineas: [{ "id": <entrega_linea>, "cantidad": <surtir> }]
-- p_status_final: 'auto' (asignado si hay repartidor, si no surtido) · 'surtido' · 'cargado' · 'ninguno'

CREATE OR REPLACE FUNCTION public.surtir_entrega(
  p_entrega_id uuid,
  p_almacen_origen_id uuid,
  p_lineas jsonb,
  p_vendedor_ruta_id uuid DEFAULT NULL,
  p_status_final text DEFAULT 'auto'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_ent  public.entregas%ROWTYPE;
  v_line jsonb;
  v_el   record;
  v_cant numeric;
  v_n    int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_status_final NOT IN ('auto', 'surtido', 'cargado', 'ninguno') THEN
    RAISE EXCEPTION 'Estado final inválido' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ent FROM public.entregas WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_ent.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta entrega' USING ERRCODE = '42501';
  END IF;
  IF p_almacen_origen_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_origen_id AND empresa_id = v_ent.empresa_id) THEN
    RAISE EXCEPTION 'El almacén no es de esta empresa' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb)) LOOP
    SELECT id, producto_id INTO v_el
      FROM public.entrega_lineas
     WHERE id = NULLIF(v_line->>'id', '')::uuid AND entrega_id = p_entrega_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Renglón de otra entrega o inexistente' USING ERRCODE = '22023';
    END IF;
    v_cant := COALESCE((v_line->>'cantidad')::numeric, 0);
    IF v_cant <= 0 THEN CONTINUE; END IF;
    PERFORM public.surtir_linea_entrega(v_el.id, v_el.producto_id, p_almacen_origen_id, v_cant,
                                        p_entrega_id, v_ent.empresa_id, v_uid);
    v_n := v_n + 1;
  END LOOP;

  IF p_status_final = 'cargado' THEN
    UPDATE public.entregas SET status = 'cargado', fecha_carga = now() WHERE id = p_entrega_id;
  ELSIF p_status_final = 'surtido' OR (p_status_final = 'auto' AND p_vendedor_ruta_id IS NULL) THEN
    UPDATE public.entregas SET status = 'surtido', almacen_id = COALESCE(p_almacen_origen_id, almacen_id)
     WHERE id = p_entrega_id;
  ELSIF p_status_final = 'auto' THEN
    UPDATE public.entregas
       SET status = 'asignado', almacen_id = COALESCE(p_almacen_origen_id, almacen_id),
           vendedor_ruta_id = p_vendedor_ruta_id, fecha_asignacion = now()
     WHERE id = p_entrega_id;
  END IF;

  RETURN jsonb_build_object('entrega_id', p_entrega_id, 'surtidas', v_n);
END;
$function$;

REVOKE ALL ON FUNCTION public.surtir_entrega(uuid, uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_entrega(uuid, uuid, jsonb, uuid, text) TO authenticated;
