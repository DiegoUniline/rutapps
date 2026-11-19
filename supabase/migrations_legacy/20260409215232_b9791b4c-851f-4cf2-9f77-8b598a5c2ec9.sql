
-- Fix the trigger to auto-assign vendedor_id back to the profile
CREATE OR REPLACE FUNCTION public.sync_profile_to_vendedor_cobrador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
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

  -- Auto-assign vendedor_id to profile (the vendedor has same id as profile)
  IF NEW.vendedor_id IS NULL THEN
    NEW.vendedor_id := NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: assign vendedor_id to all existing profiles that don't have one
UPDATE public.profiles
SET vendedor_id = id
WHERE vendedor_id IS NULL
  AND empresa_id IS NOT NULL;
