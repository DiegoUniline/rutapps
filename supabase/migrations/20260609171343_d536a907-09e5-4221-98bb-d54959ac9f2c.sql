
CREATE TABLE public.dashboard_ai_recomendaciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  snapshot JSONB,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dai_reco_empresa_user_date ON public.dashboard_ai_recomendaciones (empresa_id, user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_ai_recomendaciones TO authenticated;
GRANT ALL ON public.dashboard_ai_recomendaciones TO service_role;

ALTER TABLE public.dashboard_ai_recomendaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own empresa AI reco"
  ON public.dashboard_ai_recomendaciones FOR SELECT
  TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users insert own AI reco"
  ON public.dashboard_ai_recomendaciones FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own AI reco"
  ON public.dashboard_ai_recomendaciones FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
