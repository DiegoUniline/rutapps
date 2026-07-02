-- DESCARGA DE CAMIÓN (conteo físico de producto al liquidar). OPCIONAL por corte.
--
-- Regla de negocio (confirmada con el dueño):
--  - En el corte, el vendedor elige "¿Descargar camión? Sí/No".
--     · No  → no se mueve stock; el producto se queda en el camión.
--     · Sí  → captura el conteo físico por producto (descarga_ruta_lineas).
--  - Al APROBAR (admin), con descargo_camion=true:
--     · El físico (cantidad_real) ENTRA a la bodega destino (almacen_destino_id,
--       que el admin elige al aprobar).
--     · El camión queda en 0 de lo descargado.
--     · La diferencia (real − lo que el sistema tenía en el camión) se registra
--       como AJUSTE marcado "Diferencia en descarga (revisar)" — evidencia; NO
--       decide solo si fue error o merma.
--  - Al desplegar NO se mueve stock de nadie: el trigger solo actúa cuando
--    descargo_camion=true y hay líneas; hoy no existen, así que es inerte.
--
-- Nota: ajustes_inventario es tabla de LOG (no tiene trigger que mueva stock),
-- así que insertar ahí es solo evidencia.

-- 1) Columnas nuevas en descarga_ruta (idempotentes)
ALTER TABLE public.descarga_ruta
  ADD COLUMN IF NOT EXISTS descargo_camion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS almacen_destino_id uuid REFERENCES public.almacenes(id);

-- 2) Trigger de aprobación: mueve físico camión→bodega, deja camión en 0 y
--    registra la diferencia como evidencia. Reemplaza la versión anterior que
--    solo hacía una salida del camión sin destino.
CREATE OR REPLACE FUNCTION public.apply_descarga_ruta_aprobada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camion uuid;
  v_bodega uuid;
  v_linea RECORD;
  v_real numeric;
  v_cam_now numeric;
  v_dif numeric;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;

  -- Si NO se descargó el camión, no se mueve nada de stock.
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;

  -- Idempotencia: si ya procesamos esta descarga (p. ej. se reabrió y se vuelve a
  -- aprobar), no volver a mover stock ni duplicar la entrada a bodega.
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_tipo = 'descarga' AND referencia_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Almacén del vendedor (camión) y bodega destino elegida por el admin.
  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  v_bodega := NEW.almacen_destino_id;

  IF v_camion IS NULL OR v_bodega IS NULL THEN
    RAISE EXCEPTION 'Descarga %: falta almacén de camión o bodega destino (camión=%, bodega=%)',
      COALESCE(NEW.folio, NEW.id::text), v_camion, v_bodega;
  END IF;
  IF v_camion = v_bodega THEN
    RAISE EXCEPTION 'Descarga %: la bodega destino no puede ser el mismo almacén del camión', COALESCE(NEW.folio, NEW.id::text);
  END IF;

  FOR v_linea IN
    SELECT id, producto_id, cantidad_real
    FROM public.descarga_ruta_lineas
    WHERE descarga_id = NEW.id
  LOOP
    v_real := COALESCE(v_linea.cantidad_real, 0);

    -- Lo que el sistema tiene HOY en el camión para ese producto (fuente de verdad:
    -- ya incluye cargas, ventas, devoluciones, traspasos, compras y ajustes).
    SELECT cantidad INTO v_cam_now
    FROM public.stock_almacen WHERE almacen_id = v_camion AND producto_id = v_linea.producto_id;
    v_cam_now := COALESCE(v_cam_now, 0);

    -- 1) El físico entra a la bodega destino.
    IF v_real > 0 THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (NEW.empresa_id, v_bodega, v_linea.producto_id, v_real)
      ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id,
        referencia_tipo, referencia_id, user_id, fecha, notas
      ) VALUES (
        NEW.empresa_id, 'entrada', v_linea.producto_id, v_real, v_camion, v_bodega,
        'descarga', NEW.id, COALESCE(NEW.aprobado_por, NEW.user_id), COALESCE(NEW.fecha, CURRENT_DATE),
        'Descarga de ruta: entrada a bodega (folio ' || COALESCE(NEW.folio, '—') || ')'
      );
    END IF;

    -- 2) El camión queda en 0 de lo descargado.
    IF v_cam_now <> 0 THEN
      UPDATE public.stock_almacen SET cantidad = 0, updated_at = now()
      WHERE almacen_id = v_camion AND producto_id = v_linea.producto_id;

      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
        referencia_tipo, referencia_id, user_id, fecha, notas
      ) VALUES (
        NEW.empresa_id, 'salida', v_linea.producto_id, v_cam_now, v_camion,
        'descarga', NEW.id, COALESCE(NEW.aprobado_por, NEW.user_id), COALESCE(NEW.fecha, CURRENT_DATE),
        'Descarga de ruta: salida de camión (folio ' || COALESCE(NEW.folio, '—') || ')'
      );
    END IF;

    -- 3) Evidencia de la diferencia (real − lo que el sistema tenía en el camión).
    v_dif := v_real - v_cam_now;
    IF v_dif <> 0 THEN
      INSERT INTO public.ajustes_inventario (
        empresa_id, producto_id, almacen_id, cantidad_anterior, cantidad_nueva, diferencia, motivo, user_id, fecha
      ) VALUES (
        NEW.empresa_id, v_linea.producto_id, v_camion, v_cam_now, v_real, v_dif,
        'Diferencia en descarga (revisar) — folio ' || COALESCE(NEW.folio, '—')
          || ' · esperado ' || v_cam_now || ' · físico ' || v_real,
        COALESCE(NEW.aprobado_por, NEW.user_id), COALESCE(NEW.fecha, CURRENT_DATE)
      );
    END IF;

    -- Dejar la línea con lo que realmente medimos (esperado = lo del sistema, diferencia).
    UPDATE public.descarga_ruta_lineas
      SET cantidad_esperada = v_cam_now, diferencia = v_dif
      WHERE id = v_linea.id;
  END LOOP;

  RETURN NEW;
END;
$function$;
