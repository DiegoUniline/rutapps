CREATE TABLE public.wa_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono text NOT NULL UNIQUE,
  nombre text,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.wa_optouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read wa_optouts"
ON public.wa_optouts FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert wa_optouts"
ON public.wa_optouts FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can delete wa_optouts"
ON public.wa_optouts FOR DELETE TO authenticated
USING (true);