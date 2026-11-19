-- Fix existing profiles that have NULL vendedor_id
UPDATE public.profiles
SET vendedor_id = id
WHERE vendedor_id IS NULL AND empresa_id IS NOT NULL;

-- Also ensure their vendedor records exist
INSERT INTO public.vendedores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
WHERE p.empresa_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Ensure cobrador records exist too
INSERT INTO public.cobradores (id, empresa_id, nombre)
SELECT p.id, p.empresa_id, COALESCE(p.nombre, 'Usuario')
FROM public.profiles p
WHERE p.empresa_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;