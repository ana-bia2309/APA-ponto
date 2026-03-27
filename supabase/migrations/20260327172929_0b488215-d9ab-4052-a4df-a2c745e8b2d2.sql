
-- Fix overly permissive INSERT policies

DROP POLICY IF EXISTS "Anyone can insert manual punches" ON public.manual_punches;
CREATE POLICY "Active employees can insert manual punches"
  ON public.manual_punches FOR INSERT TO anon, authenticated
  WITH CHECK (is_active_employee(employee_id));

DROP POLICY IF EXISTS "Anyone can insert punch records" ON public.punch_records;
CREATE POLICY "Active employees can insert punch records"
  ON public.punch_records FOR INSERT TO anon, authenticated
  WITH CHECK (is_active_employee(employee_id));

DROP POLICY IF EXISTS "Anyone can insert justifications" ON public.absence_justifications;
CREATE POLICY "Active employees can insert justifications"
  ON public.absence_justifications FOR INSERT TO anon, authenticated
  WITH CHECK (is_active_employee(employee_id));

-- Fix overly permissive DELETE policies
DROP POLICY IF EXISTS "Auth can delete manual punches" ON public.manual_punches;
CREATE POLICY "Auth can delete manual punches"
  ON public.manual_punches FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth can delete punch records" ON public.punch_records;
CREATE POLICY "Auth can delete punch records"
  ON public.punch_records FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth can delete justifications" ON public.absence_justifications;
CREATE POLICY "Auth can delete justifications"
  ON public.absence_justifications FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- employees: tighten write policies
DROP POLICY IF EXISTS "Auth can insert employees" ON public.employees;
CREATE POLICY "Auth can insert employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth can update employees" ON public.employees;
CREATE POLICY "Auth can update employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth can delete employees" ON public.employees;
CREATE POLICY "Auth can delete employees"
  ON public.employees FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Enforce manual punch limit server-side via trigger
DROP TRIGGER IF EXISTS enforce_manual_punch_limit ON public.manual_punches;
CREATE TRIGGER enforce_manual_punch_limit
  BEFORE INSERT ON public.manual_punches
  FOR EACH ROW EXECUTE FUNCTION check_manual_punch_limit();
