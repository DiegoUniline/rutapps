
-- Campaign history
CREATE TABLE public.wa_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  message text,
  image_url text,
  filters text[] DEFAULT '{}',
  total_recipients int NOT NULL DEFAULT 0,
  total_sent int NOT NULL DEFAULT 0,
  total_failed int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed'
);

-- Individual send results per campaign
CREATE TABLE public.wa_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.wa_campaigns(id) ON DELETE CASCADE NOT NULL,
  telefono text NOT NULL,
  nombre text,
  empresa_nombre text,
  status text NOT NULL DEFAULT 'sent',
  error_detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_campaign_sends_campaign ON public.wa_campaign_sends(campaign_id);
CREATE INDEX idx_wa_campaigns_created ON public.wa_campaigns(created_at DESC);

-- RLS
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaign_sends ENABLE ROW LEVEL SECURITY;

-- Only super admins can access
CREATE POLICY "Super admins full access campaigns" ON public.wa_campaigns
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins full access campaign sends" ON public.wa_campaign_sends
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
