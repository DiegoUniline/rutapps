
-- Notification types
CREATE TYPE public.notification_type AS ENUM ('banner', 'modal', 'bubble');
CREATE TYPE public.notification_redirect_type AS ENUM ('internal', 'external', 'both');

-- Main notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type notification_type NOT NULL DEFAULT 'banner',
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  redirect_url text,
  redirect_type notification_redirect_type,
  image_url text,
  bg_color text DEFAULT '#1d4ed8',
  text_color text DEFAULT '#ffffff',
  max_views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track per-user views (for modals)
CREATE TABLE public.notification_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_views ENABLE ROW LEVEL SECURITY;

-- Notifications: users can read their tenant's active notifications
CREATE POLICY "Users read own tenant notifications"
ON public.notifications FOR SELECT TO authenticated
USING (empresa_id = public.get_my_empresa_id());

-- Notifications: admins manage
CREATE POLICY "Admins manage notifications"
ON public.notifications FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id())
WITH CHECK (empresa_id = public.get_my_empresa_id());

-- notification_views: users can read/write their own views
CREATE POLICY "Users manage own views"
ON public.notification_views FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
