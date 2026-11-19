DELETE FROM public.internal_notifications
WHERE empresa_id = (
  SELECT id FROM public.empresas WHERE licencia = '12324489' LIMIT 1
)
AND entity_type IN ('cobro', 'venta')
AND (
  entity_id IN (
    '85605b44-ca2d-44bd-aa90-31af4307d062'::uuid,
    'f02800e2-0f97-419f-a89f-fa8d4592c6ea'::uuid,
    'ecc0a717-e97d-4b2d-94f2-71ed8c2f3c1e'::uuid,
    '64dd7093-32a8-48af-9117-cedcd653dfe6'::uuid,
    'e192168e-7053-4087-852f-e7e761af628b'::uuid,
    '531ad839-443d-4e5e-9f31-8db275c2d5ad'::uuid,
    '8acabfe9-dac3-4670-a481-c3cace7a7639'::uuid
  )
  OR body ILIKE '%$2,297.00%'
  OR body ILIKE '%$4,594.00%'
  OR title ILIKE '%VTA-0001%'
  OR title ILIKE '%VTA-0002%'
  OR title ILIKE '%PED-0001%'
  OR title ILIKE '%PED-0002%'
);