
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE public.cobradores ADD COLUMN IF NOT EXISTS telefono text;

-- Backfill from profiles
UPDATE public.vendedores v SET telefono = p.telefono
FROM public.profiles p WHERE p.id = v.id AND v.telefono IS DISTINCT FROM p.telefono;

UPDATE public.cobradores c SET telefono = p.telefono
FROM public.profiles p WHERE p.id = c.id AND c.telefono IS DISTINCT FROM p.telefono;

-- Also sync nombre in case it drifted
UPDATE public.vendedores v SET nombre = p.nombre
FROM public.profiles p WHERE p.id = v.id AND p.nombre IS NOT NULL AND v.nombre IS DISTINCT FROM p.nombre;

UPDATE public.cobradores c SET nombre = p.nombre
FROM public.profiles p WHERE p.id = c.id AND p.nombre IS NOT NULL AND c.nombre IS DISTINCT FROM p.nombre;

-- Mirror function: keep vendedores/cobradores in sync with profiles
CREATE OR REPLACE FUNCTION public.mirror_profile_to_vendedor_cobrador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vendedores
    SET nombre = COALESCE(NEW.nombre, nombre),
        telefono = NEW.telefono
  WHERE id = NEW.id;

  UPDATE public.cobradores
    SET nombre = COALESCE(NEW.nombre, nombre),
        telefono = NEW.telefono
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_profile_to_vendedor_cobrador ON public.profiles;
CREATE TRIGGER trg_mirror_profile_to_vendedor_cobrador
AFTER UPDATE OF nombre, telefono ON public.profiles
FOR EACH ROW
WHEN (OLD.nombre IS DISTINCT FROM NEW.nombre OR OLD.telefono IS DISTINCT FROM NEW.telefono)
EXECUTE FUNCTION public.mirror_profile_to_vendedor_cobrador();
