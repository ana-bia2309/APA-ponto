
-- Fix punch_records: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can view punch records" ON public.punch_records;

CREATE POLICY "Auth can view punch records"
  ON public.punch_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Also restrict manual_punches and absence_justifications SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view manual punches" ON public.manual_punches;
CREATE POLICY "Auth can view manual punches"
  ON public.manual_punches
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can view justifications" ON public.absence_justifications;
CREATE POLICY "Auth can view justifications"
  ON public.absence_justifications
  FOR SELECT
  TO authenticated
  USING (true);
