-- Allow super admins to read otp_codes for incomplete registration tracking
CREATE POLICY "Super admins can read otp_codes"
ON public.otp_codes
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
