-- Blueprint rule:
-- Physical quantities may only be revised on the latest visit for an outlet.
-- Older notes may still be revised financially (discount/payment/debt/note),
-- but their physical line_items/new_consignment_items are immutable.

CREATE OR REPLACE FUNCTION public.validate_transaction_physical_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_id uuid;
  physical_changed boolean;
BEGIN
  physical_changed :=
    OLD.line_items IS DISTINCT FROM NEW.line_items
    OR OLD.new_consignment_items IS DISTINCT FROM NEW.new_consignment_items;

  IF NOT physical_changed THEN
    RETURN NEW;
  END IF;

  -- Internal future-stock recalculation updates line_items without setting
  -- revised_at. Those updates are part of the approved cascade and must pass.
  IF OLD.revised_at IS NOT DISTINCT FROM NEW.revised_at THEN
    RETURN NEW;
  END IF;

  SELECT t.id
  INTO latest_id
  FROM public.transactions t
  WHERE t.outlet_id = OLD.outlet_id
  ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
  LIMIT 1;

  IF latest_id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      'Kuantitas fisik hanya dapat direvisi pada nota kunjungan terakhir outlet. Nota terdahulu hanya dapat direvisi secara finansial.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_transaction_physical_revision_before_update
ON public.transactions;

CREATE TRIGGER validate_transaction_physical_revision_before_update
BEFORE UPDATE OF line_items, new_consignment_items, revised_at
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_transaction_physical_revision();

REVOKE ALL ON FUNCTION public.validate_transaction_physical_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_transaction_physical_revision() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
