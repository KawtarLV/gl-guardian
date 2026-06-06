
CREATE TABLE public.monthly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_code TEXT,
  account_description TEXT NOT NULL,
  period TEXT NOT NULL,
  total_credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_debet NUMERIC(18,2) NOT NULL DEFAULT 0,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_code, account_description, period, source_file)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_summaries TO authenticated;
GRANT ALL ON public.monthly_summaries TO service_role;

ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their company monthly summaries"
ON public.monthly_summaries FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_summaries.company_id AND cm.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_summaries.company_id AND cm.user_id = auth.uid()));

CREATE INDEX idx_monthly_summaries_company_period ON public.monthly_summaries(company_id, period);

CREATE TRIGGER update_monthly_summaries_updated_at
BEFORE UPDATE ON public.monthly_summaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
