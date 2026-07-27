DELETE FROM public.internal_notifications
WHERE empresa_id = (
  SELECT id FROM public.empresas WHERE licencia = '12324489' LIMIT 1
)
AND entity_type = 'cobro'
AND entity_id IN (
  '85605b44-ca2d-44bd-aa90-31af4307d062'::uuid,
  'f02800e2-0f97-419f-a89f-fa8d4592c6ea'::uuid,
  'ecc0a717-e97d-4b2d-94f2-71ed8c2f3c1e'::uuid
);