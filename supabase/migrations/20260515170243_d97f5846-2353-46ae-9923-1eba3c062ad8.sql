
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_partner(
  _solicitud_id uuid,
  _slug text,
  _comision_pct numeric DEFAULT 20
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol public.partner_solicitudes%ROWTYPE;
  v_partner_id uuid;
  v_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_sol FROM public.partner_solicitudes WHERE id = _solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF v_sol.status <> 'pending' THEN RAISE EXCEPTION 'Solicitud ya procesada'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_sol.email) LIMIT 1;

  IF v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = v_user_id AND empresa_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este correo ya pertenece a una empresa cliente. No puede ser partner.';
  END IF;

  INSERT INTO public.partners (nombre, email, telefono, ref_slug, comision_pct, user_id, estado)
  VALUES (v_sol.nombre, v_sol.email, v_sol.telefono, lower(_slug), _comision_pct, v_user_id, 'activo')
  RETURNING id INTO v_partner_id;

  UPDATE public.partner_solicitudes
  SET status = 'approved', partner_id = v_partner_id, processed_at = now(), processed_by = auth.uid()
  WHERE id = _solicitud_id;

  RETURN v_partner_id;
END;
$$;
