GRANT SELECT ON public.subscription_plans TO anon;
CREATE POLICY "Anon can read active plans" ON public.subscription_plans FOR SELECT TO anon USING (activo = true);