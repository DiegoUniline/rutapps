
-- Make empresa_id nullable so notifications can be system-wide (NULL = all empresas)
ALTER TABLE public.notifications ALTER COLUMN empresa_id DROP NOT NULL;

-- Update RLS: users can see notifications for their empresa OR global (empresa_id IS NULL)
DROP POLICY IF EXISTS "Users read own tenant notifications" ON public.notifications;
CREATE POLICY "Users read own tenant notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL);

-- Update admin policy to also allow managing global notifications  
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL)
  WITH CHECK (empresa_id = get_my_empresa_id() OR empresa_id IS NULL);
