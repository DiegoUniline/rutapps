DROP POLICY IF EXISTS "Users can view tutorial videos" ON public.tutorial_videos;
CREATE POLICY "Anyone can view tutorial videos"
  ON public.tutorial_videos FOR SELECT
  TO anon, authenticated
  USING (true);