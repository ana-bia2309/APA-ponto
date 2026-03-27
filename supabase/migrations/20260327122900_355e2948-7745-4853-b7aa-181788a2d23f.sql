
-- 1. Create RPC to return active employees WITHOUT CPF (for public time clock)
CREATE OR REPLACE FUNCTION public.get_active_employees_public()
RETURNS TABLE(id uuid, name text, punch_mode text, shift text, has_cpf boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name, e.punch_mode, e.shift, (e.cpf IS NOT NULL AND e.cpf != '') AS has_cpf
  FROM public.employees e
  WHERE e.active = true
  ORDER BY e.name;
$$;

-- 2. Create RPC to validate CPF without exposing it
CREATE OR REPLACE FUNCTION public.validate_employee_cpf(p_employee_id uuid, p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_cpf text;
  input_digits text;
  stored_digits text;
BEGIN
  SELECT cpf INTO stored_cpf FROM public.employees WHERE id = p_employee_id AND active = true;
  IF stored_cpf IS NULL THEN RETURN false; END IF;
  input_digits := regexp_replace(p_cpf, '\D', '', 'g');
  stored_digits := regexp_replace(stored_cpf, '\D', '', 'g');
  RETURN input_digits = stored_digits;
END;
$$;

-- 3. Restrict employees SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can view employees" ON public.employees;
CREATE POLICY "Auth can view employees" ON public.employees
  FOR SELECT TO authenticated USING (true);

-- 4. Tighten punch_records INSERT: validate employee_id exists and is active
DROP POLICY IF EXISTS "Anyone can insert punch records" ON public.punch_records;
CREATE POLICY "Public can insert punch records for active employees" ON public.punch_records
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND active = true)
  );

-- 5. Tighten manual_punches INSERT similarly
DROP POLICY IF EXISTS "Anyone can insert manual punches" ON public.manual_punches;
CREATE POLICY "Public can insert manual punches for active employees" ON public.manual_punches
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND active = true)
  );

-- 6. Tighten absence_justifications INSERT
DROP POLICY IF EXISTS "Anyone can insert justifications" ON public.absence_justifications;
CREATE POLICY "Public can insert justifications for active employees" ON public.absence_justifications
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees WHERE id = employee_id AND active = true)
  );

-- 7. Server-side manual punch limit (5 per month)
CREATE OR REPLACE FUNCTION public.check_manual_punch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  monthly_count integer;
BEGIN
  SELECT COUNT(*) INTO monthly_count
  FROM public.manual_punches
  WHERE employee_id = NEW.employee_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
  IF monthly_count >= 5 THEN
    RAISE EXCEPTION 'Limite mensal de 5 correções manuais excedido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_manual_punch_limit
  BEFORE INSERT ON public.manual_punches
  FOR EACH ROW EXECUTE FUNCTION public.check_manual_punch_limit();
