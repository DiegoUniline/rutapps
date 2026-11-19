
-- Trigger: when a profile is created/updated, ensure a vendedor and cobrador entry exists
CREATE OR REPLACE FUNCTION public.sync_profile_to_vendedor_cobrador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert vendedor
  INSERT INTO public.vendedores (id, empresa_id, nombre)
  VALUES (NEW.id, NEW.empresa_id, COALESCE(NEW.nombre, 'Usuario'))
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;

  -- Upsert cobrador
  INSERT INTO public.cobradores (id, empresa_id, nombre)
  VALUES (NEW.id, NEW.empresa_id, COALESCE(NEW.nombre, 'Usuario'))
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_profile_vendedor_cobrador
  AFTER INSERT OR UPDATE OF nombre ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_vendedor_cobrador();

-- Sync existing profiles into vendedores and cobradores
INSERT INTO public.vendedores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.vendedores v WHERE v.id = p.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cobradores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.cobradores c WHERE c.id = p.id)
ON CONFLICT (id) DO NOTHING;
