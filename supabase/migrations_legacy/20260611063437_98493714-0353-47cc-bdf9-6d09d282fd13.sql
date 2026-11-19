ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS onboarding_completado boolean DEFAULT false;

-- Crear un trigger para marcar onboarding como completado cuando la empresa ya tiene RFC, direccion y nombre configurados
CREATE OR REPLACE FUNCTION public.check_onboarding_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la empresa ya tiene datos básicos completos, dejar onboarding_completado como está
  -- Esta columna la controla el usuario/app manualmente para mostrar/ocultar el modal
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;