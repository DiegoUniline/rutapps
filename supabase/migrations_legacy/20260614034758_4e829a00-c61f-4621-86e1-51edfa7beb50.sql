
-- Tabla de publicidad gestionada por super admin (global)
CREATE TABLE public.publicidad_anuncios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo_media TEXT NOT NULL DEFAULT 'imagen' CHECK (tipo_media IN ('imagen','video','url_video','solo_texto')),
  media_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  mostrar_popup BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_publicidad_anuncios_activo ON public.publicidad_anuncios(activo, created_at DESC);

GRANT SELECT ON public.publicidad_anuncios TO authenticated;
GRANT ALL ON public.publicidad_anuncios TO service_role;
ALTER TABLE public.publicidad_anuncios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active ads"
  ON public.publicidad_anuncios FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage ads"
  ON public.publicidad_anuncios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- Tabla de vistas por usuario (una sola vez por usuario)
CREATE TABLE public.publicidad_vistas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anuncio_id UUID NOT NULL REFERENCES public.publicidad_anuncios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anuncio_id, user_id)
);
CREATE INDEX idx_publicidad_vistas_user ON public.publicidad_vistas(user_id, anuncio_id);

GRANT SELECT, INSERT ON public.publicidad_vistas TO authenticated;
GRANT ALL ON public.publicidad_vistas TO service_role;
ALTER TABLE public.publicidad_vistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own views"
  ON public.publicidad_vistas FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert their own views"
  ON public.publicidad_vistas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins see all views"
  ON public.publicidad_vistas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.publicidad_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_publicidad_updated_at
  BEFORE UPDATE ON public.publicidad_anuncios
  FOR EACH ROW EXECUTE FUNCTION public.publicidad_set_updated_at();

-- Storage policies para bucket 'publicidad' (público para lectura, super admin para escritura)
CREATE POLICY "Public read publicidad"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'publicidad');

CREATE POLICY "Super admins upload publicidad"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicidad' AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "Super admins update publicidad"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'publicidad' AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE POLICY "Super admins delete publicidad"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'publicidad' AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
