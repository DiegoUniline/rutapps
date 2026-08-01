DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM public.empresas WHERE licencia = '53021303';
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'empresa no encontrada'; END IF;

  UPDATE public.tarifa_lineas tl
  SET aplica_a = 'producto',
      producto_ids = COALESCE((
        SELECT array_agg(p.id)
        FROM public.productos p
        JOIN public.listas l ON l.id = p.lista_id
        WHERE p.empresa_id = v_empresa
          AND l.empresa_id = v_empresa
          AND l.nombre = c.nombre
      ), '{}'::uuid[]),
      clasificacion_ids = '{}'::uuid[]
  FROM public.tarifas t, public.clasificaciones c
  WHERE t.id = tl.tarifa_id
    AND t.empresa_id = v_empresa
    AND tl.aplica_a = 'categoria'
    AND c.empresa_id = v_empresa
    AND c.nombre IN ('A','B','C','D')
    AND c.id = tl.clasificacion_ids[1];

  DELETE FROM public.clasificaciones c
  WHERE c.empresa_id = v_empresa
    AND c.nombre IN ('A','B','C','D')
    AND NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.clasificacion_id = c.id);
END $$;