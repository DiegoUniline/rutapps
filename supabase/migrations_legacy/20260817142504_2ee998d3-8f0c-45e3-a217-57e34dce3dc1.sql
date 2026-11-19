CREATE TABLE IF NOT EXISTS public.tmp_difasur_lotes (val text, lote text, cad date, cant numeric);
GRANT ALL ON public.tmp_difasur_lotes TO service_role;
GRANT ALL ON public.tmp_difasur_lotes TO sandbox_exec;
ALTER TABLE public.tmp_difasur_lotes ENABLE ROW LEVEL SECURITY;