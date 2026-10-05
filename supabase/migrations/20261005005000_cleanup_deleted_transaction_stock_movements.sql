-- Prevent deleted transactions from leaving orphaned physical stock movements.
-- Without this, deleting a visit removes the transaction row but its
-- reference_type='transaction' stock_movements remain in the ledger, so a
-- later warehouse rebuild can resurrect stock that belonged to the deleted visit.

CREATE OR REPLACE FUNCTION public.cleanup_deleted_transaction_stock_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.stock_movements
  WHERE owner_id = OLD.user_id
    AND reference_type = 'transaction'
    AND reference_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_deleted_transaction_stock_movements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cleanup_deleted_transaction_stock_movements_after_delete
ON public.transactions;

CREATE TRIGGER cleanup_deleted_transaction_stock_movements_after_delete
AFTER DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_transaction_stock_movements();

-- Clean any orphan transaction movements left behind by deletions that
-- happened before this trigger existed, then let the stock-movement trigger
-- rebuild affected warehouse balances from the complete ledger.
DO $$
DECLARE
  movement_row record;
BEGIN
  FOR movement_row IN
    SELECT DISTINCT sm.owner_id, sm.product_id
    FROM public.stock_movements sm
    LEFT JOIN public.transactions t
      ON t.id = sm.reference_id
    WHERE sm.reference_type = 'transaction'
      AND t.id IS NULL
  LOOP
    DELETE FROM public.stock_movements sm
    WHERE sm.reference_type = 'transaction'
      AND sm.reference_id IN (
        SELECT sm2.reference_id
        FROM public.stock_movements sm2
        LEFT JOIN public.transactions t2
          ON t2.id = sm2.reference_id
        WHERE sm2.reference_type = 'transaction'
          AND t2.id IS NULL
          AND sm2.owner_id = movement_row.owner_id
          AND sm2.product_id = movement_row.product_id
      );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
