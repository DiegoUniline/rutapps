
-- Blacklist table
CREATE TABLE public.trial_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  telefono text,
  motivo text DEFAULT 'Empresa eliminada',
  empresa_nombre text,
  bloqueado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage blacklist"
  ON public.trial_blacklist FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_trial_blacklist_email ON public.trial_blacklist (email);
CREATE INDEX idx_trial_blacklist_telefono ON public.trial_blacklist (telefono);

-- Function to check if email is blacklisted
CREATE OR REPLACE FUNCTION public.is_email_blacklisted(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trial_blacklist WHERE lower(email) = lower(p_email)
  );
$$;

-- Cascade delete function
CREATE OR REPLACE FUNCTION public.delete_empresa_cascade(p_empresa_id uuid, p_deleted_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_email text;
  v_owner_phone text;
  v_empresa_nombre text;
  v_user_ids uuid[];
BEGIN
  -- Get empresa info
  SELECT nombre INTO v_empresa_nombre FROM empresas WHERE id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;

  -- Get all user_ids for this empresa
  SELECT array_agg(user_id) INTO v_user_ids FROM profiles WHERE empresa_id = p_empresa_id;

  -- Get owner info for blacklist
  SELECT u.email, u.phone INTO v_owner_email, v_owner_phone
  FROM auth.users u
  JOIN empresas e ON e.owner_user_id = u.id
  WHERE e.id = p_empresa_id;

  -- Add to blacklist
  IF v_owner_email IS NOT NULL THEN
    INSERT INTO trial_blacklist (email, telefono, empresa_nombre, bloqueado_por)
    VALUES (v_owner_email, v_owner_phone, v_empresa_nombre, p_deleted_by);
  END IF;

  -- Also blacklist all other users of this empresa
  INSERT INTO trial_blacklist (email, empresa_nombre, bloqueado_por)
  SELECT u.email, v_empresa_nombre, p_deleted_by
  FROM auth.users u
  JOIN profiles p ON p.user_id = u.id
  WHERE p.empresa_id = p_empresa_id
    AND u.id IS DISTINCT FROM (SELECT owner_user_id FROM empresas WHERE id = p_empresa_id)
    AND u.email IS NOT NULL;

  -- Delete all related data (order matters for FK constraints)
  DELETE FROM auditoria_escaneos WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id);
  DELETE FROM auditoria_entradas WHERE auditoria_linea_id IN (SELECT id FROM auditoria_lineas WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id));
  DELETE FROM auditoria_lineas WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id);
  DELETE FROM auditorias WHERE empresa_id = p_empresa_id;

  DELETE FROM conteo_entradas WHERE conteo_linea_id IN (SELECT id FROM conteo_lineas WHERE conteo_id IN (SELECT id FROM conteos_fisicos WHERE empresa_id = p_empresa_id));
  DELETE FROM conteo_lineas WHERE conteo_id IN (SELECT id FROM conteos_fisicos WHERE empresa_id = p_empresa_id);
  DELETE FROM conteos_fisicos WHERE empresa_id = p_empresa_id;

  DELETE FROM cfdi_lineas WHERE cfdi_id IN (SELECT id FROM cfdis WHERE empresa_id = p_empresa_id);
  DELETE FROM cfdis WHERE empresa_id = p_empresa_id;

  DELETE FROM entrega_lineas WHERE entrega_id IN (SELECT id FROM entregas WHERE empresa_id = p_empresa_id);
  DELETE FROM entregas WHERE empresa_id = p_empresa_id;

  DELETE FROM descarga_ruta_lineas WHERE descarga_id IN (SELECT id FROM descarga_ruta WHERE empresa_id = p_empresa_id);
  DELETE FROM descarga_ruta WHERE empresa_id = p_empresa_id;

  DELETE FROM cobro_aplicaciones WHERE cobro_id IN (SELECT id FROM cobros WHERE empresa_id = p_empresa_id);
  DELETE FROM cobros WHERE empresa_id = p_empresa_id;

  DELETE FROM venta_lineas WHERE venta_id IN (SELECT id FROM ventas WHERE empresa_id = p_empresa_id);
  DELETE FROM carga_pedidos WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = p_empresa_id);
  DELETE FROM ventas WHERE empresa_id = p_empresa_id;

  DELETE FROM devoluciones WHERE empresa_id = p_empresa_id;

  DELETE FROM carga_lineas WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = p_empresa_id);
  DELETE FROM cargas WHERE empresa_id = p_empresa_id;

  DELETE FROM compra_lineas WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id = p_empresa_id);
  DELETE FROM compras WHERE empresa_id = p_empresa_id;

  DELETE FROM traspaso_lineas WHERE traspaso_id IN (SELECT id FROM traspasos WHERE empresa_id = p_empresa_id);
  DELETE FROM traspasos WHERE empresa_id = p_empresa_id;

  DELETE FROM movimientos_inventario WHERE empresa_id = p_empresa_id;
  DELETE FROM stock_almacen WHERE empresa_id = p_empresa_id;
  DELETE FROM ajustes_inventario WHERE empresa_id = p_empresa_id;

  DELETE FROM cliente_pedido_sugerido WHERE cliente_id IN (SELECT id FROM clientes WHERE empresa_id = p_empresa_id);
  DELETE FROM visitas WHERE empresa_id = p_empresa_id;
  DELETE FROM clientes WHERE empresa_id = p_empresa_id;

  DELETE FROM producto_proveedores WHERE producto_id IN (SELECT id FROM productos WHERE empresa_id = p_empresa_id);
  DELETE FROM producto_precios WHERE producto_id IN (SELECT id FROM productos WHERE empresa_id = p_empresa_id);
  DELETE FROM productos WHERE empresa_id = p_empresa_id;

  DELETE FROM proveedores WHERE empresa_id = p_empresa_id;
  DELETE FROM clasificaciones WHERE empresa_id = p_empresa_id;
  DELETE FROM marcas WHERE empresa_id = p_empresa_id;
  DELETE FROM unidades WHERE empresa_id = p_empresa_id;
  DELETE FROM tasas_iva WHERE empresa_id = p_empresa_id;
  DELETE FROM tasas_ieps WHERE empresa_id = p_empresa_id;
  DELETE FROM tarifa_lineas WHERE tarifa_id IN (SELECT id FROM tarifas WHERE empresa_id = p_empresa_id);
  DELETE FROM tarifas WHERE empresa_id = p_empresa_id;
  DELETE FROM lista_precios WHERE empresa_id = p_empresa_id;
  DELETE FROM listas WHERE empresa_id = p_empresa_id;
  DELETE FROM zonas WHERE empresa_id = p_empresa_id;
  DELETE FROM cobradores WHERE empresa_id = p_empresa_id;
  DELETE FROM vendedores WHERE empresa_id = p_empresa_id;
  DELETE FROM almacenes WHERE empresa_id = p_empresa_id;
  DELETE FROM gastos WHERE empresa_id = p_empresa_id;
  DELETE FROM promociones WHERE empresa_id = p_empresa_id;

  DELETE FROM timbres_movimientos WHERE empresa_id = p_empresa_id;
  DELETE FROM timbres_saldo WHERE empresa_id = p_empresa_id;
  DELETE FROM facturas WHERE empresa_id = p_empresa_id;
  DELETE FROM emisor_fiscal WHERE empresa_id = p_empresa_id;

  DELETE FROM cancellation_requests WHERE empresa_id = p_empresa_id;
  DELETE FROM subscriptions WHERE empresa_id = p_empresa_id;

  DELETE FROM role_permisos WHERE role_id IN (SELECT id FROM roles WHERE empresa_id = p_empresa_id);
  DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE empresa_id = p_empresa_id);
  DELETE FROM roles WHERE empresa_id = p_empresa_id;

  -- Delete profiles
  DELETE FROM profiles WHERE empresa_id = p_empresa_id;

  -- Delete empresa
  DELETE FROM empresas WHERE id = p_empresa_id;

  -- Delete auth users (last, after all FK references are gone)
  IF v_user_ids IS NOT NULL THEN
    FOR i IN 1..array_length(v_user_ids, 1) LOOP
      -- Only delete if user has no other empresa profile
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_user_ids[i]) THEN
        DELETE FROM auth.users WHERE id = v_user_ids[i];
      END IF;
    END LOOP;
  END IF;
END;
$$;
