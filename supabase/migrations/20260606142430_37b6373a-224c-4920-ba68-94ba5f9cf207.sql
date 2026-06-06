
-- Clear stale forecast data (no production use yet) so the new unique index can be created
TRUNCATE TABLE public.forecast_weeks;
TRUNCATE TABLE public.forecast_runs CASCADE;

-- companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS accounting_system TEXT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM public.companies
)
UPDATE public.companies c SET
  name = CASE o.rn WHEN 1 THEN 'Peter Ummels Dakdekkers' ELSE 'Dakwerken Winschoten' END,
  slug = CASE o.rn WHEN 1 THEN 'peter_ummels' ELSE 'winschoten' END,
  city = CASE o.rn WHEN 1 THEN 'Amsterdam' ELSE 'Winschoten' END,
  latitude = CASE o.rn WHEN 1 THEN 52.37 ELSE 53.14 END,
  longitude = CASE o.rn WHEN 1 THEN 4.90 ELSE 7.03 END,
  accounting_system = CASE o.rn WHEN 1 THEN 'Exact Online' ELSE 'Twinfield' END
FROM ordered o WHERE c.id = o.id;

-- projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_type TEXT DEFAULT 'commercial',
  ADD COLUMN IF NOT EXISTS total_value NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_materials_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weather_sensitive BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS wip_amount NUMERIC(14,2) DEFAULT 0;

-- milestones
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS materials_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subcontractor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoiced BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS days_delayed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_reason TEXT;

-- customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0;

-- forecast_weeks
ALTER TABLE public.forecast_weeks
  ALTER COLUMN forecast_run_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS scenario TEXT NOT NULL DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS week_end DATE,
  ADD COLUMN IF NOT EXISTS driver_milestone_billing NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_materials_outflow NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_subcontractor_payments NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_payment_lag_adjustment NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_weather_impact NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rain_mm NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_frost BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS covenant_headroom NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS covenant_status TEXT DEFAULT 'green';

CREATE UNIQUE INDEX IF NOT EXISTS forecast_weeks_company_scenario_week_idx
  ON public.forecast_weeks (company_id, scenario, week_number);

-- covenants
CREATE TABLE IF NOT EXISTS public.covenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  threshold NUMERIC(14,2) NOT NULL,
  current_value NUMERIC(14,2),
  breach_warning_pct NUMERIC(5,2) DEFAULT 20,
  measured_period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.covenants TO authenticated;
GRANT ALL ON public.covenants TO service_role;
ALTER TABLE public.covenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_covenants_all" ON public.covenants
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP TRIGGER IF EXISTS covenants_updated ON public.covenants;
CREATE TRIGGER covenants_updated BEFORE UPDATE ON public.covenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
