
-- Create the trigger that syncs profiles to vendedores and cobradores
CREATE TRIGGER on_profile_sync
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_vendedor_cobrador();

-- Sync existing profiles that may not have vendedores/cobradores entries
INSERT INTO public.vendedores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;

INSERT INTO public.cobradores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;
