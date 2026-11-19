DO $$
DECLARE
  v_emp uuid;
  r record;
  d numeric; c numeric; grp text;
  vals jsonb := '{
    "Tipo 1": {"A":[0,10],  "B":[0,7],     "C":[0,7],  "D":[0,3]},
    "Tipo 2": {"A":[10,7],  "B":[8.5,5],   "C":[0,7],  "D":[0,3]},
    "Tipo 3": {"A":[20,5],  "B":[16,3],    "C":[0,7],  "D":[0,3]},
    "Tipo 4": {"A":[22.5,5],"B":[16,3],    "C":[10,5], "D":[0,3]},
    "Tipo 5": {"A":[26.5,3],"B":[18,3],    "C":[10,5], "D":[0,3]},
    "Tipo 6": {"A":[28.36,3],"B":[18,3],   "C":[16,3], "D":[0,3]},
    "Tipo 7": {"A":[30.89,3],"B":[21.03,3],"C":[18,3], "D":[0,3]}
  }'::jsonb;
BEGIN
  SELECT id INTO v_emp FROM empresas WHERE licencia = '53021303';

  -- 1) Quitar listas duplicadas apuntando a Tarifa General
  DELETE FROM lista_precios lp
  USING tarifas t
  WHERE lp.empresa_id = v_emp
    AND lp.tarifa_id = t.id
    AND t.nombre = 'Tarifa General'
    AND lp.nombre <> 'Tarifa General';

  -- 2) Corregir descuentos y comisiones por grupo
  FOR r IN
    SELECT tl.id, t.nombre AS lista, coalesce(array_length(tl.producto_ids,1),0) AS n
    FROM tarifa_lineas tl
    JOIN tarifas t ON t.id = tl.tarifa_id
    WHERE t.empresa_id = v_emp
  LOOP
    grp := CASE r.n WHEN 761 THEN 'A' WHEN 95 THEN 'B' WHEN 51 THEN 'C' WHEN 86 THEN 'D' ELSE NULL END;
    IF grp IS NULL OR vals -> r.lista IS NULL THEN CONTINUE; END IF;
    d := ((vals -> r.lista -> grp) ->> 0)::numeric;
    c := ((vals -> r.lista -> grp) ->> 1)::numeric;
    UPDATE tarifa_lineas SET descuento_pct = d, comision_pct = c WHERE id = r.id;
  END LOOP;
END $$;