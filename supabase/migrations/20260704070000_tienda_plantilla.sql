-- Plantilla (tema) de la tienda en línea: cada empresa elige cómo se ve.
-- 'clasica' = la que ya tenían. Otras: 'boutique', 'bazar', 'ahorrera'.
ALTER TABLE public.tienda_config
  ADD COLUMN IF NOT EXISTS plantilla text NOT NULL DEFAULT 'clasica';
