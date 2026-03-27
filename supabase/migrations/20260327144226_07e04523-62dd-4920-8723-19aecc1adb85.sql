CREATE OR REPLACE FUNCTION public.is_active_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_employee_public_by_id(p_employee_id uuid)
RETURNS TABLE(id uuid, name text, punch_mode text, shift text, has_cpf boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name, e.punch_mode, e.shift, (e.cpf IS NOT NULL AND e.cpf != '') AS has_cpf
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.active = true
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Anyone can insert time records" ON public.time_records;
CREATE POLICY "Anyone can insert time records"
ON public.time_records
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_active_employee(employee_id));

DROP POLICY IF EXISTS "Auth can delete time records" ON public.time_records;
CREATE POLICY "Auth can delete time records"
ON public.time_records
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);