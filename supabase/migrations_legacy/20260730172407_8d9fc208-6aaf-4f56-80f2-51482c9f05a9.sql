update public.feature_flags
set licencias = (select array(select distinct unnest(coalesce(licencias,'{}'::text[]) || array['12324489'])))
where clave = 'promo_descuento_linea';