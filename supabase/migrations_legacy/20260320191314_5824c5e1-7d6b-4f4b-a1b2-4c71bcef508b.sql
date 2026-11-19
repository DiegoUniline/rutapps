CREATE POLICY "Public read productos for audits"
ON public.productos
FOR SELECT
TO anon
USING (true);