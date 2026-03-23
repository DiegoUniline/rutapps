-- Add visibility config column to empresas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS clientes_visibilidad text NOT NULL DEFAULT 'todos';

-- Add 'ver_todos' action to all existing Administrador roles
INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
SELECT r.id, m.modulo, 'ver_todos', true
FROM public.roles r
CROSS JOIN (
  VALUES ('ventas'), ('clientes'), ('finanzas.por_cobrar'), ('logistica.entregas'), ('logistica.descargas')
) AS m(modulo)
WHERE r.nombre = 'Administrador' AND r.es_sistema = true
ON CONFLICT DO NOTHING;