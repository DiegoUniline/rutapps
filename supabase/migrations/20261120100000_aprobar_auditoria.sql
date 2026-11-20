-- Aprobar auditoría en UNA transacción. Antes el navegador, renglón por renglón, leía el stock,
-- lo sobrescribía (upsert), insertaba movimiento y ajuste y marcaba la línea: si fallaba a la
-- mitad quedaba medio ajustada, y entre la lectura y la escritura se podía perder una venta.
-- Ahora usa aplicar_ajuste_inventario (bloquea existencias, mueve solo la diferencia, kardex).
-- p_ajustes: [{ "linea_id": uuid, "ajustar": bool, "motivo": text }]

CREATE OR REPLACE FUNCTION public.aprobar_auditoria(p_auditoria_id uuid, p_ajustes jsonb, p_motivo_global text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_aud  public.auditorias%ROWTYPE;
  v_prof uuid;
  g      record;
  v_n    int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_aud FROM public.auditorias WHERE id = p_auditoria_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auditoría no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_aud.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta auditoría' USING ERRCODE = '42501';
  END IF;
  IF v_aud.status::text = 'aprobada' THEN
    RAISE EXCEPTION 'La auditoría ya está aprobada' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _aud (linea_id uuid PRIMARY KEY, ajustar boolean, motivo text) ON COMMIT DROP;
  DELETE FROM _aud WHERE true;
  INSERT INTO _aud (linea_id, ajustar, motivo)
  SELECT DISTINCT ON ((x->>'linea_id')::uuid) (x->>'linea_id')::uuid, COALESCE((x->>'ajustar')::boolean, false),
         COALESCE(NULLIF(btrim(x->>'motivo'), ''), NULLIF(btrim(p_motivo_global), ''))
    FROM jsonb_array_elements(COALESCE(p_ajustes, '[]'::jsonb)) x
   WHERE NULLIF(x->>'linea_id', '') IS NOT NULL;
  IF EXISTS (SELECT 1 FROM _aud a LEFT JOIN public.auditoria_lineas l ON l.id = a.linea_id
              WHERE l.id IS NULL OR l.auditoria_id <> p_auditoria_id) THEN
    RAISE EXCEPTION 'Hay renglones que no son de esta auditoría' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM _aud WHERE ajustar) THEN
    IF v_aud.almacen_id IS NULL THEN
      RAISE EXCEPTION 'La auditoría no tiene almacén: no se puede ajustar existencias' USING ERRCODE = '22023';
    END IF;
    -- Un ajuste por motivo (aplicar_ajuste_inventario lleva un motivo por lote).
    FOR g IN
      SELECT COALESCE(a.motivo, 'Ajuste por auditoría') AS motivo,
             jsonb_agg(jsonb_build_object('producto_id', l.producto_id, 'cantidad_nueva', l.cantidad_real)) AS lineas
        FROM _aud a JOIN public.auditoria_lineas l ON l.id = a.linea_id
       WHERE a.ajustar AND l.cantidad_real IS NOT NULL
       GROUP BY 1
    LOOP
      PERFORM public.aplicar_ajuste_inventario(v_aud.almacen_id,
        'Auditoría ' || COALESCE(v_aud.nombre, '') || ': ' || g.motivo, g.lineas, false);
      v_n := v_n + jsonb_array_length(g.lineas);
    END LOOP;
    UPDATE public.auditoria_lineas l SET ajustado = true
      FROM _aud a WHERE a.linea_id = l.id AND a.ajustar AND l.cantidad_real IS NOT NULL;
  END IF;

  UPDATE public.auditoria_lineas l SET notas = COALESCE(a.motivo, 'No se ajustó')
    FROM _aud a WHERE a.linea_id = l.id AND NOT a.ajustar;

  SELECT id INTO v_prof FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  UPDATE public.auditorias
     SET status = 'aprobada', aprobado_por = v_prof, fecha_aprobacion = now(),
         notas_supervisor = NULLIF(btrim(COALESCE(p_motivo_global, '')), '')
   WHERE id = p_auditoria_id;

  RETURN jsonb_build_object('auditoria_id', p_auditoria_id, 'ajustados', v_n);
END;
$function$;

REVOKE ALL ON FUNCTION public.aprobar_auditoria(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_auditoria(uuid, jsonb, text) TO authenticated;
