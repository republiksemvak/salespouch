-- Use a security-definer RPC for Sales expense creation.
-- This makes the server derive owner_id/sales_id from the authenticated session
-- instead of trusting client-supplied ownership fields.
CREATE OR REPLACE FUNCTION public.record_sales_expense(
  p_category text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_spent_at date DEFAULT CURRENT_DATE
)
RETURNS public.sales_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean;
  v_result public.sales_expenses;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_category IS NULL OR char_length(trim(p_category)) = 0 THEN
    RAISE EXCEPTION 'Kategori pengeluaran wajib diisi';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari 0';
  END IF;

  v_owner_id := public.business_owner_id();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Akun Sales belum terhubung ke Owner';
  END IF;

  v_is_super_admin := lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'candraprinting@gmail.com',
    'ganlapor@gmail.com',
    'republiksemvak@gmail.com'
  );

  IF NOT v_is_super_admin AND NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = v_user_id
      AND tm.owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Akun Sales tidak terdaftar pada bisnis ini';
  END IF;

  INSERT INTO public.sales_expenses (
    owner_id, sales_id, category, amount, note, spent_at
  )
  VALUES (
    v_owner_id, v_user_id, trim(p_category), p_amount, NULLIF(trim(coalesce(p_note, '')), ''), p_spent_at
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sales_expense(text, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sales_expense(text, numeric, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
