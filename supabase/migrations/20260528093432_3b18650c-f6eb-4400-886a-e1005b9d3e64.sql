
-- Recurring items (income + expense templates)
CREATE TABLE public.recurring_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  name text NOT NULL,
  category text NOT NULL,
  subtype text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  fx_rate numeric NOT NULL DEFAULT 1,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','weekly','yearly','one-time')),
  next_due_date date NOT NULL DEFAULT (now())::date,
  last_generated_at timestamp with time zone,
  icon text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_items TO authenticated;
GRANT ALL ON public.recurring_items TO service_role;

ALTER TABLE public.recurring_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ri_select_own ON public.recurring_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ri_insert_own ON public.recurring_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY ri_update_own ON public.recurring_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ri_delete_own ON public.recurring_items FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_recurring_items_updated_at
  BEFORE UPDATE ON public.recurring_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recurring_items_user_type ON public.recurring_items(user_id, type);
CREATE INDEX idx_recurring_items_next_due ON public.recurring_items(user_id, next_due_date);

-- Link transactions back to the recurring template that generated them
ALTER TABLE public.transactions
  ADD COLUMN source_recurring_id uuid;

CREATE INDEX idx_transactions_source_recurring ON public.transactions(source_recurring_id);
