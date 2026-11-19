
CREATE OR REPLACE FUNCTION public.prevent_partner_overlap_on_partners()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.user_id AND empresa_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Este usuario ya es cliente de una empresa, no puede ser partner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_partner_overlap_on_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.empresa_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'Este usuario es partner, no puede pertenecer a una empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_overlap_partners ON public.partners;
CREATE TRIGGER trg_prevent_overlap_partners
BEFORE INSERT OR UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.prevent_partner_overlap_on_partners();

DROP TRIGGER IF EXISTS trg_prevent_overlap_profiles ON public.profiles;
CREATE TRIGGER trg_prevent_overlap_profiles
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_partner_overlap_on_profiles();
