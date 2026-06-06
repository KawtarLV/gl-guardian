
CREATE OR REPLACE FUNCTION public.match_gl_mappings(
  query_embedding vector(1536),
  match_company_id uuid,
  match_threshold float DEFAULT 0.85,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  account_description text,
  standardized_category text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.id,
    m.account_description,
    m.standardized_category,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.gl_mappings m
  WHERE m.company_id = match_company_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) >= match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_gl_mappings(vector, uuid, float, int) TO authenticated, service_role;
