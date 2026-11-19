
-- Fix liquidations with null vendedor_id by matching through profiles
-- Diego (user 387501a7) -> vendedor f71fec41 (profile.id)
UPDATE descarga_ruta SET vendedor_id = 'f71fec41-33ac-409b-94b7-b30f502ef807'
WHERE user_id = '387501a7-d172-4310-9e83-1a7f9fc37cac' AND vendedor_id IS NULL;

-- Martha (user 3e0d134f) -> vendedor 2cd8887e (profile.id)
UPDATE descarga_ruta SET vendedor_id = '2cd8887e-8ab8-4fb3-b821-0301553b4145'
WHERE user_id = '3e0d134f-5ea6-49e0-a592-170574e672ca' AND vendedor_id IS NULL;

-- Jose (user 0903e7c8) -> vendedor 061211c2 (from profile.vendedor_id)
UPDATE descarga_ruta SET vendedor_id = '061211c2-bc63-4456-9be0-d3e0d8ff5571'
WHERE user_id = '0903e7c8-91e4-45f0-a910-75a251a2921f' AND vendedor_id IS NULL;

-- Also fix profiles with null vendedor_id to point to their profile-based vendedor
UPDATE profiles SET vendedor_id = id WHERE vendedor_id IS NULL AND id IN (
  SELECT id FROM vendedores
);
