
CREATE TABLE public.column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  source_system text,
  source_column_name text NOT NULL,
  normalised_column_name text,
  sample_values jsonb,
  suggested_field text,
  standard_field text,
  confidence numeric,
  reasoning text,
  source text,
  status text DEFAULT 'needs_review',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.column_mappings TO authenticated;
GRANT ALL ON public.column_mappings TO service_role;
ALTER TABLE public.column_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read company column_mappings or global"
  ON public.column_mappings FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members write company column_mappings"
  ON public.column_mappings FOR INSERT TO authenticated
  WITH CHECK (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members update company column_mappings"
  ON public.column_mappings FOR UPDATE TO authenticated
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members delete company column_mappings"
  ON public.column_mappings FOR DELETE TO authenticated
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

CREATE INDEX column_mappings_normalised_idx ON public.column_mappings(normalised_column_name);
CREATE INDEX column_mappings_company_idx ON public.column_mappings(company_id);
CREATE UNIQUE INDEX column_mappings_global_unique ON public.column_mappings(normalised_column_name) WHERE company_id IS NULL;
CREATE UNIQUE INDEX column_mappings_company_unique ON public.column_mappings(company_id, normalised_column_name) WHERE company_id IS NOT NULL;

CREATE TRIGGER trg_column_mappings_updated_at
  BEFORE UPDATE ON public.column_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  filename text,
  file_structure text,
  total_rows integer,
  parsed_rows integer,
  failed_rows integer,
  parse_quality_score numeric,
  column_map jsonb,
  warnings jsonb,
  status text DEFAULT 'pending',
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_uploads TO authenticated;
GRANT ALL ON public.file_uploads TO service_role;
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read company file_uploads"
  ON public.file_uploads FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members write company file_uploads"
  ON public.file_uploads FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members update company file_uploads"
  ON public.file_uploads FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE INDEX file_uploads_company_idx ON public.file_uploads(company_id);

CREATE TRIGGER trg_file_uploads_updated_at
  BEFORE UPDATE ON public.file_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the global rule-engine known mappings (company_id NULL = applies to everyone)
INSERT INTO public.column_mappings
  (company_id, source_column_name, normalised_column_name, standard_field,
   confidence, source, status)
VALUES
  (NULL,'Rekening','rekening','account_code',1.00,'rule_engine','approved'),
  (NULL,'Datum','datum','date',1.00,'rule_engine','approved'),
  (NULL,'Boeknummer','boeknummer','invoice_number',1.00,'rule_engine','approved'),
  (NULL,'Trek','trek','customer_code',1.00,'rule_engine','approved'),
  (NULL,'Debet','debet','debet',1.00,'rule_engine','approved'),
  (NULL,'Credit','credit','credit',1.00,'rule_engine','approved'),
  (NULL,'Boekingstekst','boekingstekst','description',1.00,'rule_engine','approved'),
  (NULL,'Dagboek','dagboek','journal',1.00,'rule_engine','approved'),
  (NULL,'Periode','periode','period',1.00,'rule_engine','approved'),
  (NULL,'BTW','btw','vat',1.00,'rule_engine','approved'),
  (NULL,'Bkst.nr','bkst nr','invoice_number',1.00,'rule_engine','approved'),
  (NULL,'Per','per','period',1.00,'rule_engine','approved'),
  (NULL,'Nr','nr','row_number',1.00,'rule_engine','approved')
ON CONFLICT DO NOTHING;
