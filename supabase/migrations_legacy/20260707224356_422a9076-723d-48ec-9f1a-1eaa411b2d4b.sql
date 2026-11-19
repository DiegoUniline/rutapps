-- Crear rol Vendedor y almacenes/rutas para DIFASUR
INSERT INTO public.roles (empresa_id, nombre, acceso_ruta_movil, es_sistema, descripcion)
VALUES ('ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec', 'Vendedor', true, false, 'Vendedor en ruta móvil')
ON CONFLICT DO NOTHING;

INSERT INTO public.almacenes (empresa_id, nombre, activo)
VALUES
  ('ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec', 'Ruta Alberto', true),
  ('ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec', 'Ruta Isau', true),
  ('ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec', 'Ruta Ignacio', true);
