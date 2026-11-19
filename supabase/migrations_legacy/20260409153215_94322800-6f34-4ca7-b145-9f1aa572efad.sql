
-- Make empresa_id nullable (videos are global, not per-empresa)
ALTER TABLE public.tutorial_videos ALTER COLUMN empresa_id DROP NOT NULL;

-- Update SELECT policy: all authenticated users can view all tutorials
DROP POLICY IF EXISTS "Users can view tutorial videos" ON public.tutorial_videos;
CREATE POLICY "Users can view tutorial videos" ON public.tutorial_videos
  FOR SELECT TO authenticated USING (true);
