
DROP POLICY "Users can view tutorial videos of their empresa" ON public.tutorial_videos;
DROP POLICY "Admins can insert tutorial videos" ON public.tutorial_videos;
DROP POLICY "Admins can update tutorial videos" ON public.tutorial_videos;
DROP POLICY "Admins can delete tutorial videos" ON public.tutorial_videos;

CREATE POLICY "Users can view tutorial videos"
  ON public.tutorial_videos FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Users can insert tutorial videos"
  ON public.tutorial_videos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Users can update tutorial videos"
  ON public.tutorial_videos FOR UPDATE TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Users can delete tutorial videos"
  ON public.tutorial_videos FOR DELETE TO authenticated
  USING (empresa_id = public.get_my_empresa_id());
