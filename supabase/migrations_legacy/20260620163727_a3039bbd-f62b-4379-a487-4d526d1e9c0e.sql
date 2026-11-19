DROP POLICY IF EXISTS select_same_empresa ON public.internal_notifications;
DROP POLICY IF EXISTS delete_same_empresa ON public.internal_notifications;

CREATE POLICY select_same_empresa
ON public.internal_notifications
FOR SELECT
TO authenticated
USING (
  empresa_id = (
    SELECT COALESCE(p.super_admin_override_empresa_id, p.empresa_id)
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
);

CREATE POLICY delete_same_empresa
ON public.internal_notifications
FOR DELETE
TO authenticated
USING (
  empresa_id = (
    SELECT COALESCE(p.super_admin_override_empresa_id, p.empresa_id)
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
);