DROP POLICY "Authenticated can insert wa_optouts" ON public.wa_optouts;
DROP POLICY "Authenticated can delete wa_optouts" ON public.wa_optouts;

CREATE POLICY "Super admins can insert wa_optouts"
ON public.wa_optouts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
);

CREATE POLICY "Super admins can delete wa_optouts"
ON public.wa_optouts FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
);