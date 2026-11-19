
DROP POLICY IF EXISTS "Empresa members manage reportes_personalizados" ON public.reportes_personalizados;

CREATE POLICY "Empresa members manage reportes_personalizados"
ON public.reportes_personalizados FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));
