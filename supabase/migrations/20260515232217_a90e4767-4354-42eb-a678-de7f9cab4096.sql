
CREATE POLICY "Partner ve usos de sus cupones"
ON public.cupon_usos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cupones c
    WHERE c.id = cupon_usos.cupon_id
      AND c.partner_id = public.get_my_partner_id()
  )
);
