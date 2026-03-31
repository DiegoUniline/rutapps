
-- Drop existing write policies
DROP POLICY IF EXISTS "Users can insert tutorial videos" ON public.tutorial_videos;
DROP POLICY IF EXISTS "Users can update tutorial videos" ON public.tutorial_videos;
DROP POLICY IF EXISTS "Users can delete tutorial videos" ON public.tutorial_videos;

-- Only diego.leon@uniline.mx or super admins can write
CREATE POLICY "Only owner can insert tutorial videos"
  ON public.tutorial_videos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid OR is_super_admin(auth.uid()));

CREATE POLICY "Only owner can update tutorial videos"
  ON public.tutorial_videos FOR UPDATE TO authenticated
  USING (auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid OR is_super_admin(auth.uid()));

CREATE POLICY "Only owner can delete tutorial videos"
  ON public.tutorial_videos FOR DELETE TO authenticated
  USING (auth.uid() = '387501a7-d172-4310-9e83-1a7f9fc37cac'::uuid OR is_super_admin(auth.uid()));
