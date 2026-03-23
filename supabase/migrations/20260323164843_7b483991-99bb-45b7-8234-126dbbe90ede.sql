CREATE OR REPLACE FUNCTION public.sync_profile_to_vendedor_cobrador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip if no empresa assigned
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert vendedor
  INSERT INTO public.vendedores (id, empresa_id, nombre)
  VALUES (NEW.id, NEW.empresa_id, COALESCE(NEW.nombre, 'Usuario'))
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, empresa_id = EXCLUDED.empresa_id;

  -- Upsert cobrador
  INSERT INTO public.cobradores (id, empresa_id, nombre)
  VALUES (NEW.id, NEW.empresa_id, COALESCE(NEW.nombre, 'Usuario'))
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, empresa_id = EXCLUDED.empresa_id;

  RETURN NEW;
END;
$function$;

-- Recreate trigger to fire on nombre OR empresa_id changes
DROP TRIGGER IF EXISTS trg_sync_profile_vendedor ON public.profiles;
CREATE TRIGGER trg_sync_profile_vendedor
  AFTER INSERT OR UPDATE OF nombre, empresa_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_vendedor_cobrador();