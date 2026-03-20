
-- Add PIN code column to profiles for admin authorization
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code text;

-- Create RPC to verify PIN (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = p_user_id 
    AND pin_code = p_pin
    AND pin_code IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_pin(uuid, text) TO authenticated;
