
-- 1) Nuevas columnas en subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS precio_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usuarios_incluidos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS precio_extra_usuario numeric NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS stripe_price_id_extra text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS popular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS ideal_para text,
  ADD COLUMN IF NOT EXISTS features_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS capacitacion_sesiones integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_slug_uniq ON public.subscription_plans(slug) WHERE slug IS NOT NULL;

-- 2) Bandera legacy en subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS legacy_pricing boolean NOT NULL DEFAULT false;

-- 3) Marcar TODAS las suscripciones existentes como legacy (mantienen modelo viejo, piso 3 usuarios)
UPDATE public.subscriptions SET legacy_pricing = true WHERE legacy_pricing = false;

-- 4) Desactivar planes viejos para que NO aparezcan en checkout nuevo (siguen referenciados por subs existentes)
UPDATE public.subscription_plans
  SET activo = false
  WHERE slug IS NULL;

-- 5) Insertar 3 planes nuevos (precios base — los stripe_price_id se llenan después de crearlos en Stripe)
INSERT INTO public.subscription_plans
  (nombre, periodo, precio_por_usuario, descuento_pct, meses, activo,
   precio_base, usuarios_incluidos, precio_extra_usuario, slug, orden, popular,
   descripcion, ideal_para, capacitacion_sesiones, features_json)
VALUES
  ('Individual', 'mensual', 300, 0, 1, true,
   450, 1, 300, 'individual', 1, false,
   'Para personas o negocios pequeños que inician con el control de rutas y entregas.',
   'Negocios de 1 persona o que apenas inician',
   1,
   '["1 usuario incluido","Acceso completo a RutApp","Registro de rutas, entregas y actividades","Consulta de historial","Panel básico","Soporte por WhatsApp","Actualizaciones del sistema","Capacitación inicial remota (1 sesión)"]'::jsonb),
  ('Equipo', 'mensual', 300, 0, 1, true,
   900, 3, 300, 'equipo', 2, true,
   'Ideal para equipos que requieren coordinar varias rutas y vendedores al mismo tiempo.',
   'Equipos de ventas y reparto de 2 a 5 personas',
   2,
   '["3 usuarios incluidos","Todo lo del plan Individual","Coordinación multiusuario","Reportes por usuario y por ruta","Soporte prioritario por WhatsApp","Capacitación remota (2 sesiones)"]'::jsonb),
  ('Empresa', 'mensual', 300, 0, 1, true,
   1500, 5, 300, 'empresa', 3, false,
   'Pensado para empresas con operación más amplia que requieren control y reportes avanzados.',
   'Empresas con varias rutas, almacenes o sucursales',
   3,
   '["5 usuarios incluidos","Todo lo del plan Equipo","Reportes avanzados","Gestión de múltiples almacenes","Soporte preferente","Capacitación remota (3 sesiones)","Asesoría para crecimiento operativo"]'::jsonb)
ON CONFLICT DO NOTHING;
