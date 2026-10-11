-- System announcements are read and managed through authenticated server functions.
-- Do not add broad authenticated write policies: they would let any signed-in user
-- publish or disable announcements. The server functions enforce super-admin access.

CREATE TABLE IF NOT EXISTS public.app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'important')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;

-- Intentionally no direct client policies. Server functions use the server-only
-- service-role client and enforce authentication/super-admin authorization.
CREATE INDEX IF NOT EXISTS app_announcements_active_created_at_idx
  ON public.app_announcements (is_active, created_at DESC);
