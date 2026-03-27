CREATE OR REPLACE FUNCTION public.get_active_employee_by_cpf(p_cpf text)
RETURNS TABLE (
  id uuid,
  name text,
  cpf text,
  shift text,
  punch_mode text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_cpf text;
BEGIN
  normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  RETURN QUERY
  SELECT e.id, e.name, e.cpf, e.shift, e.punch_mode
  FROM public.employees e
  WHERE e.active = true
    AND regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = normalized_cpf
  ORDER BY e.created_at ASC;
END;
$$;