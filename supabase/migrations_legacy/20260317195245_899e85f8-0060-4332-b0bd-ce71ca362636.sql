
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0
);

-- No RLS needed - this is accessed via service role from edge function only
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup old codes (older than 10 minutes)
CREATE INDEX idx_otp_codes_phone_created ON public.otp_codes (phone, created_at DESC);
