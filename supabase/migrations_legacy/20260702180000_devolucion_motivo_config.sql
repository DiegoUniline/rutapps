-- Configuración por empresa: a dónde va cada MOTIVO de devolución (Vendible o Mermas).
-- Antes la regla estaba fija en el trigger. Ahora cada empresa puede decidirlo.
-- Default seguro: si no hay config para un (empresa, motivo), el trigger usa la
-- regla estándar (danado/vencido/caducado → mermas; el resto → vendible), así que
-- NUNCA falla aunque falte configuración.

-- 1) Tabla de configuración
CREATE TABLE IF NOT EXISTS public.devolucion_motivo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  motivo text NOT NULL,               -- valor de motivo_devolucion como texto
  a_mermas boolean NOT NULL DEFAULT false,   -- true = va a Mermas; false = Vendible
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, motivo)
);

ALTER TABLE public.devolucion_motivo_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant devol motivo config" ON public.devolucion_motivo_config;
CREATE POLICY "Tenant devol motivo config" ON public.devolucion_motivo_config
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- 2) Semilla de defaults para TODAS las empresas actuales
INSERT INTO public.devolucion_motivo_config (empresa_id, motivo, a_mermas)
SELECT e.id, m.motivo, m.a_mermas
FROM public.empresas e
CROSS JOIN (VALUES
  ('no_vendido', false),
  ('cambio', false),
  ('error_pedido', false),
  ('otro', false),
  ('danado', true),
  ('vencido', true),
  ('caducado', true)
) AS m(motivo, a_mermas)
ON CONFLICT (empresa_id, motivo) DO NOTHING;

-- 3) Sembrar defaults al crear una empresa nueva
CREATE OR REPLACE FUNCTION public.seed_devolucion_motivo_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.devolucion_motivo_config (empresa_id, motivo, a_mermas)
  VALUES
    (NEW.id,'no_vendido',false),(NEW.id,'cambio',false),(NEW.id,'error_pedido',false),
    (NEW.id,'otro',false),(NEW.id,'danado',true),(NEW.id,'vencido',true),(NEW.id,'caducado',true)
  ON CONFLICT (empresa_id, motivo) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_devolucion_motivo_config ON public.empresas;
CREATE TRIGGER trg_seed_devolucion_motivo_config
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.seed_devolucion_motivo_config();

-- 4) El trigger de inventario ahora LEE la config (con fallback al estándar)
CREATE OR REPLACE FUNCTION public.apply_devolucion_linea_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_dev record;
  v_almacen_id uuid;
  v_merma_almacen uuid;
  v_a_mermas boolean;
  v_existing int;
  v_legacy int;
BEGIN
  SELECT id, empresa_id, user_id, vendedor_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- ¿Este motivo va a mermas? Primero la config de la empresa; si no hay, el estándar.
  SELECT a_mermas INTO v_a_mermas
  FROM public.devolucion_motivo_config
  WHERE empresa_id = v_dev.empresa_id AND motivo = NEW.motivo::text;
  IF v_a_mermas IS NULL THEN
    v_a_mermas := NEW.motivo::text IN ('danado', 'vencido', 'caducado');
  END IF;

  IF v_a_mermas THEN
    SELECT id INTO v_merma_almacen
    FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true
    LIMIT 1;
    IF v_merma_almacen IS NOT NULL THEN
      v_almacen_id := v_merma_almacen;
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id;
  IF v_existing > 0 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id AND tipo = 'entrada';
  IF v_legacy > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, notas, fecha
    ) VALUES (
      v_dev.empresa_id, 'entrada', NEW.producto_id, 0, v_almacen_id,
      'devolucion_aplicada', v_dev.id, v_dev.user_id, 'Ancla (reingreso previo por app móvil)', CURRENT_DATE
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_dev.empresa_id, v_almacen_id, NEW.producto_id, NEW.cantidad)
  ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
    referencia_tipo, referencia_id, user_id, notas, fecha
  ) VALUES (
    v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen_id,
    'devolucion_aplicada', v_dev.id, v_dev.user_id,
    CASE WHEN v_a_mermas AND v_merma_almacen IS NOT NULL THEN 'Devolución a MERMAS (trigger BD)'
         ELSE 'Devolución (trigger BD)' END,
    CURRENT_DATE
  );

  RETURN NEW;
END;
$function$;
