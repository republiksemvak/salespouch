ALTER TABLE public.sales_travel_funds
ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'in';

UPDATE public.sales_travel_funds
SET transaction_type = 'in'
WHERE transaction_type IS NULL OR transaction_type = '';

ALTER TABLE public.sales_travel_funds
DROP CONSTRAINT IF EXISTS sales_travel_funds_transaction_type_check;

ALTER TABLE public.sales_travel_funds
ADD CONSTRAINT sales_travel_funds_transaction_type_check
CHECK (transaction_type IN ('in', 'out'));

CREATE INDEX IF NOT EXISTS sales_travel_funds_transaction_type_idx
ON public.sales_travel_funds(transaction_type);

NOTIFY pgrst, 'reload schema';
