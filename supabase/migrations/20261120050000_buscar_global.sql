-- Buscador general (⌘K): antes eran ~20 consultas por tecla con ILIKE sobre columnas sin índice.
-- Ahora una sola función que busca solo en campos con índice de trigramas y devuelve todo junto.
-- SECURITY INVOKER: aplica RLS; además filtra por la empresa del usuario para usar los índices.

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre_trgm ON public.proveedores USING gin (nombre extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_compras_folio_trgm ON public.compras USING gin (folio extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_traspasos_folio_trgm ON public.traspasos USING gin (folio extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gastos_concepto_trgm ON public.gastos USING gin (concepto extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cfdis_folio_trgm ON public.cfdis USING gin (folio extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cfdis_receiver_trgm ON public.cfdis USING gin (receiver_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_nombre_trgm ON public.profiles USING gin (nombre extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.buscar_global(p_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_emp  uuid := public.get_my_empresa_id();
  v_term text;
  v_cli  uuid[];
  v_prov uuid[];
BEGIN
  IF v_emp IS NULL OR length(btrim(COALESCE(p_q, ''))) < 2 THEN
    RETURN '{}'::jsonb;
  END IF;
  v_term := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  SELECT array_agg(id) INTO v_cli FROM (
    SELECT id FROM public.clientes WHERE empresa_id = v_emp AND (nombre ILIKE v_term OR codigo ILIKE v_term) LIMIT 50) c;
  SELECT array_agg(id) INTO v_prov FROM (
    SELECT id FROM public.proveedores WHERE empresa_id = v_emp AND nombre ILIKE v_term LIMIT 50) p;

  RETURN jsonb_build_object(
    'ventas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT v.id, v.folio, v.total, v.fecha, v.tipo,
               jsonb_build_object('nombre', cl.nombre) AS clientes,
               jsonb_build_object('nombre', pf.nombre) AS vendedores
          FROM public.ventas v
          LEFT JOIN public.clientes cl ON cl.id = v.cliente_id
          LEFT JOIN public.profiles pf ON pf.id = v.vendedor_id
         WHERE v.empresa_id = v_emp
           AND (v.folio ILIKE v_term OR v.cliente_id = ANY(COALESCE(v_cli, '{}')))
         ORDER BY v.created_at DESC
         LIMIT 10) x), '[]'::jsonb),
    'clientes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, codigo, telefono, rfc FROM public.clientes
         WHERE id = ANY(COALESCE(v_cli, '{}')) ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'productos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, codigo, clave_alterna, precio_principal FROM public.productos
         WHERE empresa_id = v_emp AND (nombre ILIKE v_term OR codigo ILIKE v_term)
         ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'proveedores', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, rfc, telefono FROM public.proveedores
         WHERE id = ANY(COALESCE(v_prov, '{}')) ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'compras', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT c.id, c.folio, c.total, c.fecha, jsonb_build_object('nombre', pr.nombre) AS proveedores
          FROM public.compras c LEFT JOIN public.proveedores pr ON pr.id = c.proveedor_id
         WHERE c.empresa_id = v_emp AND (c.folio ILIKE v_term OR c.proveedor_id = ANY(COALESCE(v_prov, '{}')))
         ORDER BY c.fecha DESC LIMIT 5) x), '[]'::jsonb),
    'traspasos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, folio, fecha, status FROM public.traspasos
         WHERE empresa_id = v_emp AND folio ILIKE v_term ORDER BY created_at DESC LIMIT 5) x), '[]'::jsonb),
    'gastos', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, concepto, monto, fecha FROM public.gastos
         WHERE empresa_id = v_emp AND cancelado_at IS NULL AND concepto ILIKE v_term
         ORDER BY fecha DESC LIMIT 5) x), '[]'::jsonb),
    'cobros', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT co.id, co.metodo_pago, co.monto, co.fecha, co.referencia, jsonb_build_object('nombre', cl.nombre) AS clientes
          FROM public.cobros co LEFT JOIN public.clientes cl ON cl.id = co.cliente_id
         WHERE co.empresa_id = v_emp AND co.cliente_id = ANY(COALESCE(v_cli, '{}'))
         ORDER BY co.fecha DESC LIMIT 5) x), '[]'::jsonb),
    'cfdis', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, folio, folio_fiscal, total, fecha_timbrado, receiver_name FROM public.cfdis
         WHERE empresa_id = v_emp AND (folio ILIKE v_term OR receiver_name ILIKE v_term)
         ORDER BY created_at DESC LIMIT 5) x), '[]'::jsonb),
    'almacenes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, tipo FROM public.almacenes
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'tarifas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, tipo FROM public.tarifas
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'empleados', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT id, nombre, telefono FROM public.profiles
         WHERE empresa_id = v_emp AND nombre ILIKE v_term ORDER BY nombre LIMIT 5) x), '[]'::jsonb),
    'entregas', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT e.id, e.folio, e.fecha, e.status, jsonb_build_object('nombre', cl.nombre) AS clientes
          FROM public.entregas e LEFT JOIN public.clientes cl ON cl.id = e.cliente_id
         WHERE e.empresa_id = v_emp AND (e.folio ILIKE v_term OR e.cliente_id = ANY(COALESCE(v_cli, '{}')))
         ORDER BY e.created_at DESC LIMIT 5) x), '[]'::jsonb),
    'ajustes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT a.id, a.fecha, a.motivo, jsonb_build_object('nombre', p.nombre, 'codigo', p.codigo) AS productos
          FROM public.ajustes_inventario a JOIN public.productos p ON p.id = a.producto_id
         WHERE a.empresa_id = v_emp AND (p.nombre ILIKE v_term OR p.codigo ILIKE v_term)
         ORDER BY a.fecha DESC LIMIT 5) x), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.buscar_global(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_global(text) TO authenticated;
