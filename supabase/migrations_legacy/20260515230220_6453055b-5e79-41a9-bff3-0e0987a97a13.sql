CREATE POLICY "Partners can view referred empresas"
ON public.empresas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.partner_atribuciones pa
    JOIN public.partners p ON p.id = pa.partner_id
    WHERE pa.empresa_id = empresas.id
      AND p.user_id = auth.uid()
  )
);