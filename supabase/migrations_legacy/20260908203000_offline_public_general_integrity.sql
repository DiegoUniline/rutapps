-- Identidad contable estable para ventas de mostrador/Público general.
-- Corrige ventas históricas huérfanas y evita que vuelvan a crearse.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS es_publico_general boolean NOT NULL DEFAULT false;

-- Si ya existe un cliente con ese nombre, conservar el más antiguo como la
-- identidad oficial. Los duplicados históricos no se borran ni se fusionan.
WITH candidatos AS (
  SELECT
    c.id,
    row_number() OVER (
      PARTITION BY c.empresa_id
      ORDER BY c.created_at ASC, c.id ASC
    ) AS posicion
  FROM public.clientes c
  WHERE regexp_replace(
    translate(lower(btrim(c.nombre)), 'áéíóúüñ', 'aeiouun'),
    '[[:space:]]+',
    ' ',
    'g'
  ) = 'publico general'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clientes oficial
      WHERE oficial.empresa_id = c.empresa_id
        AND oficial.es_publico_general
    )
)
UPDATE public.clientes c
SET es_publico_general = true,
    status = 'activo'
FROM candidatos x
WHERE c.id = x.id
  AND x.posicion = 1;

-- Toda empresa obtiene una identidad antes de reparar ventas y de imponer la
-- restricción NOT NULL.
INSERT INTO public.clientes (
  empresa_id,
  nombre,
  status,
  credito,
  es_publico_general
)
SELECT
  e.id,
  'Público general',
  'activo',
  false,
  true
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.clientes c
  WHERE c.empresa_id = e.id
    AND c.es_publico_general
);

CREATE UNIQUE INDEX IF NOT EXISTS clientes_un_publico_general_por_empresa
  ON public.clientes (empresa_id)
  WHERE es_publico_general;

-- Función expuesta a clientes autenticados. El bloqueo asesor más el índice
-- parcial hacen la operación idempotente incluso con dos equipos a la vez.
CREATE OR REPLACE FUNCTION public.ensure_cliente_publico_general(p_empresa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'La empresa es obligatoria';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para administrar Público general en esta empresa';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('publico-general:' || p_empresa_id::text, 0));

  INSERT INTO public.clientes (
    empresa_id,
    nombre,
    status,
    credito,
    es_publico_general
  ) VALUES (
    p_empresa_id,
    'Público general',
    'activo',
    false,
    true
  )
  ON CONFLICT (empresa_id) WHERE es_publico_general
  DO UPDATE SET
    nombre = 'Público general',
    status = 'activo'
  RETURNING id INTO v_cliente_id;

  RETURN v_cliente_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_cliente_publico_general(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_cliente_publico_general(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_cliente_publico_general(uuid) TO service_role;

-- Reparación histórica: una venta sin cliente representa mostrador/Público
-- general. No se alteran importes, pagos, inventario, folio ni estado.
UPDATE public.ventas v
SET cliente_id = c.id
FROM public.clientes c
WHERE v.cliente_id IS NULL
  AND c.empresa_id = v.empresa_id
  AND c.es_publico_general;

-- Última defensa: también protege importaciones, POS y cualquier consumidor
-- futuro que inserte una venta sin pasar por la interfaz de Ruta.
CREATE OR REPLACE FUNCTION public.asignar_publico_general_a_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.clientes (
    empresa_id,
    nombre,
    status,
    credito,
    es_publico_general
  ) VALUES (
    NEW.empresa_id,
    'Público general',
    'activo',
    false,
    true
  )
  ON CONFLICT (empresa_id) WHERE es_publico_general
  DO UPDATE SET status = 'activo'
  RETURNING id INTO v_cliente_id;

  NEW.cliente_id := v_cliente_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asignar_publico_general_a_venta ON public.ventas;
CREATE TRIGGER trg_asignar_publico_general_a_venta
BEFORE INSERT OR UPDATE OF cliente_id, empresa_id ON public.ventas
FOR EACH ROW
WHEN (NEW.cliente_id IS NULL)
EXECUTE FUNCTION public.asignar_publico_general_a_venta();

ALTER TABLE public.ventas
  ALTER COLUMN cliente_id SET NOT NULL;

COMMENT ON COLUMN public.clientes.es_publico_general IS
  'Identidad contable única por empresa para ventas sin cliente nominal.';
