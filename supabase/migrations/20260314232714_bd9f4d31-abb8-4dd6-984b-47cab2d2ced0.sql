
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS direccion text,
ADD COLUMN IF NOT EXISTS colonia text,
ADD COLUMN IF NOT EXISTS ciudad text,
ADD COLUMN IF NOT EXISTS estado text,
ADD COLUMN IF NOT EXISTS cp text,
ADD COLUMN IF NOT EXISTS telefono text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS rfc text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS razon_social text,
ADD COLUMN IF NOT EXISTS regimen_fiscal text,
ADD COLUMN IF NOT EXISTS notas_ticket text;

-- Allow empresa update by members
CREATE POLICY "Users can update their empresa"
ON public.empresas
FOR UPDATE
TO authenticated
USING (id = get_my_empresa_id())
WITH CHECK (id = get_my_empresa_id());
