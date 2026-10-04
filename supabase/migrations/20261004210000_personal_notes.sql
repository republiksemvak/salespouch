-- Personal notes: Other Income and Reminders.
-- These records belong only to the authenticated account and do not sync
-- with sales, outlet, Uang Jalan, or other business data.

CREATE TABLE IF NOT EXISTS public.personal_other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text,
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_other_income_account_id_idx
ON public.personal_other_income(account_id);
CREATE INDEX IF NOT EXISTS personal_other_income_received_at_idx
ON public.personal_other_income(received_at DESC);

CREATE TABLE IF NOT EXISTS public.personal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  note text,
  reminder_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_reminders_account_id_idx
ON public.personal_reminders(account_id);
CREATE INDEX IF NOT EXISTS personal_reminders_reminder_date_idx
ON public.personal_reminders(reminder_date);

GRANT SELECT, INSERT, DELETE ON public.personal_other_income TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.personal_reminders TO authenticated;
GRANT ALL ON public.personal_other_income TO service_role;
GRANT ALL ON public.personal_reminders TO service_role;

ALTER TABLE public.personal_other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts read own other income" ON public.personal_other_income;
DROP POLICY IF EXISTS "accounts add own other income" ON public.personal_other_income;
DROP POLICY IF EXISTS "accounts delete own other income" ON public.personal_other_income;

CREATE POLICY "accounts read own other income"
ON public.personal_other_income
FOR SELECT TO authenticated
USING (account_id = auth.uid());

CREATE POLICY "accounts add own other income"
ON public.personal_other_income
FOR INSERT TO authenticated
WITH CHECK (account_id = auth.uid());

CREATE POLICY "accounts delete own other income"
ON public.personal_other_income
FOR DELETE TO authenticated
USING (account_id = auth.uid());

DROP POLICY IF EXISTS "accounts read own reminders" ON public.personal_reminders;
DROP POLICY IF EXISTS "accounts add own reminders" ON public.personal_reminders;
DROP POLICY IF EXISTS "accounts delete own reminders" ON public.personal_reminders;

CREATE POLICY "accounts read own reminders"
ON public.personal_reminders
FOR SELECT TO authenticated
USING (account_id = auth.uid());

CREATE POLICY "accounts add own reminders"
ON public.personal_reminders
FOR INSERT TO authenticated
WITH CHECK (account_id = auth.uid());

CREATE POLICY "accounts delete own reminders"
ON public.personal_reminders
FOR DELETE TO authenticated
USING (account_id = auth.uid());

NOTIFY pgrst, 'reload schema';
