DO $$
DECLARE
  v_emp uuid := (SELECT id FROM public.empresas WHERE licencia = '53021303');
  r RECORD;
  v_prods uuid[];
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Tipo 2','A',10.0,7.0),('Tipo 2','B',8.5,5.0),('Tipo 2','C',0.0,7.0),('Tipo 2','D',0.0,3.0),
      ('Tipo 3','A',20.0,5.0),('Tipo 3','B',16.0,3.0),('Tipo 3','C',0.0,7.0),('Tipo 3','D',0.0,3.0),
      ('Tipo 4','A',22.5,5.0),('Tipo 4','B',16.0,3.0),('Tipo 4','C',10.0,5.0),('Tipo 4','D',0.0,3.0),
      ('Tipo 5','A',26.5,3.0),('Tipo 5','B',18.0,3.0),('Tipo 5','C',10.0,5.0),('Tipo 5','D',0.0,3.0),
      ('Tipo 6','A',28.36,3.0),('Tipo 6','B',18.0,3.0),('Tipo 6','C',16.0,3.0),('Tipo 6','D',0.0,3.0)
    ) AS t(lista, grupo, desc_pct, com_pct)
  LOOP
    SELECT array_agg(p.id) INTO v_prods
    FROM public.productos p
    JOIN public.listas l ON l.id = p.lista_id
    WHERE p.empresa_id = v_emp AND l.empresa_id = v_emp AND l.nombre = r.grupo;

    IF v_prods IS NULL OR array_length(v_prods,1) IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.tarifa_lineas
      (tarifa_id, lista_precio_id, aplica_a, tipo_calculo, descuento_pct, margen_pct,
       precio, precio_minimo, descuento_max, comision_pct, base_precio, redondeo,
       producto_ids, clasificacion_ids, notas)
    SELECT lp.tarifa_id, lp.id, 'producto'::aplica_a_tarifa, 'descuento_precio'::tipo_calculo_tarifa,
           r.desc_pct, 0, 0, 0, 0, r.com_pct, 'sin_impuestos', 'ninguno',
           v_prods, '{}'::uuid[], 'Grupo ' || r.grupo
    FROM public.lista_precios lp
    WHERE lp.empresa_id = v_emp AND lp.nombre = r.lista;
  END LOOP;
END $$;