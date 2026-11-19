CREATE TABLE IF NOT EXISTS public._difa_formulas_staging (codigo TEXT PRIMARY KEY, formula TEXT NOT NULL);
GRANT ALL ON public._difa_formulas_staging TO service_role;
ALTER TABLE public._difa_formulas_staging ENABLE ROW LEVEL SECURITY;