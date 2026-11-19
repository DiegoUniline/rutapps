
-- Add stripe_price_id and stripe_product_id columns to subscription_plans
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS stripe_product_id text;
