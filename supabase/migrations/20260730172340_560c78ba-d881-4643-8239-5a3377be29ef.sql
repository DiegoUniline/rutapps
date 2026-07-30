update public.feature_flags
set alcance = 'licencias',
    licencias = (select array(select distinct unnest(coalesce(licencias, '{}'::text[]) || array['50876925','43129204'])))
where clave in ('promo_descuento_linea','promo_persist');