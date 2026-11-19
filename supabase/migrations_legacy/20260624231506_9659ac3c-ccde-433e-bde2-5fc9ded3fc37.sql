
CREATE TABLE public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje text NOT NULL,
  tipo text NOT NULL DEFAULT 'info' CHECK (tipo IN ('info','success','warning','error')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_messages TO authenticated;
GRANT ALL ON public.broadcast_messages TO service_role;
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read broadcasts"
  ON public.broadcast_messages FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Only super admins can insert broadcasts"
  ON public.broadcast_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "Only super admins can delete broadcasts"
  ON public.broadcast_messages FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE INDEX broadcast_messages_created_at_idx ON public.broadcast_messages (created_at DESC);

CREATE TABLE public.broadcast_reads (
  message_id uuid NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.broadcast_reads TO authenticated;
GRANT ALL ON public.broadcast_reads TO service_role;
ALTER TABLE public.broadcast_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reads"
  ON public.broadcast_reads FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_messages;
