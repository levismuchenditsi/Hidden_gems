CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);

CREATE INDEX ratings_place_id_idx ON public.ratings (place_id);
CREATE INDEX ratings_user_id_idx ON public.ratings (user_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  depth smallint NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 2),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_place_created_idx ON public.comments (place_id, created_at);
CREATE INDEX comments_parent_id_idx ON public.comments (parent_id);
CREATE INDEX comments_user_id_idx ON public.comments (user_id);

CREATE TABLE public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);

CREATE INDEX likes_place_id_idx ON public.likes (place_id);
CREATE INDEX likes_user_id_idx ON public.likes (user_id);

CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);

CREATE INDEX bookmarks_user_created_idx ON public.bookmarks (user_id, created_at DESC);
CREATE INDEX bookmarks_place_id_idx ON public.bookmarks (place_id);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_place_id uuid REFERENCES public.places(id) ON DELETE CASCADE,
  target_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((target_place_id IS NOT NULL)::integer + (target_comment_id IS NOT NULL)::integer = 1)
);

CREATE INDEX reports_status_created_idx ON public.reports (status, created_at DESC);
CREATE INDEX reports_reporter_id_idx ON public.reports (reporter_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  notification_type text NOT NULL CHECK (
    notification_type IN ('comment', 'reply', 'like', 'bookmark', 'moderation_approved', 'moderation_rejected')
  ),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 500),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (user_id, read_at) WHERE read_at IS NULL;

CREATE TABLE public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  place_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN ('approve_place', 'reject_place', 'hide_comment', 'unhide_comment', 'resolve_report', 'dismiss_report')
  ),
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_logs_place_created_idx ON public.moderation_logs (place_id, created_at DESC);
CREATE INDEX moderation_logs_moderator_created_idx ON public.moderation_logs (moderator_id, created_at DESC);
