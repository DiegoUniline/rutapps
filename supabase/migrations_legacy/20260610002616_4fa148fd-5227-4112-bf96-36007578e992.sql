
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS monthly_sales_goal NUMERIC NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.empresas.monthly_sales_goal IS 'Meta mensual de ventas para el dashboard (configurable por admin)';
