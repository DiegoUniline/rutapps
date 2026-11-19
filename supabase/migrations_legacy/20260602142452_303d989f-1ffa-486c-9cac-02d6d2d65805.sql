DROP POLICY IF EXISTS "Users can read own company invoices" ON public.facturas;
DROP POLICY IF EXISTS "Super admins can manage all invoices" ON public.facturas;
DROP POLICY IF EXISTS "Users can read own company invoices or Diego can read all" ON public.facturas;
DROP POLICY IF EXISTS "Only Diego can insert invoices" ON public.facturas;
DROP POLICY IF EXISTS "Only Diego can update invoices" ON public.facturas;
DROP POLICY IF EXISTS "Only Diego can delete invoices" ON public.facturas;

CREATE OR REPLACE FUNCTION public.is_diego_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE user_id = p_user_id
      AND lower(email) = 'diego.leon@uniline.mx'
  );
$$;

CREATE POLICY "Users can read own company invoices or Diego can read all"
  ON public.facturas
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_diego_super_admin(auth.uid()));

CREATE POLICY "Only Diego can insert invoices"
  ON public.facturas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_diego_super_admin(auth.uid()));

CREATE POLICY "Only Diego can update invoices"
  ON public.facturas
  FOR UPDATE
  TO authenticated
  USING (public.is_diego_super_admin(auth.uid()))
  WITH CHECK (public.is_diego_super_admin(auth.uid()));

CREATE POLICY "Only Diego can delete invoices"
  ON public.facturas
  FOR DELETE
  TO authenticated
  USING (public.is_diego_super_admin(auth.uid()));