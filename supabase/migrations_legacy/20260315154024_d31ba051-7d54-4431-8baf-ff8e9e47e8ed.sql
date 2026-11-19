
-- Trigger: auto-create trial subscription when a new empresa is created
CREATE OR REPLACE FUNCTION public.auto_create_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (empresa_id, status, trial_ends_at, max_usuarios)
  VALUES (NEW.id, 'trial', now() + interval '7 days', 3);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_empresa_created_trial
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_trial_subscription();
