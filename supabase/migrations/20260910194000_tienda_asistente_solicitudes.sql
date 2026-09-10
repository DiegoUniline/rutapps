-- Tienda en linea: solicitudes de nuevos clientes.
-- Los visitantes NO crean directamente un registro en public.clientes.
-- La solicitud se revisa internamente y se aprueba desde Configuracion > Tienda.

CREATE TABLE IF NOT EXISTS public.tienda_solicitudes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tienda_slug text NOT NULL,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','aprobada','rechazada')),
  nombre text NOT NULL,
  contacto text,
  telefono text,
  email text NOT NULL,
  direccion text,
  ciudad text,
  rfc text,
  password_hash text NOT NULL,
  lista_precio_id uuid,
  vendedor_id uuid,
  zona_id uuid,
  credito boolean NOT NULL DEFAULT false,
  limite_credito numeric NOT NULL DEFAULT 0,
  dias_credito integer NOT NULL DEFAULT 0,
  notas_revision text,
  posible_cliente_id uuid,
  posible_cliente_nombre text,
  posible_motivo text,
  cliente_id uuid,
  revisado_por uuid,
  revisado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tienda_solicitudes_empresa_status_created
  ON public.tienda_solicitudes_cliente (empresa_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tienda_solicitud_pendiente_email
  ON public.tienda_solicitudes_cliente (empresa_id, lower(email))
  WHERE status = 'pendiente';

ALTER TABLE public.tienda_solicitudes_cliente ENABLE ROW LEVEL SECURITY;

-- Toda lectura/escritura de solicitudes pasa por funciones Edge con service role.
-- No exponemos password_hash ni solicitudes al cliente web mediante PostgREST.
REVOKE ALL ON TABLE public.tienda_solicitudes_cliente FROM anon, authenticated;
GRANT ALL ON TABLE public.tienda_solicitudes_cliente TO service_role;

COMMENT ON TABLE public.tienda_solicitudes_cliente IS
  'Solicitudes de alta originadas en la tienda en linea. Se convierten en cliente real solo al aprobarse internamente.';
